/* =========================================================================
   localfs.js — local-folder workspace storage (File System Access API)
   =========================================================================
   The workspace is stored as a plain folder tree the user chooses:

     <picked folder>/          ← the workspace (its name = the workspace title)
     ├── Upload/               ← uploaded files
     └── Space/                ← pages as Markdown (.md), nested by folders

   Serialization to/from this tree lives in ./markdown.js — this module only
   does the File-System-Access plumbing: directory handles (persisted in
   IndexedDB, since handles can't live in a cookie), permissions, and reading /
   writing the tree with minimal churn.

   Browser support: Chromium (Chrome, Edge, Brave, Opera). Firefox and Safari
   lack showDirectoryPicker — isLocalFSSupported() returns false and callers
   fall back to Google Drive.
   ========================================================================= */
import { buildFolderPlan, parseFolderTree, slugifyTitle, FILE_PAGE_EXT_RE, markdownToInfo } from './markdown.js';

const IDB_DB    = 'workspace-localfs';
const IDB_VER   = 1;
const IDB_STORE = 'handles';
const SPACE_DIR   = 'Space';
const UPLOAD_DIR  = 'Upload';
const TRASH_DIR   = 'trash';
const ARCHIVE_DIR = 'archive';
const PLUGIN_DIR  = 'plugins';

/* ---------------------------------------------------------------- feature detect */
export const isLocalFSSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.showDirectoryPicker === 'function';

/* ---------------------------------------------------------------- IndexedDB tiny wrapper */
let _dbPromise = null;
function openIDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, IDB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => {
      const db = e.target.result;
      // another tab upgrading the DB needs us to let go of the connection
      db.onversionchange = () => { try { db.close(); } catch (_) {} _dbPromise = null; };
      resolve(db);
    };
    req.onerror = e => { _dbPromise = null; reject(e.target.error); };
  });
  return _dbPromise;
}
async function idbGet(id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}
async function idbPut(record) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}
async function idbGetAll() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });
}
async function idbDelete(id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/* ---------------------------------------------------------------- permission helpers */
async function verifyPermission(dirHandle, write = true) {
  const opts = { mode: write ? 'readwrite' : 'read' };
  if ((await dirHandle.queryPermission(opts)) === 'granted') return true;
  if ((await dirHandle.requestPermission(opts)) === 'granted') return true;
  return false;
}

/* Structured variant so the UI can tell "Don't Allow" apart from a thrown error. */
async function verifyPermissionDetailed(dirHandle, write = true) {
  if (!dirHandle) return { granted: false, reason: 'no-handle' };
  const opts = { mode: write ? 'readwrite' : 'read' };
  try {
    if ((await dirHandle.queryPermission(opts)) === 'granted')
      return { granted: true, reason: 'granted' };
    const res = await dirHandle.requestPermission(opts);
    return res === 'granted'
      ? { granted: true, reason: 'granted' }
      : { granted: false, reason: 'denied' };
  } catch (e) {
    console.warn('[localfs] requestPermission threw:', e);
    return { granted: false, reason: e?.name || 'error', error: e };
  }
}

/* ================================================================ directory navigation */
/* Walk (optionally creating) a nested path relative to `root`, returning the
   leaf directory handle. `parts` excludes the final filename. */
async function _dir(root, parts, create) {
  let h = root;
  for (const p of parts) h = await h.getDirectoryHandle(p, { create });
  return h;
}
async function _writeFileAtPath(root, path, text) {
  const parts = path.split('/');
  const name = parts.pop();
  const dir = await _dir(root, parts, true);
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}
async function _deleteFileAtPath(root, path) {
  const parts = path.split('/');
  const name = parts.pop();
  try {
    const dir = await _dir(root, parts, false);
    await dir.removeEntry(name);
  } catch (_) { /* already gone */ }
}
/* Recursively remove empty sub-directories under `root/relDir`. Returns true
   if the directory itself is now empty. */
async function _pruneEmptyDirs(root, relDir) {
  let dir;
  try { dir = await _dir(root, relDir.split('/'), false); } catch { return false; }
  const subdirs = [];
  let count = 0;
  for await (const [name, handle] of dir.entries()) {
    count++;
    if (handle.kind === 'directory') subdirs.push(name);
  }
  for (const name of subdirs) {
    const emptied = await _pruneEmptyDirs(root, relDir + '/' + name);
    if (emptied) { try { await dir.removeEntry(name); count--; } catch (_) {} }
  }
  return count === 0;
}

/* ================================================================ pickers */
/* Does this folder look like a workspace? (has a Space/ sub-folder) */
async function _looksLikeWorkspace(dirHandle) {
  try { await dirHandle.getDirectoryHandle(SPACE_DIR); return true; }
  catch { return false; }
}
/* Return the handle that actually contains a workspace — the picked folder or
   one immediate sub-folder — else null. */
async function _locateWorkspaceDir(dirHandle) {
  if (await _looksLikeWorkspace(dirHandle)) return dirHandle;
  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'directory' && await _looksLikeWorkspace(entry)) return entry;
    }
  } catch (_) {}
  return null;
}

/* Create a BRAND-NEW workspace folder. The user picks a LOCATION (parent
   folder) and gives a workspace NAME; we create "<name>" inside the chosen
   location and register it. The created folder becomes the workspace root and
   its name is the workspace title. Returns { alreadyExisted } so the caller can
   avoid clobbering a folder of the same name that already has content. */
export async function createLocalWorkspaceFolder(wsId, name) {
  if (!isLocalFSSupported())
    throw new Error('File System Access API is not supported in this browser.');
  const folderName = slugifyTitle(name) || 'Workspace';
  const parent = await window.showDirectoryPicker({ id: 'workspace-parent', mode: 'readwrite', startIn: 'documents' });
  let alreadyExisted = true;
  try { await parent.getDirectoryHandle(folderName); }        // exists?
  catch { alreadyExisted = false; }
  const dirHandle = await parent.getDirectoryHandle(folderName, { create: true });
  const record = { id: wsId, name: dirHandle.name, dirName: dirHandle.name, handle: dirHandle, createdAt: Date.now() };
  await idbPut(record);
  return { ...record, alreadyExisted };
}

/* Re-pick a folder for an existing workspace whose handle was lost on this
   device. `foundFile` reports whether an existing Space/ tree was found. */
export async function relinkAndRegisterDirectory(wsId) {
  if (!isLocalFSSupported())
    throw new Error('File System Access API is not supported in this browser.');
  const picked = await window.showDirectoryPicker({ id: 'workspace-ws', mode: 'readwrite', startIn: 'documents' });
  const located = await _locateWorkspaceDir(picked);
  const dirHandle = located || picked;
  const record = { id: wsId, name: dirHandle.name, dirName: dirHandle.name, handle: dirHandle, createdAt: Date.now() };
  await idbPut(record);
  return { ...record, foundFile: !!located };
}

/* Connect an EXISTING workspace folder as a new workspace WITHOUT writing
   anything — reads its tree straight away while we hold the located handle. */
export async function openExistingDirectory(wsId) {
  if (!isLocalFSSupported())
    throw new Error('File System Access API is not supported in this browser.');
  const picked = await window.showDirectoryPicker({ id: 'workspace-ws', mode: 'readwrite', startIn: 'documents' });
  const located = await _locateWorkspaceDir(picked);
  const dirHandle = located || picked;
  await idbPut({ id: wsId, name: dirHandle.name, dirName: dirHandle.name, handle: dirHandle, createdAt: Date.now() });

  let data = null;
  if (located) {
    try { data = await _readTreeFromHandle(wsId, dirHandle); } catch (e) { console.warn('[localfs] openExisting read failed:', e); }
  }
  return { dirName: dirHandle.name, name: dirHandle.name, handle: dirHandle, foundFile: !!located, data };
}

/* ================================================================ index / records */
export async function loadLocalWorkspaceIndex() {
  try {
    const all = await idbGetAll();
    return await Promise.all(all.map(async rec => {
      let accessible = false;
      try { accessible = (await rec.handle.queryPermission({ mode: 'readwrite' })) === 'granted'; } catch (_) {}
      return { ...rec, accessible };
    }));
  } catch (_) { return []; }
}
export async function getLocalWorkspaceRecord(id) { return idbGet(id); }
export async function removeLocalWorkspaceRecord(id) {
  // Cancel any pending debounced write FIRST so a stale write can never fire
  // for a workspace we're forgetting. Then drop the handle + caches. No file
  // on disk is ever removed here — this only disconnects.
  clearTimeout(_writeTimers[id]); delete _writeTimers[id];
  await idbDelete(id); revokeLocalURLs(id); delete _treeCache[id]; delete _uploadNameCache[id];
}

export async function requestPermissionForHandleDetailed(handle, write = true) {
  return verifyPermissionDetailed(handle, write);
}

/* ================================================================ blob-URL registry */
const _objURLs = {}; // id -> [blobURL]
function _track(id, url) { (_objURLs[id] || (_objURLs[id] = [])).push(url); }
export function revokeLocalURLs(id) {
  (_objURLs[id] || []).forEach(u => { try { URL.revokeObjectURL(u); } catch (_) {} });
  _objURLs[id] = [];
}

/* ================================================================ read tree */
async function _collectMd(dirHandle, relPath, out, dirs, extraExts) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'directory') {
      if (dirs) dirs.push(relPath + '/' + name);
      await _collectMd(handle, relPath + '/' + name, out, dirs, extraExts);
    } else if (name.toLowerCase().endsWith('.md') || FILE_PAGE_EXT_RE.test(name)
        || (extraExts && extraExts.has((name.match(/\.([^./]+)$/) || [, ''])[1]?.toLowerCase()))) {
      // .md pages plus text files (.py/.html/…) that open as 'file' pages —
      // extraExts carries the workspace's CUSTOM types (Settings → File handlers)
      const file = await handle.getFile();
      out.push({ path: relPath + '/' + name, text: await file.text() });
    }
  }
}

async function _readUploads(root, id) {
  const uploads = [];
  const map = {}; // localName -> blobURL
  let dir;
  try { dir = await root.getDirectoryHandle(UPLOAD_DIR); } catch { return { uploads, map }; }
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue;
    try {
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      _track(id, url);
      map[name] = url;
      uploads.push({ id: 'up_' + name, name, type: file.type || '', size: file.size,
        uploadedAt: file.lastModified || Date.now(), localName: name, wsId: id, dataUrl: url });
    } catch (_) {}
  }
  return { uploads, map };
}

/* Fill block.url from the localName→blobURL map (recursing into toggles). */
function _hydrateBlocks(blocks, map) {
  return (blocks || []).map(b => {
    let nb = b;
    if (b.localName && map[b.localName]) nb = { ...b, url: map[b.localName] };
    if (nb.children) nb = { ...nb, children: _hydrateBlocks(nb.children, map) };
    return nb;
  });
}

async function _readTreeFromHandle(id, root) {
  revokeLocalURLs(id);
  const files = [];
  const spaceDirs = [];   // every directory under Space/ (folders may be empty)
  // info.md FIRST — its fileHandlers map registers custom file extensions that
  // the Space/ walk below must also collect (e.g. .ipynb).
  let extraExts = null;
  try {
    const fh = await root.getFileHandle('info.md');
    const text = await (await fh.getFile()).text();
    files.push({ path: 'info.md', text });
    const inf = markdownToInfo(text);
    extraExts = new Set([...Object.keys(inf.fileHandlers || {}),
      ...Object.keys(inf.fileHandlersCode || {})].map(e => e.toLowerCase()));
  } catch (_) { /* no info.md yet */ }
  try {
    const space = await root.getDirectoryHandle(SPACE_DIR);
    await _collectMd(space, SPACE_DIR, files, spaceDirs, extraExts);
  } catch (_) { /* no Space/ yet */ }
  try {
    const trash = await root.getDirectoryHandle(TRASH_DIR);
    await _collectMd(trash, TRASH_DIR, files);
  } catch (_) { /* no trash/ yet */ }
  try {
    const archive = await root.getDirectoryHandle(ARCHIVE_DIR);
    await _collectMd(archive, ARCHIVE_DIR, files);
  } catch (_) { /* no archive/ yet */ }

  const { nodes, favorites, currentId, info } = parseFolderTree(files, spaceDirs);
  const { uploads, map } = await _readUploads(root, id);

  for (const n of Object.values(nodes)) {
    if (n.blocks) n.blocks = _hydrateBlocks(n.blocks, map);
  }
  // Resolve the page-background image to a displayable blob URL.
  if (info && info.pageBg && map[info.pageBg]) info.pageBgUrl = map[info.pageBg];

  // Prime the write cache with the ACTUAL on-disk files, so the first save only
  // writes real differences — and still creates files that don't exist yet (e.g.
  // info.md in an older workspace).
  _treeCache[id] = new Map(files.map(f => [f.path, f.text]));
  const masterDirs = new Set(files.filter(f => f.path.toLowerCase().endsWith('/master page.md'))
    .map(f => f.path.split('/').slice(0, -1).join('/')));
  _dirCache[id] = new Set(spaceDirs.filter(d => !masterDirs.has(d)));

  return { nodes, favorites, currentId, uploads, info };
}

/* ================================================================ plugins */
/* Read plugins/<name>/* from a local workspace folder. Each direct child
   directory of plugins/ is one plugin: every text file inside it (one level,
   .json/.js/.jsx/.css/.md) is returned as { name → text }. Interpretation
   (manifest parsing, compiling, consent) happens in plugins.jsx — this
   function only reads bytes. Returns [] when there is no plugins/ folder. */
const PLUGIN_FILE_RE = /\.(json|jsx?|css|md)$/i;
export async function readLocalPlugins(wsId) {
  const rec = await idbGet(wsId);
  if (!rec) return [];
  if (!(await verifyPermission(rec.handle, false))) return [];
  let dir;
  try { dir = await rec.handle.getDirectoryHandle(PLUGIN_DIR); } catch { return []; }
  const out = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'directory') continue;
    const files = {};
    try {
      for await (const [fname, fh] of handle.entries()) {
        if (fh.kind !== 'file' || !PLUGIN_FILE_RE.test(fname)) continue;
        files[fname] = await (await fh.getFile()).text();
      }
    } catch (_) { continue; }
    if (Object.keys(files).length) out.push({ id: name, files });
  }
  return out;
}

/* Write a plugin's files into plugins/<pluginId>/ (installing from GitHub). */
export async function writeLocalPlugin(wsId, pluginId, files) {
  const rec = await idbGet(wsId);
  if (!rec) throw new Error('Workspace not found');
  if (!(await verifyPermission(rec.handle, true))) throw new Error('Permission to write the workspace folder was denied.');
  const dir = await _dir(rec.handle, [PLUGIN_DIR, pluginId], true);
  for (const [name, text] of Object.entries(files)) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }
}

/* Read a local workspace's full tree → { nodes, favorites, currentId, uploads }.
   Returns null if the folder has no Space/ yet (brand-new). Throws on denied. */
export async function readWorkspaceTree(id) {
  const rec = await idbGet(id);
  if (!rec) throw new Error('Local workspace record not found in IndexedDB');
  if (!(await verifyPermission(rec.handle, false))) throw new Error('Permission denied');
  return _readTreeFromHandle(id, rec.handle);
}

/* ================================================================ write tree */
const _treeCache = {};        // id -> Map(path -> lastWrittenText)
const _dirCache = {};         // id -> Set(folder-node dir paths at last save)
const _uploadNameCache = {};  // id -> Set(upload names at last reconcile)
const _writeTimers = {};

async function _doWriteTree(id, store) {
  try {
    const rec = await idbGet(id);
    if (!rec) return;
    if (!(await verifyPermission(rec.handle, true))) return;
    const root = rec.handle;

    const plan = buildFolderPlan(store);
    const desired = new Map(plan.files.map(f => [f.path, f.text]));
    const prev = _treeCache[id] || new Map();

    // 1) delete files no longer present
    let deletedAny = false;
    for (const path of prev.keys()) {
      if (!desired.has(path)) { await _deleteFileAtPath(root, path); deletedAny = true; }
    }
    // 2) write new / changed files
    for (const [path, text] of desired) {
      if (prev.get(path) === text) continue;
      try { await _writeFileAtPath(root, path, text); }
      catch (e) { console.warn('[localfs] write failed:', path, e.message); }
    }
    // 3) remove directories that became empty — a file deletion or a removed
    //    folder-node can empty one; skip the full-tree walk on ordinary saves
    const planDirs = new Set(plan.dirs || []);
    const prevDirs = _dirCache[id] || new Set();
    const dirsGone = [...prevDirs].some(d => !planDirs.has(d));
    if (deletedAny || dirsGone) await _pruneEmptyDirs(root, SPACE_DIR).catch(() => {});
    // 3b) (re)create folder-node directories — folders have no master page.md,
    //     so an empty one exists on disk only as a bare directory
    for (const d of plan.dirs || []) {
      try { await _dir(root, d.split('/'), true); }
      catch (e) { console.warn('[localfs] mkdir failed:', d, e.message); }
    }
    _dirCache[id] = planDirs;
    // 4) reconcile uploads (delete files no longer referenced) — only when the
    //    referenced set changed since the last save; it walks Upload/ each time
    const uploadNames = new Set((plan.uploads || []).map(u => u.name));
    const prevUploads = _uploadNameCache[id];
    const sameUploads = prevUploads && prevUploads.size === uploadNames.size
      && [...uploadNames].every(n => prevUploads.has(n));
    if (!sameUploads) {
      await _reconcileUploads(root, plan.uploads).catch(() => {});
      _uploadNameCache[id] = uploadNames;
    }

    _treeCache[id] = desired;
  } catch (e) {
    console.warn('[localfs] writeTree failed:', e.message);
  }
}

async function _reconcileUploads(root, wantedUploads) {
  const wanted = new Set((wantedUploads || []).map(u => u.name));
  let dir;
  try { dir = await root.getDirectoryHandle(UPLOAD_DIR); } catch { return; }
  const names = [];
  for await (const [name, handle] of dir.entries()) if (handle.kind === 'file') names.push(name);
  for (const name of names) if (!wanted.has(name)) { try { await dir.removeEntry(name); } catch (_) {} }
}

export function writeWorkspaceTreeDebounced(id, store, delayMs = 800) {
  clearTimeout(_writeTimers[id]);
  _writeTimers[id] = setTimeout(() => _doWriteTree(id, store), delayMs);
}
export async function writeWorkspaceTreeNow(id, store) {
  clearTimeout(_writeTimers[id]);
  return _doWriteTree(id, store);
}

/* ================================================================ uploads */
/* Write an uploaded file into Upload/. Accepts a Blob/File directly (no
   base64 round trip) or a data-URL string. Returns the on-disk filename. */
export async function writeLocalUploadFile(wsId, originalName, fileOrDataUrl) {
  try {
    const rec = await idbGet(wsId);
    if (!rec) return null;
    if (!(await verifyPermission(rec.handle, true))) return null;
    const dir = await rec.handle.getDirectoryHandle(UPLOAD_DIR, { create: true });
    const safe = Date.now() + '_' + slugifyTitle(originalName).replace(/\s+/g, '_');
    const fh = await dir.getFileHandle(safe, { create: true });
    const w = await fh.createWritable();
    const blob = fileOrDataUrl instanceof Blob
      ? fileOrDataUrl
      : await (await fetch(fileOrDataUrl)).blob();
    await w.write(blob);
    await w.close();
    return safe;
  } catch (e) {
    console.warn('[localfs] writeLocalUploadFile failed:', e.message);
    return null;
  }
}

/* Read one upload from Upload/ as a blob URL. Caller revokes via revokeLocalURLs. */
export async function readLocalUploadURL(wsId, localName) {
  if (!localName) return null;
  try {
    const rec = await idbGet(wsId);
    if (!rec) return null;
    if (!(await verifyPermission(rec.handle, false))) return null;
    const dir = await rec.handle.getDirectoryHandle(UPLOAD_DIR, { create: false });
    const fh = await dir.getFileHandle(localName, { create: false });
    const file = await fh.getFile();
    const url = URL.createObjectURL(file);
    _track(wsId, url);
    return { url, type: file.type };
  } catch (e) {
    if (e.name !== 'NotFoundError') console.warn('[localfs] readLocalUploadURL failed:', e.message);
    return null;
  }
}

export async function deleteLocalUploadFile(wsId, localName) {
  if (!localName) return;
  try {
    const rec = await idbGet(wsId);
    if (!rec) return;
    if (!(await verifyPermission(rec.handle, true))) return;
    const dir = await rec.handle.getDirectoryHandle(UPLOAD_DIR, { create: false });
    await dir.removeEntry(localName);
  } catch (e) {
    if (e.name !== 'NotFoundError') console.warn('[localfs] deleteLocalUploadFile failed:', e.message);
  }
}
