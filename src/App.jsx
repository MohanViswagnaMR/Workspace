/* =========================================================================
   App.jsx — root component
   -------------------------------------------------------------------------
   No accounts, no auth gate. The Workspace component decides what to show:
   a homepage when no workspace is connected, otherwise the connected
   Local / Google Drive workspace. Theme is restored from a cookie so it
   applies before any workspace loads.
   ========================================================================= */
import React, { useEffect } from 'react';
import Workspace from './workspace.jsx';
import { readTheme } from './cookies.js';

export default function App() {
  useEffect(() => {
    const { theme, accent } = readTheme();
    document.body.classList.toggle('dark', theme === 'dark');
    ['indigo', 'blue', 'ocean', 'forest', 'rose', 'sunset', 'violet']
      .forEach(a => document.body.classList.remove(`t-${a}`));
    document.body.classList.add(`t-${accent || 'indigo'}`);
    const b = document.getElementById('boot');
    if (b) b.style.display = 'none';
  }, []);

  return <Workspace />;
}
