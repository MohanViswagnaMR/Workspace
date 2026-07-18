/* =========================================================================
   Navbar.jsx — the public site chrome (navbar + footer)
   -------------------------------------------------------------------------
   The brand navbar and fixed footer shared by the Welcome landing and the
   start page (HomeScreen). SiteNavbar takes {links}: an array of
   {label, onClick, icon?} rendered before the GitHub / version links;
   SiteFooter carries the copyright line, the light/dark switch and the
   accent-color picker. GitHubIcon lives here too (re-exported by
   workspace.jsx for the lazy site pages).
   ========================================================================= */
import React from 'react';
import { cx, Ic, APP_VERSION } from '../views/smart.jsx';
import CustomSelect from './ui/select.jsx';
import Brand from './ui/brand.jsx';
import { ACCENT_COLORS } from '../services/theme.js';

export const GitHubIcon=({size=17})=>
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
  </svg>;

/* The site navbar: brand mark + page links + GitHub + version badge. */
export function SiteNavbar({links}){
  return <nav className="home-nav">
    <Brand/>
    <div className="home-nav-links">
      {(links||[]).map(l=>
        <button key={l.label} type="button" className="home-nav-link" onClick={l.onClick}>
          {l.icon?<>{l.icon} {l.label}</>:l.label}
        </button>)}
      <a className="home-nav-link home-nav-icon" href="https://github.com/MohanViswagnaMR/Workspace"
        target="_blank" rel="noopener noreferrer" title="View on GitHub" aria-label="View on GitHub">
        <GitHubIcon/>
      </a>
      {APP_VERSION&&<a className="home-nav-ver"
        href="https://github.com/MohanViswagnaMR/Workspace/tree/main/versions"
        target="_blank" rel="noopener noreferrer" title="Release notes">v{APP_VERSION}</a>}
    </div>
  </nav>;
}

/* The fixed site footer: copyright + theme switch + accent picker. */
export function SiteFooter({theme,onToggleTheme,accent,onAccent,delay}){
  return <div className="home-foot home-foot-fixed home-rise" style={{animationDelay:delay}}>
    <div className="home-foot-copy">
      © {new Date().getFullYear()} Workspace · Mohan Viswagna MR. All rights reserved.
    </div>
    <div className="home-foot-controls">
      <button type="button" role="switch" aria-checked={theme==='dark'}
        className={cx('theme-switch',theme==='dark'&&'on')} onClick={onToggleTheme}
        title={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
        aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>
        <Ic n="sun" style={{width:13,height:13}}/>
        <Ic n="moon" style={{width:13,height:13}}/>
        <span className="theme-switch-knob"/>
      </button>
      <CustomSelect value={accent} onChange={onAccent}
        options={ACCENT_COLORS.map(c=>({value:c.id,label:c.label,
          dot:theme==='dark'?c.dark:c.light}))}/>
    </div>
  </div>;
}
