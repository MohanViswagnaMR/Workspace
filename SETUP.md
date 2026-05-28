# SETUP — step-by-step manual guide

This is everything **you** need to do by hand. The code is already done; these
steps connect it to Firebase and get it deployed. Allow ~15–20 minutes.

> You can skip Steps 3–7 entirely if you only want **Local Mode** (no login,
> data in the browser). The app already works that way out of the box.

---

## Step 1 — Install Node.js

You need **Node.js 18 or newer**.

- Download from https://nodejs.org (LTS version).
- Verify in a terminal:
  ```bash
  node -v      # should print v18.x or higher
  npm -v
  ```

## Step 2 — Run the app locally

In the project folder:

```bash
npm install      # installs dependencies (one time)
npm run dev      # starts the dev server
```

Open the URL it prints (default http://localhost:5173).
You should see the workspace open straight away — this is **Local Mode**.

✅ **Checkpoint:** the app loads, you can create pages and they survive a
browser refresh. If so, the conversion to Vite worked.

---

## Step 3 — Create a Firebase project

1. Go to https://console.firebase.google.com
2. Click **Add project**. Give it a name (e.g. `my-workspace`).
3. You can disable Google Analytics — it's not needed.
4. When the project is ready, click **Continue**.

## Step 4 — Register a Web App and copy the config

1. On the project home, click the **Web** icon **`</>`** ("Add app").
2. Give it a nickname (e.g. `workspace-web`). **Do not** check "Firebase
   Hosting" yet — you can add it later.
3. Click **Register app**.
4. Firebase shows a `firebaseConfig` object that looks like:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "my-workspace.firebaseapp.com",
     projectId: "my-workspace",
     storageBucket: "my-workspace.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
   **Keep this tab open** — you need these six values next.

## Step 5 — Add your keys to `.env`

1. In the project folder, copy the template:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and paste each value from Step 4:
   ```
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=my-workspace.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=my-workspace
   VITE_FIREBASE_STORAGE_BUCKET=my-workspace.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
   VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
   ```
3. **Stop and restart** the dev server (`Ctrl+C`, then `npm run dev`).
   Vite only reads `.env` at startup.

> `.env` is git-ignored on purpose. These keys are *public by design* (they
> ship in every web app's bundle) — your data is protected by the Firestore
> rules in Step 7, not by hiding the keys.

✅ **Checkpoint:** restart the app. Instead of opening the workspace, you should
now see the **login screen**. That means Cloud Mode is active.

---

## Step 6 — Enable Authentication

1. Firebase console → left menu → **Build → Authentication**.
2. Click **Get started**.
3. On the **Sign-in method** tab, enable two providers:
   - **Email/Password** → click it → toggle *Enable* → **Save**.
   - **Google** → click it → toggle *Enable* → pick a support email → **Save**.

✅ **Checkpoint:** on the login screen, create an account with email/password,
or click "Continue with Google". You should land in the workspace.

---

## Step 7 — Enable Cloud Firestore + security rules

1. Firebase console → **Build → Firestore Database**.
2. Click **Create database**.
3. Choose a location close to your users (this cannot be changed later).
4. Start in **Production mode** (rules below will lock it down properly).
5. Once created, open the **Rules** tab, replace everything with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {

       // Each user can only read/write their own workspace document.
       match /workspaces/{uid} {
         allow read, write: if request.auth != null
                            && request.auth.uid == uid;
       }
     }
   }
   ```
6. Click **Publish**.

✅ **Checkpoint:** create a page, refresh the browser, sign in on a *different*
browser or device with the same account — your pages should be there. Data is
now syncing through the cloud.

---

## Step 8 — Deploy to the web

Pick **one** host. All three are free for this kind of app.

### Option A — Vercel (easiest)
1. Push the project to a GitHub repo.
2. Go to https://vercel.com → **Add New → Project** → import the repo.
3. Framework preset: **Vite**. Build command `npm run build`, output `dist`.
4. Under **Environment Variables**, add all six `VITE_FIREBASE_*` values
   (same as your `.env`).
5. **Deploy.**

### Option B — Netlify
1. Push to GitHub → https://app.netlify.com → **Add new site → Import**.
2. Build command `npm run build`, publish directory `dist`.
3. Site settings → **Environment variables** → add the six `VITE_FIREBASE_*`.
4. **Deploy site.**

### Option C — Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting      # public dir: dist  |  single-page app: Yes
npm run build
firebase deploy
```

## Step 9 — Authorize your live domain (important!)

After deploying, Google sign-in will fail on the live site until you whitelist
the domain:

1. Firebase console → **Authentication → Settings → Authorized domains**.
2. Click **Add domain** and add your deployed URL
   (e.g. `my-workspace.vercel.app`).

✅ **Done.** Your workspace is live with real accounts and cloud sync.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Still no login screen after editing `.env` | You didn't restart `npm run dev`. Env vars load only at startup. |
| `auth/configuration-not-found` | The Auth provider isn't enabled (Step 6) or keys are wrong. |
| `Missing or insufficient permissions` | Firestore rules not published (Step 7), or you're signed out. |
| Google sign-in works locally but not on the live site | Add the live domain in Authorized domains (Step 9). |
| `auth/popup-closed-by-user` | Harmless — the user closed the Google popup. |
| Blank page after deploy | Confirm the host's build output dir is `dist` and env vars are set. |

---

## Going further (optional improvements)

The current setup stores each user's whole workspace in **one** Firestore
document. That's simple and fast, but has trade-offs:

- **1 MB document limit.** Fine for hundreds of text pages; huge workspaces
  could hit it. To scale, store each page as its own document
  (`workspaces/{uid}/pages/{pageId}`) and load them individually. The seam for
  this is entirely inside `src/storage.js` — the rest of the app is untouched.
- **No real-time multi-tab sync.** Swap the `getDoc` in `storage.js` for an
  `onSnapshot` listener to get live updates across tabs/devices.
- **Offline support.** Call `enableIndexedDbPersistence(db)` in `firebase.js`
  for offline editing that syncs when reconnected.
- **Images.** Block images are currently URLs. To support uploads, enable
  Firebase Storage and upload files there, saving the download URL on the block.
- **Password reset.** Firebase has `sendPasswordResetEmail` — add a
  "Forgot password?" link to `src/auth.jsx`.

None of these are required — the app is fully functional as delivered.
