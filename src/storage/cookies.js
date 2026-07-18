/* =========================================================================
   cookies.js — tiny cookie persistence (the local "what to reconnect to")
   =========================================================================
   Cookies hold only small pointers, never workspace data:
     - the active workspace pointer (type + name + optional Drive folder id)
     - the theme + accent

   The actual File System directory handle can't be serialized into a cookie,
   so it stays in IndexedDB (see localfs.js); the Google Drive OAuth token
   stays in sessionStorage (see cloudstorage.js). Values are stored as simple
   delimited, URL-encoded strings — no JSON.
   ========================================================================= */

const PTR_KEY   = 'ws_active';
const THEME_KEY = 'ws_theme';
const ONE_YEAR  = 365;

export function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
export function setCookie(name, value, days = ONE_YEAR) {
  const exp = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
}
export function deleteCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

/* ------------------------------------------------- active workspace pointer */
/* Encoded as:  v1|<type>|<name>|<folderId>   (name/folderId URL-encoded). */
export function readActivePointer() {
  const raw = getCookie(PTR_KEY);
  if (!raw) return null;
  const parts = raw.split('|');
  if (parts[0] !== 'v1') return null;
  const type = parts[1];
  if (type !== 'local' && type !== 'gdrive') return null;
  return {
    type,
    name: decodeURIComponent(parts[2] || ''),
    folderId: parts[3] ? decodeURIComponent(parts[3]) : '',
    id: parts[4] ? decodeURIComponent(parts[4]) : '',
  };
}
export function writeActivePointer(ptr) {
  if (!ptr || !ptr.type) return clearActivePointer();
  const enc = s => encodeURIComponent(s || '');
  setCookie(PTR_KEY, ['v1', ptr.type, enc(ptr.name), enc(ptr.folderId), enc(ptr.id)].join('|'));
}
export function clearActivePointer() { deleteCookie(PTR_KEY); }

/* ------------------------------------------------------------------- theme */
/* Encoded as:  <theme>|<accent> */
export function readTheme() {
  const raw = getCookie(THEME_KEY);
  // Default look: dark mode with a ROSE accent.
  if (!raw) return { theme: 'dark', accent: 'rose' };
  const [theme, accent] = raw.split('|');
  return { theme: theme === 'dark' ? 'dark' : 'light', accent: accent || 'rose' };
}
export function writeTheme({ theme, accent }) {
  setCookie(THEME_KEY, `${theme === 'dark' ? 'dark' : 'light'}|${accent || 'rose'}`);
}
