# Workspace — Notion-style Connected Workspace

A fast, block-based workspace app built with **Vite + React 18 + Firebase**. Works instantly in your browser with no setup required, and optionally syncs to the cloud.

---

## Features

- **Block editor** — text, headings (H1–H3), to-do lists, bullet lists, numbered lists, toggles, quotes, callouts, dividers, code blocks (with language selection), and image blocks
- **Nested pages** — infinite page hierarchy in the sidebar
- **Multi-view databases** — table, kanban board, gallery, and calendar views with filtering and sorting
- **Slash commands** — type `/` anywhere to insert any block type
- **Instant search** — find pages across your entire workspace
- **Favorites** — pin pages for quick access
- **Trash & restore** — soft-delete pages and restore them any time
- **Templates** — built-in page templates to get started fast
- **Page customization** — emoji icons, gradient covers, and colored blocks
- **Dark mode** — full theme toggle
- **Keyboard shortcuts** — navigate and edit without leaving the keyboard
- **Two storage modes** — local browser storage (no setup) or Firebase cloud sync
- **Local filesystem** — save workspaces as files on your machine (via File System Access API)
- **Cloud storage providers** — connect external cloud providers (Google Drive, etc.)
- **Sharing** — share workspaces with other users (cloud mode)
- **Import** — import `.docx` files via mammoth

---

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173.

The app opens immediately in **Local Mode** — no login, data saved to your browser's `localStorage`. To enable accounts and cloud sync, see [SETUP.md](./SETUP.md).

---

## Scripts

| Command            | Description                           |
|--------------------|---------------------------------------|
| `npm run dev`      | Start dev server with hot reload      |
| `npm run build`    | Production build into `dist/`         |
| `npm run preview`  | Preview the production build locally  |

---

## Storage Modes

The app detects your Firebase configuration and adapts automatically:

|                  | **Local Mode** (default)                    | **Cloud Mode** (after setup)               |
|------------------|---------------------------------------------|--------------------------------------------|
| **Trigger**      | `.env` empty or missing                     | Real `VITE_FIREBASE_*` keys present        |
| **Login**        | None — opens straight to workspace          | Email/password or Google sign-in           |
| **Storage**      | Browser `localStorage`                      | Cloud Firestore (`workspaces/{uid}`)       |
| **Devices**      | This browser only                           | Synced across every device you sign in on  |

Switch from Local to Cloud Mode at any time by filling in `.env` — no code changes needed.

---

## Firebase Setup (Cloud Mode)

Copy the config template and add your Firebase project keys:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

See [SETUP.md](./SETUP.md) for the full step-by-step guide covering Firebase Authentication, Firestore security rules, and deployment options (Vercel, Netlify, Firebase Hosting).

---

## Project Structure

```
index.html              Boot screen and root mount point
vite.config.js          Vite config (vendor chunk splitting)
.env.example            Firebase config template — copy to .env
src/
  main.jsx              Entry point
  App.jsx               Auth gate: loading → sign-in → workspace
  auth.jsx              useAuth() hook + sign-in / sign-up screen
  firebase.js           Firebase init (graceful fallback if unconfigured)
  storage.js            Persistence layer — Firestore or localStorage
  workspace.jsx         Full workspace app: editor, databases, modals
  localfs.js            File System Access API integration
  cloudstorage.js       External cloud provider integration
  styles.css            Theme tokens, components, dark mode
public/
  oauth-callback.html   OAuth redirect handler for cloud providers
```

---

## How Persistence Works

In cloud mode, the entire workspace (`{ nodes, favorites, currentId, theme }`) is stored as a **single Firestore document per user** at `workspaces/{uid}`. Writes are debounced by 700 ms so rapid edits coalesce into one network call.

Firestore documents support up to ~1 MB, which is sufficient for hundreds of pages of text. See [SETUP.md → Going further](./SETUP.md#going-further-optional-improvements) for guidance on scaling beyond that.

---

## Tech Stack

| Layer       | Technology                                   |
|-------------|----------------------------------------------|
| Build tool  | Vite 6                                       |
| UI          | React 18                                     |
| Backend     | Firebase 11 (Authentication + Firestore)     |
| Icons       | lucide-react                                 |
| Import      | mammoth (`.docx` → blocks)                   |
| Fonts       | Fraunces (display) + Hanken Grotesk (UI)     |

---

## Deployment

The built `dist/` folder is a static site that can be hosted anywhere:

- **Vercel** — import the repo, set framework to Vite, add env vars
- **Netlify** — build command `npm run build`, publish dir `dist`, add env vars
- **Firebase Hosting** — `firebase init hosting && npm run build && firebase deploy`

After deploying, add your live domain to Firebase → Authentication → Authorized Domains so Google sign-in works on the live site.
