/* =========================================================================
   cloudstorage.js — Google Drive workspace storage (folder-tree mirror)
   =========================================================================
   A Google Drive workspace is a real folder in the user's Drive that mirrors
   the exact same on-disk layout as a local workspace:

     <Workspace Title>/          (a normal Drive folder)
     ├── Upload/                 uploaded files
     └── Space/                  pages as Markdown (.md), nested by folders

   Because it uses the `drive.file` scope (not the hidden appDataFolder), the
   files are browsable and editable directly in Google Drive — the data stays
   readable without the app. Serialization lives in ./markdown.js; this module
   only talks to the Drive REST API.

   OAuth: Google Identity Services token client (implicit, browser-only). The
   GIS script is pre-loaded in index.html. Tokens are cached in sessionStorage.
   ========================================================================= */
import { buildFolderPlan, parseFolderTree, infoToMarkdown, markdownToInfo, FILE_PAGE_EXT_RE } from './markdown.js';

export const GDRIVE = {
  id: 'gdrive',
  name: 'Google Drive',
  shortName: 'Drive',
  emoji: '📁',
  color: '#4285F4',
  gradient: 'linear-gradient(135deg,#4285F4,#34A853)',
  scope: 'https://www.googleapis.com/auth/drive.file',
};

/* Bundled OAuth client ID (browser implicit flow — no secret needed). The
   app's origin must be an Authorised JavaScript origin in Google Cloud. */
const GDRIVE_CLIENT_ID =
  '298006869899-tfavelqu4up3u11dd462kqhcgallgcd5.apps.googleusercontent.com';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const TOK_KEY = 'ws_gdrive_tok';

/* ============================================================ token cache */
function _getToken() {
  try {
    const raw = sessionStorage.getItem(TOK_KEY);
    if (!raw) return null;
    const { token, expires } = JSON.parse(raw);
    if (expires && Date.now() > expires) { sessionStorage.removeItem(TOK_KEY); return null; }
    return token;
  } catch { return null; }
}
function _setToken(token, expiresIn = 3600) {
  const expires = Date.now() + (Math.max(parseInt(expiresIn, 10) || 3600, 120) - 60) * 1000;
  sessionStorage.setItem(TOK_KEY, JSON.stringify({ token, expires }));
}
export function getDriveToken() { return _getToken(); }
export function clearDriveToken() { sessionStorage.removeItem(TOK_KEY); }

/* ============================================================ GIS loader */
let _gisPromise = null;
function _loadGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (_gisPromise) return _gisPromise;
  _gisPromise = new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = setInterval(() => {
      if (window.google?.accounts?.oauth2) { clearInterval(poll); resolve(); }
      else if (Date.now() - start > 15000) {
        clearInterval(poll);
        reject(new Error('Google Identity Services did not load. Check your connection and that https://accounts.google.com is reachable.'));
      }
    }, 80);
  });
  return _gisPromise;
}

/* Authenticate with Google Drive. Must be called from a user gesture. */
export async function authenticateGoogleDrive(opts = {}) {
  const existing = _getToken();
  if (existing) return existing;
  await _loadGIS();
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, v) => { if (!settled) { settled = true; fn(v); } };
    const cfg = {
      client_id: GDRIVE_CLIENT_ID,
      scope: GDRIVE.scope,
      callback: resp => {
        if (resp.error) { settle(reject, new Error(resp.error_description || resp.error)); return; }
        _setToken(resp.access_token, resp.expires_in);
        settle(resolve, resp.access_token);
      },
      error_callback: err => settle(reject, new Error(err?.message || 'Google authorisation was cancelled.')),
    };
    if (opts.loginHint) cfg.login_hint = opts.loginHint;
    window.google.accounts.oauth2.initTokenClient(cfg).requestAccessToken();
  });
}

/* ============================================================ REST helpers */
async function _errMsg(res) {
  if (res.status === 401) clearDriveToken();
  let reason = res.statusText;
  try { const j = await res.json(); reason = j?.error?.message || reason; } catch (_) {}
  let hint = '';
  if (res.status === 403)
    hint = ' — Ensure the Google Drive API is enabled in your Google Cloud project and, if the OAuth app is in Testing, that your email is a Test User.';
  return `(${res.status}) ${reason}${hint}`;
}

/* Global concurrency gate: reads/writes below fire in parallel for speed, but
   Drive rate-limits aggressive bursts — cap the requests in flight at once. */
const MAX_INFLIGHT = 8;
let _inflight = 0;
const _waiters = [];

async function _driveFetch(token, url, init = {}) {
  if (_inflight >= MAX_INFLIGHT) await new Promise(r => _waiters.push(r));
  _inflight++;
  try {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
    if (!res.ok) throw new Error('Drive request failed ' + (await _errMsg(res)));
    return res;
  } finally {
    _inflight--;
    const next = _waiters.shift();
    if (next) next();
  }
}

async function _createFolder(token, name, parentId) {
  const res = await _driveFetch(token, 'https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined }),
  });
  return (await res.json()).id;
}

async function _findChild(token, name, parentId, folderOnly) {
  const q = [
    `name='${name.replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    'trashed=false',
    folderOnly ? `mimeType='${FOLDER_MIME}'` : null,
  ].filter(Boolean).join(' and ');
  const res = await _driveFetch(token,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=1000`);
  return (await res.json()).files || [];
}

async function _listChildren(token, parentId) {
  const q = `'${parentId}' in parents and trashed=false`;
  const res = await _driveFetch(token,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size)&pageSize=1000`);
  return (await res.json()).files || [];
}

async function _uploadText(token, parentId, name, text, existingId) {
  const meta = { name, parents: existingId ? undefined : [parentId] };
  const boundary = '----wsBoundary' + name.length + text.length;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}` +
    `\r\n--${boundary}\r\nContent-Type: text/markdown\r\n\r\n${text}\r\n--${boundary}--`;
  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
  const res = await _driveFetch(token, url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return (await res.json()).id;
}

async function _uploadBinary(token, parentId, name, blob, existingId) {
  const meta = { name, parents: existingId ? undefined : [parentId] };
  const boundary = '----wsBin' + name.length;
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`;
  const mediaHead = `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Blob([metaPart, mediaHead, blob, tail]);
  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
  const res = await _driveFetch(token, url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return (await res.json()).id;
}

async function _deleteFile(token, id) {
  try { await _driveFetch(token, `https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE' }); } catch (_) {}
}
async function _downloadText(token, id) {
  const res = await _driveFetch(token, `https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return res.text();
}
async function _downloadBlob(token, id) {
  const res = await _driveFetch(token, `https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
  return res.blob();
}

/* ============================================================ workspace ops */
/* Per-root caches so unchanged files are skipped and deletions can be diffed. */
const _cache = {};   // rootId -> { text:Map(path->text), fileId:Map(path->id), folderId:Map(dirPath->id) }
const _objURLs = {}; // rootId -> [blobURL]
function _cacheFor(rootId) {
  return _cache[rootId] || (_cache[rootId] = { text: new Map(), fileId: new Map(), folderId: new Map() });
}
export function revokeDriveURLs(rootId) {
  (_objURLs[rootId] || []).forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
  _objURLs[rootId] = [];
}

/* Create a new empty Drive workspace folder; returns its folderId. */
export async function createDriveWorkspace(name) {
  const token = await authenticateGoogleDrive();
  const folderId = await _createFolder(token, name || 'Workspace', null);
  return folderId;
}

/* List candidate Drive workspaces (app-created folders containing a Space/). */
export async function listDriveWorkspaces() {
  const token = _getToken();
  if (!token) return [];
  const q = `mimeType='${FOLDER_MIME}' and trashed=false and 'root' in parents`;
  const res = await _driveFetch(token,
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000`);
  const folders = (await res.json()).files || [];
  // probe every candidate folder for a Space/ child in parallel
  const hasSpace = await Promise.all(folders.map(
    f => _findChild(token, 'Space', f.id, true).then(r => r.length > 0, () => false)));
  return folders.filter((_, i) => hasSpace[i]).map(f => ({ id: f.id, name: f.name }));
}

async function _ensureFolderPath(token, rootId, dirParts, cache) {
  let parentId = rootId, acc = '';
  for (const part of dirParts) {
    acc = acc ? acc + '/' + part : part;
    let id = cache.folderId.get(acc);
    if (!id) {
      const found = await _findChild(token, part, parentId, true);
      id = found.length ? found[0].id : await _createFolder(token, part, parentId);
      cache.folderId.set(acc, id);
    }
    parentId = id;
  }
  return parentId;
}

/* Mirror the whole workspace into the Drive folder `rootId`. */
export async function writeGdriveWorkspaceTree(rootId, store) {
  const token = _getToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');
  const cache = _cacheFor(rootId);
  const plan = buildFolderPlan(store);
  const desired = new Map(plan.files.map(f => [f.path, f.text]));

  // delete files no longer present (parallel)
  const gone = [...cache.text.keys()].filter(p => !desired.has(p));
  await Promise.all(gone.map(async path => {
    const id = cache.fileId.get(path);
    if (id) await _deleteFile(token, id);
    cache.text.delete(path); cache.fileId.delete(path);
  }));

  // remove folder-node directories that no longer exist in the plan (deepest
  // first; their contents were already deleted or moved by the file pass)
  const planDirs = new Set(plan.dirs || []);
  const prevDirs = cache.dirPaths || new Set();
  const goneDirs = [...prevDirs].filter(d => !planDirs.has(d)
    && ![...desired.keys()].some(p => p.startsWith(d + '/')));
  goneDirs.sort((a, b) => b.split('/').length - a.split('/').length);
  for (const d of goneDirs) {
    const id = cache.folderId.get(d);
    if (id) await _deleteFile(token, id).catch(() => {});
    for (const key of [...cache.folderId.keys()]) if (key === d || key.startsWith(d + '/')) cache.folderId.delete(key);
  }

  // upsert changed / new files: ensure the folders first (sequential — the
  // folderId cache makes this a no-op after the first save), then upload the
  // file bodies in parallel
  const changed = [...desired].filter(([path, text]) => cache.text.get(path) !== text);
  const dirs = [...new Set(changed.map(([path]) => path.split('/').slice(0, -1).join('/')))];
  for (const dir of dirs) if (dir) await _ensureFolderPath(token, rootId, dir.split('/'), cache);
  // folder-node directories exist even when empty
  for (const dir of plan.dirs || []) await _ensureFolderPath(token, rootId, dir.split('/'), cache);
  cache.dirPaths = planDirs;
  await Promise.all(changed.map(async ([path, text]) => {
    const parts = path.split('/');
    const name = parts.pop();
    const dir = parts.join('/');
    const parentId = dir ? cache.folderId.get(dir) : rootId;
    const id = await _uploadText(token, parentId, name, text, cache.fileId.get(path));
    cache.text.set(path, text); cache.fileId.set(path, id);
  }));

  // reconcile uploads only when the referenced set actually changed — it
  // costs an Upload/ listing per call, which most saves don't need
  const names = new Set((plan.uploads || []).map(u => u.name));
  const prev = cache.uploadNames;
  const same = prev && prev.size === names.size && [...names].every(n => prev.has(n));
  if (!same) {
    await _reconcileDriveUploads(token, rootId, plan.uploads, cache).catch(() => {});
    cache.uploadNames = names;
  }
}

async function _reconcileDriveUploads(token, rootId, wantedUploads, cache) {
  const uploadDirId = cache.folderId.get('Upload');
  if (!uploadDirId) return;
  const wanted = new Set((wantedUploads || []).map(u => u.name));
  const files = await _listChildren(token, uploadDirId);
  for (const f of files) if (f.mimeType !== FOLDER_MIME && !wanted.has(f.name)) await _deleteFile(token, f.id);
}

/* Write one uploaded file into the Drive Upload/ folder. Returns its name. */
export async function writeDriveUpload(rootId, name, blob) {
  const token = _getToken();
  if (!token) return null;
  const cache = _cacheFor(rootId);
  const parentId = await _ensureFolderPath(token, rootId, ['Upload'], cache);
  await _uploadBinary(token, parentId, name, blob, null);
  return name;
}

async function _collectMd(token, dirId, relPath, out, cache, dirs, extraExts) {
  const children = await _listChildren(token, dirId);
  // fetch sub-folders and file bodies in parallel; _driveFetch caps the burst
  await Promise.all(children.map(async c => {
    const p = relPath + '/' + c.name;
    if (c.mimeType === FOLDER_MIME) {
      cache.folderId.set(p, c.id);
      if (dirs) dirs.push(p);
      await _collectMd(token, c.id, p, out, cache, dirs, extraExts);
    } else if (c.name.toLowerCase().endsWith('.md') || FILE_PAGE_EXT_RE.test(c.name)
        || (extraExts && extraExts.has((c.name.match(/\.([^./]+)$/) || [, ''])[1]?.toLowerCase()))) {
      // .md pages plus text files (.py/.html/…) that open as 'file' pages
      const text = await _downloadText(token, c.id);
      out.push({ path: p, text });
      cache.text.set(p, text); cache.fileId.set(p, c.id);
    }
  }));
}

function _hydrateBlocks(blocks, map) {
  return (blocks || []).map(b => {
    let nb = b;
    if (b.localName && map[b.localName]) nb = { ...b, url: map[b.localName] };
    if (nb.children) nb = { ...nb, children: _hydrateBlocks(nb.children, map) };
    return nb;
  });
}

/* Read the whole Drive workspace back → { nodes, favorites, currentId, uploads }. */
export async function readGdriveWorkspaceTree(rootId) {
  const token = _getToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');
  revokeDriveURLs(rootId);
  const cache = _cacheFor(rootId);
  cache.text.clear(); cache.fileId.clear(); cache.folderId.clear();

  // one parallel round trip for all five root entries…
  const [spaceFolders, trashFolders, archiveFolders, infoFiles, uploadFolders] = await Promise.all([
    _findChild(token, 'Space', rootId, true),
    _findChild(token, 'trash', rootId, true),
    _findChild(token, 'archive', rootId, true),
    _findChild(token, 'info.md', rootId, false),
    _findChild(token, 'Upload', rootId, true),
  ]);

  // …then read every section (and every file inside it) in parallel.
  // info.md is fetched FIRST: its fileHandlers map registers custom file
  // extensions the Space/ walk must also collect (e.g. .ipynb).
  const files = [];
  const spaceDirs = [];   // every directory under Space/ (folders may be empty)
  const uploads = [];
  const map = {};
  const jobs = [];
  let extraExts = null;
  if (infoFiles.length) {
    cache.fileId.set('info.md', infoFiles[0].id);
    const text = await _downloadText(token, infoFiles[0].id);
    files.push({ path: 'info.md', text });
    cache.text.set('info.md', text);
    const inf = markdownToInfo(text);
    extraExts = new Set([...Object.keys(inf.fileHandlers || {}),
      ...Object.keys(inf.fileHandlersCode || {})].map(e => e.toLowerCase()));
  }
  if (spaceFolders.length) {
    cache.folderId.set('Space', spaceFolders[0].id);
    jobs.push(_collectMd(token, spaceFolders[0].id, 'Space', files, cache, spaceDirs, extraExts));
  }
  if (trashFolders.length) {
    cache.folderId.set('trash', trashFolders[0].id);
    jobs.push(_collectMd(token, trashFolders[0].id, 'trash', files, cache));
  }
  if (archiveFolders.length) {
    cache.folderId.set('archive', archiveFolders[0].id);
    jobs.push(_collectMd(token, archiveFolders[0].id, 'archive', files, cache));
  }
  if (uploadFolders.length) {
    cache.folderId.set('Upload', uploadFolders[0].id);
    jobs.push(_listChildren(token, uploadFolders[0].id).then(items =>
      Promise.all(items.map(async it => {
        if (it.mimeType === FOLDER_MIME) return;
        try {
          const blob = await _downloadBlob(token, it.id);
          const url = URL.createObjectURL(blob);
          (_objURLs[rootId] || (_objURLs[rootId] = [])).push(url);
          map[it.name] = url;
          uploads.push({ id: 'up_' + it.id, name: it.name, type: blob.type || '', size: Number(it.size) || blob.size || 0,
            uploadedAt: Date.now(), localName: it.name, wsId: rootId, dataUrl: url });
        } catch (_) {}
      }))));
  }
  await Promise.all(jobs);

  const { nodes, favorites, currentId, info } = parseFolderTree(files, spaceDirs);
  for (const n of Object.values(nodes)) if (n.blocks) n.blocks = _hydrateBlocks(n.blocks, map);
  if (info && info.pageBg && map[info.pageBg]) info.pageBgUrl = map[info.pageBg];
  cache.uploadNames = new Set(uploads.map(u => u.name));
  const masterDirs = new Set(files.filter(f => f.path.toLowerCase().endsWith('/master page.md'))
    .map(f => f.path.split('/').slice(0, -1).join('/')));
  cache.dirPaths = new Set(spaceDirs.filter(d => !masterDirs.has(d)));

  return { nodes, favorites, currentId, uploads, info };
}

/* Read plugins/<name>/* from a Drive workspace. Mirrors readLocalPlugins in
   localfs.js: each child folder of plugins/ is one plugin, its text files
   (one level) returned as { name → text }. Returns [] without a plugins/
   folder. Interpretation happens in plugins.jsx. */
const PLUGIN_FILE_RE = /\.(json|jsx?|css|md)$/i;
export async function readDrivePlugins(rootId) {
  const token = _getToken();
  if (!token) return [];
  const pluginFolders = await _findChild(token, 'plugins', rootId, true);
  if (!pluginFolders.length) return [];
  const dirs = (await _listChildren(token, pluginFolders[0].id)).filter(c => c.mimeType === FOLDER_MIME);
  return (await Promise.all(dirs.map(async d => {
    const files = {};
    await Promise.all((await _listChildren(token, d.id)).map(async c => {
      if (c.mimeType === FOLDER_MIME || !PLUGIN_FILE_RE.test(c.name)) return;
      try { files[c.name] = await _downloadText(token, c.id); } catch (_) {}
    }));
    return Object.keys(files).length ? { id: d.name, files } : null;
  }))).filter(Boolean);
}

/* Write a plugin's files into plugins/<pluginId>/ (installing from GitHub). */
export async function writeDrivePlugin(rootId, pluginId, files) {
  const token = _getToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');
  const pf = await _findChild(token, 'plugins', rootId, true);
  const pid = pf.length ? pf[0].id : await _createFolder(token, 'plugins', rootId);
  const df = await _findChild(token, pluginId, pid, true);
  const did = df.length ? df[0].id : await _createFolder(token, pluginId, pid);
  for (const [name, text] of Object.entries(files)) {
    const ex = await _findChild(token, name, did, false);
    await _uploadText(token, did, name, text, ex.length ? ex[0].id : undefined);
  }
}

/* Remove a plugin's folder (plugins/<id>/) from a Drive workspace. */
export async function deleteDrivePlugin(rootId, pluginId) {
  const token = _getToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');
  const pf = await _findChild(token, 'plugins', rootId, true);
  if (!pf.length) return;
  const df = await _findChild(token, pluginId, pf[0].id, true);
  if (df.length) await _deleteFile(token, df[0].id);
}

/* Read a Drive workspace's stored settings (theme/accent/font/description)
   from its root info.md. Returns {} if there is no info.md yet. */
export async function readDriveWorkspaceMeta(rootId) {
  const token = _getToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');
  const infoFiles = await _findChild(token, 'info.md', rootId, false);
  if (!infoFiles.length) return {};
  const text = await _downloadText(token, infoFiles[0].id);
  return markdownToInfo(text);
}

/* Rename a Drive workspace — its folder name IS the workspace title. */
export async function renameDriveWorkspace(rootId, newName) {
  const token = _getToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');
  const name = (newName || '').trim();
  if (!name) throw new Error('Workspace name cannot be empty.');
  await _driveFetch(token, `https://www.googleapis.com/drive/v3/files/${rootId}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return name;
}

/* Update a Drive workspace's description (in info.md), preserving every other
   setting already stored there. Creates info.md if it is missing. */
export async function updateDriveWorkspaceDescription(rootId, description) {
  const token = _getToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');
  const infoFiles = await _findChild(token, 'info.md', rootId, false);
  let info = {}, existingId = null;
  if (infoFiles.length) { existingId = infoFiles[0].id; info = markdownToInfo(await _downloadText(token, existingId)); }
  info.description = (description || '').trim();
  const id = await _uploadText(token, rootId, 'info.md', infoToMarkdown(info), existingId);
  // keep any active-session cache for this root consistent
  const cache = _cache[rootId];
  if (cache) { cache.fileId.set('info.md', id); cache.text.set('info.md', infoToMarkdown(info)); }
}

/* Permanently delete a whole Drive workspace folder. */
export async function deleteDriveWorkspace(rootId) {
  const token = _getToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');
  await _deleteFile(token, rootId);
  delete _cache[rootId];
  revokeDriveURLs(rootId);
}
