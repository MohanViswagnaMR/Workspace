/* =========================================================================
   App.jsx — root component
   -------------------------------------------------------------------------
   Decides what to render:
     loading      -> spinner
     no user      -> AuthScreen        (cloud mode only)
     signed in    -> Workspace         (the full Notion-style app)

   In local mode useAuth() returns a user immediately, so the AuthScreen
   is skipped and the Workspace opens straight away.
   ========================================================================= */
import React, { useEffect } from 'react';
import { useAuth, AuthScreen } from './auth.jsx';
import Workspace from './workspace.jsx';

export default function App() {
  const { user, loading, signOut, enterLocally } = useAuth();

  useEffect(() => {
    const b = document.getElementById('boot');
    if (b) b.style.display = 'none';
  }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-logo">◧</div>
        <div className="app-loading-bar"><i /></div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onEnterLocally={enterLocally} />;
  }

  return <Workspace user={user} onSignOut={signOut} />;
}
