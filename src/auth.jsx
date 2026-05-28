/* =========================================================================
   auth.jsx — authentication layer
   =========================================================================
   Exports:
     useAuth()   - hook -> { user, loading, signOut, enterLocally }
     AuthScreen  - the sign-in / sign-up / landing screen

   Fresh session (no saved auth):
     - Firebase mode  → shows AuthScreen until user signs in
     - Local mode     → shows AuthScreen with "Continue locally" option
                        once entered, sessionStorage key keeps them in for
                        the rest of that browser session
   ========================================================================= */
import React, { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from './firebase.js';
import { registerUser } from './storage.js';

const LOCAL_USER = {
  uid: 'local-user',
  email: '',
  displayName: 'You',
  isLocal: true,
  photoURL: null,
};

const LOCAL_KEY = 'ws_local_entered';

/* ---------------------------------------------------------- useAuth hook -- */
export function useAuth() {
  const getInitial = () => {
    if (isFirebaseConfigured) return null;
    return sessionStorage.getItem(LOCAL_KEY) ? LOCAL_USER : null;
  };

  const [user, setUser] = useState(getInitial);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }
    const giveUp = setTimeout(() => {
      console.warn('[auth] Firebase timeout — proceeding without auth');
      setLoading(false);
    }, 8000);
    const unsub = onAuthStateChanged(
      auth,
      (fbUser) => {
        clearTimeout(giveUp);
        if (fbUser) {
          const profile = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email?.split('@')[0],
            photoURL: fbUser.photoURL,
            isLocal: false,
          };
          setUser(profile);
          // register in users collection so others can find by email
          registerUser(fbUser.uid, profile);
        } else {
          setUser(null);
        }
        setLoading(false);
      },
      (err) => { clearTimeout(giveUp); console.error('[auth]', err); setLoading(false); }
    );
    return () => { clearTimeout(giveUp); unsub(); };
  }, []);

  const signOut = useCallback(async () => {
    if (isFirebaseConfigured && auth) {
      await fbSignOut(auth);
    } else {
      sessionStorage.removeItem(LOCAL_KEY);
      setUser(null);
    }
  }, []);

  const enterLocally = useCallback(() => {
    sessionStorage.setItem(LOCAL_KEY, '1');
    setUser(LOCAL_USER);
  }, []);

  return { user, loading, signOut, enterLocally };
}

/* --------------------------------------------- friendly error messages --- */
function friendlyError(code) {
  const map = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account already exists for that email.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/network-request-failed': 'Network error — check your connection.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

/* ============================ AUTH SCREEN / HOME PAGE ==================== */
export function AuthScreen({ onEnterLocally }) {
  const [mode, setMode] = useState('signin');
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const isSignup = mode === 'signup';

  async function handleEmailAuth(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (isSignup) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(friendlyError(err.code));
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(''); setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(friendlyError(err.code));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      {/* ── Left: brand / hero ── */}
      <aside className="auth-brand">
        <div className="auth-brand-top">
          <span className="auth-mark">◧</span>
          <span className="auth-wordmark">Workspace</span>
        </div>
        <div className="auth-brand-mid">
          <h1>Your notes, docs &amp; databases —<em> one connected home.</em></h1>
          <p>Write, plan and organise in a fast block editor. Everything syncs securely to your account, on every device.</p>
        </div>
        <ul className="auth-features">
          <li><span>✦</span> Nested pages &amp; a 20-block editor</li>
          <li><span>✦</span> Table, board, gallery &amp; calendar databases</li>
          <li><span>✦</span> Instant search, templates &amp; themes</li>
          <li><span>✦</span> Real-time cloud sync with Firebase</li>
        </ul>
        <div className="auth-grain" aria-hidden="true" />
      </aside>

      {/* ── Right: sign-in card ── */}
      <main className="auth-panel">
        <div className="auth-card">
          <h2 className="auth-title">{isSignup ? 'Create your workspace' : 'Welcome back'}</h2>
          <p className="auth-sub">
            {isSignup ? 'Sign up to start building.' : 'Sign in to continue to your workspace.'}
          </p>

          {isFirebaseConfigured ? (
            <>
              <button type="button" className="auth-google" onClick={handleGoogle} disabled={busy}>
                <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.1 0 24 0 14.6 0 6.4 5.4 2.5 13.2l7.9 6.1C12.2 13.3 17.6 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-3.9 6.8-9.7 6.8-17.4z"/>
                  <path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.8-2.9-.8-4.3s.3-3 .8-4.3l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.5 10.4l7.9-6.1z"/>
                  <path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.5l-7.3-5.7c-2 1.4-4.6 2.2-7.7 2.2-6.4 0-11.8-3.8-13.6-9.3l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/>
                </svg>
                Continue with Google
              </button>

              <div className="auth-divider"><span>or</span></div>

              <form onSubmit={handleEmailAuth} className="auth-form">
                {isSignup && (
                  <label className="auth-field">
                    <span>Name</span>
                    <input type="text" value={name} onChange={e=>setName(e.target.value)}
                      placeholder="Ada Lovelace" autoComplete="name"/>
                  </label>
                )}
                <label className="auth-field">
                  <span>Email</span>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                    placeholder="you@example.com" autoComplete="email" required/>
                </label>
                <label className="auth-field">
                  <span>Password</span>
                  <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                    placeholder={isSignup ? 'At least 6 characters' : '••••••••'}
                    autoComplete={isSignup ? 'new-password' : 'current-password'} required minLength={6}/>
                </label>
                {error && <div className="auth-error">{error}</div>}
                <button type="submit" className="auth-submit" disabled={busy}>
                  {busy ? 'Please wait…' : isSignup ? 'Create workspace' : 'Sign in'}
                </button>
              </form>

              <p className="auth-switch">
                {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button type="button" onClick={()=>{setMode(isSignup?'signin':'signup');setError('');}}>
                  {isSignup ? 'Sign in' : 'Sign up'}
                </button>
              </p>
            </>
          ) : (
            /* ── Local mode: no Firebase configured ── */
            <div className="auth-local">
              <p className="auth-local-note">
                Firebase is not configured — your workspace will be saved locally in this browser.
              </p>
              <button type="button" className="auth-submit" onClick={onEnterLocally}>
                Get started
              </button>
            </div>
          )}
        </div>
        <footer className="auth-foot">Built with Vite · React · Firebase</footer>
      </main>
    </div>
  );
}
