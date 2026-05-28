/* =========================================================================
   cloudstorage.js — third-party cloud storage providers
   =========================================================================
   Supports: Google Drive · OneDrive (Microsoft Graph) · Dropbox

   Each provider stores workspace data as a single JSON file inside the
   app's dedicated folder so it never clutters the user's Drive / OneDrive
   / Dropbox root:

     Google Drive  → appDataFolder  (hidden, not browsable by the user)
     OneDrive      → /me/drive/special/approot  (Apps/<app name>/)
     Dropbox       → app-folder root  (Apps/<app name>/)

   OAuth flow
   ──────────
   All three use the implicit-grant flow (response_type=token) via a popup
   window that redirects to /oauth-callback.html.  That page posts the
   token back via postMessage and closes itself.

   Tokens are cached in sessionStorage for the lifetime of the tab.
   Client IDs are stored in localStorage so they survive between sessions
   (the user only enters them once, in the workspace creation modal).

   Public API
   ──────────
   CLOUD_PROVIDERS          — provider metadata map
   isCloudProviderConfigured(id) — true if a client ID has been saved
   getCloudClientId(id)     — retrieve saved client ID
   setCloudClientId(id,cid) — persist client ID
   authenticateProvider(id) — OAuth popup → returns access token
   readCloudWorkspace(id,fileRef)       — fetch + parse JSON from provider
   writeCloudWorkspace(id,wsId,data,fileRef) — upsert JSON to provider
   listCloudWorkspaces(id)  — list workspace files (for import / scan)
   getProviderToken(id)     — read cached token (or null)
   clearProviderToken(id)   — revoke cached token (force re-auth)
   ========================================================================= */

/* ---------------------------------------------------------------- metadata */
export const CLOUD_PROVIDERS = {
  gdrive: {
    id:        'gdrive',
    name:      'Google Drive',
    shortName: 'Drive',
    emoji:     '📁',
    color:     '#4285F4',
    gradient:  'linear-gradient(135deg,#4285F4,#34A853)',
    scope:     'https://www.googleapis.com/auth/drive.appdata',
    helpUrl:   'https://console.cloud.google.com/apis/credentials',
    /* No redirect URI needed — GIS Token Client only requires the JS origin */
    helpText:  'Create an OAuth 2.0 Client ID (Web application). No redirect URI needed — just add this site\'s origin as an Authorised JavaScript origin.',
  },
  onedrive: {
    id:        'onedrive',
    name:      'OneDrive',
    shortName: 'OneDrive',
    emoji:     '☁',
    color:     '#0078D4',
    gradient:  'linear-gradient(135deg,#0078D4,#00BCF2)',
    scope:     'files.readwrite.appfolder openid',
    authUrl:   'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    helpUrl:   'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps',
    helpText:  'Register a new application in Azure Portal. Under Authentication, add a Single-page application redirect URI pointing to /oauth-callback.html on this site.',
  },
  dropbox: {
    id:        'dropbox',
    name:      'Dropbox',
    shortName: 'Dropbox',
    emoji:     '📦',
    color:     '#0061FF',
    gradient:  'linear-gradient(135deg,#0061FF,#1da3f0)',
    scope:     '',   // Dropbox implicit flow does not use scope param
    authUrl:   'https://www.dropbox.com/oauth2/authorize',
    helpUrl:   'https://www.dropbox.com/developers/apps',
    helpText:  'Create a Dropbox app (Scoped access → App folder). Under Settings, add the OAuth 2 redirect URI pointing to /oauth-callback.html on this site.',
  },
};

/* ---------------------------------------------------------------- bundled credentials
   Client ID from the Google Cloud OAuth 2.0 credential (web application).
   The client_secret is intentionally omitted — GIS Token Client is a
   browser-only implicit flow that never needs the secret.
   Authorised JavaScript origins must include this app's origin in Google
   Cloud Console → APIs & Services → Credentials.                           */
const GDRIVE_CLIENT_ID =
  '298006869899-tfavelqu4up3u11dd462kqhcgallgcd5.apps.googleusercontent.com';

/* ---------------------------------------------------------------- storage keys */
const TOK_KEY = id => `nt_cloud_tok_${id}`;
const CID_KEY = id => `nt_cloud_cid_${id}`;

/* ============================================================ token cache */
function _getToken(providerId) {
  try {
    const raw = sessionStorage.getItem(TOK_KEY(providerId));
    if (!raw) return null;
    const { token, expires } = JSON.parse(raw);
    if (expires && Date.now() > expires) {
      sessionStorage.removeItem(TOK_KEY(providerId));
      return null;
    }
    return token;
  } catch { return null; }
}

function _setToken(providerId, token, expiresIn = 3600) {
  const expires = Date.now() + (Math.max(parseInt(expiresIn, 10) || 3600, 120) - 60) * 1000;
  sessionStorage.setItem(TOK_KEY(providerId), JSON.stringify({ token, expires }));
}

/* ============================================================ Google Identity Services (GIS)
   The GIS script is loaded via index.html so it pre-warms before any user
   gesture.  We still guard here with a poller so the module never crashes if
   the script hasn't finished executing yet.
   ============================================================ */

let _gisLoadPromise = null;

function _loadGIS() {
  /* Already fully initialised — return synchronously (no async gap) */
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (_gisLoadPromise) return _gisLoadPromise;

  _gisLoadPromise = new Promise((resolve, reject) => {
    /* The script tag is already in <head> (index.html).
       Poll until window.google.accounts.oauth2 is available. */
    const start = Date.now();
    const poll  = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(poll);
        resolve();
      } else if (Date.now() - start > 15000) {
        clearInterval(poll);
        reject(new Error(
          'Google Identity Services did not load. ' +
          'Check your internet connection and that ' +
          'https://accounts.google.com is reachable.'
        ));
      }
    }, 80);
  });
  return _gisLoadPromise;
}

/* ============================================================ Google Drive */
async function _gdriveAuth(clientId, loginHint) {
  const existing = _getToken('gdrive');
  if (existing) return existing;

  /* Wait for GIS — should already be ready since the script is in index.html.
     This await completes in one microtask tick, keeping the user-gesture window. */
  await _loadGIS();

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const cfg = {
      client_id: clientId,
      scope:     CLOUD_PROVIDERS.gdrive.scope,
      callback: (resp) => {
        if (resp.error) {
          settle(reject, new Error(resp.error_description || resp.error));
          return;
        }
        _setToken('gdrive', resp.access_token, resp.expires_in);
        settle(resolve, resp.access_token);
      },
      error_callback: (err) => {
        settle(reject, new Error(err?.message || 'Google authorisation was cancelled.'));
      },
    };

    /* login_hint tells GIS which Google account to use — skips the account
       picker entirely and goes straight to the Drive consent screen.         */
    if (loginHint) cfg.login_hint = loginHint;

    const client = window.google.accounts.oauth2.initTokenClient(cfg);

    /* No prompt arg → GIS decides:
         - silent token if scope was already consented in a previous session
         - consent overlay if this is the first time (shows "Allow Drive access") */
    client.requestAccessToken();
  });
}

/* Helper: extract a human-readable message from a Google API error response */
async function _gdriveErrMsg(res) {
  if (res.status === 401) sessionStorage.removeItem(TOK_KEY('gdrive'));
  let reason = res.statusText;
  try {
    const j = await res.json();
    reason = j?.error?.message || j?.error?.errors?.[0]?.message || reason;
  } catch (_) {}
  let hint = '';
  if (res.status === 403) {
    hint = ' — Make sure the Google Drive API is enabled in your Google Cloud project ' +
           '(APIs & Services → Library → "Google Drive API" → Enable). ' +
           'If your OAuth app is in Testing mode, also add your email as a Test User.';
  }
  return `(${res.status}) ${reason}${hint}`;
}

async function _gdriveRead(token, fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Google Drive read failed ${await _gdriveErrMsg(res)}`);
  return res.json();
}

async function _gdriveWrite(token, wsId, data, existingFileId) {
  const filename = `workspace-ws-${wsId}.json`;
  const body     = JSON.stringify(data, null, 2);
  const authHdr  = { Authorization: `Bearer ${token}` };

  if (existingFileId) {
    /* PATCH — update existing file content */
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
      { method: 'PATCH', headers: { ...authHdr, 'Content-Type': 'application/json' }, body },
    );
    if (!res.ok) throw new Error(`Google Drive write failed ${await _gdriveErrMsg(res)}`);
    return (await res.json()).id;
  }

  /* POST — create new file in appDataFolder (multipart) */
  const meta     = JSON.stringify({ name: filename, parents: ['appDataFolder'],
    ...(data.wsName ? { appProperties: { wsName: data.wsName } } : {}) });
  const boundary = '----NTFormBoundary' + Date.now().toString(36);
  const multipartBody = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}`,
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}`,
    `\r\n--${boundary}--`,
  ].join('');

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method:  'POST',
      headers: { ...authHdr, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body:    multipartBody,
    },
  );
  if (!res.ok) throw new Error(`Google Drive create failed ${await _gdriveErrMsg(res)}`);
  return (await res.json()).id;
}

async function _gdriveList(token) {
  const q   = encodeURIComponent("name contains 'workspace-ws-'");
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime,appProperties)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Google Drive list failed ${await _gdriveErrMsg(res)}`);
  return (await res.json()).files || [];
}

/* ============================================================ OneDrive */
async function _onedriveAuth(clientId) {
  const existing = _getToken('onedrive');
  if (existing) return existing;

  const state  = Math.random().toString(36).slice(2);
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  REDIRECT_URI(),
    response_type: 'token',
    scope:         CLOUD_PROVIDERS.onedrive.scope,
    state,
  });

  const result = await _openOAuthPopup(`${CLOUD_PROVIDERS.onedrive.authUrl}?${params}`);
  if (result.state !== state) throw new Error('OAuth state mismatch — possible CSRF');
  _setToken('onedrive', result.token, result.expiresIn);
  return result.token;
}

/* OneDrive stores files in the app folder — path is deterministic by wsId */
const _odriveFilePath = wsId =>
  `https://graph.microsoft.com/v1.0/me/drive/special/approot:/workspace-ws-${wsId}.json`;

async function _onedriveRead(token, fileRef) {
  /* fileRef may be a Graph item ID (faster) or fall back to path */
  const url = fileRef && !fileRef.startsWith('http')
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${fileRef}/content`
    : `${_odriveFilePath(fileRef)}:/content`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    if (res.status === 401) sessionStorage.removeItem(TOK_KEY('onedrive'));
    throw new Error(`OneDrive read failed (${res.status})`);
  }
  return res.json();
}

async function _onedriveWrite(token, wsId, data) {
  const res = await fetch(
    `${_odriveFilePath(wsId)}:/content`,
    {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(data, null, 2),
    },
  );
  if (!res.ok) {
    if (res.status === 401) sessionStorage.removeItem(TOK_KEY('onedrive'));
    throw new Error(`OneDrive write failed (${res.status})`);
  }
  const result = await res.json();
  return result.id || wsId;  /* return Graph item ID for future reads */
}

async function _onedriveList(token) {
  const res = await fetch(
    'https://graph.microsoft.com/v1.0/me/drive/special/approot/children',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`OneDrive list failed (${res.status})`);
  const { value = [] } = await res.json();
  return value.filter(f => f.name.startsWith('workspace-ws-'));
}

/* ============================================================ Dropbox */
async function _dropboxAuth(clientId) {
  const existing = _getToken('dropbox');
  if (existing) return existing;

  const state  = Math.random().toString(36).slice(2);
  const params = new URLSearchParams({
    client_id:         clientId,
    redirect_uri:      REDIRECT_URI(),
    response_type:     'token',
    token_access_type: 'legacy',
    state,
  });

  const result = await _openOAuthPopup(`${CLOUD_PROVIDERS.dropbox.authUrl}?${params}`);
  /* Dropbox does not return state in all flows — skip strict check */
  _setToken('dropbox', result.token, result.expiresIn || 14400);
  return result.token;
}

const _dbxFilePath = wsId => `/workspace-ws-${wsId}.json`;

async function _dropboxRead(token, fileRef) {
  const path = fileRef && fileRef.startsWith('/') ? fileRef : _dbxFilePath(fileRef);
  const res  = await fetch('https://content.dropboxapi.com/2/files/download', {
    method:  'POST',
    headers: {
      Authorization:    `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
  });
  if (!res.ok) {
    if (res.status === 401) sessionStorage.removeItem(TOK_KEY('dropbox'));
    throw new Error(`Dropbox read failed (${res.status})`);
  }
  return res.json();
}

async function _dropboxWrite(token, wsId, data) {
  const path = _dbxFilePath(wsId);
  const res  = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method:  'POST',
    headers: {
      Authorization:    `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: false }),
      'Content-Type':   'application/octet-stream',
    },
    body: JSON.stringify(data, null, 2),
  });
  if (!res.ok) {
    if (res.status === 401) sessionStorage.removeItem(TOK_KEY('dropbox'));
    throw new Error(`Dropbox write failed (${res.status})`);
  }
  return path; /* path is the stable file ref for Dropbox */
}

async function _dropboxList(token) {
  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path: '' }),
  });
  if (!res.ok) throw new Error(`Dropbox list failed (${res.status})`);
  const { entries = [] } = await res.json();
  return entries.filter(f => f['.tag'] === 'file' && f.name.startsWith('workspace-ws-'));
}

/* ================================================================
   PUBLIC API
   ================================================================ */

/**
 * True if the provider can be used.
 * Google Drive is always ready (bundled credentials).
 * Other providers still require a client ID to be saved by the user.
 */
export function isCloudProviderConfigured(providerId) {
  if (providerId === 'gdrive') return true;
  return !!localStorage.getItem(CID_KEY(providerId));
}

/** Retrieve the OAuth client ID for a provider. Google Drive uses the bundled one. */
export function getCloudClientId(providerId) {
  if (providerId === 'gdrive') return GDRIVE_CLIENT_ID;
  return localStorage.getItem(CID_KEY(providerId)) || '';
}

/** Persist the OAuth client ID for a provider (not needed for Google Drive). */
export function setCloudClientId(providerId, clientId) {
  if (providerId === 'gdrive') return; // bundled — cannot be overridden
  const trimmed = (clientId || '').trim();
  if (trimmed) localStorage.setItem(CID_KEY(providerId), trimmed);
  else         localStorage.removeItem(CID_KEY(providerId));
}

/**
 * Authenticate with a provider.
 * Must be called from a user-gesture handler (button click).
 * @param {string} providerId  - 'gdrive' | 'onedrive' | 'dropbox'
 * @param {object} [opts]
 * @param {string} [opts.loginHint] - email address to pre-select the account (Google only)
 * Returns the access token string.
 */
export async function authenticateProvider(providerId, opts = {}) {
  const clientId = getCloudClientId(providerId);
  if (!clientId) throw new Error(`No client ID configured for "${providerId}".`);

  switch (providerId) {
    case 'gdrive':   return _gdriveAuth(clientId, opts.loginHint);
    case 'onedrive': return _onedriveAuth(clientId);
    case 'dropbox':  return _dropboxAuth(clientId);
    default: throw new Error(`Unknown provider: "${providerId}"`);
  }
}

/**
 * Read and parse the workspace JSON for `wsId` from the given provider.
 * `fileRef` is provider-specific (GDrive: file ID · OneDrive: item ID · Dropbox: path).
 * Returns null if the file does not exist yet (first use).
 */
export async function readCloudWorkspace(providerId, wsId, fileRef) {
  const token = _getToken(providerId);
  if (!token) throw new Error('Not authenticated — call authenticateProvider() first.');

  try {
    switch (providerId) {
      case 'gdrive':   return await _gdriveRead(token, fileRef);
      case 'onedrive': return await _onedriveRead(token, fileRef || wsId);
      case 'dropbox':  return await _dropboxRead(token, fileRef || wsId);
      default: throw new Error(`Unknown provider: "${providerId}"`);
    }
  } catch (e) {
    if (e.message.includes('404') || e.message.includes('(404)')) return null;
    throw e;
  }
}

/**
 * Write workspace data to the provider.
 * Returns the new/updated file reference (store this back on the workspace object).
 */
export async function writeCloudWorkspace(providerId, wsId, data, fileRef = null) {
  const token = _getToken(providerId);
  if (!token) throw new Error('Not authenticated — call authenticateProvider() first.');

  switch (providerId) {
    case 'gdrive':   return _gdriveWrite(token, wsId, data, fileRef);
    case 'onedrive': return _onedriveWrite(token, wsId, data);
    case 'dropbox':  return _dropboxWrite(token, wsId, data);
    default: throw new Error(`Unknown provider: "${providerId}"`);
  }
}

/**
 * List workspace files on the provider (used for "scan for existing workspaces").
 * Returns an array of provider-native file objects.
 */
export async function listCloudWorkspaces(providerId) {
  const token = _getToken(providerId);
  if (!token) return [];

  switch (providerId) {
    case 'gdrive':   return _gdriveList(token);
    case 'onedrive': return _onedriveList(token);
    case 'dropbox':  return _dropboxList(token);
    default: return [];
  }
}

/** Return the cached access token for a provider (or null if expired / not authed) */
export function getProviderToken(providerId) {
  return _getToken(providerId);
}

/** Clear the cached token, forcing re-authentication on the next operation */
export function clearProviderToken(providerId) {
  sessionStorage.removeItem(TOK_KEY(providerId));
}

/* ---------------------------------------------------------------- delete helpers */
async function _gdriveDeleteFile(token, fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok && res.status !== 204)
    throw new Error(`Google Drive delete failed ${await _gdriveErrMsg(res)}`);
}

async function _onedriveDeleteFile(token, itemId) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok && res.status !== 204) {
    if (res.status === 401) sessionStorage.removeItem(TOK_KEY('onedrive'));
    throw new Error(`OneDrive delete failed (${res.status})`);
  }
}

async function _dropboxDeleteFile(token, wsId) {
  const res = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ path: _dbxFilePath(wsId) }),
  });
  if (!res.ok) {
    if (res.status === 401) sessionStorage.removeItem(TOK_KEY('dropbox'));
    throw new Error(`Dropbox delete failed (${res.status})`);
  }
}

/**
 * Permanently delete a workspace file from the cloud provider.
 * `fileRef` is the provider's file/item ID (GDrive file ID, OneDrive item ID).
 * `wsId`    is the workspace UUID (used for Dropbox path derivation).
 */
export async function deleteCloudWorkspace(providerId, fileRef, wsId) {
  const token = _getToken(providerId);
  if (!token) throw new Error('Not authenticated — call authenticateProvider() first.');

  switch (providerId) {
    case 'gdrive':   return _gdriveDeleteFile(token, fileRef);
    case 'onedrive': return _onedriveDeleteFile(token, fileRef || wsId);
    case 'dropbox':  return _dropboxDeleteFile(token, wsId);
    default: throw new Error(`Unknown provider: "${providerId}"`);
  }
}
