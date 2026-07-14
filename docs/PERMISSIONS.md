# Plugin permissions reference

Workspace custom-page plugins (`plugins/<id>/` inside a workspace folder) must
**declare every app service they use** in their `manifest.json`. The user sees
the requested list when enabling the plugin and can revoke each permission at
any time in **Settings → Plugins**. Undeclared or revoked calls **throw** — so
declare only what you call, and wrap api calls in `try/catch`.

The single source of truth in code is the `PERMISSIONS` registry in
[`src/plugins.jsx`](../src/plugins.jsx). This file, that registry, and the
in-app **Docs → Plugins & permissions** section must be kept in sync.

## Declaring permissions

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "type": "page",
  "layout": "all",
  "entry": "page.jsx",
  "icon": "🧩",
  "description": "One line",
  "apiVersion": 1,
  "permissions": ["pages:read"]
}
```

`type` says what the plugin *is*. `"page"` — a custom page type (optionally a
file handler via `"handles"`) — is the default and the only type supported
today; the registry is `SUPPORTED_PLUGIN_TYPES` in `src/plugins.jsx`. Future
types will be added there, and a plugin with an unsupported type fails the
compatibility test cleanly instead of misrendering.

`layout` says which app layout the plugin's pages render in: `"home"` (the
Notion-style layout), `"code"` (the VS Code-style layout) or `"all"` (the
default). A page whose plugin is scoped to the other layout shows a
"switch layouts" card instead of rendering, and layout-scoped plugins are
offered only in their layout's creation menus.

## Available permissions

| Permission | Grants | Api surface |
| --- | --- | --- |
| `pages:read` | See the id, title and kind of every live page in the workspace | `api.listPages()` → `[{ id, title, kind }]` |
| `pages:navigate` | Navigate the user to another page | `api.openPage(id)` |

**No permission needed** for:

| Always available | What it is |
| --- | --- |
| `data` / `setData` | Read and write **this page's own content** (a JSON object for custom pages, the raw file text for file handlers) |
| `node` | `{ id, title, ext }` of the page being shown |
| `api.theme` | `'light'` or `'dark'` — style accordingly |

Unknown permission strings are flagged by the compatibility test ("permissions
recognized" check fails) and are never granted.

## How enforcement works

- The `api` object handed to your component is **gated per call**:
  - not declared in `manifest.json` → the call throws
    `Permission "…" is not declared in this plugin's manifest.json.`
  - declared but revoked by the user → the call throws
    `Permission "…" was revoked — re-enable it in Settings → Plugins.`
- Grants are stored per plugin id in the browser (`localStorage`
  `wsPluginPerms:<id>`), defaulting to *granted* for everything declared —
  the user consented to that list when enabling the plugin.
- Changing any plugin file changes its content hash, which re-triggers the
  enable/consent screen (and re-runs the compatibility test).

## API versioning

The plugin contract is **append-only**: fields are added, never removed or
changed in meaning. `manifest.json` may declare `"apiVersion"` (defaults to
`1`); the app checks it against its supported versions at every load and
install. A plugin targeting an unsupported version shows a clear
"needs an update" report instead of running.

## Adding a new permission (app contributors)

1. Add the key to `PERMISSIONS` in `src/plugins.jsx` with a short `label`
   (shown on toggles/consent) and `desc` (one sentence, names the api call).
2. Gate the new api member in `PluginHost` with `gate('<key>', fn)`.
3. Document it in this file, in the in-app Docs section
   (`src/sitepages.jsx` → "Plugins & permissions"), and in the AI prompt
   (`PLUGIN_AI_PROMPT` in `src/workspace.jsx`).
4. Never repurpose or rename an existing key — add a new one.
