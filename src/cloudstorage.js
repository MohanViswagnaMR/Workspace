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
import { buildFolderPlan, parseFolderTree } from './markdown.js';

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

async function _driveFetch(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!res.ok) throw new Error('Drive request failed ' + (await _errMsg(res)));
  return res;
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
  const out = [];
  for (const f of folders) {
    const hasSpace = (await _findChild(token, 'Space', f.id, true)).length > 0;
    if (hasSpace) out.push({ id: f.id, name: f.name });
  }
  return out;
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

  // delete files no longer present
  for (const path of [...cache.text.keys()]) {
    if (!desired.has(path)) {
      const id = cache.fileId.get(path);
      if (id) await _deleteFile(token, id);
      cache.text.delete(path); cache.fileId.delete(path);
    }
  }
  // upsert changed / new files
  for (const [path, text] of desired) {
    if (cache.text.get(path) === text) continue;
    const parts = path.split('/');
    const name = parts.pop();
    const parentId = await _ensureFolderPath(token, rootId, parts, cache);
    const id = await _uploadText(token, parentId, name, text, cache.fileId.get(path));
    cache.text.set(path, text); cache.fileId.set(path, id);
  }
  // reconcile uploads (delete Upload/ files no longer referenced)
  await _reconcileDriveUploads(token, rootId, plan.uploads, cache).catch(() => {});
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

async function _collectMd(token, dirId, relPath, out, cache) {
  const children = await _listChildren(token, dirId);
  for (const c of children) {
    const p = relPath + '/' + c.name;
    if (c.mimeType === FOLDER_MIME) {
      cache.folderId.set(p, c.id);
      await _collectMd(token, c.id, p, out, cache);
    } else if (c.name.toLowerCase().endsWith('.md')) {
      const text = await _downloadText(token, c.id);
      out.push({ path: p, text });
      cache.text.set(p, text); cache.fileId.set(p, c.id);
    }
  }
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

  const files = [];
  const spaceFolders = await _findChild(token, 'Space', rootId, true);
  if (spaceFolders.length) {
    cache.folderId.set('Space', spaceFolders[0].id);
    await _collectMd(token, spaceFolders[0].id, 'Space', files, cache);
  }
  const trashFolders = await _findChild(token, 'trash', rootId, true);
  if (trashFolders.length) {
    cache.folderId.set('trash', trashFolders[0].id);
    await _collectMd(token, trashFolders[0].id, 'trash', files, cache);
  }
  const archiveFolders = await _findChild(token, 'archive', rootId, true);
  if (archiveFolders.length) {
    cache.folderId.set('archive', archiveFolders[0].id);
    await _collectMd(token, archiveFolders[0].id, 'archive', files, cache);
  }
  // workspace info.md (root)
  const infoFiles = await _findChild(token, 'info.md', rootId, false);
  if (infoFiles.length) {
    cache.fileId.set('info.md', infoFiles[0].id);
    const text = await _downloadText(token, infoFiles[0].id);
    files.push({ path: 'info.md', text });
    cache.text.set('info.md', text);
  }
  const { nodes, favorites, currentId, info } = parseFolderTree(files);

  // uploads
  const uploads = [];
  const map = {};
  const uploadFolders = await _findChild(token, 'Upload', rootId, true);
  if (uploadFolders.length) {
    cache.folderId.set('Upload', uploadFolders[0].id);
    const items = await _listChildren(token, uploadFolders[0].id);
    for (const it of items) {
      if (it.mimeType === FOLDER_MIME) continue;
      try {
        const blob = await _downloadBlob(token, it.id);
        const url = URL.createObjectURL(blob);
        (_objURLs[rootId] || (_objURLs[rootId] = [])).push(url);
        map[it.name] = url;
        uploads.push({ id: 'up_' + it.id, name: it.name, type: blob.type || '', size: Number(it.size) || blob.size || 0,
          uploadedAt: Date.now(), localName: it.name, wsId: rootId, dataUrl: url });
      } catch (_) {}
    }
  }
  for (const n of Object.values(nodes)) if (n.blocks) n.blocks = _hydrateBlocks(n.blocks, map);
  if (info && info.pageBg && map[info.pageBg]) info.pageBgUrl = map[info.pageBg];

  return { nodes, favorites, currentId, uploads, info };
}

/* Permanently delete a whole Drive workspace folder. */
export async function deleteDriveWorkspace(rootId) {
  const token = _getToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');
  await _deleteFile(token, rootId);
  delete _cache[rootId];
  revokeDriveURLs(rootId);
}
