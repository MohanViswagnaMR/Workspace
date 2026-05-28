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

/** Return the stored record for one workspace (or null) */
export async function getLocalWorkspaceRecord(id) {
  return idbGet(id);
}

/** Remove a local workspace from IndexedDB (does NOT delete the folder/file) */
export async function removeLocalWorkspaceRecord(id) {
  await idbDelete(id);
}
