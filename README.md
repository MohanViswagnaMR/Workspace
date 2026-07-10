# Workspace

**Version 2.3.0**

A fast, block-based, Notion-style workspace built with **Vite + React 18**. There
are no accounts and no backend. Everything you write is stored as **ordinary
folders and Markdown files** — either in a folder on your computer or mirrored to
your Google Drive — so your data stays readable and usable even if this app goes
away.

---

## Highlights

- **Welcome page** — first-time visitors (no workspace data in the browser) get
  a website-style landing that explains the app, with **Get Started**, **About**
  and **Self-hosting** pages; returning users go straight to the start page.
- **Try the demo** — a one-click, in-memory sandbox workspace;
  nothing is saved until you choose **Keep this workspace**, which converts it
  (content included) into a real Local or Drive workspace.
- **Your data is just files** — pages are plain `.md` files with a little YAML
  frontmatter; folders mirror the page hierarchy. Open them in any editor.
- **No account, no login, no cloud lock-in** — nothing is sent anywhere except
  (optionally) your own Google Drive.
- **Two workspace types** — a **Local** folder (via the File System Access API)
  or **Google Drive** (a real, browsable folder in your Drive).
- **Block editor** — text, headings, to-dos, lists, toggles, quotes, callouts,
  dividers, code blocks, images and file attachments. Inline formatting via a
  right-click menu: bold, italic, underline, strikethrough, code, text colour
  and highlight; bare URLs become clickable links automatically.
- **Nested pages** — infinite page hierarchy, mirrored as nested folders on disk.
- **Multi-view databases** — table, board, gallery, list and calendar views.
- **Slash commands, instant search, favorites, trash & archive, templates,
  dark mode and keyboard shortcuts.**
- **Installable PWA** — install it to your desktop or phone and launch it in its
  own window; a service worker caches the app shell so it opens offline (your
  data is already local files or Drive).
- **Import** — bring in `.docx` files via mammoth.
- **Homepage** — a top navbar with in-app **Docs**, **Manage workspaces** (rename /
  edit description / delete Drive workspaces), a Google Drive connection indicator, and a
  dark/light switch. Defaults to dark mode with a purple accent.
- **Live save status** — a Saved / Saving… / Unsaved indicator next to the storage badge.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click **Try the demo**, or pick **Local folder**
or **Google Drive** from the homepage. Local folders require a Chromium browser
(Chrome, Edge, Brave); Google Drive works everywhere.

| Command           | Description                          |
|-------------------|--------------------------------------|
| `npm run dev`     | Start dev server with hot reload     |
| `npm run build`   | Production build into `dist/`        |
| `npm run preview` | Preview the production build         |

---

## How your data is stored on disk

Each workspace is a self-describing folder tree. Pages with children become
folders holding a `master page.md`; leaf pages are single `.md` files. Ordering
and metadata live in each file's YAML frontmatter.

```
My Workspace/                 (the folder you picked — its name is the workspace title)
├── Upload/                   uploaded images & file attachments
│   └── sunset.jpg
└── Space/                    all top-level pages
    ├── Meeting Notes.md      a page with no children
    └── Homework/             a page WITH children → a folder
        ├── master page.md    the "Homework" page's own content
        ├── Essay.md
        └── Math/
            ├── master page.md
            ├── Problem set 1.md
            └── Problem set 2.md
```

A page file looks like this — readable on its own, no app required:

```markdown
---
id: n_start
title: Getting Started
icon: 📓
order: 0
type: page
favorite: true
---

# 📓 Getting Started

Welcome to your **connected workspace**.

> 💡 Callouts are blockquotes with a leading emoji.

- [x] To-dos are GitHub-style checkboxes
```

Databases keep their structure (properties, rows and views) in the frontmatter
`db:` block and render a readable Markdown table in the body.

There is **no JSON** anywhere in your data.

---

## Persistence & local state

- The **active workspace** (its type, name, and Drive folder id) plus your
  **theme** are remembered in small browser **cookies**, so the app reconnects to
  the same workspace on your next visit.
- For a Local workspace, the folder **handle** is kept in the browser's IndexedDB
  (it can't live in a cookie). Chromium asks you to re-grant access once per
  session — click **Reconnect** on the homepage.
- For Google Drive, the OAuth token lives in `sessionStorage`; sign in again if
  it has expired.

---

## Project structure

```
index.html          Boot screen, root mount point, PWA manifest + meta tags
vite.config.js      Vite config (vendor chunk splitting)
public/             Static assets copied to the site root
  manifest.webmanifest  PWA web app manifest (name, icons, colors, display)
  sw.js                 Service worker (offline app-shell cache)
  icon.svg / icon-*.png App icons (any + maskable) + apple-touch-icon
src/
  main.jsx          Entry point + service-worker registration
  App.jsx           Restores theme, renders the workspace
  workspace.jsx     The full app: homepage, editor, databases, sidebar, modals
  sitepages.jsx     Docs, About & Self-hosting pages (lazy-loaded chunk)
  markdown.js       Workspace ⇄ folder-of-Markdown serialization (pure)
  localfs.js        Local folder storage (File System Access API + IndexedDB)
  cloudstorage.js   Google Drive folder-tree mirror
  cookies.js        Tiny cookie helpers (active-workspace pointer + theme)
  styles.css        Theme tokens, components, dark mode
```

---

## Progressive Web App

Workspace is an installable PWA. In a supported browser you'll get an **Install**
option (address-bar icon or menu) to add it to your desktop or phone; it then
launches in its own standalone window.

- **Offline** — a hand-rolled service worker (`public/sw.js`) precaches the app
  shell and serves Vite's hashed assets stale-while-revalidate, so the app opens
  with no network. Your notes are already local Markdown files (or Google Drive),
  so editing works offline for Local workspaces.
- **Network stays untouched for auth/sync** — the service worker never intercepts
  cross-origin requests, so Google sign-in (`accounts.google.com`) and the Google
  Drive API always talk to the network directly.
- **Updates** — the worker uses the classic lifecycle (no forced reloads); a new
  version activates once all tabs are closed. Bump the `CACHE` constant in
  `sw.js` on each release to refresh the shell.
- The worker registers in **production builds only**, so it never interferes with
  the dev server's hot reload. Test it with `npm run build && npm run preview`.

> Deploying under a sub-path? The manifest and service worker assume the site is
> served from the origin root (`/`). If you set a Vite `base`, adjust the paths in
> `manifest.webmanifest`, `sw.js`, and the registration in `main.jsx` to match.

---

## Tech stack

| Layer      | Technology                                    |
|------------|-----------------------------------------------|
| Build tool | Vite 6                                        |
| UI         | React 18                                      |
| Storage    | File System Access API · Google Drive API     |
| Frontmatter| js-yaml                                        |
| Icons      | lucide-react                                   |
| Import     | mammoth (`.docx` → blocks)                     |

---

## Deployment

The built `dist/` folder is a static site — host it anywhere (Vercel, Netlify,
GitHub Pages, any static host). To use Google Drive on a deployed site, add the
site's origin as an **Authorised JavaScript origin** on the Google Cloud OAuth
client, and ensure the Google Drive API is enabled.

---

## Versions

Current release: **2.3.0**. Full release notes live in the [`versions/`](./versions)
folder.

| Version | Date       | Highlights                                                        |
|---------|------------|-------------------------------------------------------------------|
| [2.3.0](./versions/v2.3.0.md) | 2026-07-11 | Performance release — typing re-renders only the edited block (memoized editor), O(n) sidebar tree, database views keep state across edits (calendar/board fix), **Google Drive opens ~5–10× faster** (parallel I/O), lighter saves, lazy-loaded Docs/About pages (−30 KB main bundle), deferred spell-check dictionary, text-preview & upload-memory fixes |
| [2.2.1](./versions/v2.2.1.md) | 2026-07-11 | Editor polish release — selection-aware backspace/delete, backspace merges text up (caret at the junction), slash only opens after whitespace and converts the block in place, combined right-click menu with a format toolbar on top, inline-code styling + toggle-off, **offline spell-check with inline suggestions**, undo/redo merge-duplication fix, click-empty-space adds a block, and **/bold · /italic · /red · /yellow-highlight** slash formatting commands |
| [2.2.0](./versions/v2.2.0.md) | 2026-07-08 | First-impression release — **Welcome page** for first-time visitors (with About & Self-hosting pages) vs the classic **Start page** for returning users; one-click in-memory **demo workspace** with "Keep this workspace" conversion; version badge; empty new workspaces; subpage-only sidebar chevrons |
| [2.1.1](./versions/v2.1.1.md) | 2026-07-08 | Editor bug-fix release — phantom empty blocks fixed, Enter splits paragraphs, clickable links, right-click format menu (colour/highlight), multi-block selection, forward-delete merge, menus stay on screen |
| [2.1.0](./versions/v2.1.0.md) | 2026-07-04 | Progressive Web App — installable, offline app shell, service worker, web manifest & icons; app renamed to just **Workspace** |
| [2.0.1](./versions/v2.0.1.md) | 2026-07-04 | Google Drive fixes (open/browse/reconnect); homepage navbar; in-app Docs page; Manage workspaces (rename/description/delete); save-state indicator; dark+violet default; `Alt+N` / `Ctrl+Enter` shortcuts |
| [2.0.0](./versions/v2.0.0.md) | 2026-07-03 | Firebase/accounts removed; plain-Markdown storage (Local + Google Drive); `info.md`, `trash/` & `archive/` folders; homepage; Trash/Archive/Templates as full pages |
| [1.2.0](./versions/v1.2.0.md) | 2026-05-29 | File attachment, storage icons, code-block redesign               |
| 1.1.0   | 2026-05-28 | Feature-complete initial release                                  |
| 1.0.0   | —          | Initial commit / project scaffold                                 |
