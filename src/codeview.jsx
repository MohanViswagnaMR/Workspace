/* =========================================================================
   codeview.jsx — the CODE LAYOUT (lazy chunk)
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
import { cx, Ic } from './smart.jsx';
import '@xterm/xterm/css/xterm.css';
// the REAL bridge sources, bundled as text — the downloadable zip in the
// "No terminal connected" panel can never drift from docker/terminal-bridge/
import bridgeServerJs from '../docker/terminal-bridge/server.js?raw';
import bridgeDockerfile from '../docker/terminal-bridge/Dockerfile?raw';
import bridgeReadme from '../docker/terminal-bridge/README.md?raw';

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
function Tree({ nodes, childrenMap, parentId, depth, currentId, openPage, expanded, toggleExp }) {
  const kids = childrenMap[parentId || ''] || [];
  return kids.map(n => {
    const hasKids = (childrenMap[n.id] || []).length > 0;
    const open = expanded[n.id];
    return <React.Fragment key={n.id}>
      <div className={cx('tree-item', currentId === n.id && 'sel')}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => { if (n.kind === 'folder' || hasKids) toggleExp(n.id); if (n.kind !== 'folder') openPage(n.id); }}>
        <span className={cx('cl-caret', !hasKids && n.kind !== 'folder' && 'none')}>
          {(hasKids || n.kind === 'folder') ? (open ? '▾' : '▸') : ''}</span>
        <span className="tree-emoji"><FileDot node={n}/></span>
        <span className="tree-label">{diskName(n)}</span>
      </div>
      {open && <Tree nodes={nodes} childrenMap={childrenMap} parentId={n.id} depth={depth + 1}
        currentId={currentId} openPage={openPage} expanded={expanded} toggleExp={toggleExp}/>}
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

function Terminal({ onClose, max, onMax }) {
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

  return <div className="cl-term">
    <div className="cl-term-head">
      <span>TERMINAL{state === 'on' ? ' — local shell (Docker bridge)' : ''}</span>
      <span className="cl-term-hbtns">
        <button className="cl-term-x" title={max ? 'Restore the panel size' : 'Maximize — terminal fills the page'}
          onClick={onMax}>{max ? '▼' : '▲'}</button>
        <button className="cl-term-x" title="Close terminal (Ctrl+`)" onClick={onClose}>×</button>
      </span>
    </div>
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

/* ---------------------------------------------------------------- layout -- */
export default function CodeLayout({ nodes, currentId, openPage, renderEditor,
  createNamed, addFolder, trashNode, wsName, plugins, saveState, setLayout, setModal, dashId }) {
  const [expanded, setExpanded] = useState({});
  const [tabs, setTabs] = useState([]);          // node ids, in open order
  const [term, setTerm] = useState(true);
  const [termMax, setTermMax] = useState(false); // terminal fills the main area
  useEffect(() => { if (!term) setTermMax(false); }, [term]);
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
        if (next) openPage(next);
      }
      return nt;
    });
  };

  /* Ctrl+` toggles the terminal, like VS Code */
  useEffect(() => {
    const h = e => { if (e.ctrlKey && e.key === '`') { e.preventDefault(); setTerm(t => !t); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return <div className="code-layout">
    {/* the left column mirrors the HOME sidebar: workspace name on top, the
        layout toggle + search under it, the explorer, and a footer with
        terminal + settings */}
    <div className="sidebar cl-sidebar">
      <div className="ws">
        <div className="ws-btn" style={{cursor:'default'}}>
          <div className="ws-ava">{(wsName||'W')[0].toUpperCase()}</div>
          <div className="ws-name">{wsName||'Workspace'}
            <small>&lt;/&gt; code layout</small>
          </div>
        </div>
      </div>

      <div className="layout-switch">
        <button className="ls-btn" title="Home layout — pages & databases"
          onClick={()=>setLayout('home')}>
          <Ic n="home" style={{width:14,height:14}}/> Home
        </button>
        <button className="ls-btn on" title="Code layout — explorer, tabs & terminal">
          <span style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:12}}>&lt;/&gt;</span> Code
        </button>
      </div>

      <div className="nav">
        <div className="tree-item" onClick={()=>setModal({type:'search'})}>
          <span className="tree-emoji" style={{fontSize:14}}><Ic n="search"/></span>
          <span className="tree-label">Search</span>
          <span style={{fontSize:11,color:'var(--text-3)'}}>Ctrl + K</span>
        </div>
      </div>

      <div className="nav-scroll" style={{flex:1,minHeight:0,overflowY:'auto'}}>
        <div className="sec-title"><span>Explorer</span>
          <button title="Add a folder" onClick={()=>addFolder(null)}><Ic n="folder-plus"/></button>
          <button title="Add a page — the name decides the kind: hello.py, notes.md, or a plain name"
            onClick={()=>{
              const name=window.prompt('Name — hello.py · notes.md · plain name for a smart page','');
              if(name&&name.trim()) createNamed(name.trim());
            }}><Ic n="plus"/></button>
        </div>
        <div className="nav">
          <Tree nodes={nodes} childrenMap={childrenMap} parentId={null} depth={0}
            currentId={currentId} openPage={openPage} expanded={expanded} toggleExp={toggleExp}/>
        </div>
      </div>

      <div className="sidebar-foot">
        <div className={cx('tree-item',term&&'sel')} onClick={()=>setTerm(t=>!t)}>
          <span className="tree-emoji" style={{fontSize:12,fontFamily:'var(--mono)',fontWeight:700}}>&gt;_</span>
          <span className="tree-label">Terminal</span>
          <span style={{fontSize:11,color:'var(--text-3)'}}>Ctrl + `</span>
        </div>
        <div className="tree-item" onClick={()=>setModal({type:'settings'})}>
          <span className="tree-emoji" style={{fontSize:14}}><Ic n="settings"/></span>
          <span className="tree-label">Settings</span>
        </div>
      </div>
    </div>

    <div className={cx('cl-main', term && termMax && 'term-max')}>
      <div className="cl-tabs">
        {tabs.map(id => {
          const n = nodes[id]; if (!n) return null;
          return <div key={id} className={cx('cl-tab', id === currentId && 'on')}
            onClick={() => openPage(id)}>
            <FileDot node={n}/>
            <span>{diskName(n)}</span>
            <button className="cl-tab-x" onClick={e => { e.stopPropagation(); closeTab(id); }}>×</button>
          </div>;
        })}
      </div>
      <div className="cl-editor">
        {node
          ? <div className="cl-editor-host" key={node.id}>{renderEditor(node)}</div>
          : <div className="cl-welcome">
              <div className="cl-welcome-mark">◧</div>
              <h2>{wsName || 'Workspace'} — code layout</h2>
              <p>Open a file from the explorer, or create one in the
                terminal: <code>new hello.py</code>, <code>new notes.md</code>.</p>
            </div>}
      </div>
      {term && <Terminal onClose={()=>setTerm(false)}
        max={termMax} onMax={()=>setTermMax(m=>!m)}/>}
    </div>

    <div className="cl-status">
      <button className="cl-status-item cl-status-branch" onClick={()=>setLayout('home')}
        title="Switch to the Home layout">⌂ home layout</button>
      <span className="cl-status-item">{wsName||'Workspace'}</span>
      <div style={{flex:1}}/>
      <button className="cl-status-item" onClick={()=>setTerm(t=>!t)} title="Toggle terminal (Ctrl+`)">&gt;_ terminal</button>
      <span className="cl-status-item">{node?`${diskName(node)}`:''}</span>
      <span className="cl-status-item">{saveState==='demo'?'demo — not saved':saveState}</span>
    </div>
  </div>;
}
