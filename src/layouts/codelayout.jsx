/* =========================================================================
   codelayout.jsx — the CODE LAYOUT (lazy chunk)
   -------------------------------------------------------------------------
   A VS Code-style presentation of the SAME workspace: activity bar +
   explorer (on-disk file names), tabbed editor area, a pseudo-terminal and
   a status bar. Pages render through the same editors as the home layout —
   the workspace.jsx shell passes `renderEditor(node)` so routing (smart /
   md / file / plugin, incl. the lazy PluginHost) stays in one place.

   The terminal is a REAL shell: an xterm.js client for the local Docker
   bridge (docker/terminal-bridge, localhost:4517). It runs as a bottom
   panel or maximized over the whole editor area (the ▲/▼ button).
   ========================================================================= */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cx, Ic, ContextMenu } from '../views/smart.jsx';
import { fetchPluginIndex, searchIndex, installUrlFor, submitPluginUrl } from '../services/pluginrepo.js';
import { nodeToMarkdown, markdownToNode } from '../storage/markdown.js';
import SavePill from '../components/ui/savepill.jsx';
import Brand from '../components/ui/brand.jsx';
import '@xterm/xterm/css/xterm.css';
// the REAL bridge sources, bundled as text — the downloadable zip in the
// "No terminal connected" panel can never drift from docker/terminal-bridge/
import bridgeServerJs from '../../docker/terminal-bridge/server.js?raw';
import bridgeDockerfile from '../../docker/terminal-bridge/Dockerfile?raw';
import bridgeReadme from '../../docker/terminal-bridge/README.md?raw';

/* ---- minimal ZIP writer (stored, no compression — three text files) ---- */
function crc32(buf) {
  if (!crc32.t) {
    crc32.t = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      crc32.t[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crc32.t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function buildZip(files) {
  const enc = new TextEncoder();
  const num = (n, bytes) => {
    const a = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) a[i] = (n >>> (8 * i)) & 0xFF;
    return a;
  };
  const parts = []; const central = []; let offset = 0;
  const push = arr => { for (const p of arr) { parts.push(p); offset += p.length; } };
  for (const f of files) {
    const data = enc.encode(f.text), name = enc.encode(f.name), crc = crc32(data);
    central.push({ name, crc, size: data.length, offset });
    push([num(0x04034b50, 4), num(20, 2), num(0, 2), num(0, 2), num(0, 2), num(0, 2),
      num(crc, 4), num(data.length, 4), num(data.length, 4), num(name.length, 2), num(0, 2), name, data]);
  }
  const cdStart = offset;
  for (const c of central)
    push([num(0x02014b50, 4), num(20, 2), num(20, 2), num(0, 2), num(0, 2), num(0, 2), num(0, 2),
      num(c.crc, 4), num(c.size, 4), num(c.size, 4), num(c.name.length, 2), num(0, 2), num(0, 2),
      num(0, 2), num(0, 2), num(0, 4), num(c.offset, 4), c.name]);
  const cdSize = offset - cdStart;
  push([num(0x06054b50, 4), num(0, 2), num(0, 2), num(central.length, 2), num(central.length, 2),
    num(cdSize, 4), num(cdStart, 4), num(0, 2)]);
  return new Blob(parts, { type: 'application/zip' });
}
function downloadBridgeZip() {
  const blob = buildZip([
    { name: 'terminal-bridge/server.js', text: bridgeServerJs },
    { name: 'terminal-bridge/Dockerfile', text: bridgeDockerfile },
    { name: 'terminal-bridge/README.md', text: bridgeReadme },
  ]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'workspace-terminal-bridge.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* on-disk name of a node, same rules as the topbar crumb + buildFolderPlan */
export function diskName(n) {
  if (!n) return 'Untitled';
  if (n.kind === 'folder') return n.title || 'Untitled';
  if (n.kind === 'file') {
    const m = (n.title || 'file.txt').match(/^(.*?)(\.[^.]+)?$/);
    return (m[1] || 'file') + (n.plugin ? '-(' + n.plugin + ')' : '') + (m[2] || '');
  }
  if (n.kind === 'plugin') return (n.title || 'Untitled') + '-(' + (n.plugin || 'plugin') + ').md';
  return (n.title || 'Untitled') + '.md';
}

const EXT_COLORS = { md: '#519aba', py: '#4B8BBE', js: '#e8d44d', jsx: '#61dafb', ts: '#3178c6',
  html: '#e34c26', css: '#9575cd', json: '#cbcb41', csv: '#89e051', sh: '#89e051',
  yaml: '#cb4b16', xml: '#e37933', sql: '#c0c0c0', txt: '#9aa0a6' };

/* Same icon rule as the home layout: custom emoji wins; smart pages get the
   document icon; file-backed pages show their extension as the icon. */
function FileDot({ node }) {
  if (node.kind === 'folder') return <span className="cl-caret-ic"><Ic n="folder"/></span>;
  if (node.icon) return <span className="cl-filedot">{node.icon}</span>;
  if (node.kind === 'database') return <span className="cl-filedot">▦</span>;
  if (node.kind === 'md' || node.kind === 'plugin' || node.kind === 'file') {
    const ext = node.kind === 'file' ? (node.ext || 'txt') : 'md';
    return <span className="cl-filedot" style={{ color: EXT_COLORS[ext] || '#9aa0a6' }}>{ext.slice(0, 4)}</span>;
  }
  return <span className="cl-filedot"><Ic n="doc" style={{ width: 13, height: 13, color: 'var(--cl-text2)' }}/></span>;
}

/* -------------------------------------------------------------- explorer -- */
/* Rows reuse the HOME sidebar's tree classes so both layouts look identical. */
function Tree({ nodes, childrenMap, parentId, depth, currentId, openPage, expanded, toggleExp, onCtx }) {
  const kids = childrenMap[parentId || ''] || [];
  return kids.map(n => {
    const hasKids = (childrenMap[n.id] || []).length > 0;
    const open = expanded[n.id];
    return <React.Fragment key={n.id}>
      <div className={cx('tree-item', currentId === n.id && 'sel')}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => { if (n.kind === 'folder' || hasKids) toggleExp(n.id); if (n.kind !== 'folder') openPage(n.id); }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onCtx && onCtx({ type: 'tree', id: n.id, x: e.clientX, y: e.clientY }); }}>
        <span className={cx('cl-caret', !hasKids && n.kind !== 'folder' && 'none')}>
          {(hasKids || n.kind === 'folder') ? (open ? '▾' : '▸') : ''}</span>
        <span className="tree-emoji"><FileDot node={n}/></span>
        <span className="tree-label">{diskName(n)}</span>
      </div>
      {open && <Tree nodes={nodes} childrenMap={childrenMap} parentId={n.id} depth={depth + 1}
        currentId={currentId} openPage={openPage} expanded={expanded} toggleExp={toggleExp} onCtx={onCtx}/>}
    </React.Fragment>;
  });
}

/* -------------------------------------------------------------- terminal -- */
/* A REAL terminal — an xterm.js client for the local Docker bridge
   (docker/terminal-bridge, localhost:4517). The app has no backend, so when
   the bridge isn't running there is simply no terminal: the panel says
   "No terminal connected" with the command to start one.
   localhost is tried first; 127.0.0.1 is the fallback for systems where
   localhost resolves to ::1 (IPv6) while the bridge binds IPv4 only. */
const BRIDGE_URLS = ['ws://localhost:4517', 'ws://127.0.0.1:4517'];

function Terminal({ hidden }) {
  const [state, setState] = useState('connecting');   // connecting | on | off
  const holderRef = useRef(null);
  const sockRef = useRef(null);
  const termRef = useRef(null);

  const connect = React.useCallback(() => {
    // a reconnect replaces any previous session's terminal
    try { termRef.current?.ro?.disconnect(); termRef.current?.term.dispose(); } catch (_) {}
    termRef.current = null;
    setState('connecting');
    const tryUrl = ix => {
      if (ix >= BRIDGE_URLS.length) { setState('off'); return; }
      let sock;
      try { sock = new WebSocket(BRIDGE_URLS[ix]); } catch (_) { tryUrl(ix + 1); return; }
      sockRef.current = sock;
      let opened = false;
      sock.onerror = () => {};   // onclose always follows and decides
      sock.onclose = () => {
        if (!opened) tryUrl(ix + 1);            // this URL failed → try the next
        else setState('off');                   // live session dropped
      };
      sock.onopen = () => { opened = true; onSock(sock); };
    };
    const onSock = async sock => {
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (sock.readyState !== 1) { setState('off'); return; }
      const term = new XTerm({
        fontSize: 13,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        cursorBlink: true,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.onData(d => { if (sock.readyState === 1) sock.send(JSON.stringify({ t: 'i', d })); });
      term.onResize(({ cols, rows }) => {
        if (sock.readyState === 1) sock.send(JSON.stringify({ t: 'r', cols, rows })); });
      // xterm buffers writes before open(), so wiring this now loses nothing
      sock.onmessage = e => term.write(typeof e.data === 'string' ? e.data : '');
      termRef.current = { term, fit, sock, opened: false, ro: null };
      setState('on');   // the effect below opens the term once the holder is visible
    };
    tryUrl(0);
  }, []);

  /* xterm must be opened into a VISIBLE element — doing it while the holder
     is display:none renders a zero-size terminal that can't take focus. */
  useEffect(() => {
    const t = termRef.current;
    if (state !== 'on' || !t || t.opened || !holderRef.current) return;
    t.opened = true;
    const cs = getComputedStyle(holderRef.current);
    t.term.options.theme = {
      background: cs.getPropertyValue('--cl-bg').trim() || '#1e1e1e',
      foreground: cs.getPropertyValue('--cl-text').trim() || '#cccccc',
      cursor: cs.getPropertyValue('--cl-status').trim() || '#7c6cf0',
    };
    t.term.open(holderRef.current);
    t.fit.fit();
    if (t.sock.readyState === 1)
      t.sock.send(JSON.stringify({ t: 'r', cols: t.term.cols, rows: t.term.rows }));
    t.ro = new ResizeObserver(() => { try { t.fit.fit(); } catch (_) {} });
    t.ro.observe(holderRef.current);
    t.term.focus();
  }, [state]);

  useEffect(() => {
    connect();
    return () => {
      try { sockRef.current?.close(); } catch (_) {}
      try { termRef.current?.ro?.disconnect(); termRef.current?.term.dispose(); } catch (_) {}
    };
  }, [connect]);

  return <div className="cl-term" style={hidden?{display:'none'}:undefined}>
    {/* the xterm holder must exist before the socket opens */}
    <div className="cl-term-xterm" ref={holderRef}
      style={{ display: state === 'on' ? 'block' : 'none' }}/>
    {state !== 'on' && <div className="cl-term-off">
      {state === 'connecting'
        ? <div className="cl-term-line">Connecting to the local terminal bridge…</div>
        : <>
            <div className="cl-term-line err">No terminal connected.</div>
            <div className="cl-term-line">The terminal needs the local Docker bridge
              running on this computer (the app itself has no shell access).
              Download it, unzip, then:</div>
            <pre className="cl-term-cmd">{
`docker build -t workspace-terminal terminal-bridge
docker run --rm -p 127.0.0.1:4517:4517 -v "$PWD:/workspace" workspace-terminal`}</pre>
            <div className="cl-term-btns">
              <button className="cl-term-retry" onClick={downloadBridgeZip}>
                ⬇ Download the bridge (.zip)</button>
              <button className="cl-term-retry" onClick={connect}>Retry connection</button>
            </div>
          </>}
    </div>}
  </div>;
}


/* ------------------------------------------------- extensions (plugins) -- */
/* VS Code's Extensions view, for plugins: an EXTENSIONS side panel with
   search + INSTALLED / MARKETPLACE sections, and a detail page that opens
   in the editor area. "Installed" = the workspace's discovered plugins
   (built-ins included); "Marketplace" = the community registry index. */
function extActions(p,{onTogglePlugin,busy}){
  if(p.registry) return null;
  if(p.manifest.type==='theme')
    return <button className={cx('cl-ext-btn',p.enabled&&'primary')} disabled={busy}
      onClick={e=>{e.stopPropagation();onTogglePlugin&&onTogglePlugin(p,!p.enabled);}}>
      {p.enabled?'Applied ✓':'Apply'}</button>;
  if(p.builtin) return <span className="cl-ext-tag">built-in</span>;
  return <button className={cx('cl-ext-btn',!p.enabled&&'primary')} disabled={busy}
    onClick={e=>{e.stopPropagation();onTogglePlugin&&onTogglePlugin(p,!p.enabled);}}>
    {p.enabled?'Disable':'Enable'}</button>;
}

function ExtensionsView({plugins,onTogglePlugin,onInstallPlugin,onOpenExt,openExtId}){
  const [q,setQ]=useState('');
  const [registry,setRegistry]=useState(null);
  const [busyId,setBusyId]=useState(null);
  useEffect(()=>{ let a=true; fetchPluginIndex().then(ix=>a&&setRegistry(ix)); return()=>{a=false;}; },[]);
  const ql=q.trim().toLowerCase();
  const match=p=>!ql||p.manifest.name.toLowerCase().includes(ql)
    ||p.manifest.description.toLowerCase().includes(ql)||p.manifest.type.includes(ql);
  const installed=plugins.filter(match);
  const market=searchIndex(registry||[],ql).filter(e=>!plugins.some(p=>p.id===e.id));
  const install=async e=>{
    setBusyId(e.id);
    try{
      const m=await import('../plugins.jsx');
      const raw=await m.fetchGithubPlugin(installUrlFor(e));
      await onInstallPlugin(raw);
    }catch(err){ alert('Install failed: '+(err?.message||err)); }
    setBusyId(null);
  };
  const Row=({p,reg})=><div key={p.id}
    className={cx('cl-ext-row',openExtId===p.id&&'sel')}
    onClick={()=>onOpenExt(reg?{registry:true,...p}:p)}>
    <span className="cl-ext-ic">{(reg?p.icon:p.manifest.icon)||'🧩'}</span>
    <span className="cl-ext-tx">
      <span className="cl-ext-t">{reg?p.name:p.manifest.name}</span>
      <span className="cl-ext-s">{reg?p.description:p.manifest.description}</span>
      <span className="cl-ext-a">
        {reg?<>✓ {p.submittedBy||'community'}</>:<>✓ {p.builtin?'Workspace':'this workspace'}</>}
        <span style={{flex:1}}/>
        {reg
          ? <button className="cl-ext-btn install" disabled={busyId===p.id}
              onClick={e=>{e.stopPropagation();install(p);}}>
              {busyId===p.id?'Installing…':'Install'}</button>
          : extActions(p,{onTogglePlugin,busy:false})}
      </span>
    </span>
  </div>;
  return <>
    <div className="cl-side-title">EXTENSIONS</div>
    <label className="cl-ext-search">
      <input placeholder="Search Plugins in Marketplace" value={q}
        onChange={e=>setQ(e.target.value)}/>
    </label>
    <div className="cl-sec cl-sec-grow" style={{overflowY:'auto'}}>
      <div className="cl-sec-h"><span className="cl-sec-caret">▾</span> INSTALLED
        <span className="cl-ext-count">{installed.length}</span></div>
      {installed.map(p=><Row key={p.id} p={p}/>)}
      <div className="cl-sec-h" style={{marginTop:6}}><span className="cl-sec-caret">▾</span> MARKETPLACE
        <span className="cl-ext-count">{registry===null?'…':market.length}</span></div>
      {market.map(e=><Row key={'r'+e.id} p={e} reg/>)}
      {registry!==null&&!market.length&&!ql&&
        <div className="cl-ext-none">Everything from the registry is installed.</div>}
      <a className="cl-ext-none" style={{display:'block',textDecoration:'none',cursor:'pointer',color:'var(--accent)'}}
        href={submitPluginUrl('')} target="_blank" rel="noopener noreferrer">Publish your own plugin ↗</a>
    </div>
  </>;
}

function ExtensionDetail({ext,plugins,onTogglePlugin,onUninstall}){
  const reg=!!ext.registry;
  const live=plugins.find(p=>p.id===ext.id);   // discovered version, if installed
  const man=live?live.manifest:ext;             // registry entries are flat
  const rows=[
    ['Identifier',ext.id],
    ['Version',man.version||'1.0.0'],
    ['Type',man.type],
    ['Layout',man.layout||'all'],
    (man.handles||[]).length&&['Handles',(man.handles||[]).map(h=>'.'+h).join(', ')],
    ['Permissions',(man.permissions||[]).length?man.permissions.join(', '):'none'],
    reg&&['Tested commit',String(ext.ref||'').slice(0,10)],
    reg&&['Submitted by',ext.submittedBy||'—'],
  ].filter(Boolean);
  return <div className="cl-ext-detail scroll">
    <div className="cl-ext-hero">
      <span className="cl-ext-hero-ic">{man.icon||'🧩'}</span>
      <div style={{minWidth:0}}>
        <h1>{man.name}</h1>
        <div className="cl-ext-hero-meta">
          ✓ {reg?(ext.submittedBy||'community'):(live?.builtin?'Workspace built-in':'this workspace')}
          <span className="cb-type-badge">{man.type}</span>
          {ext.verified&&<span className="cb-type-badge">✓ verified</span>}
        </div>
        <p className="cl-ext-hero-desc">{man.description}</p>
        <div className="cl-ext-hero-btns">
          {live&&extActions(live,{onTogglePlugin,busy:false})}
          {live&&!live.builtin&&onUninstall&&
            <button className="cl-ext-btn" onClick={()=>onUninstall(live)}>Uninstall</button>}
          {(reg||live?.repo)&&<a className="cl-ext-btn" target="_blank" rel="noopener noreferrer"
            href={reg?`https://github.com/${ext.repo}`:'#'}>Repository ↗</a>}
        </div>
      </div>
    </div>
    <div className="cl-ext-cols">
      <div className="cl-ext-readme">
        <h3>DETAILS</h3>
        <p>{man.description}</p>
        {man.type==='theme'
          ? <p>A CSS-only skin — applied across the whole app while enabled.
              Themes never run code; they are still consent-gated because CSS
              can restyle any surface.</p>
          : <p>A page plugin: default-exports a React component that receives
              <code> data / setData</code> for its page's content
              {(man.handles||[]).length>0&&<> and opens <code>{(man.handles||[]).map(h=>'.'+h).join(' ')}</code> files</>}.</p>}
      </div>
      <div className="cl-ext-meta">
        <h3>Installation</h3>
        {rows.map(([k,v])=><div key={k} className="cl-ext-meta-row">
          <span>{k}</span><b style={{fontFamily:'var(--mono)',fontSize:11}}>{v}</b></div>)}
      </div>
    </div>
  </div>;
}

/* --------------------------------------------------------------- raw md -- */
/* CODE-LAYOUT ONLY: render a SMART page as its raw on-disk .md file
   (frontmatter included — exactly what nodeToMarkdown writes). Edits are
   parsed back into blocks with the same markdownToNode the disk loader
   uses, committed on blur / unmount. */
function RawMdView({ node, nodes, update }) {
  const initial = useMemo(() => nodeToMarkdown(node, { nodesMap: nodes }), [node.id]);
  const [text, setText] = useState(initial);
  const live = useRef({ text, dirty: false, node });
  live.current.text = text; live.current.node = node;
  const commit = () => {
    const c = live.current;
    if (!c.dirty) return;
    c.dirty = false;
    try {
      const { node: p } = markdownToNode(c.text, { fallbackTitle: c.node.title || 'Untitled' });
      const { id, parentId, sort, ...rest } = p;   // identity + position stay
      update(c.node.id, rest);
    } catch (_) {}
  };
  useEffect(() => commit, []);   // leaving the view (tab switch, toggle) commits
  return <div className="cl-rawmd">
    <textarea className="cl-rawmd-ta" spellCheck={false} wrap="off" value={text}
      onChange={e => { setText(e.target.value); live.current.dirty = true; }}
      onBlur={commit}/>
    <div className="cl-rawmd-note">raw .md — the exact on-disk file; parsed back into blocks when you click away</div>
  </div>;
}

/* ---------------------------------------------------------------- trash -- */
/* The Trash side view: every trashed page, with restore / delete-forever. */
function TrashView({ nodes, restore, deleteForever }) {
  const rows = Object.values(nodes).filter(n => n && n.trashed)
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  return <>
    <div className="cl-side-title">TRASH</div>
    <div className="cl-sec cl-sec-grow" style={{ overflowY: 'auto' }}>
      {rows.length === 0 && <div className="cl-ext-none">Trash is empty.</div>}
      {rows.map(n => <div key={n.id} className="tree-item cl-trash-row">
        <span className="tree-emoji"><FileDot node={n}/></span>
        <span className="tree-label">{diskName(n)}</span>
        <button className="cl-sec-btn" title="Restore" onClick={() => restore(n.id)}>
          <Ic n="restore"/></button>
        <button className="cl-sec-btn" title="Delete forever"
          onClick={() => { if (confirm(`Delete “${diskName(n)}” forever? This cannot be undone.`)) deleteForever(n.id); }}>
          <Ic n="x"/></button>
      </div>)}
    </div>
  </>;
}

/* ---------------------------------------------------------------- layout -- */
const PANEL_TABS=[['problems','PROBLEMS'],['output','OUTPUT'],['terminal','TERMINAL']];
const MENUS={
  File:(a)=>[
    {label:'New Page…',kbd:'name decides kind',action:a.newPage},
    {label:'New Folder',action:()=>a.addFolder(null)},
    {sep:true},
    {label:'Settings',action:()=>a.setModal({type:'settings'})},
  ],
  Edit:(a)=>[
    {label:'Search Pages',kbd:'Ctrl+K',action:()=>a.setModal({type:'search'})},
    {header:'Text editing lives in each editor'},
  ],
  View:(a)=>[
    {label:'Toggle Explorer',action:a.toggleSide},
    {label:'Toggle Panel',kbd:'Ctrl+`',action:a.togglePanel},
    {sep:true},
    {label:'Home Layout',action:()=>a.setLayout('home')},
  ],
  Go:(a)=>[
    {label:'Home Page',action:()=>a.openPage(a.dashId)},
    {label:'Search Pages…',kbd:'Ctrl+K',action:()=>a.setModal({type:'search'})},
  ],
  Terminal:(a)=>[
    {label:'Toggle Terminal',kbd:'Ctrl+`',action:a.togglePanel},
    {label:'Download the Bridge (.zip)',action:downloadBridgeZip},
  ],
  Help:(a)=>[
    {label:'Keyboard Shortcuts',kbd:'Ctrl+/',action:()=>a.setModal({type:'shortcuts'})},
    {label:'Plugins',action:()=>a.setModal({type:'settings'})},
  ],
};

export default function CodeLayout({ nodes, currentId, openPage, renderEditor,
  createNamed, addFolder, trashNode, restore, deleteForever, updateNode, wsName, plugins, saveState,
  onTogglePlugin, onInstallPlugin, onUninstallPlugin, setLayout, setModal, dashId, goHome }) {
  const [expanded, setExpanded] = useState({});
  const [tabs, setTabs] = useState([]);          // node ids, in open order
  const [sideView, setSideView] = useState('explorer');  // 'explorer'|'extensions'|null
  const [ext, setExt] = useState(null);          // open extension detail (editor area)
  /* the bottom panel NEVER auto-opens — it comes back only if it was open
     when you left (persisted per browser) */
  const [panel, setPanel] = useState(() => {
    try { return localStorage.getItem('ws_code_panel') === '1'; } catch (_) { return false; }
  });
  useEffect(() => { try { localStorage.setItem('ws_code_panel', panel ? '1' : '0'); } catch (_) {} }, [panel]);
  const [panelTab, setPanelTab] = useState('terminal');
  const [panelMax, setPanelMax] = useState(false);
  const [menu, setMenu] = useState(null);        // {name,x,y} — open titlebar menu
  const [ctx, setCtx] = useState(null);          // {type:'tree'|'tab', id, x, y}
  /* code-layout-only: smart pages render as their raw on-disk .md */
  const [rawMd, setRawMdState] = useState(() => {
    try { return localStorage.getItem('ws_code_rawmd') === '1'; } catch (_) { return false; }
  });
  const setRawMd = v => { setRawMdState(v); try { localStorage.setItem('ws_code_rawmd', v ? '1' : '0'); } catch (_) {} };
  useEffect(() => { if (!panel) setPanelMax(false); }, [panel]);
  const toggleExp = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const childrenMap = useMemo(() => {
    const m = {};
    Object.values(nodes).forEach(n => {
      if (!n || n.trashed || n.archived) return;
      (m[n.parentId || ''] || (m[n.parentId || ''] = [])).push(n);
    });
    Object.values(m).forEach(a => a.sort((x, y) => (x.sort || 0) - (y.sort || 0)));
    return m;
  }, [nodes]);

  const node = currentId && currentId !== dashId ? nodes[currentId] : null;

  /* the current page always becomes a tab; dead tabs (trashed pages) drop */
  useEffect(() => {
    setTabs(t => {
      const alive = t.filter(id => nodes[id] && !nodes[id].trashed && !nodes[id].archived);
      return node && !alive.includes(node.id) ? [...alive, node.id] : alive;
    });
  }, [node?.id, nodes]);

  const closeTab = id => {
    setTabs(t => {
      const nt = t.filter(x => x !== id);
      if (id === currentId) {
        const ix = t.indexOf(id);
        const next = nt[Math.min(ix, nt.length - 1)];
        // no tabs left → leave the page too, or the tab-sync effect
        // immediately re-adds the still-current page
        openPage(next || dashId);
      }
      return nt;
    });
  };
  const closeOthers = id => { setTabs([id]); openPage(id); };
  const closeAll = () => { setTabs([]); openPage(dashId); };

  const newPage = () => {
    const name = window.prompt('Name — hello.py · notes.md · plain name for a smart page', '');
    if (name && name.trim()) createNamed(name.trim());
  };

  /* Ctrl+` toggles the panel, like VS Code */
  useEffect(() => {
    const h = e => { if (e.ctrlKey && e.key === '`') { e.preventDefault(); setPanel(p => !p); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const menuApi = { newPage, addFolder, setModal, setLayout, openPage, dashId,
    toggleSide: () => setSideView(v => v === 'explorer' ? null : 'explorer'), togglePanel: () => setPanel(p => !p) };
  const openMenu = (name, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu(m => m?.name === name ? null : { name, x: r.left, y: r.bottom + 2 });
  };

  /* breadcrumb trail: workspace › …folders › file */
  const crumbs = [];
  for (let c = node; c; c = c.parentId ? nodes[c.parentId] : null) crumbs.unshift(c);

  return <div className="code-layout">
    {/* ------------------------------------------------ title bar ------- */}
    <div className="cl-titlebar">
      <Brand small name={wsName||'Workspace'}/>
      <nav className="cl-menus">
        {Object.keys(MENUS).map(name =>
          <button key={name} className={cx('cl-menu-btn', menu?.name === name && 'on')}
            onClick={e => openMenu(name, e)}
            onMouseEnter={e => { if (menu) openMenu(name, e); }}>{name}</button>)}
      </nav>
      <div className="cl-tb-center">
        <button className="cl-tb-nav" title="Home page" onClick={() => openPage(dashId)}>
          <Ic n="back" style={{ width: 14, height: 14 }}/></button>
        <div className="cl-tb-search" onClick={() => setModal({ type: 'search' })}
          title="Search every page (Ctrl+K)">
          <Ic n="search" style={{ width: 12, height: 12 }}/>
          <span>{wsName || 'Workspace'} — Workspace</span>
        </div>
      </div>
      <div className="cl-tb-right">
        <div className="layout-switch">
          <button className="ls-btn" title="Home layout — pages & databases"
            onClick={() => setLayout('home')}>
            <Ic n="home" style={{ width: 13, height: 13 }}/> Home
          </button>
          <button className="ls-btn on" title="Code layout">
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11 }}>&lt;/&gt;</span> Code
          </button>
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y}
        items={MENUS[menu.name](menuApi)} onClose={() => setMenu(null)}/>}
      {/* right-click menus: explorer rows + editor tabs, VS Code style */}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)}
        items={ctx.type === 'tab'
          ? [
              { label: 'Close', kbd: '×', action: () => closeTab(ctx.id) },
              { label: 'Close Others', action: () => closeOthers(ctx.id) },
              { label: 'Close All', action: closeAll },
            ]
          : (n => [
              ...(n?.kind !== 'folder' ? [{ label: 'Open', action: () => openPage(ctx.id) }] : []),
              { label: 'New Page inside…', action: () => {
                  const name = window.prompt('Name — hello.py · notes.md · plain name', '');
                  if (name && name.trim()) createNamed(name.trim(), ctx.id);
                } },
              { label: 'New Folder inside', action: () => addFolder(ctx.id) },
              { sep: true },
              { label: 'Delete', danger: true, action: () => trashNode(ctx.id) },
            ])(nodes[ctx.id])}/>}
    </div>

    <div className="cl-body">
      {/* --------------------------------------------- activity bar ----- */}
      <div className="cl-activity">
        <button className={cx('cl-act', sideView === 'explorer' && 'on')} title="Explorer"
          onClick={() => setSideView(v => v === 'explorer' ? null : 'explorer')}><Ic n="copy"/></button>
        <button className="cl-act" title="Search (Ctrl+K)"
          onClick={() => setModal({ type: 'search' })}><Ic n="search"/></button>
        <button className={cx('cl-act', sideView === 'extensions' && 'on')}
          title={`Extensions — ${plugins.length} installed`}
          onClick={() => setSideView(v => v === 'extensions' ? null : 'extensions')}><Ic n="plug"/></button>
        <div style={{ flex: 1 }}/>
        <button className={cx('cl-act', sideView === 'trash' && 'on')} title="Trash"
          onClick={() => setSideView(v => v === 'trash' ? null : 'trash')}><Ic n="trash"/></button>
        <button className={cx('cl-act', panel && 'on')} title="Terminal (Ctrl+`)"
          onClick={() => { setPanel(p => !p); setPanelTab('terminal'); }}>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>&gt;_</span></button>
        <button className="cl-act" title="Settings"
          onClick={() => setModal({ type: 'settings' })}><Ic n="settings"/></button>
        <button className="cl-act" title="Close workspace — back to the start page"
          onClick={goHome}><Ic n="log-out"/></button>
      </div>

      {/* ------------------------------------------------ side bar ------ */}
      {sideView === 'extensions' && <div className="cl-side">
        <ExtensionsView plugins={plugins} onTogglePlugin={onTogglePlugin}
          onInstallPlugin={onInstallPlugin} openExtId={ext?.id}
          onOpenExt={setExt}/>
      </div>}
      {sideView === 'trash' && <div className="cl-side">
        <TrashView nodes={nodes} restore={restore} deleteForever={deleteForever}/>
      </div>}
      {sideView === 'explorer' && <div className="cl-side">
        <div className="cl-side-title">EXPLORER</div>
        <div className="cl-sec">
          <div className="cl-sec-h"><span className="cl-sec-caret">▾</span> OPEN EDITORS</div>
          {/* same .nav wrapper as the tree below — identical row insets/pills */}
          <div className="nav">
          {tabs.map(id => {
            const n = nodes[id]; if (!n) return null;
            return <div key={id} className={cx('tree-item cl-oe', id === currentId && 'sel')}
              style={{ paddingLeft: 6 }} onClick={() => openPage(id)}>
              <span className="cl-caret none"/>
              {/* on hover the file icon itself becomes the close × */}
              <span className="tree-emoji cl-oe-swap">
                <span className="cl-oe-ic"><FileDot node={n}/></span>
                <button className="cl-oe-x" title="Close"
                  onClick={e => { e.stopPropagation(); closeTab(id); }}>×</button>
              </span>
              <span className="tree-label">{diskName(n)}</span>
            </div>;
          })}
          </div>
        </div>
        <div className="cl-sec cl-sec-grow">
          <div className="cl-sec-h">
            <span className="cl-sec-caret">▾</span> {(wsName || 'WORKSPACE').toUpperCase()}
            <span style={{ flex: 1 }}/>
            <button className="cl-sec-btn" title="New page — the name decides the kind"
              onClick={newPage}><Ic n="plus"/></button>
            <button className="cl-sec-btn" title="New folder"
              onClick={() => addFolder(null)}><Ic n="folder"/></button>
          </div>
          <div className="cl-sec-body nav">
            <Tree nodes={nodes} childrenMap={childrenMap} parentId={null} depth={0}
              currentId={currentId} openPage={openPage} expanded={expanded} toggleExp={toggleExp}
              onCtx={setCtx}/>
          </div>
        </div>
      </div>}

      {/* ---------------------------------------------- editor area ----- */}
      <div className={cx('cl-main', panel && panelMax && 'term-max')}>
        <div className="cl-tabs">
          {ext && <div className="cl-tab on">
            <span>🧩</span>
            <span style={{fontStyle:'italic'}}>Extension: {ext.registry?ext.name:ext.manifest.name}</span>
            <button className="cl-tab-x" onClick={() => setExt(null)}>×</button>
          </div>}
          {tabs.map(id => {
            const n = nodes[id]; if (!n) return null;
            return <div key={id} className={cx('cl-tab', !ext && id === currentId && 'on')}
              onClick={() => { setExt(null); openPage(id); }}
              onContextMenu={e => { e.preventDefault(); setCtx({ type: 'tab', id, x: e.clientX, y: e.clientY }); }}>
              <FileDot node={n}/>
              <span>{diskName(n)}</span>
              <button className="cl-tab-x" onClick={e => { e.stopPropagation(); closeTab(id); }}>×</button>
            </div>;
          })}
        </div>
        {node && !ext && <div className="cl-crumbs">
          <span>{wsName || 'Workspace'}</span>
          {crumbs.map(c => <React.Fragment key={c.id}>
            <span className="cl-crumb-sep">›</span>
            <span className={cx(c.id === node.id && 'cur')}>{diskName(c)}</span>
          </React.Fragment>)}
        </div>}
        <div className="cl-editor">
          {ext
            ? <ExtensionDetail key={ext.id} ext={ext} plugins={plugins}
                onTogglePlugin={onTogglePlugin}
                onUninstall={async p=>{ if(await onUninstallPlugin?.(p)) setExt(null); }}/>
            : node
            ? (rawMd && node.kind === 'page' && !node.db
                ? <RawMdView key={node.id + ':raw'} node={node} nodes={nodes} update={updateNode}/>
                : <div className="cl-editor-host" key={node.id}>{renderEditor(node)}</div>)
            : <div className="cl-welcome">
                <div className="cl-welcome-mark">◧</div>
                <h2>{wsName || 'Workspace'}</h2>
                <p>Open a file from the explorer, or create one —
                  <code> hello.py</code>, <code>notes.md</code>, or a plain name.</p>
                <div className="cl-welcome-keys">
                  <span>Search <b>Ctrl+K</b></span>
                  <span>Terminal <b>Ctrl+`</b></span>
                  <span>Shortcuts <b>Ctrl+/</b></span>
                </div>
              </div>}
        </div>

        {/* ------------------------------------------- bottom panel ----- */}
        {panel && <div className="cl-panel">
          <div className="cl-panel-head">
            {PANEL_TABS.map(([id, label]) =>
              <button key={id} className={cx('cl-panel-tab', panelTab === id && 'on')}
                onClick={() => setPanelTab(id)}>{label}</button>)}
            <span style={{ flex: 1 }}/>
            <button className="cl-term-x" title={panelMax ? 'Restore panel size' : 'Maximize panel'}
              onClick={() => setPanelMax(m => !m)}>{panelMax ? '▼' : '▲'}</button>
            <button className="cl-term-x" title="Close panel (Ctrl+`)"
              onClick={() => setPanel(false)}>×</button>
          </div>
          {/* the terminal stays MOUNTED across tab switches — a live shell
              must not drop its socket because you glanced at Problems */}
          <Terminal hidden={panelTab !== 'terminal'}/>
          {panelTab === 'problems' && <div className="cl-panel-body">
            No problems have been detected in the workspace.
          </div>}
          {panelTab === 'output' && <div className="cl-panel-body">
            <div>[workspace] {wsName || 'Workspace'} — code layout</div>
            <div>[storage] save state: {saveState}</div>
            <div>[plugins] {plugins.length} plugin{plugins.length === 1 ? '' : 's'} available</div>
          </div>}
        </div>}
      </div>
    </div>

    {/* ------------------------------------------------- status bar ----- */}
    <div className="cl-status">
      <button className="cl-status-item" onClick={() => setRawMd(!rawMd)}
        title="Smart page ON = the block editor · OFF = the raw on-disk .md file"
        role="switch" aria-checked={!rawMd}>
        smart page
        <span className={cx('cl-mini-switch', !rawMd && 'on')}><i/></span>
      </button>
      <div style={{ flex: 1 }}/>
      {/* ACTIVE plugins only: built-in page plugins always run; everything
          else (community plugins, themes) counts once enabled/applied */}
      <button className="cl-status-item" title="Active plugins"
        onClick={() => setModal({ type: 'settings' })}>
        <Ic n="plug" style={{ width: 12, height: 12 }}/>
        {plugins.filter(p => (p.builtin && p.manifest.type === 'page') || p.enabled).length}</button>
      <span className="cl-status-item"><SavePill state={saveState} where={wsName} compact/></span>
    </div>
  </div>;
}
