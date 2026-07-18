/* =========================================================================
   layout.jsx — the app-layout mode machinery
   -------------------------------------------------------------------------
   The Home ⟷ Code layout switch and Developer mode: useLayoutMode() owns
   the persisted layout/devMode state (localStorage 'ws_layout' /
   'ws_devmode', with the legacy code-layout migration); AppLayout renders
   the lazy Code layout (codelayout.jsx stays its own chunk) or the home
   layout passed as children; BootScreen is the shared Suspense fallback.
   ========================================================================= */
import React from 'react';

const CodeLayout=React.lazy(()=>import('./codelayout.jsx'));

export const BootScreen=()=><div className="app-loading"><div className="app-loading-logo">◧</div><div className="app-loading-bar"><i /></div></div>;

/* app layout: 'home' (Notion-style) | 'code' (VS Code-style). Persisted.
   app mode: 'workspace' (default) is just the normal workspace; DEVELOPMENT
   mode unlocks the Code layout (the Home⟷Code switch, explorer, terminal).
   Existing users already in the code layout migrate to development mode. */
export function useLayoutMode(){
  const [layout,setLayoutState]=React.useState(()=>{
    try{ return localStorage.getItem('ws_layout')==='code'?'code':'home'; }catch(_){ return 'home'; }
  });
  const setLayout=l=>{
    setLayoutState(l);
    try{ localStorage.setItem('ws_layout',l); }catch(_){}
  };
  const [devMode,setDevModeState]=React.useState(()=>{
    try{
      const v=localStorage.getItem('ws_devmode');
      if(v!=null) return v==='1';
      return localStorage.getItem('ws_layout')==='code';
    }catch(_){ return false; }
  });
  const setDevMode=on=>{
    setDevModeState(on);
    try{ localStorage.setItem('ws_devmode',on?'1':'0'); }catch(_){}
    if(!on) setLayout('home');   // leaving development mode returns to Home
  };
  return {layout,setLayout,devMode,setDevMode};
}

/* Renders the Code layout (its own lazy chunk) when it's active, otherwise
   the home-layout children built by workspace.jsx. */
export function AppLayout({layout,devMode,codeProps,children}){
  return layout==='code'&&devMode
    ? <React.Suspense fallback={<BootScreen/>}>
        <CodeLayout {...codeProps}/>
      </React.Suspense>
    : children;
}
