/* =========================================================================
   start.jsx — the start page (HomeScreen) & the connect panel
   -------------------------------------------------------------------------
   HomeScreen is shown when no workspace is connected: known workspaces,
   the Drive cloud toggle and the ConnectPanel (create/open local & Drive
   workspaces + the Workspace/Developer mode pill). ConnectPanel is also
   reused by workspace.jsx's CreateWorkspaceModal ("Keep this workspace").
   ========================================================================= */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cx, Ic } from '../views/smart.jsx';
import { isLocalFSSupported } from '../storage/localfs.js';
import { GDRIVE } from '../storage/cloudstorage.js';
import { SiteNavbar, SiteFooter } from '../components/Navbar.jsx';
import Button, { TileButton } from '../components/ui/button.jsx';
import { ACCENT_COLORS } from '../services/theme.js';
import { fetchPluginIndex, searchIndex, installUrlFor, submitPluginUrl } from '../services/pluginrepo.js';

/* Optional starter pages offered by the create wizard. Raw block templates —
   ids are assigned by the creation handler (workspace.jsx) via nid(). */
export const STARTER_PAGES=[
  {id:'getting-started',icon:'📓',title:'Getting Started',desc:'Blocks, the slash menu and first steps',
    blocks:[
      {type:'callout',emoji:'💡',html:'Type <strong>/</strong> anywhere to insert a block — headings, to-dos, tables, images and more.'},
      {type:'todo',html:'Create your first page',checked:false},
      {type:'todo',html:'Drag blocks by their left handle',checked:false},
      {type:'text',html:'Everything you write is saved as plain Markdown files — open the workspace folder in any editor.'}]},
  {id:'tasks',icon:'✅',title:'Tasks',desc:'A simple to-do list to start the day',
    blocks:[
      {type:'todo',html:'Plan the week',checked:false},
      {type:'todo',html:'Reply to open messages',checked:false},
      {type:'todo',html:'Take a break',checked:false}]},
  {id:'meeting-notes',icon:'📝',title:'Meeting Notes',desc:'Agenda + notes structure',
    blocks:[
      {type:'h2',html:'Agenda'},
      {type:'bullet',html:'Topic one'},
      {type:'bullet',html:'Topic two'},
      {type:'divider'},
      {type:'h2',html:'Notes'},
      {type:'text',html:''}]},
  {id:'reading-list',icon:'📚',title:'Reading List',desc:'Links & books to get back to',
    blocks:[
      {type:'bullet',html:'A book worth reading'},
      {type:'bullet',html:'An article to finish'}]},
];

/* The connect panel: two identical system TileButtons — "Create workspace"
   and "Connect" — each opening a POPUP wizard (house .overlay/.modal chrome).
   The create wizard walks labeled, numbered stages; conditional stages (layout,
   theme) only exist when their handlers are passed, so the in-app
   CreateWorkspaceModal gets a shorter wizard automatically. The layout stage
   drives devMode under the hood: Code = Developer mode + opens in the Code
   layout; Home = normal mode (which also resets the layout to home). */
export function ConnectPanel({onLocalNew,onLocalExisting,onDriveNew,onDriveExisting,busy,error,devMode,onDevMode,theme,onToggleTheme,accent,onAccent}){
  const localOK=isLocalFSSupported();
  const [flow,setFlow]=useState(null);   // null | 'create' | 'connect'
  const [step,setStep]=useState(0);
  const [name,setName]=useState('');
  const [desc,setDesc]=useState('');
  const [selPlugins,setSelPlugins]=useState({});  // plugin id → true (pre-enable)
  const [selPages,setSelPages]=useState({});      // starter page id → true
  const [builtins,setBuiltins]=useState(null);    // built-in plugin gallery (lazy)
  const [pgQuery,setPgQuery]=useState('');        // plugin search / GitHub link
  const [pgBusy,setPgBusy]=useState(false);
  const [pgErr,setPgErr]=useState('');
  const [added,setAdded]=useState([]);            // GitHub plugins queued for install
  const [registry,setRegistry]=useState(null);    // community registry index
  const named=!!name.trim();
  const STAGES=[
    {key:'name',label:'Name',icon:'✏️',title:'Name your workspace',sub:'Pick something short — you can rename it any time.'},
    ...(onDevMode?[{key:'layout',label:'Layout',icon:'🖥️',title:'Pick a layout',sub:'How the app looks — your pages are the same files either way. Switch anytime.'}]:[]),
    ...(onToggleTheme?[{key:'theme',label:'Theme',icon:'🎨',title:'Make it yours',sub:'Colors apply live — change them any time in Settings.'}]:[]),
    {key:'plugins',label:'Plugins',icon:'🧩',title:'Plugins',sub:'Built-ins are included with every workspace. Connect more from GitHub, or apply a theme — all changeable later in Settings → Plugins.'},
    {key:'pages',label:'Pages',icon:'📄',title:'Starter pages',sub:'A few pages to begin with, or none for a blank slate.'},
    {key:'where',label:'Storage',icon:'📦',title:'Where should it live?',sub:'Your pages are plain Markdown files either way.'},
  ];
  const last=step===STAGES.length-1;
  const stage=STAGES[step];
  const close=()=>{setFlow(null);setStep(0);};
  const back=()=>step>0?setStep(step-1):close();
  const next=()=>!last&&setStep(step+1);
  /* what the storage tiles hand to the create callbacks */
  const opts=()=>({
    plugins:[...added.map(p=>p.id),
      ...Object.keys(selPlugins).filter(k=>selPlugins[k])],
    install:added.map(p=>({id:p.id,files:p.files})),   // written into plugins/
    pages:STARTER_PAGES.filter(p=>selPages[p.id])
      .map(p=>({title:p.title,icon:p.icon,blocks:p.blocks})),
  });
  /* Connect a plugin from a public GitHub link (or a registry entry pinned to
     its tested commit): fetch → compat-check → queue for install */
  const looksLikeLink=/github\.com\//i.test(pgQuery);
  const connectUrl=async url=>{
    if(pgBusy) return;
    setPgBusy(true);setPgErr('');
    try{
      const m=await import('../plugins.jsx');
      const entry=await m.buildPluginEntry(await m.fetchGithubPlugin(url));
      if(!entry.compat.ok) throw new Error('Not compatible: '
        +entry.compat.checks.filter(c=>!c.pass).map(c=>c.label).join(' · '));
      setAdded(a=>[entry,...a.filter(x=>x.id!==entry.id)]);
      setPgQuery('');
    }catch(e){ setPgErr(e.message||String(e)); }
    setPgBusy(false);
  };
  const connectPlugin=()=>{ if(looksLikeLink) connectUrl(pgQuery.trim()); };
  /* the plugin gallery (built-ins + community registry) loads on demand */
  useEffect(()=>{
    if(stage?.key!=='plugins'||builtins) return;
    let alive=true;
    import('../plugins.jsx').then(m=>m.discoverPlugins(null))
      .then(l=>{ if(alive) setBuiltins(l); })
      .catch(()=>{ if(alive) setBuiltins([]); });
    fetchPluginIndex().then(ix=>{ if(alive) setRegistry(ix); });
    return ()=>{alive=false;};
  },[flow,step]);
  /* Escape closes the popup */
  useEffect(()=>{
    if(!flow) return;
    const h=e=>{ if(e.key==='Escape') close(); };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[flow]);

  const storageTiles=<div className="cb-tiles">
    <TileButton className="local" icon="💻" title={flow==='connect'?'Open a folder':'Local folder'}
      sub={flow==='connect'?'A workspace on this computer':'Saved on this computer'}
      disabled={!localOK||busy||(flow==='create'&&!named)}
      onClick={()=>flow==='connect'?onLocalExisting():onLocalNew(name.trim(),desc.trim(),opts())}/>
    <TileButton className="drive" icon="📁" title={flow==='connect'?'Open from Drive':'Google Drive'}
      sub={flow==='connect'?'A workspace in your Google Drive':'Synced across devices'}
      disabled={busy||(flow==='create'&&!named)}
      onClick={()=>flow==='connect'?onDriveExisting():onDriveNew(name.trim(),desc.trim(),opts())}/>
  </div>;

  return <div className="connect">
    <div className="connect-block">
      <div className="cb-launch">
        <TileButton className="launch accent" icon="＋" title="Create workspace"
          sub="Start fresh — a guided setup in a few steps" disabled={busy}
          onClick={()=>{setFlow('create');setStep(0);}}/>
        <TileButton className="launch accent" icon={<Ic n="link" style={{width:20,height:20}}/>}
          title="Connect" sub="Open an existing workspace folder or Drive workspace"
          disabled={busy} onClick={()=>setFlow('connect')}/>
      </div>
    </div>
    {error&&<div className="connect-error">{error}</div>}
    {busy&&!flow&&<div className="connect-busy"><span className="spin"/> Working…</div>}

    {/* PORTALED to <body>: ancestors here carry transforms/backdrop-filters
        (home-rise animation, glass cards) which would hijack position:fixed
        and push the popup off-screen. Body-level = true viewport overlay. */}
    {flow&&createPortal(<div className="overlay wz-overlay" onClick={close}>
      <div className="modal wizard" onClick={e=>e.stopPropagation()}>
        <div className="modal-h">
          <h3>{flow==='create'?'Create a workspace':'Connect a workspace'}</h3>
          <div className="x" onClick={close}><Ic n="x" style={{width:15,height:15}}/></div>
        </div>

        {flow==='connect'
          ? <div className="wz-body">
              <div className="wz-stage-head">
                <span className="wz-stage-ic">🔗</span>
                <div>
                  <div className="wz-stage-t">Open an existing workspace</div>
                  <div className="wz-stage-s">Point at a folder that already holds your Markdown pages.</div>
                </div>
              </div>
              {storageTiles}
              {!localOK&&<div className="cc-warn">Local folders need Chrome, Edge or Brave — Google Drive works everywhere.</div>}
              {error&&<div className="connect-error">{error}</div>}
              {busy&&<div className="connect-busy"><span className="spin"/> Working…</div>}
            </div>
          : <>
            {/* numbered stepper with connectors — checkmarks for done steps */}
            <div className="wz-steps" aria-label={`Step ${step+1} of ${STAGES.length}`}>
              {STAGES.map((s,i)=><React.Fragment key={s.key}>
                {i>0&&<span className={cx('wz-line',i<=step&&'done')}/>}
                <span className={cx('wz-step',i===step&&'on',i<step&&'done')}
                  title={s.label} onClick={()=>i<step&&setStep(i)}>
                  <span className="wz-step-n">{i<step?<Ic n="check" style={{width:11,height:11}}/>:i+1}</span>
                  <span className="wz-step-l">{s.label}</span>
                </span>
              </React.Fragment>)}
            </div>

            <div className="wz-body">
              <div className="wz-stage-head">
                <span className="wz-stage-ic">{stage.icon}</span>
                <div>
                  <div className="wz-stage-t">{stage.key==='where'&&named
                    ?<>Where should “{name.trim()}” live?</>:stage.title}</div>
                  <div className="wz-stage-s">{stage.sub}</div>
                </div>
              </div>

              {stage.key==='name'&&<div className="cb-fields">
                <label className="cb-field">
                  <span className="cb-field-ic">◧</span>
                  <input className="cb-input" placeholder="Workspace name" value={name}
                    onChange={e=>setName(e.target.value)} autoFocus
                    onKeyDown={e=>{if(e.key==='Enter'&&named)next();}}/>
                </label>
                <label className="cb-field">
                  <span className="cb-field-ic">✎</span>
                  <input className="cb-input" placeholder="Description (optional)" value={desc}
                    onChange={e=>setDesc(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'&&named)next();}}/>
                </label>
              </div>}

              {stage.key==='layout'&&<div className="cb-mode">
                <div className="mode-pill" role="group" aria-label="App layout">
                  <button type="button" className={cx(!devMode&&'on')}
                    title="Home layout — the Notion-style workspace"
                    onClick={()=>onDevMode(false)}>🏠 Home</button>
                  <button type="button" className={cx(devMode&&'on')}
                    title="Code layout — VS Code-style: file explorer, tabs & a terminal (enables Developer mode)"
                    onClick={()=>onDevMode(true)}>
                    <span style={{fontFamily:'var(--mono)',fontWeight:700}}>&lt;/&gt;</span> Code
                  </button>
                </div>
                <div className="cb-mode-hint">{devMode
                  ?'Code — VS Code-style: file explorer, tabs & a terminal. The Home ⟷ Code switch stays in the sidebar.'
                  :'Home — the Notion-style notes, docs & databases workspace.'}</div>
              </div>}

              {stage.key==='theme'&&<div className="cb-theme">
                <div className="cb-theme-row">
                  <span className="cb-theme-lb">Appearance</span>
                  <button type="button" role="switch" aria-checked={theme==='dark'}
                    className={cx('theme-switch',theme==='dark'&&'on')} onClick={onToggleTheme}
                    title={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>
                    <Ic n="sun" style={{width:13,height:13}}/>
                    <Ic n="moon" style={{width:13,height:13}}/>
                    <span className="theme-switch-knob"/>
                  </button>
                </div>
                <div className="cb-theme-row">
                  <span className="cb-theme-lb">Accent</span>
                  <span className="cb-swatches" role="group" aria-label="Accent color">
                    {ACCENT_COLORS.map(c=><button key={c.id} type="button"
                      className={cx('cb-swatch',accent===c.id&&'on')} title={c.label}
                      style={{background:theme==='dark'?c.dark:c.light}}
                      onClick={()=>onAccent(c.id)}/>)}
                  </span>
                </div>
              </div>}

              {stage.key==='plugins'&&(()=>{
                const q=pgQuery.trim().toLowerCase();
                const match=p=>!q||looksLikeLink
                  ||p.manifest.name.toLowerCase().includes(q)
                  ||p.manifest.description.toLowerCase().includes(q)
                  ||p.manifest.type.toLowerCase().includes(q);
                return <>
                <div className="wz-plug-bar">
                  <label className="cb-field" style={{flex:1}}>
                    <span className="cb-field-ic"><Ic n="search" style={{width:15,height:15}}/></span>
                    <input className="cb-input" value={pgQuery}
                      placeholder="Search plugins, or paste a GitHub link…"
                      onChange={e=>{setPgQuery(e.target.value);setPgErr('');}}
                      onKeyDown={e=>{if(e.key==='Enter'&&looksLikeLink)connectPlugin();}}/>
                  </label>
                  <Button disabled={!looksLikeLink||pgBusy} onClick={connectPlugin}>
                    {pgBusy?'Connecting…':'Connect'}</Button>
                </div>
                {pgErr&&<div className="connect-error">{pgErr}</div>}
                <div className="cb-checklist">
                  {added.map(p=><div key={p.id} className="cb-checkrow">
                    <span className="cb-check-ic">{p.manifest.icon}</span>
                    <span className="cb-tile-tx">
                      <span className="cb-tile-t">{p.manifest.name}
                        <span className="cb-type-badge">{p.manifest.type}</span>
                        <span className="cb-incl new">will be installed</span></span>
                      <span className="cb-tile-s">{p.manifest.description}</span>
                    </span>
                    <button type="button" className="wz-plug-rm" title="Remove"
                      onClick={()=>setAdded(a=>a.filter(x=>x.id!==p.id))}>
                      <Ic n="x" style={{width:13,height:13}}/></button>
                  </div>)}
                  {builtins===null&&<div className="connect-busy"><span className="spin"/> Loading plugins…</div>}
                  {builtins&&builtins.filter(match).map(p=>{
                    const isTheme=p.manifest.type==='theme';
                    return <label key={p.id} className={cx('cb-checkrow',!isTheme&&'ro')}>
                      {/* built-ins ship with every workspace; only themes are a
                          real choice here (they apply only when enabled) */}
                      {isTheme
                        ? <input type="checkbox" checked={!!selPlugins[p.id]}
                            onChange={e=>setSelPlugins(s=>({...s,[p.id]:e.target.checked}))}/>
                        : null}
                      <span className="cb-check-ic">{p.manifest.icon}</span>
                      <span className="cb-tile-tx">
                        <span className="cb-tile-t">{p.manifest.name}
                          <span className="cb-type-badge">{p.manifest.type}</span>
                          {!isTheme&&<span className="cb-incl">included</span>}</span>
                        <span className="cb-tile-s">{p.manifest.description}</span>
                      </span>
                    </label>;
                  })}
                  {(()=>{
                    // community registry results — installs pin to the TESTED commit
                    const regRows=searchIndex(registry||[],looksLikeLink?'':q)
                      .filter(e=>!added.some(a=>a.id===e.id)&&!(builtins||[]).some(b=>b.id===e.id));
                    return regRows.length>0&&<>
                      <div className="cb-choose">From the plugin registry</div>
                      {regRows.map(e=><div key={'reg-'+e.id} className="cb-checkrow ro">
                        <span className="cb-check-ic">{e.icon||'🧩'}</span>
                        <span className="cb-tile-tx">
                          <span className="cb-tile-t">{e.name}
                            <span className="cb-type-badge">{e.type}</span>
                            {e.verified&&<span className="cb-incl">✓ verified</span>}</span>
                          <span className="cb-tile-s">{e.description} · {e.repo}</span>
                        </span>
                        <Button size="sm" disabled={pgBusy}
                          onClick={()=>connectUrl(installUrlFor(e))}>Install</Button>
                      </div>)}
                    </>;
                  })()}
                  {builtins&&!builtins.filter(match).length&&!added.length&&
                    !searchIndex(registry||[],q).length&&
                    <div className="cb-tile-s" style={{padding:'8px 2px'}}>No plugins match “{pgQuery}” —
                      paste a GitHub link (github.com/user/plugin) to connect one.</div>}
                </div>
                <div className="cb-mode-hint">Built a plugin? <a className="cb-link"
                    href={submitPluginUrl(looksLikeLink?pgQuery.trim():'')}
                    target="_blank" rel="noopener noreferrer">Submit it to the registry</a> —
                  automated tests run on submission and index it in minutes.</div>
                </>;
              })()}

              {stage.key==='pages'&&<div className="cb-checklist">
                {STARTER_PAGES.map(p=><label key={p.id} className="cb-checkrow">
                  <input type="checkbox" checked={!!selPages[p.id]}
                    onChange={e=>setSelPages(s=>({...s,[p.id]:e.target.checked}))}/>
                  <span className="cb-check-ic">{p.icon}</span>
                  <span className="cb-tile-tx">
                    <span className="cb-tile-t">{p.title}</span>
                    <span className="cb-tile-s">{p.desc}</span>
                  </span>
                </label>)}
              </div>}

              {stage.key==='where'&&<>
                {storageTiles}
                {!localOK&&<div className="cc-warn">Local folders need Chrome, Edge or Brave — Google Drive works everywhere.</div>}
                {error&&<div className="connect-error">{error}</div>}
                {busy&&<div className="connect-busy"><span className="spin"/> Working…</div>}
              </>}
            </div>

            <div className="wz-foot">
              <Button variant="ghost" onClick={back}>‹ Back</Button>
              <span className="wz-count">{step+1} / {STAGES.length}</span>
              {!last
                ? <Button disabled={!named||busy} onClick={next}>Next ›</Button>
                : <span style={{width:76}}/>}
            </div>
          </>}
      </div>
    </div>,document.body)}
  </div>;
}

export default function HomeScreen({pointer,list,busy,error,driveConnected,onConnectDrive,onDocs,onPlugins,onWelcome,theme,onToggleTheme,accent,onAccent,devMode,onDevMode,onOpen,onRemove,onReconnect,onLocalNew,onLocalExisting,onDriveNew,onDriveExisting}){
  const known=list||[];
  const lastId=pointer?pointer.id:null;
  return <div className="home-screen has-fixed-foot">
    <div className="home-aurora" aria-hidden="true">
      <span className="orb o1"/><span className="orb o2"/><span className="orb o3"/><span className="orb o4"/>
      <span className="home-grid"/>
    </div>
    <SiteNavbar links={[
      {label:'Welcome',onClick:onWelcome},
      {label:'Docs',onClick:onDocs},
      {label:'Plugins',onClick:onPlugins},
    ]}/>
    <div className="home-inner">
      <h1 className="home-title home-rise" style={{animationDelay:'60ms'}}>
        Your notes, as plain&nbsp;<span className="grad">Markdown</span>.
      </h1>
      <p className="home-sub home-rise" style={{animationDelay:'120ms'}}>
        {known.length?'Open a workspace you’ve connected before, or start a new one.'
          :'Connect a workspace to get started.'} Everything you write is saved as ordinary
        folders and <code>.md</code> files — readable and usable even if this app goes away.
      </p>

      <div className={cx('home-columns',known.length>0&&'two-col')}>
        {known.length>0&&<div className="home-col home-rise" style={{animationDelay:'180ms'}}>
          <div className="home-label home-label-row">
            <span>Your workspaces</span>
            <button type="button"
              className={cx('drive-cloud',driveConnected?'on':'off')}
              disabled={busy} onClick={onConnectDrive}
              title={driveConnected?'Google Drive connected — click to refresh':'Click to connect to Google Drive'}
              aria-label={driveConnected?'Google Drive connected — click to refresh':'Connect to Google Drive'}>
              <Ic n="cloud" style={{width:24,height:24}}/>
              <span className="drive-cloud-badge">
                <Ic n={driveConnected?'check':'x'} style={{width:10,height:10}}/>
              </span>
            </button>
          </div>
          <div className="home-ws-list">
            {known.map(ws=>{
              const isLocal=ws.type==='local';
              const isLast=ws.id===lastId;
              return <div key={ws.id} className={cx('home-ws-row',isLast&&'last')}
                onClick={()=>!busy&&onOpen(ws)}>
                <div className={cx('home-ws-ava',isLocal?'local':'drive')}>{isLocal?'💻':GDRIVE.emoji}</div>
                <div className="home-ws-meta">
                  <div className="home-ws-name">{ws.name}
                    {isLast&&<span className="home-ws-badge">Last used</span>}
                  </div>
                  <div className="home-ws-type">
                    {isLocal?'Local folder':'Google Drive'}
                    {isLocal&&ws.accessible===false?' · needs access':''}
                  </div>
                </div>
                <button className="btn primary sm" disabled={busy}
                  onClick={e=>{e.stopPropagation();onOpen(ws);}}>Open</button>
                <button className="btn ghost sm home-ws-unlink"
                  title="Unlink — remove from this list (your files are NOT deleted)"
                  disabled={busy} onClick={e=>{e.stopPropagation();onRemove(ws);}}>
                  <Ic n="unlink" style={{width:13,height:13}}/> Unlink
                </button>
              </div>;
            })}
          </div>
          {error&&<div className="connect-error" style={{marginTop:10}}>{error}</div>}
        </div>}

        <div className="home-col home-rise" style={{animationDelay:'240ms'}}>
          <div className="home-label">{known.length?'Connect another':'Connect a workspace'}</div>
          <ConnectPanel onLocalNew={onLocalNew} onLocalExisting={onLocalExisting}
            onDriveNew={onDriveNew} onDriveExisting={onDriveExisting} busy={busy}
            devMode={devMode} onDevMode={onDevMode}
            theme={theme} onToggleTheme={onToggleTheme} accent={accent} onAccent={onAccent}
            error={known.length?'':error}/>
        </div>
      </div>

    </div>
    <SiteFooter theme={theme} onToggleTheme={onToggleTheme}
      accent={accent} onAccent={onAccent} delay="300ms"/>
  </div>;
}
