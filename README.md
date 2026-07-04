# Workspace — Notes & databases as plain Markdown

**Version 2.0.1**

A fast, block-based, Notion-style workspace built with **Vite + React 18**. There
are no accounts and no backend. Everything you write is stored as **ordinary
folders and Markdown files** — either in a folder on your computer or mirrored to
your Google Drive — so your data stays readable and usable even if this app goes
away.

---

## Highlights

- **Your data is just files** — pages are plain `.md` files with a little YAML
  frontmatter; folders mirror the page hierarchy. Open them in any editor.
- **No account, no login, no cloud lock-in** — nothing is sent anywhere except
  (optionally) your own Google Drive.
- **Two workspace types** — a **Local** folder (via the File System Access API)
  or **Google Drive** (a real, browsable folder in your Drive).
- **Block editor** — text, headings, to-dos, lists, toggles, quotes, callouts,
  dividers, code blocks, images and file attachments.
- **Nested pages** — infinite page hierarchy, mirrored as nested folders on disk.
- **Multi-view databases** — table, board, gallery, list and calendar views.
- **Slash commands, instant search, favorites, trash & archive, templates,
  dark mode and keyboard shortcuts.**
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

Open http://localhost:5173 and pick **Local folder** or **Google Drive** from the
homepage. Local folders require a Chromium browser (Chrome, Edge, Brave); Google
Drive works everywhere.

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
index.html          Boot screen and root mount point
vite.config.js      Vite config (vendor chunk splitting)
src/
  main.jsx          Entry point
  App.jsx           Restores theme, renders the workspace
  workspace.jsx     The full app: homepage, docs, editor, databases, sidebar, modals
  markdown.js       Workspace ⇄ folder-of-Markdown serialization (pure)
  localfs.js        Local folder storage (File System Access API + IndexedDB)
  cloudstorage.js   Google Drive folder-tree mirror
  cookies.js        Tiny cookie helpers (active-workspace pointer + theme)
  styles.css        Theme tokens, components, dark mode
```

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

Current release: **2.0.1**. Full release notes live in the [`versions/`](./versions)
folder.

| Version | Date       | Highlights                                                        |
|---------|------------|-------------------------------------------------------------------|
| [2.0.1](./versions/v2.0.1.md) | 2026-07-04 | Google Drive fixes (open/browse/reconnect); homepage navbar; in-app Docs page; Manage workspaces (rename/description/delete); save-state indicator; dark+violet default; `Alt+N` / `Ctrl+Enter` shortcuts |
| [2.0.0](./versions/v2.0.0.md) | 2026-07-03 | Firebase/accounts removed; plain-Markdown storage (Local + Google Drive); `info.md`, `trash/` & `archive/` folders; homepage; Trash/Archive/Templates as full pages |
| [1.2.0](./versions/v1.2.0.md) | 2026-05-29 | File attachment, storage icons, code-block redesign               |
| 1.1.0   | 2026-05-28 | Feature-complete initial release                                  |
| 1.0.0   | —          | Initial commit / project scaffold                                 |
