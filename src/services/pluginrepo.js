/* =========================================================================
   services/pluginrepo.js — the community plugin registry client
   -------------------------------------------------------------------------
   The registry is a GitHub repo (see registry/ in this project — push it to
   its own repository) holding ONE JSON entry per plugin: a link to the
   author's repo pinned to the commit that passed the automated tests. No
   plugin code is ever copied into the registry. The app fetches the
   generated index.json (raw.githubusercontent.com is CORS-open) and offers
   the results in the plugin search; installs pull from the AUTHOR's repo at
   the tested commit via the normal fetchGithubPlugin flow.
   ========================================================================= */
export const REGISTRY_REPO = 'MohanViswagnaMR/workspace-plugin-registry';
const INDEX_URL = `https://raw.githubusercontent.com/${REGISTRY_REPO}/main/index.json`;
const CACHE_KEY = 'wsPluginIndex';
const TTL = 60 * 60 * 1000;   // 1h — the index changes rarely

/* Fetch the index, memoized in localStorage. Resolves [] when the registry
   is unreachable (offline, repo not created yet) — callers just show less. */
export async function fetchPluginIndex() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && Date.now() - c.at < TTL && Array.isArray(c.plugins)) return c.plugins;
  } catch (_) {}
  try {
    const r = await fetch(INDEX_URL, { cache: 'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    const plugins = (await r.json()).plugins || [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), plugins })); } catch (_) {}
    return plugins;
  } catch (_) { return []; }
}

export function searchIndex(list, q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return list || [];
  return (list || []).filter(e =>
    (e.name || '').toLowerCase().includes(s) ||
    (e.description || '').toLowerCase().includes(s) ||
    (e.type || '').toLowerCase().includes(s) ||
    (e.tags || []).some(t => String(t).toLowerCase().includes(s)));
}

/* Install URL — the author's repo at the TESTED commit (never a moving branch). */
export const installUrlFor = e =>
  `https://github.com/${e.repo}/tree/${e.ref}${e.path ? '/' + e.path : ''}`;

/* Pre-filled "Submit a plugin" issue on the registry (issue-form fields
   prefill from query params). Automated tests run on submission. */
export const submitPluginUrl = repoUrl =>
  `https://github.com/${REGISTRY_REPO}/issues/new?template=submit-plugin.yml` +
  (repoUrl ? `&repo-url=${encodeURIComponent(repoUrl)}` : '');
