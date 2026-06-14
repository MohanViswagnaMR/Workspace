/* =========================================================================
   localfs.js — local-file workspace storage
   =========================================================================
   Uses the File System Access API (showDirectoryPicker) so the workspace
   is stored as a JSON file in a folder the user chooses.

   FileSystemDirectoryHandle objects are serialised into IndexedDB
   (localStorage can't hold them) so the same folder is found again on
   the next visit.  The browser still asks the user to confirm access once
   per session, but never asks them to pick the folder again.

   Browser support: Chrome 86+, Edge 86+, Opera 72+.
   Firefox and Safari ≤ 15.1 are NOT supported — isLocalFSSupported()
   returns false and the caller should hide / disable the option.
   ========================================================================= */

const IDB_DB    = 'workspace-localfs';
const IDB_VER   = 1;
const IDB_STORE = 'handles';
const WS_FILE   = 'workspace.json';

/* ---------------------------------------------------------------- feature detect */
export const isLocalFSSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.showDirectoryPicker === 'function';

/* ---------------------------------------------------------------- IndexedDB tiny wrapper */
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, IDB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function idbGet(id) {
  const db  = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

async function idbPut(record) {
  const db  = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

async function idbGetAll() {
  const db  = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });
}

async function idbDelete(id) {
  const db  = await openIDB();
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

/**
 * Like verifyPermission but never swallows errors — returns a structured
 * result so callers can tell apart "user clicked Don't Allow" from a thrown
 * exception (e.g. lost user activation, insecure context, stale handle).
 *   { granted: boolean, reason: 'granted'|'denied'|'no-handle'|'<error.name>' }
 */
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

/* ================================================================ PUBLIC API */

/**
 * Open the OS folder-picker, register the chosen directory in IndexedDB,
 * and return the record.  Throws an AbortError if the user cancels.
 */
export async function pickAndRegisterDirectory(wsId, wsName) {
  if (!isLocalFSSupported())
    throw new Error('File System Access API is not supported in this browser.');

  const dirHandle = await window.showDirectoryPicker({
    id: 'workspace-ws',
    mode: 'readwrite',
    startIn: 'documents',
  });

  const record = {
    id:        wsId,
    name:      wsName,
    dirName:   dirHandle.name,
    handle:    dirHandle,
    createdAt: Date.now(),
  };
  await idbPut(record);
  return record;
}

/**
 * Return the directory handle that actually contains workspace.json — either
 * `dirHandle` itself, or one of its immediate subfolders. Returns null if no
 * workspace.json is found at either level.
 */
async function locateWorkspaceDir(dirHandle) {
  // 1) the picked folder itself
  try {
    await dirHandle.getFileHandle(WS_FILE);
    return dirHandle;
  } catch (e) {
    if (e.name !== 'NotFoundError') throw e;
  }
  // 2) one level of subfolders (e.g. the user picked the parent folder)
  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'directory') continue;
      try {
        await entry.getFileHandle(WS_FILE);
        return entry;
      } catch (_) { /* not in this subfolder */ }
    }
  } catch (_) { /* directory not iterable */ }
  return null;
}

/**
 * Re-pick a folder for an existing workspace whose handle was lost on this
 * device. Searches the chosen folder (and its immediate subfolders) for an
 * existing workspace.json, registers the matching directory in IndexedDB, and
 * returns the record annotated with `foundFile` so the caller can warn the user
 * if no existing workspace file was found.  Throws AbortError if cancelled.
 */
export async function relinkAndRegisterDirectory(wsId, wsName) {
  if (!isLocalFSSupported())
    throw new Error('File System Access API is not supported in this browser.');

  const picked = await window.showDirectoryPicker({
    id: 'workspace-ws',
    mode: 'readwrite',
    startIn: 'documents',
  });

  const located  = await locateWorkspaceDir(picked);
  const dirHandle = located || picked;

  const record = {
    id:        wsId,
    name:      wsName,
    dirName:   dirHandle.name,
    handle:    dirHandle,
    createdAt: Date.now(),
  };
  await idbPut(record);
  return { ...record, foundFile: !!located };
}

/**
 * Connect an EXISTING workspace folder (e.g. one copied from another machine)
 * as a brand-new local workspace under `wsId`. Picks a folder, finds the
 * directory that holds workspace.json (root or one subfolder deep), and
 * registers the handle WITHOUT writing/overwriting anything.
 * Returns { dirName, handle, foundFile }. Throws AbortError if cancelled.
 */
export async function openExistingDirectory(wsId) {
  if (!isLocalFSSupported())
    throw new Error('File System Access API is not supported in this browser.');

  const picked = await window.showDirectoryPicker({
    id: 'workspace-ws',
    mode: 'readwrite',
    startIn: 'documents',
  });

  const located   = await locateWorkspaceDir(picked);
  const dirHandle  = located || picked;

  await idbPut({
    id:        wsId,
    dirName:   dirHandle.name,
    handle:    dirHandle,
    createdAt: Date.now(),
  });

  // Read workspace.json straight away, while we already hold the located handle
  // (avoids a second permission/IndexedDB round-trip that can fail silently).
  let data = null;
  if (located) {
    try {
      const fh   = await dirHandle.getFileHandle(WS_FILE);
      const file = await fh.getFile();
      data = JSON.parse(await file.text());
    } catch (e) {
      console.warn('[localfs] openExistingDirectory read failed:', e);
    }
  }
  return { dirName: dirHandle.name, handle: dirHandle, foundFile: !!located, data };
}

/**
 * Return all registered local-workspace records from IndexedDB, each
 * annotated with `accessible: boolean` (true = permission already granted,
 * no prompt needed).
 */
export async function loadLocalWorkspaceIndex() {
  try {
    const all = await idbGetAll();
    return await Promise.all(all.map(async rec => {
      let accessible = false;
      try {
        accessible =
          (await rec.handle.queryPermission({ mode: 'readwrite' })) === 'granted';
      } catch (_) {}
      return { ...rec, accessible };
    }));
  } catch (_) {
    return [];
  }
}

/**
 * Read and parse workspace.json from a stored directory.
 * Returns null if the file doesn't exist yet (brand-new workspace).
 * Throws if permission is denied.
 */
export async function readLocalWorkspace(id) {
  const rec = await idbGet(id);
  if (!rec) throw new Error('Local workspace record not found in IndexedDB');
  const ok = await verifyPermission(rec.handle, false);
  if (!ok) throw new Error('Permission denied');
  try {
    const fh   = await rec.handle.getFileHandle(WS_FILE);
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  } catch (e) {
    if (e.name === 'NotFoundError') return null;   // file doesn't exist yet
    throw e;
  }
}

/**
 * Serialise `data` to workspace.json inside the stored directory.
 * Requests write permission if not already granted.
 */
let _localWriteTimer = {};
export function writeLocalWorkspaceDebounced(id, data, delayMs = 800) {
  clearTimeout(_localWriteTimer[id]);
  _localWriteTimer[id] = setTimeout(() => _doWrite(id, data), delayMs);
}

async function _doWrite(id, data) {
  try {
    const rec = await idbGet(id);
    if (!rec) return;
    const ok = await verifyPermission(rec.handle, true);
    if (!ok) return;
    const fh       = await rec.handle.getFileHandle(WS_FILE, { create: true });
    const writable = await fh.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  } catch (e) {
    console.warn('[localfs] write failed:', e.message);
  }
}

/** Immediate (non-debounced) write — used when switching away from a workspace */
export async function writeLocalWorkspaceNow(id, data) {
  return _doWrite(id, data);
}

/**
 * Request readwrite permission for a stored handle — must be called from
 * a user-gesture handler (e.g., a button click).
 * Returns true if permission is now granted.
 *
 * NOTE: this awaits IndexedDB before calling requestPermission(), which can
 * eat the browser's transient user-activation window and silently suppress the
 * permission prompt. Prefer requestPermissionForHandle() with an in-memory
 * handle when you're inside a click handler.
 */
export async function requestLocalWorkspacePermission(id) {
  try {
    const rec = await idbGet(id);
    if (!rec) return false;
    return verifyPermission(rec.handle, true);
  } catch (_) {
    return false;
  }
}

/**
 * Request readwrite permission directly on an already-loaded directory handle.
 * Because there's no async IndexedDB hop before requestPermission(), the
 * browser's transient user-activation is preserved and the permission prompt
 * reliably appears. Call this synchronously from inside a click handler.
 * Returns true if permission is now granted.
 */
export async function requestPermissionForHandle(handle, write = true) {
  const { granted } = await verifyPermissionDetailed(handle, write);
  return granted;
}

/**
 * Same as requestPermissionForHandle but returns the structured result
 * { granted, reason } so the UI can show a meaningful message.
 */
export async function requestPermissionForHandleDetailed(handle, write = true) {
  return verifyPermissionDetailed(handle, write);
}

/** Return the stored record for one workspace (or null) */
export async function getLocalWorkspaceRecord(id) {
  return idbGet(id);
}

/** Remove a local workspace from IndexedDB (does NOT delete the folder/file) */
export async function removeLocalWorkspaceRecord(id) {
  await idbDelete(id);
}

/**
 * Write an uploaded file into the workspace's `uploads/` sub-folder.
 * Creates the sub-folder if it doesn't exist yet.
 * Returns the unique filename used inside uploads/, or null on failure.
 */
export async function writeLocalUploadFile(wsId, originalName, dataUrl) {
  try {
    const rec = await idbGet(wsId);
    if (!rec) return null;
    const ok = await verifyPermission(rec.handle, true);
    if (!ok) return null;
    const uploadsDir = await rec.handle.getDirectoryHandle('uploads', { create: true });
    const safeName = Date.now() + '_' + originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fh = await uploadsDir.getFileHandle(safeName, { create: true });
    const writable = await fh.createWritable();
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await writable.write(blob);
    await writable.close();
    return safeName;
  } catch (e) {
    console.warn('[localfs] writeLocalUploadFile failed:', e.message);
    return null;
  }
}

/**
 * Read an upload file from the workspace's `uploads/` sub-folder and return a
 * blob object URL (for display) plus its type. Returns null if the file or the
 * folder is missing. The caller is responsible for URL.revokeObjectURL().
 */
export async function readLocalUploadURL(wsId, localName) {
  if (!localName) return null;
  try {
    const rec = await idbGet(wsId);
    if (!rec) return null;
    const ok = await verifyPermission(rec.handle, false);
    if (!ok) return null;
    const uploadsDir = await rec.handle.getDirectoryHandle('uploads', { create: false });
    const fh   = await uploadsDir.getFileHandle(localName, { create: false });
    const file = await fh.getFile();
    return { url: URL.createObjectURL(file), type: file.type };
  } catch (e) {
    if (e.name !== 'NotFoundError')
      console.warn('[localfs] readLocalUploadURL failed:', e.message);
    return null;
  }
}

/**
 * Delete a previously written upload file from the workspace's `uploads/`
 * sub-folder. `localName` is the value returned by writeLocalUploadFile.
 */
export async function deleteLocalUploadFile(wsId, localName) {
  if (!localName) return;
  try {
    const rec = await idbGet(wsId);
    if (!rec) return;
    const ok = await verifyPermission(rec.handle, true);
    if (!ok) return;
    const uploadsDir = await rec.handle.getDirectoryHandle('uploads', { create: false });
    await uploadsDir.removeEntry(localName);
  } catch (e) {
    if (e.name !== 'NotFoundError')
      console.warn('[localfs] deleteLocalUploadFile failed:', e.message);
  }
}
