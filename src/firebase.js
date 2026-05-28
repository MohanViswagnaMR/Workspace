/* =========================================================================
   firebase.js — Firebase initialization
   -------------------------------------------------------------------------
   Reads configuration from Vite environment variables (VITE_FIREBASE_*).

   GRACEFUL FALLBACK:
   If VITE_FIREBASE_API_KEY is missing, the whole app keeps working in
   "local mode" — no auth, data in localStorage. This lets you run the
   project the moment you clone it, before doing any Firebase setup.

   Fill in .env (see SETUP.md) to flip into real cloud mode.
   ========================================================================= */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/* True only when a real API key has been provided. */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let app = null;
let auth = null;
let db = null;
let googleProvider = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
  } catch (err) {
    console.error('[firebase] initialization failed:', err);
  }
} else {
  console.info(
    '%c[workspace] Running in LOCAL MODE — no Firebase config detected.\n' +
      'Data is saved to this browser. Fill in .env to enable cloud sync & login.',
    'color:#2383e2'
  );
}

export { app, auth, db, googleProvider };
