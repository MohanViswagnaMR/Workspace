/* =========================================================================
   NOTION — Connected Workspace  (Markdown-on-disk edition)
   Block editor, nested pages, multi-view databases, search, trash,
   templates, favorites, dark mode, keyboard shortcuts.
   Persistence is delegated to ./storage (Firestore or localStorage).
   ========================================================================= */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Home, Inbox, Settings, Plus, ChevronRight, ChevronDown,
  FileText, Trash2, MoreHorizontal, Star, LayoutTemplate, GripVertical,
  Check, X, Image, Link, Table, Kanban, LayoutGrid, List, Calendar,
  Filter, ArrowUpDown, Sun, Moon, Menu, ChevronLeft, Maximize2,
  Share2, Users, Archive, Upload, LayoutDashboard, RotateCcw, Download,
  Monitor, CloudCheck, CloudUpload, Key, ExternalLink, Copy, Keyboard,
  Cloud, HardDrive, Paperclip, Database, Eye, PanelRight, LogOut, Unlink,
  Play,
} from 'lucide-react';
import {
  isLocalFSSupported,
  createLocalWorkspaceFolder,
  relinkAndRegisterDirectory,
  openExistingDirectory,
  loadLocalWorkspaceIndex,
  readWorkspaceTree,
  writeWorkspaceTreeDebounced,
  writeWorkspaceTreeNow,
  requestPermissionForHandleDetailed,
  getLocalWorkspaceRecord,
  removeLocalWorkspaceRecord,
  writeLocalUploadFile,
  deleteLocalUploadFile,
} from './localfs.js';

/* Shown when the browser lacks the File System Access API (Firefox/Zen/Safari). */
const LOCAL_FS_UNSUPPORTED_MSG =
  'Local folders require a Chromium browser (Chrome, Edge, or Brave). '+
  'In Firefox or Safari, use a Google Drive workspace instead.';

/* Turn a permission-failure reason into a human-readable message. */
function localPermMessage(reason){
  switch(reason){
    case 'denied':
      return 'You clicked “Don’t allow”. Click the workspace again and choose “Allow” / “Edit files” to grant access.';
    case 'no-handle':
      return 'This local workspace folder is no longer linked. Re-create it to pick the folder again.';
    case 'SecurityError':
    case 'NotAllowedError':
      return 'The browser blocked the permission prompt. Make sure you opened the app over http://localhost (or https) and try clicking the workspace once more.';
    default:
      return 'Could not get access to the local folder ('+reason+'). Try clicking the workspace again.';
  }
}
import {
  GDRIVE,
  authenticateGoogleDrive, getDriveToken, clearDriveToken,
  createDriveWorkspace, listDriveWorkspaces,
  writeGdriveWorkspaceTree, readGdriveWorkspaceTree,
  writeDriveUpload, deleteDriveWorkspace,
  readDriveWorkspaceMeta, renameDriveWorkspace, updateDriveWorkspaceDescription,
} from './cloudstorage.js';
import {
  readActivePointer, writeActivePointer, clearActivePointer,
  readTheme, writeTheme, getCookie, setCookie,
} from './cookies.js';
import { nodeDiskPath } from './markdown.js';

/* ---------- utils ---------- */
const nid = () => 'n'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);
const cx = (...a)=>a.filter(Boolean).join(' ');
const clone = o => JSON.parse(JSON.stringify(o));
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = iso => { if(!iso) return ''; const d=new Date(iso+'T00:00');
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); };
const fmtBytes = b => { if(!b) return '0 B'; const u=['B','KB','MB','GB']; let i=0;
  while(b>=1024&&i<u.length-1){b/=1024;i++;} return b.toFixed(i>0?1:0)+' '+u[i]; };
const readAsDataUrl = file => new Promise((res,rej)=>{
  const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=()=>rej(new Error('Read failed'));
  r.readAsDataURL(file); });

/* ---------- constants ---------- */
const SEL_COLORS = ['default','gray','brown','orange','yellow','green','blue','purple','pink','red'];
const TEXT_COLORS = ['default','gray','brown','orange','yellow','green','blue','purple','pink','red'];
const COVERS = [
  'linear-gradient(135deg,#ff9a56,#ff6a88)','linear-gradient(135deg,#5b86e5,#36d1dc)',
  'linear-gradient(135deg,#834d9b,#d04ed6)','linear-gradient(135deg,#11998e,#38ef7d)',
  'linear-gradient(135deg,#f7971e,#ffd200)','linear-gradient(120deg,#e0c3fc,#8ec5fc)',
  'linear-gradient(135deg,#2c3e50,#4ca1af)','linear-gradient(135deg,#ee9ca7,#ffdde1)',
  'linear-gradient(135deg,#c94b4b,#4b134f)','linear-gradient(135deg,#16222a,#3a6073)',
  'linear-gradient(120deg,#a1c4fd,#c2e9fb)','linear-gradient(135deg,#fbc2eb,#a6c1ee)'];
const EMOJI = {
  'Smileys':'😀 😃 😄 😁 😅 😂 🙂 😉 😊 😍 😘 😎 🤓 🧐 🤔 😴 🥳 😇 🤗 😋 😜 🤩 🥰 😏 🙃 😬 🤯 😱'.split(' '),
  'Objects':'📓 📔 📕 📗 📘 📙 📚 📝 ✏️ 📌 📎 🔖 📁 📂 🗂️ 📅 📆 🗒️ 📋 📊 📈 📉 💼 🖇️ 📐 ✂️ 🔍 🔑'.split(' '),
  'Symbols':'✅ ☑️ ⭐ 🌟 ✨ 🔥 💡 ⚡ 🎯 🚀 💎 🏆 🎉 🎊 ❤️ 🧡 💛 💚 💙 💜 🖤 ⚠️ ❓ ❗ ➕ ✔️ ♻️ 🔔'.split(' '),
  'Nature':'🌱 🌿 🍀 🌳 🌲 🌸 🌺 🌻 🌼 🌷 🌍 🌎 🌙 ☀️ ⛅ 🌈 ❄️ 💧 🔆 🌊 🐱 🐶 🦊 🐼 🦋 🐢 🌵 🍁'.split(' '),
  'Activity':'🎨 🎭 🎬 🎤 🎧 🎮 🎲 🧩 ⚽ 🏀 🏈 🎾 🏓 🥁 🎸 🎹 🏃 🧘 🚴 🏆 🥇 🎼 🪁 🎳'.split(' '),
  'Food':'☕ 🍵 🍎 🍊 🍋 🍓 🍇 🍉 🥑 🍕 🍔 🍟 🌮 🍩 🍪 🎂 🍰 🧁 🍫 🍿 🥗 🍜 🍱 🥪'.split(' '),
};
const ALL_EMOJI = Object.values(EMOJI).flat();
const PAGE_EMOJI = '📄 📝 📓 📕 ✅ 📅 🗂️ 🚀 💡 🎯 🏠 📊 🔖 ⭐ 🧠 💼 🎨 📚'.split(' ');
const CODE_LANGS = ['plain text','javascript','typescript','python','html','css','json',
  'bash','sql','java','c++','go','rust','markdown'];

/* slash-menu command catalog */
const CMDS = [
  {g:'Basic',id:'text',label:'Text',desc:'Plain paragraph',ic:'📝',kw:'text plain paragraph'},
  {g:'Basic',id:'h1',label:'Heading 1',desc:'Big section heading',ic:'H₁',kw:'heading title h1'},
  {g:'Basic',id:'h2',label:'Heading 2',desc:'Medium section heading',ic:'H₂',kw:'heading h2'},
  {g:'Basic',id:'h3',label:'Heading 3',desc:'Small section heading',ic:'H₃',kw:'heading h3'},
  {g:'Basic',id:'todo',label:'To-do list',desc:'Track tasks with checkboxes',ic:'✅',kw:'todo task checkbox check'},
  {g:'Basic',id:'bullet',label:'Bulleted list',desc:'Simple bulleted list',ic:'•',kw:'bullet list unordered'},
  {g:'Basic',id:'number',label:'Numbered list',desc:'Ordered numbered list',ic:'1.',kw:'number ordered list'},
  {g:'Basic',id:'toggle',label:'Toggle list',desc:'Collapsible content',ic:'▸',kw:'toggle collapse fold'},
  {g:'Basic',id:'quote',label:'Quote',desc:'Capture a quotation',ic:'❝',kw:'quote blockquote'},
  {g:'Basic',id:'callout',label:'Callout',desc:'Make text stand out',ic:'💡',kw:'callout highlight info'},
  {g:'Basic',id:'divider',label:'Divider',desc:'Visually divide blocks',ic:'—',kw:'divider line separator hr'},
  {g:'Basic',id:'page',label:'Page',desc:'Embed a sub-page',ic:'📄',kw:'page subpage nested'},
  {g:'Database',id:'db-table',label:'Table view',desc:'Database as a table',ic:'⊞',kw:'table database grid'},
  {g:'Database',id:'db-board',label:'Board view',desc:'Kanban-style board',ic:'▥',kw:'board kanban database'},
  {g:'Database',id:'db-gallery',label:'Gallery view',desc:'Cards in a grid',ic:'▦',kw:'gallery cards database'},
  {g:'Database',id:'db-list',label:'List view',desc:'Minimal database list',ic:'☰',kw:'list database'},
  {g:'Database',id:'db-calendar',label:'Calendar view',desc:'Database on a calendar',ic:'📅',kw:'calendar database date'},
  {g:'Media',id:'image',label:'Image',desc:'Upload or embed an image',ic:'🖼️',kw:'image picture photo upload'},
  {g:'Media',id:'file',label:'File attachment',desc:'Attach any file or document',ic:'📎',kw:'file attach upload pdf doc'},
  {g:'Media',id:'bookmark',label:'Web bookmark',desc:'Save a link as a card',ic:'🔗',kw:'bookmark link url web'},
  {g:'Media',id:'code',label:'Code',desc:'Code with syntax style',ic:'</>',kw:'code snippet'},
];

const SHORTCUTS = [
  ['Quick search / open','Ctrl/⌘ + K'],['New page','Alt + N'],
  ['Toggle sidebar','Ctrl/⌘ + \\'],['Toggle dark mode','Ctrl/⌘ + Shift + L'],
  ['Open slash menu','/'],['Add a block (block menu)','Ctrl/⌘ + Enter'],
  ['Bold','Ctrl/⌘ + B'],['Italic','Ctrl/⌘ + I'],
  ['Underline','Ctrl/⌘ + U'],['Strikethrough','Ctrl/⌘ + Shift + S'],['Inline code','Ctrl/⌘ + E'],
  ['Indent block','Tab'],['Outdent block','Shift + Tab'],
  ['New block','Enter'],['Soft line break','Shift + Enter'],
  ['Delete block / merge up','Backspace at start'],['Heading','# / ## / ###  + space'],
  ['Bulleted list','-  or  *  + space'],['Numbered list','1.  + space'],
  ['To-do','[]  + space'],['Toggle','>  + space'],['Divider','---'],
  ['Show shortcuts','Ctrl/⌘ + /'],['Close popup','Esc'],
];

/* Is this a Mac / iOS device? Used to show the right modifier symbols. */
const IS_MAC = typeof navigator!=='undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

/* Render a canonical shortcut string with platform-correct keys, e.g.
   "Ctrl/⌘ + Shift + L" → "⌘ ⇧ L" on Mac, "Ctrl + Shift + L" elsewhere. */
function fmtShortcut(s){
  if(IS_MAC){
    return s.replace(/Ctrl\/⌘/g,'⌘').replace(/\bCtrl\b/g,'⌘')
      .replace(/\bAlt\b/g,'⌥').replace(/\bShift\b/g,'⇧')
      .replace(/\bEnter\b/g,'↵').replace(/ \+ /g,' ');
  }
  return s.replace(/Ctrl\/⌘/g,'Ctrl');
}

/* ---------- Lucide icons ---------- */
const ICON_MAP = {
  search: Search, home: Home, inbox: Inbox, settings: Settings,
  plus: Plus, chevron: ChevronRight, 'chevron-down': ChevronDown,
  doc: FileText, trash: Trash2, dots: MoreHorizontal, star: Star,
  template: LayoutTemplate, grip: GripVertical, drag: GripVertical,
  check: Check, x: X, image: Image, link: Link,
  table: Table, board: Kanban, gallery: LayoutGrid, list: List,
  calendar: Calendar, filter: Filter, sort: ArrowUpDown,
  sun: Sun, moon: Moon, menu: Menu, back: ChevronLeft, fwd: ChevronRight,
  expand: Maximize2, share: Share2, users: Users, archive: Archive,
  import: Upload, dashboard: LayoutDashboard, restore: RotateCcw,
  download: Download, computer: Monitor,
  'cloud-check': CloudCheck, 'cloud-upload': CloudUpload,
  key: Key, 'external-link': ExternalLink, copy: Copy, keyboard: Keyboard,
  cloud: Cloud, 'hard-drive': HardDrive,
  paperclip: Paperclip, database: Database, eye: Eye, 'panel-right': PanelRight,
  'log-out': LogOut, unlink: Unlink, play: Play,
};

/* Injected by Vite from package.json (vite.config.js `define`). */
const APP_VERSION=typeof __APP_VERSION__!=='undefined'?__APP_VERSION__:'';

const DASH_ID='__dashboard__';
const STORAGE_ID='__storage__';
const TRASH_ID='__trash__';
const ARCHIVE_ID='__archive__';
const TEMPLATES_ID='__templates__';

function Ic({n, style}) {
  const Icon = ICON_MAP[n];
  if (!Icon) return null;
  const {width, height, ...rest} = style || {};
  const sz = +(width || height || 16);
  return <Icon width={sz} height={sz} strokeWidth={1.8}
    {...(Object.keys(rest).length ? {style: rest} : {})}/>;
}

/* Persistence lives in ./localfs.js (folders) and ./cloudstorage.js (Google Drive). */

/* =========================================================================
   DATABASE FACTORY + SEED DATA
   ========================================================================= */
function newDB(kind){
  const props=[
    {id:'p_title',name:'Name',type:'title'},
    {id:'p_status',name:'Status',type:'status',options:[
      {id:'o1',name:'Not started',color:'gray'},
      {id:'o2',name:'In progress',color:'blue'},
      {id:'o3',name:'Done',color:'green'}]},
    {id:'p_pri',name:'Priority',type:'select',options:[
      {id:'pp1',name:'Low',color:'gray'},{id:'pp2',name:'Medium',color:'yellow'},
      {id:'pp3',name:'High',color:'red'}]},
    {id:'p_date',name:'Due',type:'date'},
    {id:'p_owner',name:'Owner',type:'person'},
  ];
  const rows=[];
  return {props,rows,views:[{id:'v1',name:'Default',type:kind||'table',groupProp:'p_status'}],activeView:'v1'};
}
function mkRow(title,cells){return {id:nid(),cells:{p_title:title,...cells},icon:'📄',blocks:[]};}

function buildSeed(){
  const nodes={};
  const add=n=>{nodes[n.id]=n; return n.id;};

  // ---- Tasks database (full page) ----
  const tasksDB=newDB('board');
  tasksDB.views=[
    {id:'v1',name:'Board',type:'board',groupProp:'p_status'},
    {id:'v2',name:'All tasks',type:'table'},
    {id:'v3',name:'Calendar',type:'calendar'},
  ];
  tasksDB.activeView='v1';
  const d=new Date();
  tasksDB.rows=[
    mkRow('Design new landing page',{p_status:'o2',p_pri:'pp3',p_owner:'Alex',
      p_date:new Date(d.getFullYear(),d.getMonth(),Math.min(d.getDate()+2,28)).toISOString().slice(0,10)}),
    mkRow('Write Q3 product brief',{p_status:'o2',p_pri:'pp2',p_owner:'Sam',
      p_date:new Date(d.getFullYear(),d.getMonth(),Math.min(d.getDate()+5,28)).toISOString().slice(0,10)}),
    mkRow('Fix sync bug on mobile',{p_status:'o1',p_pri:'pp3',p_owner:'Jordan',
      p_date:new Date(d.getFullYear(),d.getMonth(),Math.min(d.getDate()+1,28)).toISOString().slice(0,10)}),
    mkRow('Ship offline mode beta',{p_status:'o3',p_pri:'pp2',p_owner:'Alex',
      p_date:new Date(d.getFullYear(),d.getMonth(),Math.max(d.getDate()-3,1)).toISOString().slice(0,10)}),
    mkRow('Plan team offsite',{p_status:'o1',p_pri:'pp1',p_owner:'Sam',
      p_date:new Date(d.getFullYear(),d.getMonth(),Math.min(d.getDate()+9,28)).toISOString().slice(0,10)}),
    mkRow('Review API docs draft',{p_status:'o3',p_pri:'pp2',p_owner:'Jordan',
      p_date:new Date(d.getFullYear(),d.getMonth(),Math.max(d.getDate()-1,1)).toISOString().slice(0,10)}),
  ];
  const tasksId=add({id:'n_tasks',kind:'database',title:'Tasks',icon:'✅',cover:COVERS[1],
    parentId:null,section:'private',sort:1,db:tasksDB});

  // ---- Reading list (gallery db) ----
  const readDB=newDB('gallery');
  readDB.props=[
    {id:'p_title',name:'Title',type:'title'},
    {id:'p_status',name:'Status',type:'status',options:[
      {id:'r1',name:'To read',color:'gray'},{id:'r2',name:'Reading',color:'orange'},
      {id:'r3',name:'Finished',color:'green'}]},
    {id:'p_author',name:'Author',type:'text'},
    {id:'p_rating',name:'Rating',type:'select',options:[
      {id:'s3',name:'★★★',color:'yellow'},{id:'s4',name:'★★★★',color:'yellow'},
      {id:'s5',name:'★★★★★',color:'yellow'}]},
  ];
  readDB.views=[{id:'v1',name:'Shelf',type:'gallery'},{id:'v2',name:'Table',type:'table'}];
  readDB.rows=[
    {id:nid(),icon:'📕',blocks:[],cells:{p_title:'Thinking, Fast and Slow',p_status:'r3',p_author:'Daniel Kahneman',p_rating:'s5'}},
    {id:nid(),icon:'📗',blocks:[],cells:{p_title:'The Pragmatic Programmer',p_status:'r2',p_author:'Hunt & Thomas',p_rating:'s4'}},
    {id:nid(),icon:'📘',blocks:[],cells:{p_title:'Shape Up',p_status:'r1',p_author:'Ryan Singer'}},
    {id:nid(),icon:'📙',blocks:[],cells:{p_title:'Designing Data-Intensive Apps',p_status:'r1',p_author:'Martin Kleppmann'}},
  ];
  const readId=add({id:'n_read',kind:'database',title:'Reading List',icon:'📚',cover:COVERS[5],
    parentId:null,section:'private',sort:2,db:readDB});

  // ---- a sub-page used by Getting Started ----
  const subId=add({id:'n_sub',kind:'page',title:'Keyboard shortcuts cheatsheet',icon:'⌨️',
    cover:null,parentId:'n_start',section:'private',sort:0,blocks:[
    {id:nid(),type:'text',html:'Press <strong>Ctrl/⌘ + /</strong> anywhere to see the full list.'},
    {id:nid(),type:'callout',html:'Try typing <strong>/</strong> on an empty line to open the block menu.',emoji:'💡',color:'blue'},
  ]});

  // ---- Getting Started page ----
  add({id:'n_start',kind:'page',title:'Getting Started',icon:'📓',cover:COVERS[0],
    parentId:null,section:'private',sort:0,blocks:[
    {id:nid(),type:'text',html:'Welcome to your <strong>connected workspace</strong> — a single place for docs, wikis, tasks and databases. This is a faithful, working clone of Notion.'},
    {id:nid(),type:'callout',html:'Everything you see is a <strong>block</strong>. Hover the left margin of any line to drag it, or click <strong>⊕</strong> to add one.',emoji:'🧱',color:'yellow'},
    {id:nid(),type:'h2',html:'Quick start'},
    {id:nid(),type:'todo',html:'Type <strong>/</strong> to open the slash command menu',checked:true},
    {id:nid(),type:'todo',html:'Create a sub-page or a database',checked:true},
    {id:nid(),type:'todo',html:'Press <strong>Ctrl/⌘ + K</strong> to search everything',checked:false},
    {id:nid(),type:'todo',html:'Toggle dark mode with <strong>Ctrl/⌘ + Shift + L</strong>',checked:false},
    {id:nid(),type:'h2',html:'Markdown shortcuts'},
    {id:nid(),type:'text',html:'Start a line with <code>#</code>, <code>-</code>, <code>1.</code>, <code>[]</code> or <code>&gt;</code> followed by a space.'},
    {id:nid(),type:'toggle',html:'▸ Click to expand this toggle',collapsed:false,children:[
      {id:nid(),type:'text',html:'Toggles can hide nested content — great for FAQs and details.'}]},
    {id:nid(),type:'quote',html:'“Lego for software — assemble your own tools out of blocks.”'},
    {id:nid(),type:'h2',html:'Code blocks'},
    {id:nid(),type:'code',code:'function hello(name){\n  return `Hello, ${name}!`;\n}',lang:'javascript'},
    {id:nid(),type:'divider'},
    {id:nid(),type:'h3',html:'Explore further'},
    {id:nid(),type:'subpage',pageId:'n_sub'},
    {id:nid(),type:'bookmark',url:'https://www.notion.com',title:'Notion – The connected workspace',
      desc:'Docs, wikis, projects and AI agents in one tool.'},
    {id:nid(),type:'text',html:''},
  ]});

  // ---- Meeting Notes ----
  add({id:'n_meet',kind:'page',title:'Meeting Notes',icon:'📝',cover:null,
    parentId:null,section:'private',sort:3,blocks:[
    {id:nid(),type:'h2',html:'Weekly sync — '+todayISO()},
    {id:nid(),type:'text',html:'<strong>Attendees:</strong> Alex, Sam, Jordan'},
    {id:nid(),type:'h3',html:'Agenda'},
    {id:nid(),type:'bullet',html:'Review last week’s progress'},
    {id:nid(),type:'bullet',html:'Offline mode rollout plan'},
    {id:nid(),type:'h3',html:'Action items'},
    {id:nid(),type:'todo',html:'Alex to finish landing page mockups',checked:false},
    {id:nid(),type:'todo',html:'Sam to draft Q3 brief',checked:false},
    {id:nid(),type:'text',html:''},
  ]});

  // ---- Shared: Team Wiki ----
  add({id:'n_wiki',kind:'page',title:'Team Wiki',icon:'🏠',cover:COVERS[6],
    parentId:null,section:'shared',sort:0,blocks:[
    {id:nid(),type:'h1',html:'Team Wiki'},
    {id:nid(),type:'callout',html:'This page is <strong>verified</strong> ✓ — single source of truth for the team.',emoji:'✅',color:'green'},
    {id:nid(),type:'h2',html:'Handbook'},
    {id:nid(),type:'bullet',html:'Company values & ways of working'},
    {id:nid(),type:'bullet',html:'Onboarding checklist'},
    {id:nid(),type:'bullet',html:'Tooling & access'},
    {id:nid(),type:'h2',html:'Projects'},
    {id:nid(),type:'text',html:'Add a database below to track team projects.'},
    {id:nid(),type:'text',html:''},
  ]});

  return {nodes,favorites:['n_start','n_tasks'],currentId:'n_start'};
}

/* =========================================================================
   small reusable bits
   ========================================================================= */
function Popup({rect,onClose,children,width,placement}){
  const ref=useRef();
  useEffect(()=>{
    const h=e=>{ if(ref.current && !ref.current.contains(e.target)) onClose(); };
    const k=e=>{ if(e.key==='Escape'){e.stopPropagation();onClose();} };
    setTimeout(()=>document.addEventListener('mousedown',h),0);
    document.addEventListener('keydown',k,true);
    return ()=>{document.removeEventListener('mousedown',h);document.removeEventListener('keydown',k,true);};
  },[]);
  let top=rect.bottom+4, left=rect.left;
  const w=width||220;
  if(left+w>window.innerWidth-10) left=window.innerWidth-w-10;
  if(placement==='right'){ left=rect.right+4; top=rect.top; }
  return createPortal(
    <div className="pop" ref={ref} style={{top,left,width:w}}>{children}</div>,
    document.body
  );
}

function EmojiPicker({onPick,onClose,rect}){
  const cats=Object.keys(EMOJI);
  const [tab,setTab]=useState(cats[0]);
  const [q,setQ]=useState('');
  const list = q ? ALL_EMOJI : EMOJI[tab];
  return <Popup rect={rect} onClose={onClose} width={360}>
    <div className="emoji-pop">
      <input className="fld" placeholder="Search emoji…" autoFocus value={q}
        onChange={e=>setQ(e.target.value)} style={{marginBottom:8}}/>
      <div className="emoji-row">
        <button onClick={()=>onPick(ALL_EMOJI[Math.floor(Math.random()*ALL_EMOJI.length)])}>🎲 Random</button>
        <button onClick={()=>onPick('')}>Remove</button>
      </div>
      {!q && <div className="emoji-tabs">{cats.map(c=>
        <button key={c} className={cx(tab===c&&'on')} onClick={()=>setTab(c)}
          title={c}>{EMOJI[c][0]}</button>)}</div>}
      <div className="emoji-grid">{list.map((e,i)=>
        <button key={i} onClick={()=>onPick(e)}>{e}</button>)}</div>
    </div>
  </Popup>;
}

function ConfirmHint({msg}){ return <div className="hint">{msg}</div>; }

/* ---- Image / file picker inline UI ---- */
function ImagePicker({onFile, onUrl, uploads}){
  const storedImgs=useMemo(()=>(uploads||[]).filter(u=>u.type?.startsWith('image/')||
    /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(u.name||'')),[uploads]);
  const [showUrl,setShowUrl]=useState(false);
  const [urlVal,setUrlVal]=useState('');
  const fileRef=useRef();
  return <div className="img-picker">
    <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
      onChange={e=>{const f=e.target.files?.[0];if(f) onFile(f);}}/>
    {showUrl
      ? <div className="img-picker-url">
          <input className="fld" autoFocus placeholder="Paste image URL…" value={urlVal}
            onChange={e=>setUrlVal(e.target.value)} style={{flex:1}}
            onKeyDown={e=>{if(e.key==='Enter'&&urlVal.trim()) onUrl(urlVal.trim());}}/>
          <button className="btn primary" style={{padding:'6px 12px'}}
            onClick={()=>{if(urlVal.trim()) onUrl(urlVal.trim());}}>Embed</button>
        </div>
      : storedImgs.length>0
      ? <div className="img-picker-storage">
          {storedImgs.map(u=><div key={u.id} className="ips-thumb" title={u.name}
            onClick={()=>onUrl(u.dataUrl)}>
            <img src={u.dataUrl} alt={u.name}/>
            <div className="ips-name">{u.name}</div>
          </div>)}
        </div>
      : <div className="img-picker-zone" onClick={()=>fileRef.current?.click()}>
          <Ic n="import" style={{width:22,height:22}}/>
          <span>Choose image from computer</span>
        </div>}
    <div className="img-picker-footer">
      <button className="img-picker-foot-btn" onClick={()=>{setShowUrl(false);fileRef.current?.click();}}>
        <Ic n="import" style={{width:13,height:13}}/> Upload
      </button>
      <button className={cx('img-picker-foot-btn',showUrl&&'on')} onClick={()=>setShowUrl(v=>!v)}>
        <Ic n="link" style={{width:13,height:13}}/> Embed link
      </button>
    </div>
  </div>;
}

/* ---- File picker (From Storage / Upload tabs) ---- */
const FILE_ICON=t=>t?.startsWith('video/')?'🎬':t?.startsWith('audio/')?'🎵'
  :t==='application/pdf'?'📄':t?.startsWith('image/')?'🖼️':t?.startsWith('text/')?'📝':'📎';

function FilePicker({uploads,onUpload,onFromStorage}){
  const all=uploads||[];
  const [view,setView]=useState('list'); // 'list' | 'grid' | 'large'
  const fileRef=useRef();

  const FP_VIEWS=[
    {id:'list', icon:'list',   title:'List'},
    {id:'grid', icon:'gallery',title:'Grid'},
    {id:'large',icon:'expand', title:'Large'},
  ];

  function renderItems(){
    if(view==='grid') return (
      <div className="fp-grid">
        {all.map(u=>{
          const isImg=u.type?.startsWith('image/');
          return <div key={u.id} className="fp-grid-card" title={u.name} onClick={()=>onFromStorage(u)}>
            <div className="fp-gc-thumb">
              {isImg
                ? <img src={u.dataUrl} alt={u.name}/>
                : <span>{FILE_ICON(u.type)}</span>}
            </div>
            <div className="fp-gc-name">{u.name}</div>
          </div>;
        })}
      </div>
    );
    if(view==='large') return (
      <div className="fp-large-grid">
        {all.map(u=>{
          const isImg=u.type?.startsWith('image/');
          return <div key={u.id} className="fp-lg-card" title={u.name} onClick={()=>onFromStorage(u)}>
            <div className="fp-lg-thumb">
              {isImg
                ? <img src={u.dataUrl} alt={u.name}/>
                : <span>{FILE_ICON(u.type)}</span>}
            </div>
            <div className="fp-lg-name">{u.name}</div>
            <div className="fp-lg-meta">{fmtBytes(u.size||0)}</div>
          </div>;
        })}
      </div>
    );
    // default list
    return (
      <div className="fp-list">
        {all.map(u=><div key={u.id} className="fp-item" onClick={()=>onFromStorage(u)}>
          <span className="fp-icon">{FILE_ICON(u.type)}</span>
          <div className="fp-info">
            <div className="fp-name">{u.name}</div>
            <div className="fp-meta">{fmtBytes(u.size||0)}
              {u.uploadedAt?' · '+new Date(u.uploadedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}):''}
            </div>
          </div>
          <Ic n="plus" style={{width:14,height:14,color:'var(--accent)',flexShrink:0}}/>
        </div>)}
      </div>
    );
  }

  return <div className="file-picker">
    {all.length>0
      ? <>
          <div className="fp-header">
            <span>From Storage</span>
            <span className="fp-badge">{all.length}</span>
            <div style={{flex:1}}/>
            <div className="fp-view-toggle">
              {FP_VIEWS.map(v=>
                <button key={v.id} className={cx('fp-vbtn',view===v.id&&'on')}
                  title={v.title} onClick={()=>setView(v.id)}>
                  <Ic n={v.icon} style={{width:13,height:13}}/>
                </button>
              )}
            </div>
          </div>
          {renderItems()}
        </>
      : <div className="fp-upload-zone" onClick={()=>fileRef.current?.click()}>
          <Ic n="paperclip" style={{width:24,height:24}}/>
          <span>Choose a file from your computer</span>
        </div>}
    <div className="fp-footer">
      <button className="fp-upload-btn" onClick={()=>fileRef.current?.click()}>
        <Ic n="import" style={{width:13,height:13}}/> Upload file
      </button>
      <input ref={fileRef} type="file" style={{display:'none'}}
        onChange={e=>{const f=e.target.files?.[0];if(f)onUpload(f);}}/>
    </div>
  </div>;
}

/* ---- File attachment block body ---- */
const FILE_TYPE_COLOR={
  'image/':'#8b5cf6','video/':'#ec4899','audio/':'#f59e0b',
  'application/pdf':'#ef4444','text/':'#3b82f6',
};
function fileAccentColor(type){
  if(!type) return '#64748b';
  for(const [k,v] of Object.entries(FILE_TYPE_COLOR)) if(type.startsWith(k)) return v;
  return '#64748b';
}

function FileBlockBody({block,onChange,onUploadFile,uploads,onDelete}){
  const [picking,setPicking]=useState(false);
  const [preview,setPreview]=useState(false);

  async function handleUpload(file){
    const u=await onUploadFile?.(file);
    if(u) onChange({...block,url:u.url,fileName:u.name,fileType:u.type,fileSize:u.size,
      uploadId:u.id,localName:u.localName});
    setPicking(false);
  }
  function handleFromStorage(upload){
    onChange({...block,url:upload.dataUrl,fileName:upload.name,fileType:upload.type,
      fileSize:upload.size,uploadId:upload.id,localName:upload.localName});
    setPicking(false);
  }

  if(!block.url){
    return <div className="b-file">
      {picking
        ? <FilePicker uploads={uploads} onUpload={handleUpload} onFromStorage={handleFromStorage}/>
        : <div className="img-empty" onClick={()=>setPicking(true)}>
            <Ic n="paperclip" style={{width:20,height:20}}/> Attach a file
          </div>}
    </div>;
  }

  const isImg=block.fileType?.startsWith('image/');
  const accent=fileAccentColor(block.fileType);
  const ext=(block.fileType||'').split('/').pop().toUpperCase()||'FILE';

  return <div className="b-file">
    <div className="fc-chip" tabIndex={0} onClick={()=>setPreview(true)}
      onKeyDown={e=>{
        if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();onDelete?.();}
        if(e.key==='Enter'||e.key===' '){e.preventDefault();setPreview(true);}
      }}>
      {/* thumbnail / icon swatch */}
      <div className="fc-chip-thumb" style={{'--fc-accent':accent}}>
        {isImg
          ? <img src={block.url} alt={block.fileName}/>
          : <span className="fc-chip-emoji">{FILE_ICON(block.fileType)}</span>}
        <span className="fc-chip-ext">{ext}</span>
      </div>
      {/* info */}
      <div className="fc-chip-info">
        <div className="fc-chip-name" title={block.fileName||'Attached file'}>
          {block.fileName||'Attached file'}
        </div>
        <div className="fc-chip-meta">
          {fmtBytes(block.fileSize||0)}
          {block.fileType?' · '+block.fileType.split('/').pop():''}
          <span className="fc-chip-hint">· click to preview</span>
        </div>
      </div>
      {/* actions — stop propagation so they don't open preview */}
      <div className="fc-chip-actions" onClick={e=>e.stopPropagation()}>
        <a href={block.url} download={block.fileName||'file'}
          className="icon-btn" title="Download"
          style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Ic n="download" style={{width:13,height:13}}/>
        </a>
        <button className="icon-btn" style={{width:28,height:28}} title="Remove attachment"
          onClick={()=>onChange({...block,url:'',fileName:'',fileType:'',fileSize:0,localName:undefined,uploadId:undefined})}>
          <Ic n="x" style={{width:12,height:12}}/>
        </button>
      </div>
    </div>

    {preview&&<FilePreviewModal
      upload={{id:block.uploadId||block.id,name:block.fileName||'file',
        type:block.fileType,size:block.fileSize,dataUrl:block.url}}
      onClose={()=>setPreview(false)}
      hasPrev={false} hasNext={false}
    />}
  </div>;
}

/* =========================================================================
   CONTEXT MENU  — right-click popup positioned at cursor
   ========================================================================= */
function ContextMenu({x,y,items,onClose}){
  const ref=useRef();
  useEffect(()=>{
    const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) onClose(); };
    const k=e=>{ if(e.key==='Escape'){e.stopPropagation();onClose();} };
    setTimeout(()=>document.addEventListener('mousedown',h),0);
    document.addEventListener('keydown',k,true);
    return()=>{document.removeEventListener('mousedown',h);document.removeEventListener('keydown',k,true);};
  },[]);
  const W=234;
  const estH=items.reduce((s,i)=>s+(i.sep?11:i.header?28:36),12);
  const left=x+W>window.innerWidth-8?x-W:x;
  const top=y+estH>window.innerHeight-8?Math.max(8,y-estH):y;
  return <div ref={ref} className="pop ctx-menu" style={{position:'fixed',left,top,width:W,zIndex:900}}>
    <div className="menu">
      {items.map((item,i)=>{
        if(item.sep) return <div key={i} className="menu-sep"/>;
        if(item.header) return <div key={i} className="menu-h">{item.header}</div>;
        return <div key={i} className={cx('mi',item.danger&&'danger')}
          onMouseDown={e=>{e.preventDefault();item.action?.();onClose();}}>
          <div className="mi-tx">{item.label}</div>
          {item.kbd&&<span className="mi-kbd">{item.kbd}</span>}
        </div>;
      })}
    </div>
  </div>;
}

/* =========================================================================
   TUTORIAL TOUR
   ========================================================================= */
const TOUR_STEPS=[
  {id:'welcome',target:null,icon:'👋',title:'Welcome to your Workspace!',pos:'center',
    body:"Let's take a quick tour of everything available. We'll walk through each part of the app — use the arrows to go at your own pace."},

  {id:'sidebar',target:'.sidebar',icon:'🗂️',title:'Your Sidebar',pos:'right',
    body:'All your pages live here, organised into Private and Shared sections. Drag pages to reorder or nest them inside each other for infinite hierarchy.'},

  {id:'workspace',target:'.ws-btn',icon:'🏢',title:'Workspaces',pos:'right',
    body:'Click here to switch between workspaces or create a new one. Each workspace has its own set of pages and can be shared independently with teammates.'},

  {id:'newpage',target:'.sec-title',icon:'➕',title:'Creating Pages',pos:'right',
    body:'Click the + next to any section header to create a new page. Pages support an emoji icon, a gradient cover image, and any combination of blocks below the title.'},

  {id:'editor',target:'.page-head',icon:'✏️',title:'The Block Editor',pos:'bottom',
    body:'Click the emoji to change the icon. Click the cover area to add a gradient header. Every line below the title is a block — hover the left margin to drag, duplicate, colour, or delete it.'},

  {id:'slash',target:null,icon:'/',title:'Slash Commands',pos:'center',
    body:"Type / on any empty line to open the block menu. Choose from 20+ types: headings, lists, to-dos, toggles, quotes, callouts, dividers, images, file attachments, code blocks, databases, and more."},

  {id:'codeblock',target:null,icon:'</>', title:'Code Blocks',pos:'center',
    body:'Insert a code block with /code. The header shows traffic-light dots and a language picker — click the language pill to choose from 14 languages. Hit Copy to grab the code instantly.'},

  {id:'media',target:null,icon:'📎',title:'Images & File Attachments',pos:'center',
    body:'Use /image to embed a photo (upload, paste URL, or pick from storage) or /file to attach any document. Attached files show a colour-coded icon chip — red for PDF, purple for images — with preview and download built in.'},

  {id:'database',target:null,icon:'🗃️',title:'Multi-view Databases',pos:'center',
    body:'Type /table, /board, /gallery, /list, or /calendar to insert a database. Switch views from the tab bar, add custom properties (status, select, date, person), and filter or sort any column.'},

  {id:'storage',target:'.storage-badge',icon:'📦',title:'Storage Manager',pos:'bottom-left',
    body:'Click the storage badge in the toolbar — or open Storage in the sidebar — to browse every uploaded file. Switch between grid, large gallery, and list views. Icons are colour-coded to match the file attachment chip.'},

  {id:'search',target:null,icon:'🔍',title:'Quick Search',pos:'center',
    body:'Press Ctrl+K (or ⌘K on Mac) to instantly search every page and block in your workspace. Arrow keys navigate results; Enter opens the page.'},

  {id:'share',target:'.topbar-actions',icon:'🔗',title:'Share & Collaborate',pos:'bottom-left',
    body:'Click Share in the toolbar to invite someone by email with view or edit access. The Shared panel (↑ icon) shows everyone currently on the document. Shared pages appear in their sidebar automatically.'},

  {id:'trash',target:'.nav-scroll',icon:'🗑️',title:'Trash & Archive',pos:'right',
    body:'Deleted pages go to Trash — restore them any time or permanently delete. The Archive is for pages you want to keep but hide from the sidebar. Both are accessible at the bottom of the navigation.'},

  {id:'themes',target:null,icon:'🎨',title:'Themes & Dark Mode',pos:'center',
    body:'Open Settings to pick from 7 accent colours (Indigo, Blue, Ocean, Forest, Rose, Sunset, Violet) and toggle dark mode. Press Ctrl+Shift+L (or ⌘+Shift+L) to flip dark mode at any time.'},

  {id:'done',target:null,icon:'🚀',title:"You're all set!",pos:'center',
    body:"Ctrl+K to search · Ctrl+N for a new page · / for blocks · Ctrl+/ for all shortcuts. Restart this tour any time from Settings → Tutorial. Happy building!"},
];

function TutorialOverlay({onComplete,onSkip}){
  const [step,setStep]=React.useState(0);
  const [spotRect,setSpotRect]=React.useState(null);
  const cur=TOUR_STEPS[step];
  const isLast=step===TOUR_STEPS.length-1;
  const hasTarget=!!cur.target;

  React.useEffect(()=>{
    if(!cur.target){setSpotRect(null);return;}
    const el=document.querySelector(cur.target);
    if(el){
      const r=el.getBoundingClientRect();
      setSpotRect({top:r.top-8,left:r.left-8,width:r.width+16,height:r.height+16});
    } else setSpotRect(null);
  },[step]);

  function cardStyle(){
    const W=330,PAD=20;
    if(!spotRect||!hasTarget) return {top:'50%',left:'50%',transform:'translate(-50%,-50%)'};
    const pos=cur.pos;
    if(pos==='right') return {
      top:Math.max(16,Math.min(spotRect.top,window.innerHeight-280)),
      left:Math.min(spotRect.left+spotRect.width+PAD,window.innerWidth-W-16),
    };
    if(pos==='bottom'||pos==='bottom-left') return {
      top:Math.min(spotRect.top+spotRect.height+PAD,window.innerHeight-280),
      left:Math.max(16,Math.min(window.innerWidth-W-16,spotRect.left)),
    };
    if(pos==='top') return {
      bottom:Math.max(16,window.innerHeight-spotRect.top+PAD),
      left:Math.max(16,Math.min(window.innerWidth-W-16,spotRect.left)),
    };
    return {top:'50%',left:'50%',transform:'translate(-50%,-50%)'};
  }

  return <div className={cx('tutorial-overlay',!hasTarget&&'tour-dim')}>
    {spotRect&&<div className="tutorial-spotlight" style={spotRect}/>}
    <div className="tutorial-card" style={cardStyle()}>
      <div className="tc-prog">
        {TOUR_STEPS.map((_,i)=><div key={i} className={cx('tc-dot',i===step&&'on',i<step&&'done')}/>)}
      </div>
      <div className="tc-icon">{cur.icon}</div>
      <div className="tc-title">{cur.title}</div>
      <div className="tc-body">{cur.body}</div>
      <div className="tc-actions">
        <button className="btn ghost" style={{fontSize:12,color:'var(--text-3)'}}
          onClick={onSkip}>Skip tour</button>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {step>0&&<button className="btn ghost" onClick={()=>setStep(s=>s-1)}>← Back</button>}
          <button className="btn primary"
            onClick={()=>isLast?onComplete():setStep(s=>s+1)}>
            {isLast?'Get started 🚀':'Next →'}
          </button>
        </div>
      </div>
    </div>
  </div>;
}

/* =========================================================================
   caret helpers for contentEditable
   ========================================================================= */
function placeCaret(el,where){
  if(!el) return;
  el.focus();
  const sel=window.getSelection(); const r=document.createRange();
  if(where==='start'){ r.setStart(el,0); r.collapse(true); }
  else { r.selectNodeContents(el); r.collapse(false); }
  sel.removeAllRanges(); sel.addRange(r);
}
function caretAtStart(el){
  const sel=window.getSelection();
  if(!sel.rangeCount) return false;
  const r=sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(el); r.setEnd(sel.getRangeAt(0).startContainer,sel.getRangeAt(0).startOffset);
  return r.toString().length===0;
}
function caretAtEnd(el){
  const sel=window.getSelection();
  if(!sel.rangeCount) return false;
  const r=sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(el); r.setStart(sel.getRangeAt(0).endContainer,sel.getRangeAt(0).endOffset);
  return r.toString().length===0;
}
function textBeforeCaret(el){
  const sel=window.getSelection();
  if(!sel.rangeCount) return el.textContent;
  const r=sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(el); r.setEnd(sel.getRangeAt(0).startContainer,sel.getRangeAt(0).startOffset);
  return r.toString();
}
function caretTextOffset(el){
  const sel=window.getSelection();
  if(!sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const r=sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(el); r.setEnd(sel.getRangeAt(0).endContainer,sel.getRangeAt(0).endOffset);
  return r.toString().length;
}
function splitHtmlAtCaret(el){
  const sel=window.getSelection();
  if(!sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const r=sel.getRangeAt(0);
  const div=document.createElement('div');
  const before=r.cloneRange(); before.selectNodeContents(el); before.setEnd(r.startContainer,r.startOffset);
  div.appendChild(before.cloneContents());
  const bHtml=div.innerHTML.replace(/<br\s*\/?>$/i,'');
  div.innerHTML='';
  const after=r.cloneRange(); after.selectNodeContents(el); after.setStart(r.endContainer,r.endOffset);
  div.appendChild(after.cloneContents());
  const aHtml=div.innerHTML.replace(/^<br\s*\/?>/i,'');
  return {before:bHtml,after:aHtml};
}
function setCaretTextOffset(el,offset){
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
  let n,count=0;
  while((n=walker.nextNode())){
    const len=n.nodeValue.length;
    if(count+len>=offset){
      const sel=window.getSelection(); const r=document.createRange();
      r.setStart(n,offset-count); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      return;
    }
    count+=len;
  }
  placeCaret(el,'end');
}

/* =========================================================================
   inline colour / highlight — wrap the selection in a tc-* / bg-* span
   ========================================================================= */
function applySelSpan(prefix,color){
  const sel=window.getSelection();
  if(!sel.rangeCount||sel.isCollapsed) return;
  const r=sel.getRangeAt(0);
  let host=r.commonAncestorContainer;
  if(host.nodeType===3) host=host.parentNode;
  const root=host.closest&&host.closest('.ce');
  if(!root) return;
  // selection as text offsets within the block, so enclosing spans split cleanly
  const measure=(container,offset)=>{
    const rr=document.createRange();
    rr.selectNodeContents(root); rr.setEnd(container,offset);
    return rr.toString().length;
  };
  const from=measure(r.startContainer,r.startOffset);
  const to=measure(r.endContainer,r.endOffset);
  if(from===to) return;
  // rebuild the block HTML: same-kind spans are dissolved into an inherited
  // class, text inside [from,to) gets the new colour, the rest keeps its own
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const wrapCls=(t,cls)=>cls?'<span class="'+cls+'">'+esc(t)+'</span>':esc(t);
  const newCls=color==='default'?'':prefix+color;
  let pos=0;
  const ser=(node,cls)=>{
    let out='';
    node.childNodes.forEach(ch=>{
      if(ch.nodeType===3){
        const t=ch.nodeValue,s=pos,e=pos+t.length; pos=e;
        const c1=Math.min(Math.max(from,s),e),c2=Math.min(Math.max(to,s),e);
        if(c1>s) out+=wrapCls(t.slice(0,c1-s),cls);
        if(c2>c1) out+=wrapCls(t.slice(c1-s,c2-s),newCls);
        if(e>c2) out+=wrapCls(t.slice(c2-s),cls);
      } else if(ch.nodeType===1){
        if(ch.tagName==='BR'){ out+='<br>'; return; }
        const pcls=ch.tagName==='SPAN'?[...ch.classList].find(c=>c.startsWith(prefix)):undefined;
        if(pcls!==undefined) out+=ser(ch,pcls);
        else{
          const tag=ch.tagName.toLowerCase();
          let attrs='';
          [...ch.attributes].forEach(a=>{attrs+=' '+a.name+'="'+String(a.value).replace(/"/g,'&quot;')+'"';});
          out+='<'+tag+attrs+'>'+ser(ch,cls)+'</'+tag+'>';
        }
      }
    });
    return out;
  };
  root.innerHTML=ser(root,'');
  // re-select the same text range so further formatting can be chained
  const locate=offset=>{
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let n,c=0;
    while((n=w.nextNode())){
      if(c+n.nodeValue.length>=offset) return [n,offset-c];
      c+=n.nodeValue.length;
    }
    return [root,root.childNodes.length];
  };
  const [sn,so]=locate(from),[en,eo]=locate(to);
  const nr=document.createRange(); nr.setStart(sn,so); nr.setEnd(en,eo);
  sel.removeAllRanges(); sel.addRange(nr);
}

/* =========================================================================
   linkify — wrap bare URLs in text with <a> (skips existing anchors)
   ========================================================================= */
const URL_RE=/(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}]/gi;
function linkifyHtml(html){
  const tpl=document.createElement('template');
  tpl.innerHTML=html||'';
  const walk=node=>{
    [...node.childNodes].forEach(child=>{
      if(child.nodeType===3){
        const text=child.nodeValue;
        URL_RE.lastIndex=0;
        if(!URL_RE.test(text)) return;
        const frag=document.createDocumentFragment();
        let last=0;
        URL_RE.lastIndex=0;
        text.replace(URL_RE,(url,idx)=>{
          if(idx>last) frag.appendChild(document.createTextNode(text.slice(last,idx)));
          const a=document.createElement('a');
          a.href=/^www\./i.test(url)?'https://'+url:url;
          a.textContent=url;
          frag.appendChild(a);
          last=idx+url.length;
          return url;
        });
        if(last<text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.replaceChild(frag,child);
      } else if(child.nodeType===1 && child.tagName!=='A'){
        walk(child);
      }
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

/* =========================================================================
   EDITABLE — uncontrolled contentEditable wrapper
   ========================================================================= */
const Editable = React.forwardRef(function Editable(props,ref){
  const {html:rawHtml,onInput,placeholder,className,onKeyDown,onFocus,onBlur,style}=props;
  const html=useMemo(()=>linkifyHtml(rawHtml||''),[rawHtml]); // bare URLs in stored content render as links
  const local=useRef();
  const [focused,setFocused]=useState(false);
  const setRef=el=>{ local.current=el; if(typeof ref==='function')ref(el); else if(ref)ref.current=el; };
  useEffect(()=>{ if(local.current && local.current.innerHTML!==(html||'')) local.current.innerHTML=html||''; },[]);
  useEffect(()=>{ // sync external html changes only when not focused
    if(local.current && document.activeElement!==local.current
       && local.current.innerHTML!==(html||'')) local.current.innerHTML=html||'';
  },[html]);
  // wrap bare URLs in <a>, keeping the caret where it was
  const maybeLinkify=el=>{
    const next=linkifyHtml(el.innerHTML);
    if(next===el.innerHTML) return false;
    const off=caretTextOffset(el);
    el.innerHTML=next;
    if(off!=null) setCaretTextOffset(el,off);
    return true;
  };
  // placeholder shows only when focused AND the block has no visible text content
  const isEmpty=!(html||'').replace(/<br\s*\/?>/gi,'').replace(/&nbsp;/gi,' ').trim();
  return <div className={cx('ce',className,isEmpty&&focused&&placeholder&&'ph')} contentEditable suppressContentEditableWarning
    ref={setRef} data-ph={placeholder||''} style={style}
    onInput={e=>{ const el=e.currentTarget;
      const d=e.nativeEvent&&e.nativeEvent.data;
      if(d===' '||d==='\u00a0') maybeLinkify(el); // linkify once a word is finished
      onInput&&onInput(el.innerHTML); }}
    onKeyDown={onKeyDown}
    onFocus={e=>{ setFocused(true); onFocus&&onFocus(e); }}
    onBlur={e=>{ setFocused(false);
      if(maybeLinkify(e.currentTarget)) onInput&&onInput(e.currentTarget.innerHTML);
      onBlur&&onBlur(e); }}
    onClick={e=>{ const a=e.target.closest&&e.target.closest('a');
      if(a && local.current && local.current.contains(a)){
        e.preventDefault(); window.open(a.href,'_blank','noopener'); } }}
    onPaste={e=>{ e.preventDefault();
      const t=(e.clipboardData||window.clipboardData).getData('text/plain');
      document.execCommand('insertText',false,t);
      const el=e.currentTarget;
      if(maybeLinkify(el)) onInput&&onInput(el.innerHTML); }}/>;
});

window.__NOTION_PART1_DONE=true;
/* =========================================================================
   SLASH MENU
   ========================================================================= */
function SlashMenu({rect,query,onPick,onClose}){
  const q=(query||'').toLowerCase().trim();
  const list=useMemo(()=>CMDS.filter(c=>!q ||
    c.label.toLowerCase().includes(q) || c.kw.includes(q)),[q]);
  const [hi,setHi]=useState(0);
  useEffect(()=>setHi(0),[q]);
  const sel=useRef();
  useEffect(()=>{
    const k=e=>{
      if(e.key==='ArrowDown'){e.preventDefault();setHi(h=>Math.min(h+1,list.length-1));}
      else if(e.key==='ArrowUp'){e.preventDefault();setHi(h=>Math.max(h-1,0));}
      else if(e.key==='Enter'){ if(list[hi]){e.preventDefault();e.stopPropagation();onPick(list[hi]);} }
      else if(e.key==='Escape'){e.preventDefault();onClose();}
    };
    document.addEventListener('keydown',k,true);
    return ()=>document.removeEventListener('keydown',k,true);
  },[hi,list]);
  useEffect(()=>{ sel.current&&sel.current.scrollIntoView({block:'nearest'}); },[hi]);
  if(!list.length) return <Popup rect={rect} onClose={onClose} width={280}>
    <div className="menu"><div className="mi" style={{color:'var(--text-3)'}}>No matching blocks</div></div>
  </Popup>;
  let lastG=null;
  return <Popup rect={rect} onClose={onClose} width={300}>
    <div className="menu">
      {list.map((c,i)=>{
        const head = c.g!==lastG ? <div className="menu-h" key={'h'+c.g}>{c.g} blocks</div> : null;
        lastG=c.g;
        return <Fragment key={c.id}>{head}
          <div className={cx('mi',i===hi&&'hi')} ref={i===hi?sel:null}
            onMouseEnter={()=>setHi(i)} onMouseDown={e=>{e.preventDefault();onPick(c);}}>
            <div className="mi-ic">{c.ic}</div>
            <div className="mi-tx">{c.label}<small>{c.desc}</small></div>
          </div></Fragment>;
      })}
    </div>
  </Popup>;
}

/* =========================================================================
   BLOCK CONTEXT MENU  (drag-handle ⋮⋮ menu)
   ========================================================================= */
function BlockMenu({rect,block,onClose,onAction}){
  const [sub,setSub]=useState(null);      // 'turn' | 'color' | null
  const [subRect,setSubRect]=useState(null);
  const mainRef=useRef();
  const subRef=useRef();

  // Single outside-click handler covering both the main menu and the submenu
  useEffect(()=>{
    const h=e=>{
      if(mainRef.current?.contains(e.target)||subRef.current?.contains(e.target)) return;
      onClose();
    };
    const k=e=>{ if(e.key==='Escape'){e.stopPropagation();onClose();} };
    setTimeout(()=>document.addEventListener('mousedown',h),0);
    document.addEventListener('keydown',k,true);
    return ()=>{
      document.removeEventListener('mousedown',h);
      document.removeEventListener('keydown',k,true);
    };
  },[]);

  const turnTypes=[['text','Text','📝'],['h1','Heading 1','H₁'],['h2','Heading 2','H₂'],
    ['h3','Heading 3','H₃'],['todo','To-do','✅'],['bullet','Bulleted','•'],
    ['number','Numbered','1.'],['toggle','Toggle','▸'],['quote','Quote','❝'],
    ['callout','Callout','💡']];

  // ── main menu position ──
  const mw=210;
  let mLeft=rect.left;
  if(mLeft+mw>window.innerWidth-10) mLeft=window.innerWidth-mw-10;
  // measured vertical clamp: open upward when there is no room below
  const [mTopAdj,setMTopAdj]=useState(null);
  useLayoutEffect(()=>{
    const el=mainRef.current; if(!el) return;
    const h=el.offsetHeight;
    let t=rect.bottom+4;
    if(t+h>window.innerHeight-10){
      t=rect.top-h-4;
      if(t<10) t=Math.max(10,window.innerHeight-h-10);
    }
    setMTopAdj(t);
  },[]);
  const mTop=mTopAdj??(rect.bottom+4);

  // ── submenu position: right side of the main menu, aligned to the hovered row ──
  const sw=sub==='turn'?210:220;
  let sLeft=0;
  if(subRect){
    sLeft=mLeft+mw+6;
    // flip left if no room on the right
    if(sLeft+sw>window.innerWidth-10) sLeft=mLeft-sw-6;
  }
  const [sTopAdj,setSTopAdj]=useState(null);
  useLayoutEffect(()=>{
    if(!sub||!subRect){ setSTopAdj(null); return; }
    const el=subRef.current; if(!el) return;
    const h=el.offsetHeight;
    let t=subRect.top-6;
    if(t+h>window.innerHeight-10) t=window.innerHeight-h-10;
    if(t<10) t=10;
    setSTopAdj(t);
  },[sub,subRect]);
  const sTop=sTopAdj??(subRect?subRect.top-6:0);

  const openSub=(type,e)=>{
    setSub(type);
    setSubRect(e.currentTarget.getBoundingClientRect());
  };

  return <>
    {createPortal(
      <div className="pop" ref={mainRef} style={{top:mTop,left:mLeft,width:mw}}>
        <div className="menu">
          <div className={cx('mi',sub==='turn'&&'hi')}
            onMouseEnter={e=>openSub('turn',e)}
            onMouseDown={e=>{e.preventDefault();openSub('turn',e);}}>
            <div className="mi-ic">⇄</div><div className="mi-tx">Turn into</div>
            <Ic n="chevron" style={{width:13,height:13}}/></div>
          <div className="mi" onMouseDown={e=>{e.preventDefault();onAction('duplicate');}}>
            <div className="mi-ic">⧉</div><div className="mi-tx">Duplicate</div>
            <span className="mi-kbd">⌘D</span></div>
          <div className={cx('mi',sub==='color'&&'hi')}
            onMouseEnter={e=>openSub('color',e)}
            onMouseDown={e=>{e.preventDefault();openSub('color',e);}}>
            <div className="mi-ic">🎨</div><div className="mi-tx">Color</div>
            <Ic n="chevron" style={{width:13,height:13}}/></div>
          <div className="mi" onMouseDown={e=>{e.preventDefault();onAction('copylink');}}>
            <div className="mi-ic"><Ic n="link" style={{width:15,height:15}}/></div>
            <div className="mi-tx">Copy link to block</div></div>
          <div className="menu-sep"/>
          <div className="mi danger" onMouseDown={e=>{e.preventDefault();onAction('delete');}}>
            <div className="mi-ic"><Ic n="trash" style={{width:15,height:15}}/></div>
            <div className="mi-tx">Delete</div><span className="mi-kbd">Del</span></div>
        </div>
      </div>,
      document.body
    )}

    {sub&&subRect&&createPortal(
      <div className="pop" ref={subRef} style={{top:sTop,left:sLeft,width:sw}}>
        {sub==='turn'
          ?<div className="menu">
            <div className="menu-h">Turn into</div>
            {turnTypes.map(([t,l,ic])=><div key={t} className="mi"
              onMouseDown={e=>{e.preventDefault();onAction('turn',t);}}>
              <div className="mi-ic">{ic}</div><div className="mi-tx">{l}</div>
            </div>)}
          </div>
          :<div className="menu">
            <div className="menu-h">Text color</div>
            {TEXT_COLORS.map(c=><div key={c} className="mi"
              onMouseDown={e=>{e.preventDefault();onAction('color',c);}}>
              <div className="mi-ic" style={{textTransform:'capitalize'}}>A</div>
              <div className="mi-tx" style={{textTransform:'capitalize'}}>
                <span className={c!=='default'?'tc-'+c:''}>{c}</span>
              </div>
            </div>)}
            <div className="menu-h">Background</div>
            {SEL_COLORS.map(c=><div key={c} className="mi"
              onMouseDown={e=>{e.preventDefault();onAction('bg',c);}}>
              <div className={cx('mi-ic',c!=='default'&&'bg-'+c)}> </div>
              <div className="mi-tx" style={{textTransform:'capitalize'}}>{c} background</div>
            </div>)}
          </div>}
      </div>,
      document.body
    )}
  </>;
}

/* ---- Selection format menu — right-click on selected text ---- */
function FormatMenu({pos,onClose,onCmd}){
  const ref=useRef();
  const [sub,setSub]=useState(null); // 'color' | 'bg'
  useEffect(()=>{
    const down=e=>{ if(ref.current&&!ref.current.contains(e.target)) onClose(); };
    const key=e=>{ if(e.key==='Escape') onClose(); };
    const t=setTimeout(()=>document.addEventListener('mousedown',down),0);
    document.addEventListener('keydown',key);
    return ()=>{ clearTimeout(t);
      document.removeEventListener('mousedown',down);
      document.removeEventListener('keydown',key); };
  },[]);
  const left=Math.max(8,Math.min(pos.left,window.innerWidth-330));
  // measured vertical clamp: flip above the cursor when there is no room below
  const [topAdj,setTopAdj]=useState(null);
  useLayoutEffect(()=>{
    const el=ref.current; if(!el) return;
    const h=el.offsetHeight;
    let t=pos.top+6;
    if(t+h>window.innerHeight-8){
      t=pos.top-h-6;
      if(t<8) t=Math.max(8,window.innerHeight-h-8);
    }
    setTopAdj(t);
  },[sub]);
  const top=topAdj??(pos.top+6);
  const pd=f=>e=>{ e.preventDefault(); e.stopPropagation(); f(); };
  const Btn=({title,cmd,children})=>
    <button className="fmt-btn" title={title} onMouseDown={pd(()=>onCmd(cmd))}>{children}</button>;
  return createPortal(
    <div className="pop fmt-pop" ref={ref} style={{top,left}}>
      <div className="fmt-bar">
        <Btn title="Bold — Ctrl+B" cmd="bold"><b>B</b></Btn>
        <Btn title="Italic — Ctrl+I" cmd="italic"><i>I</i></Btn>
        <Btn title="Underline — Ctrl+U" cmd="underline"><u>U</u></Btn>
        <Btn title="Strikethrough — Ctrl+Shift+S" cmd="strike"><s>S</s></Btn>
        <Btn title="Inline code — Ctrl+E" cmd="code"><code>&lt;&gt;</code></Btn>
        <span className="fmt-sep"/>
        <button className={cx('fmt-btn','fmt-dd',sub==='color'&&'on')} title="Text color"
          onMouseDown={pd(()=>setSub(sub==='color'?null:'color'))}>
          <span className="fmt-a">A</span><Ic n="chevron" style={{width:11,height:11}}/></button>
        <button className={cx('fmt-btn','fmt-dd',sub==='bg'&&'on')} title="Highlight"
          onMouseDown={pd(()=>setSub(sub==='bg'?null:'bg'))}>
          <span className="fmt-hl">A</span><Ic n="chevron" style={{width:11,height:11}}/></button>
        <span className="fmt-sep"/>
        <Btn title="Clear formatting" cmd="clear"><Ic n="x" style={{width:14,height:14}}/></Btn>
      </div>
      {sub&&<div className="fmt-colors">
        {(sub==='color'?TEXT_COLORS:SEL_COLORS).map(c=>
          <button key={c} title={c==='default'?'Default':c} className="fmt-sw"
            onMouseDown={pd(()=>onCmd(sub==='color'?'color':'bg',c))}>
            {sub==='color'
              ? <span className={c!=='default'?'tc-'+c:''}>A</span>
              : <span className={cx('fmt-sw-bg',c!=='default'&&'bg-'+c)}/>}
          </button>)}
      </div>}
    </div>,
    document.body
  );
}

/* ---- Code block language selector ---- */
function CodeLangSelect({value, onChange}){
  const [open,setOpen]=useState(false);
  const ref=useRef();
  useEffect(()=>{
    if(!open) return;
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    setTimeout(()=>document.addEventListener('mousedown',h),0);
    return()=>document.removeEventListener('mousedown',h);
  },[open]);
  const lang=value||'plain text';
  return <div ref={ref} className="code-lang-sel">
    <button className={cx('code-lang-btn',open&&'open')}
      onMouseDown={e=>{e.preventDefault();setOpen(o=>!o);}}>
      <span className="code-lang-pill">{lang}</span>
      <Ic n="chevron-down" style={{width:11,height:11}}/>
    </button>
    {open&&<div className="code-lang-menu">
      {CODE_LANGS.map(l=><div key={l}
        className={cx('code-lang-opt',lang===l&&'sel')}
        onMouseDown={e=>{e.preventDefault();onChange(l);setOpen(false);}}>
        <span>{l}</span>
        {lang===l&&<Ic n="check" style={{width:12,height:12}}/>}
      </div>)}
    </div>}
  </div>;
}

/* =========================================================================
   BLOCK  — renders one block of any type
   ========================================================================= */
function Block(props){
  const {block,index,listNumber,onChange,onEnter,onBackspace,onDeleteForward,onArrow,onIndent,
    focus,setFocus,onSlash,onBlockAction,openPage,onDragStart,onDragOver,onDrop,
    dragInfo,depth,onUploadFile,uploads,selected} = props;
  const ceRef=useRef();
  const codeRef=useRef();
  const [menu,setMenu]=useState(null);
  const [fmt,setFmt]=useState(null);   // selection format menu {top,left}
  const [emoji,setEmoji]=useState(false);
  const [imgPick,setImgPick]=useState(false);
  const T=block.type;
  // selection formatting (right-click menu) — applies to the current selection
  const applyFormat=(a,v)=>{
    const el=ceRef.current; if(!el) return;
    if(a==='bold') document.execCommand('bold');
    else if(a==='italic') document.execCommand('italic');
    else if(a==='underline') document.execCommand('underline');
    else if(a==='strike') document.execCommand('strikeThrough');
    else if(a==='code'){
      const t=window.getSelection().toString();
      if(t) document.execCommand('insertHTML',false,
        '<code>'+t.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</code>');
    }
    else if(a==='clear'){
      document.execCommand('removeFormat');
      applySelSpan('tc-','default'); applySelSpan('bg-','default');
    }
    else if(a==='color') applySelSpan('tc-',v);
    else if(a==='bg') applySelSpan('bg-',v);
    onChange({...block,html:el.innerHTML});
  };
  // auto-resize code textarea whenever its content changes
  useEffect(()=>{
    const el=codeRef.current;
    if(!el) return;
    el.style.height='auto';
    el.style.height=el.scrollHeight+'px';
  },[block.code]);
  const textHandlers = {
    onInput:rawHtml=>{
      // normalize: browser leaves <br> in empty contentEditable — treat as truly empty
      const html=rawHtml.replace(/<br\s*\/?>/gi,'').trim()===''?'':rawHtml;
      const plain=ceRef.current?ceRef.current.textContent:'';
      if(T==='text'){
        if(plain==='---'){ onChange({...block,type:'divider',html:''}); return; }
        if(plain==='```'){ onChange({...block,type:'code',code:'',lang:'plain text',html:undefined}); return; }
      }
      onChange({...block,html});
    },
    onKeyDown:e=>{
      const el=ceRef.current;
      // markdown shortcuts on Space
      if(e.key===' ' && (T==='text')){
        const before=textBeforeCaret(el).trim();
        const map={'#':'h1','##':'h2','###':'h3','-':'bullet','*':'bullet',
          '1.':'number','[]':'todo','[ ]':'todo','>':'toggle','"':'quote'};
        if(map[before]!==undefined && before===el.textContent.trim()){
          e.preventDefault();
          const nt=map[before];
          const patch={...block,type:nt,html:''};
          if(nt==='todo')patch.checked=false;
          if(nt==='toggle'){patch.collapsed=false;patch.children=[];}
          onChange(patch);
          setFocus({id:block.id,pos:'start'});
          return;
        }
      }
      // slash
      if(e.key==='/'){
        setTimeout(()=>{ const r=el.getBoundingClientRect();
          onSlash({blockId:block.id,rect:r,el}); },0);
      }
      // Ctrl/⌘ + Enter → open the block-insert menu (add a block) without typing "/"
      if((e.metaKey||e.ctrlKey) && e.key==='Enter'){
        e.preventDefault(); e.stopPropagation();
        onSlash({blockId:block.id,rect:el.getBoundingClientRect(),el});
        return;
      }
      if(e.key==='Enter' && !e.shiftKey){
        e.preventDefault();
        onEnter(block,el);
      }
      if(e.key==='Backspace'){
        if(caretAtStart(el)){
          e.preventDefault(); onBackspace(block,el);
        }
      }
      if(e.key==='Delete'){
        if(caretAtEnd(el)){
          e.preventDefault(); onDeleteForward(block,el);
        }
      }
      if(e.key==='ArrowUp' && !e.shiftKey){
        const sel=window.getSelection();
        if(sel.rangeCount){ const r=sel.getRangeAt(0).getClientRects()[0];
          const top=el.getBoundingClientRect().top;
          if(!r || r.top-top<8){ e.preventDefault(); onArrow('up',block); } }
      }
      if(e.key==='ArrowDown' && !e.shiftKey){
        const sel=window.getSelection();
        if(sel.rangeCount){ const r=sel.getRangeAt(0).getClientRects()[0];
          const bot=el.getBoundingClientRect().bottom;
          if(!r || bot-r.bottom<8){ e.preventDefault(); onArrow('down',block); } }
      }
      if(e.key==='Tab'){ e.preventDefault(); onIndent(block,e.shiftKey?-1:1); }
      // formatting
      const m=e.metaKey||e.ctrlKey;
      if(m && e.key.toLowerCase()==='b'){e.preventDefault();document.execCommand('bold');onChange({...block,html:el.innerHTML});}
      if(m && e.key.toLowerCase()==='i'){e.preventDefault();document.execCommand('italic');onChange({...block,html:el.innerHTML});}
      if(m && e.key.toLowerCase()==='u'){e.preventDefault();document.execCommand('underline');onChange({...block,html:el.innerHTML});}
      if(m && e.shiftKey && e.key.toLowerCase()==='s'){e.preventDefault();document.execCommand('strikeThrough');onChange({...block,html:el.innerHTML});}
      if(m && e.key.toLowerCase()==='e'){e.preventDefault();
        document.execCommand('insertHTML',false,'<code>'+(window.getSelection().toString()||'code')+'</code>');
        onChange({...block,html:el.innerHTML});}
    }
  };
  // focus management
  useEffect(()=>{
    if(focus && focus.id===block.id && ceRef.current){
      placeCaret(ceRef.current,focus.pos==='start'?'start':'end');
      setFocus(null);
    }
  },[focus]);

  const gutterCls = T==='h1'?'h1':T==='h2'?'h2':T==='h3'?'h3':'';
  const colorCls = block.color&&block.color!=='default'&&T!=='callout'?
    'tc-'+block.color:'';
  const bgCls = block.bg&&block.bg!=='default'?'bg-'+block.bg:'';

  const Gutter = <div className={cx('blk-gutter',gutterCls)}>
    <button className="g-btn" title="Add block below"
      onClick={()=>onBlockAction(block,'add-below')}><Ic n="plus"/></button>
    <button className="g-btn handle" title="Drag or click for actions" draggable
      onDragStart={e=>onDragStart(e,block,index)}
      onClick={e=>{ const r=e.currentTarget.getBoundingClientRect(); setMenu(r); }}>
      <Ic n="drag"/></button>
  </div>;

  function renderText(extraPh,cls){
    return <Editable ref={ceRef} html={block.html} placeholder={extraPh}
      className={cx(colorCls,cls)} {...textHandlers}/>;
  }

  let body;
  if(T==='text') body=renderText("Type '/' for commands");
  else if(T==='h1'||T==='h2'||T==='h3') body=renderText('Heading');
  else if(T==='quote') body=<div className={cx('b-quote',bgCls)}>{renderText('Empty quote')}</div>;
  else if(T==='callout') body=<div className={cx('b-callout','bg-'+(block.color||'gray'))}>
    <span className="cal-emoji" onClick={e=>{e.stopPropagation();setEmoji(e.currentTarget.getBoundingClientRect());}}
      >{block.emoji||'💡'}</span>
    {renderText('Type something…')}
    {emoji&&<EmojiPicker rect={emoji} onClose={()=>setEmoji(false)}
      onPick={em=>{onChange({...block,emoji:em||'💡'});setEmoji(false);}}/>}
  </div>;
  else if(T==='divider') body=<div className="b-divider"><hr/></div>;
  else if(T==='bullet') body=<div className="li">
    <span className="bullet">•</span>{renderText('List')}</div>;
  else if(T==='number') body=<div className="li">
    <span className="num">{listNumber}.</span>{renderText('List')}</div>;
  else if(T==='todo') body=<div className={cx('li','todo',block.checked&&'todo-done')}>
    <span className="bullet" onClick={()=>onChange({...block,checked:!block.checked})}>
      <span className={cx('chk',block.checked&&'on')}><Ic n="check"/></span></span>
    {renderText('To-do')}</div>;
  else if(T==='toggle') body=<div>
    <div className="toggle-row">
      <span className={cx('toggle-twist',!block.collapsed&&'open')}
        onClick={()=>onChange({...block,collapsed:!block.collapsed})}>
        <Ic n="chevron"/></span>
      {renderText('Toggle')}
    </div>
    {!block.collapsed && <div className="toggle-children">
      {(block.children||[]).map(ch=><div key={ch.id} className={'b-'+ch.type} style={{padding:'2px 0'}}>
        <Editable html={ch.html} placeholder="Empty toggle. Click or type."
          onInput={h=>onChange({...block,children:block.children.map(c=>c.id===ch.id?{...c,html:h}:c)})}/>
      </div>)}
      <div className="tree-empty" style={{cursor:'pointer',paddingLeft:0}}
        onClick={()=>onChange({...block,children:[...(block.children||[]),
          {id:nid(),type:'text',html:''}]})}>+ Add inside toggle</div>
    </div>}
  </div>;
  else if(T==='code') body=<div className="b-code">
    <div className="code-head">
      <div className="code-dots"><span/><span/><span/></div>
      <CodeLangSelect value={block.lang||'plain text'} onChange={l=>onChange({...block,lang:l})}/>
      <div style={{flex:1}}/>
      <button className="code-copy"
        onClick={()=>{navigator.clipboard&&navigator.clipboard.writeText(block.code||'');}}>
        <Ic n="copy" style={{width:11,height:11}}/>Copy
      </button>
    </div>
    <textarea ref={codeRef} className="code-area"
      value={block.code||''} placeholder="Type your code…"
      onChange={e=>{
        const el=e.target;
        el.style.height='auto';
        el.style.height=el.scrollHeight+'px';
        onChange({...block,code:el.value});
      }}
      onKeyDown={e=>{ if(e.key==='Backspace'&&!block.code){e.preventDefault();onBackspace(block);}}}/>
  </div>;
  else if(T==='image') body=<div className="b-image"
    tabIndex={block.url?0:undefined}
    onKeyDown={block.url?e=>{
      if((e.key==='Delete'||e.key==='Backspace')&&e.target===e.currentTarget){
        e.preventDefault(); onBlockAction(block,'delete');
      }
    }:undefined}>
    {block.url ? <Fragment>
      <img src={block.url} alt="" onError={e=>e.target.style.opacity=.3}
        onClick={e=>e.currentTarget.closest('.b-image')?.focus()}/>
      <Editable html={block.caption} placeholder="Add a caption…" className="img-cap"
        onInput={h=>onChange({...block,caption:h})}
        onKeyDown={e=>{
          if((e.key==='Delete'||e.key==='Backspace')&&caretAtStart(e.currentTarget)&&!(block.caption||'').trim()){
            e.preventDefault(); onBlockAction(block,'delete');
          }
        }}/>
    </Fragment> : imgPick
      ? <ImagePicker
          uploads={uploads}
          onFile={async file=>{
            const u=await onUploadFile?.(file);
            if(u) onChange({...block,url:u.url,fileName:u.name,fileType:u.type,fileSize:u.size,
              uploadId:u.id,localName:u.localName});
            setImgPick(false);
          }}
          onUrl={url=>{onChange({...block,url});setImgPick(false);}}
        />
      : <div className="img-empty" onClick={()=>setImgPick(true)}>
          <Ic n="image" style={{width:20,height:20}}/> Add an image
        </div>}
  </div>;
  else if(T==='file') body=<FileBlockBody block={block} onChange={onChange} onUploadFile={onUploadFile} uploads={uploads} onDelete={()=>onBlockAction(block,'delete')}/>;
  else if(T==='bookmark') body=<div className="b-bookmark">
    {block.url ? <a href={block.url} target="_blank" rel="noreferrer">
      <div className="bm-txt">
        <div className="bm-title">{block.title||block.url}</div>
        {block.desc&&<div className="bm-url" style={{whiteSpace:'normal'}}>{block.desc}</div>}
        <div className="bm-url">{block.url}</div>
      </div>
      <div className="bm-side" style={{background:'linear-gradient(135deg,#5b86e5,#36d1dc)'}}/>
    </a> : <div className="img-empty" onClick={()=>{
      const u=prompt('Paste a link URL'); if(u)onChange({...block,url:u,title:u}); }}>
      <Ic n="link" style={{width:18,height:18}}/> Create bookmark — paste a URL
    </div>}
  </div>;
  else if(T==='subpage'){
    const pg=props.lookupNode(block.pageId);
    body=<div className="subpage" onClick={()=>pg&&openPage(block.pageId)}>
      <span className="sp-emoji">{pg?pg.icon||'📄':'📄'}</span>
      <span className="sp-title">{pg?(pg.title||'Untitled'):'(deleted page)'}</span>
    </div>;
  }
  else if(T==='database'){
    body=<div className="db"><DatabaseView db={block.db}
      onChange={ndb=>onChange({...block,db:ndb})} openRow={props.openRow}
      onDelete={()=>onBlockAction(block,'delete')}
      onDuplicate={()=>onBlockAction(block,'duplicate')}/></div>;
  }
  else body=renderText('Type something…');

  const dropCls = dragInfo&&dragInfo.overId===block.id ?
    (dragInfo.pos==='above'?'drop-above':'drop-below') : '';

  return <div className={cx('blk','b-'+T,selected&&'blk-sel',dragInfo&&dragInfo.dragId===block.id&&'dragging',dropCls)}
    data-block-id={block.id}
    style={{marginLeft:(depth||0)*26}}
    onDragOver={e=>onDragOver(e,block)} onDrop={e=>onDrop(e,block)}
    onContextMenu={T!=='database'?e=>{
      e.preventDefault();e.stopPropagation();
      const sel=window.getSelection();
      if(ceRef.current && sel.rangeCount && !sel.isCollapsed
         && ceRef.current.contains(sel.anchorNode) && ceRef.current.contains(sel.focusNode)){
        setFmt({top:e.clientY,left:e.clientX});  // text selected → format menu
        return;
      }
      setMenu({top:e.clientY,bottom:e.clientY,left:e.clientX,right:e.clientX});
    }:undefined}>
    {T!=='database' && Gutter}
    <div className="blk-body">{body}</div>
    {menu&&<BlockMenu rect={menu} block={block} onClose={()=>setMenu(null)}
      onAction={(a,v)=>{ setMenu(null); onBlockAction(block,a,v); }}/>}
    {fmt&&<FormatMenu pos={fmt} onClose={()=>setFmt(null)} onCmd={applyFormat}/>}
  </div>;
}

window.__NOTION_PART2_DONE=true;
/* =========================================================================
   PAGE EDITOR
   ========================================================================= */
function Editor({node,update,createChild,openPage,lookupNode,openRow,childPages=[],onUploadFile,uploads}){
  const [focus,setFocus]=useState(null);
  const [slash,setSlash]=useState(null); // {blockId,rect,el}
  const [drag,setDrag]=useState(null);   // {dragId,overId,pos}
  const [iconPick,setIconPick]=useState(false);
  const [coverPick,setCoverPick]=useState(false);
  const blocks=node.blocks||[];

  const setBlocks=nb=>update(node.id,{blocks:nb});

  /* ── undo / redo (block-structural history) ── */
  const undoStack=useRef([]);
  const redoStack=useRef([]);
  function setBlocksH(nb){        // history-aware setter for structural ops
    undoStack.current=[...undoStack.current.slice(-20), blocks];
    redoStack.current=[];
    setBlocks(nb);
  }
  function undo(){
    if(!undoStack.current.length) return;
    const prev=undoStack.current[undoStack.current.length-1];
    undoStack.current=undoStack.current.slice(0,-1);
    redoStack.current=[blocks,...redoStack.current.slice(0,20)];
    setBlocks(prev);
  }
  function redo(){
    if(!redoStack.current.length) return;
    const next=redoStack.current[0];
    redoStack.current=redoStack.current.slice(1);
    undoStack.current=[...undoStack.current.slice(-100),blocks];
    setBlocks(next);
  }
  useEffect(()=>{
    function onKey(e){
      const m=e.metaKey||e.ctrlKey;
      if(!m) return;
      if(e.key.toLowerCase()==='z'&&!e.shiftKey&&undoStack.current.length){
        e.preventDefault(); undo();
      }
      if((e.key.toLowerCase()==='y'||(e.key.toLowerCase()==='z'&&e.shiftKey))&&redoStack.current.length){
        e.preventDefault(); redo();
      }
    }
    document.addEventListener('keydown',onKey,true); // capture so it beats contentEditable
    return ()=>document.removeEventListener('keydown',onKey,true);
  },[]);
  const updateBlock=(b)=>setBlocks(blocks.map(x=>x.id===b.id?b:x));
  const idx=id=>blocks.findIndex(b=>b.id===id);

  function insertAfter(afterId,blk){
    const i=idx(afterId);
    const nb=[...blocks]; nb.splice(i+1,0,blk); setBlocksH(nb);
    setFocus({id:blk.id,pos:'start'});
  }
  // ── multi-block selection: dragging across block boundaries selects whole
  // blocks (native text selection cannot span separate contentEditables) ──
  const [blockSel,setBlockSel]=useState(null); // {a,b} indices, inclusive
  const blockSelRef=useRef(null); blockSelRef.current=blockSel;
  const dragSel=useRef(null);                  // {anchorId,active} during mouse drag
  const bsBlockId=t=>{ const el=t&&t.closest&&t.closest('[data-block-id]');
    return el?el.getAttribute('data-block-id'):null; };
  function onSelMouseDown(e){
    if(e.button!==0) return;
    if(blockSelRef.current) setBlockSel(null); // a fresh click clears the selection
    const id=bsBlockId(e.target);
    if(!id||!e.target.closest('.blk-body')) return;
    dragSel.current={anchorId:id,active:false};
    const move=ev=>{
      const d=dragSel.current; if(!d) return;
      const over=bsBlockId(document.elementFromPoint(ev.clientX,ev.clientY));
      if(!over) return;
      if(over!==d.anchorId||d.active){
        const ai=idx(d.anchorId),bi=idx(over);
        if(ai<0||bi<0) return;
        if(!d.active){ d.active=true;
          if(document.activeElement&&document.activeElement.blur) document.activeElement.blur(); }
        window.getSelection().removeAllRanges();
        setBlockSel({a:ai,b:bi});
        ev.preventDefault();
      }
    };
    const up=()=>{
      document.removeEventListener('mousemove',move);
      document.removeEventListener('mouseup',up);
      dragSel.current=null;
    };
    document.addEventListener('mousemove',move);
    document.addEventListener('mouseup',up);
  }
  useEffect(()=>{
    if(!blockSel) return;
    const lo=Math.min(blockSel.a,blockSel.b),hi=Math.max(blockSel.a,blockSel.b);
    const selText=()=>blocks.slice(lo,hi+1).map(b=>{
      if(b.type==='code') return b.code||'';
      const d=document.createElement('div'); d.innerHTML=b.html||'';
      return d.textContent;
    }).join('\n');
    const removeSel=()=>{
      const nb=blocks.filter((_,i)=>i<lo||i>hi);
      if(!nb.length) nb.push({id:nid(),type:'text',html:''});
      setBlocksH(nb); setBlockSel(null);
    };
    const onKey=e=>{
      if(e.key==='Escape'){ setBlockSel(null); return; }
      if(e.key==='Backspace'||e.key==='Delete'){ e.preventDefault(); removeSel(); return; }
      const m=e.metaKey||e.ctrlKey;
      if(m&&e.key.toLowerCase()==='c'){ e.preventDefault();
        navigator.clipboard&&navigator.clipboard.writeText(selText()); return; }
      if(m&&e.key.toLowerCase()==='x'){ e.preventDefault();
        navigator.clipboard&&navigator.clipboard.writeText(selText()); removeSel(); return; }
    };
    document.addEventListener('keydown',onKey,true);
    return ()=>document.removeEventListener('keydown',onKey,true);
  },[blockSel,blocks]);

  // clicking the empty area below the last block puts the caret in it
  function focusLastEditable(){
    const EDITABLE=['text','h1','h2','h3','bullet','number','todo','toggle','quote','callout'];
    for(let i=blocks.length-1;i>=0;i--){
      if(EDITABLE.includes(blocks[i].type)){
        setFocus({id:blocks[i].id,pos:'end'}); return;
      }
    }
    // no editable block found — create one
    const b={id:nid(),type:'text',html:''};
    setBlocksH([...blocks,b]); setFocus({id:b.id,pos:'start'});
  }
  function onEnter(b,el){
    // continue lists; empty list item -> text
    const listish=['bullet','number','todo','toggle'].includes(b.type);
    if(listish && el && el.textContent.trim()===''){
      updateBlock({...b,type:'text',checked:undefined,children:undefined});
      setFocus({id:b.id,pos:'start'}); return;
    }
    let nt='text';
    if(['bullet','number','todo'].includes(b.type)) nt=b.type;
    // split at the caret: content after it moves into the new block
    const split=el?splitHtmlAtCaret(el):null;
    const blk={id:nid(),type:nt,html:split?split.after:''};
    if(nt==='todo')blk.checked=false;
    if(split) el.innerHTML=split.before; // keep DOM in step so the focused block doesn't show stale text
    const i=idx(b.id);
    const nb=blocks.map(x=>x.id===b.id&&split?{...x,html:split.before}:x);
    nb.splice(i+1,0,blk);
    setBlocksH(nb);
    setFocus({id:blk.id,pos:'start'});
  }
  function onBackspace(b,el){
    const i=idx(b.id);
    // media/embed blocks should be deleted on backspace, not converted to text
    if(['image','file','bookmark','divider','subpage'].includes(b.type)){
      const nb=blocks.filter(x=>x.id!==b.id);
      if(!nb.length) nb.push({id:nid(),type:'text',html:''});
      setBlocksH(nb);
      if(i>0) setFocus({id:blocks[i-1].id,pos:'end'});
      return;
    }
    if(b.type!=='text' && b.type!=='code'){
      updateBlock({...b,type:'text',checked:undefined,children:undefined,
        emoji:undefined,color:b.color}); setFocus({id:b.id,pos:'start'}); return;
    }
    if(b.type==='code'){
      const nb=blocks.filter(x=>x.id!==b.id); setBlocksH(nb);
      if(i>0)setFocus({id:blocks[i-1].id,pos:'end'}); return;
    }
    if(i===0) return;
    const prev=blocks[i-1];
    if(['divider','image','file','bookmark','subpage','database'].includes(prev.type)){
      // delete the media block above instead
      setBlocksH(blocks.filter(x=>x.id!==prev.id)); return;
    }
    const merged={...prev,html:(prev.html||'')+(b.html||'')};
    const nb=blocks.filter(x=>x.id!==b.id).map(x=>x.id===prev.id?merged:x);
    setBlocksH(nb); setFocus({id:prev.id,pos:'end'});
  }
  // Delete at the end of a block — pull the next block's content up into it
  function onDeleteForward(b,el){
    const i=idx(b.id);
    const next=blocks[i+1];
    if(!next) return;
    if(['divider','image','file','bookmark','subpage'].includes(next.type)){
      // delete the media block below instead of merging
      setBlocksH(blocks.filter(x=>x.id!==next.id)); return;
    }
    if(next.type==='code'||next.type==='database') return;
    if(next.type==='toggle'&&(next.children||[]).length) return; // don't orphan its children
    // an empty current block just disappears; the next block keeps its type
    if(b.type==='text'&&!(b.html||'').replace(/<br\s*\/?>/gi,'').trim()){
      setBlocksH(blocks.filter(x=>x.id!==b.id));
      setFocus({id:next.id,pos:'start'}); return;
    }
    // merge, keeping the caret at the junction (this block stays focused, so
    // update its DOM directly — the state sync skips focused blocks)
    const junction=el?caretTextOffset(el):null;
    const merged={...b,html:(b.html||'')+(next.html||'')};
    if(el){ el.innerHTML=merged.html; if(junction!=null) setCaretTextOffset(el,junction); }
    setBlocksH(blocks.filter(x=>x.id!==next.id).map(x=>x.id===b.id?merged:x));
  }
  function onArrow(dir,b){
    const i=idx(b.id);
    const t=dir==='up'?i-1:i+1;
    if(t>=0&&t<blocks.length) setFocus({id:blocks[t].id,pos:'end'});
  }
  function onIndent(b,delta){
    const cur=b.depth||0;
    updateBlock({...b,depth:Math.max(0,Math.min(cur+delta,5))});
  }
  function blockAction(b,action,val){
    const i=idx(b.id);
    if(action==='delete'){
      const nb=blocks.filter(x=>x.id!==b.id);
      if(!nb.length)nb.push({id:nid(),type:'text',html:''});
      setBlocksH(nb); return;
    }
    if(action==='duplicate'){
      const copy={...clone(b),id:nid()};
      const nb=[...blocks]; nb.splice(i+1,0,copy); setBlocksH(nb); return;
    }
    if(action==='add-below'){
      insertAfter(b.id,{id:nid(),type:'text',html:''}); return;
    }
    if(action==='turn'){
      const patch={...b,type:val};
      if(val==='todo')patch.checked=patch.checked||false;
      if(val==='toggle'){patch.collapsed=false;patch.children=patch.children||[];}
      if(val==='callout')patch.emoji=patch.emoji||'💡';
      updateBlock(patch); return;
    }
    if(action==='color'){ updateBlock({...b,color:val}); return; }
    if(action==='bg'){ updateBlock({...b,bg:val,color:b.type==='callout'?val:b.color}); return; }
    if(action==='copylink'){ navigator.clipboard&&navigator.clipboard.writeText(
      location.href+'#'+b.id); return; }
  }
  // slash apply
  function applySlash(cmd){
    if(!slash) return;
    const b=blocks.find(x=>x.id===slash.blockId);
    if(!b){ setSlash(null); return; }
    // strip the "/query" from html
    const el=slash.el;
    let html=el?el.innerHTML:b.html||'';
    const tIdx=(el?el.textContent:'').lastIndexOf('/');
    // rebuild from textContent minus slash token, keep simple (drop formatting after slash)
    let text=el?el.textContent:'';
    if(tIdx>=0) text=text.slice(0,tIdx);
    setSlash(null);

    const mk=()=>{ // returns the new block to use
      const id=nid();
      switch(cmd.id){
        case 'text': case 'h1': case 'h2': case 'h3':
        case 'quote': return {id,type:cmd.id,html:''};
        case 'todo': return {id,type:'todo',html:'',checked:false};
        case 'bullet': return {id,type:'bullet',html:''};
        case 'number': return {id,type:'number',html:''};
        case 'toggle': return {id,type:'toggle',html:'',collapsed:false,children:[]};
        case 'callout': return {id,type:'callout',html:'',emoji:'💡',color:'gray'};
        case 'divider': return {id,type:'divider'};
        case 'image': return {id,type:'image',url:'',caption:''};
        case 'file': return {id,type:'file',url:'',fileName:'',fileType:'',fileSize:0};
        case 'bookmark': return {id,type:'bookmark',url:''};
        case 'code': return {id,type:'code',code:'',lang:'plain text'};
        case 'page': {
          const child=createChild(node.id);
          return {id,type:'subpage',pageId:child};
        }
        default:
          if(cmd.id.startsWith('db-')){
            return {id,type:'database',db:newDB(cmd.id.slice(3))};
          }
          return {id,type:'text',html:''};
      }
    };
    const nb=mk();
    if(text.trim()===''){
      // replace current block
      setBlocksH(blocks.map(x=>x.id===b.id?nb:x));
      if(['text','h1','h2','h3','quote','todo','bullet','number','toggle','callout'].includes(nb.type))
        setFocus({id:nb.id,pos:'start'});
    } else {
      // keep current text, insert new after
      const i=idx(b.id); const arr=[...blocks]; arr[i]={...b,html:text};
      arr.splice(i+1,0,nb); setBlocksH(arr);
      if(nb.type==='text') setFocus({id:nb.id,pos:'start'});
    }
  }
  // track slash query via input on the editing element
  useEffect(()=>{
    if(!slash) return;
    const el=slash.el;
    const read=()=>{
      const t=el.textContent||'';
      const m=t.match(/\/([a-z0-9 ]*)$/i);
      if(!m){ setSlash(s=>s?{...s}:s); setSlashQuery(null); return; }
      setSlashQuery(m[1]);
    };
    el.addEventListener('input',read);
    return ()=>el.removeEventListener('input',read);
  },[slash]);
  const [slashQuery,setSlashQuery]=useState('');

  // drag & drop blocks
  function onDragStart(e,b,i){ setDrag({dragId:b.id}); e.dataTransfer.effectAllowed='move'; }
  function onDragOver(e,b){
    if(!drag) return; e.preventDefault();
    const r=e.currentTarget.getBoundingClientRect();
    const pos=e.clientY<r.top+r.height/2?'above':'below';
    if(drag.overId!==b.id||drag.pos!==pos) setDrag({...drag,overId:b.id,pos});
  }
  function onDrop(e,b){
    if(!drag||drag.dragId===b.id){ setDrag(null); return; }
    e.preventDefault();
    const from=idx(drag.dragId);
    const moving=blocks[from];
    let rest=blocks.filter(x=>x.id!==drag.dragId);
    let ti=rest.findIndex(x=>x.id===b.id);
    if(drag.pos==='below')ti++;
    rest.splice(ti,0,moving);
    setBlocksH(rest); setDrag(null);
  }
  useEffect(()=>{ const end=()=>setDrag(null);
    document.addEventListener('dragend',end); return ()=>document.removeEventListener('dragend',end); },[]);

  // Clipboard image paste → auto-create image block
  const editorDivRef=useRef();
  useEffect(()=>{
    const el=editorDivRef.current; if(!el) return;
    function onPaste(e){
      const items=Array.from(e.clipboardData?.items||[]);
      const imgItem=items.find(i=>i.type.startsWith('image/')); if(!imgItem) return;
      e.preventDefault(); e.stopPropagation();
      const file=imgItem.getAsFile(); if(!file) return;
      (async()=>{
        const u=await onUploadFile?.(file);
        const imgBlk={id:nid(),type:'image',url:u?.url||'',caption:'',
          fileName:u?.name||`paste-${Date.now()}.png`,fileType:u?.type||file.type,
          fileSize:u?.size||file.size,uploadId:u?.id,localName:u?.localName};
        // insert after the currently focused block (detected via DOM data-block-id)
        let insertAt=blocks.length;
        const active=document.activeElement;
        if(active&&el.contains(active)){
          const blkEl=active.closest('[data-block-id]');
          if(blkEl){
            const i=blocks.findIndex(b=>b.id===blkEl.dataset.blockId);
            if(i>=0) insertAt=i+1;
          }
        }
        const nb=[...blocks]; nb.splice(insertAt,0,imgBlk); setBlocksH(nb);
        setFocus({id:imgBlk.id,pos:'end'});
      })();
    }
    el.addEventListener('paste',onPaste,true); // capture so we intercept before Editable
    return ()=>el.removeEventListener('paste',onPaste,true);
  },[blocks,onUploadFile]);

  // numbering for numbered lists
  const numbers=useMemo(()=>{
    const map={}; let counters={};
    blocks.forEach(b=>{
      if(b.type==='number'){ const d=b.depth||0;
        counters[d]=(counters[d]||0)+1; map[b.id]=counters[d];
        Object.keys(counters).forEach(k=>{if(+k>d)counters[k]=0;}); }
      else counters={};
    });
    return map;
  },[blocks]);

  return <div className="scroll" key={node.id}>
    {node.cover && <div className="cover" style={{background:node.cover}}>
      <div className="cover-tools">
        <button onClick={()=>setCoverPick(true)}>Change cover</button>
        <button onClick={()=>update(node.id,{cover:null})}>Remove</button>
      </div></div>}
    <div className="page-wrap">
      <div className="page-head">
        <div className={cx('icon-big',!node.cover&&'nocover')}
          onClick={e=>setIconPick(e.currentTarget.getBoundingClientRect())}>
          {node.icon||'📄'}</div>
        {iconPick&&<EmojiPicker rect={iconPick} onClose={()=>setIconPick(false)}
          onPick={em=>{update(node.id,{icon:em||'📄'});setIconPick(false);}}/>}
        <div className="page-meta-tools">
          {!node.icon&&<button className="meta-btn" onClick={e=>setIconPick(
            e.currentTarget.getBoundingClientRect())}>😀 Add icon</button>}
          {!node.cover&&<button className="meta-btn" onClick={()=>setCoverPick(true)}>
            <Ic n="image"/> Add cover</button>}
        </div>
        <textarea className="title-input" placeholder="Untitled" rows={1}
          value={node.title} onChange={e=>{update(node.id,{title:e.target.value});
            e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px';}}
          ref={el=>{if(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}}}
          onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();
            if(blocks[0])setFocus({id:blocks[0].id,pos:'start'}); }}}/>
      </div>

      {node.kind==='database'
        ? <div style={{paddingBottom:'30vh'}}><DatabaseView db={node.db}
            onChange={ndb=>update(node.id,{db:ndb})} openRow={openRow}/></div>
        : <div className={cx('editor',blockSel&&'bsel')} ref={editorDivRef}
        onMouseDown={onSelMouseDown}
        onClick={e=>{ if(e.target===e.currentTarget&&!blockSelRef.current) focusLastEditable(); }}>
        {blocks.map((b,i)=><Block key={b.id} block={b} index={i} depth={b.depth}
          listNumber={numbers[b.id]}
          selected={!!blockSel&&i>=Math.min(blockSel.a,blockSel.b)&&i<=Math.max(blockSel.a,blockSel.b)}
          onChange={updateBlock} onEnter={onEnter} onBackspace={onBackspace}
          onDeleteForward={onDeleteForward} onArrow={onArrow} onIndent={onIndent}
          focus={focus} setFocus={setFocus}
          onSlash={info=>{setSlash(info);setSlashQuery('');}}
          onBlockAction={blockAction} openPage={openPage} openRow={openRow}
          lookupNode={lookupNode}
          onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
          dragInfo={drag} onUploadFile={onUploadFile} uploads={uploads}/>)}
        <div className="blk editor-end-zone" onClick={focusLastEditable}>
          <div className="blk-body"><div className="ce" style={{color:'var(--text-3)',
            cursor:'text',minHeight:24}}> </div></div>
        </div>
        {(()=>{
          const embeddedIds=new Set(blocks.filter(b=>b.type==='subpage').map(b=>b.pageId));
          const unembedded=(childPages||[]).filter(n=>!embeddedIds.has(n.id));
          if(!unembedded.length) return null;
          return <div className="child-pages-list">
            {unembedded.map(child=>
              <div key={child.id} className="subpage child-page-row" onClick={()=>openPage(child.id)}>
                <span className="sp-emoji">{child.icon||'📄'}</span>
                <span className="sp-title">{child.title||'Untitled'}</span>
              </div>)}
          </div>;
        })()}
      </div>}
    </div>

    {slash&&<SlashMenu rect={slash.rect} query={slashQuery}
      onPick={applySlash} onClose={()=>setSlash(null)}/>}
    {coverPick&&<div className="overlay" onClick={()=>setCoverPick(false)}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-h"><h3>Choose a cover</h3>
          <button className="x" onClick={()=>setCoverPick(false)}><Ic n="x"/></button></div>
        <div className="cover-grid">{COVERS.map((c,i)=>
          <button key={i} style={{background:c}}
            onClick={()=>{update(node.id,{cover:c});setCoverPick(false);}}/>)}</div>
      </div></div>}
  </div>;
}

/* =========================================================================
   DATABASE — property cell editors
   ========================================================================= */
function colorVar(c){ return c&&c!=='default'?'var(--c-'+c+')':'var(--c-default)'; }

function SelectCell({prop,value,values,onSet,onProp,multi}){
  const [open,setOpen]=useState(null);
  const opts=prop.options||[];
  const cur=multi?(values||[]):(value?[value]:[]);
  const chips=cur.map(id=>opts.find(o=>o.id===id)).filter(Boolean);
  return <div className="chip-wrap" onClick={e=>setOpen(e.currentTarget.getBoundingClientRect())}>
    {chips.map(o=><span key={o.id} className="chip" style={{background:colorVar(o.color)}}>
      {prop.type==='status'&&<span className="status-dot"
        style={{background:o.color==='gray'?'#9b9a97':colorVar(o.color),filter:'brightness(.7)'}}/>}
      {o.name}</span>)}
    {!chips.length&&<span style={{color:'var(--text-3)'}}> </span>}
    {open&&<Popup rect={open} onClose={()=>setOpen(null)} width={230}>
      <div className="menu">
        <div className="menu-h">Select an option</div>
        {opts.map(o=><div key={o.id} className="mi"
          onMouseDown={e=>{e.preventDefault();
            if(multi){ const set=new Set(cur); set.has(o.id)?set.delete(o.id):set.add(o.id);
              onSet([...set]); }
            else { onSet(value===o.id?'':o.id); setOpen(null); } }}>
          <span className="chip" style={{background:colorVar(o.color)}}>{o.name}</span>
          {cur.includes(o.id)&&<span style={{marginLeft:'auto'}}><Ic n="check"
            style={{width:14,height:14}}/></span>}
        </div>)}
        <div className="menu-sep"/>
        <div className="mi" onMouseDown={e=>{e.preventDefault();
          const name=prompt('New option name'); if(!name)return;
          const o={id:nid(),name,color:SEL_COLORS[1+Math.floor(Math.random()*8)]};
          onProp({...prop,options:[...opts,o]});
          if(multi)onSet([...cur,o.id]); else { onSet(o.id); setOpen(null); }
        }}><div className="mi-ic"><Ic n="plus" style={{width:14,height:14}}/></div>
          <div className="mi-tx">Create new option</div></div>
      </div></Popup>}
  </div>;
}

function PropCell({prop,row,onSet,onProp}){
  const v=row.cells[prop.id];
  if(prop.type==='title')
    return <Editable html={v||''} className="cell-in" placeholder="Untitled"
      onInput={h=>onSet(h)}/>;
  if(prop.type==='text')
    return <Editable html={v||''} className="cell-in" placeholder=" "
      onInput={h=>onSet(h)}/>;
  if(prop.type==='number')
    return <div className="cell-in" contentEditable suppressContentEditableWarning
      onBlur={e=>onSet(e.currentTarget.textContent)}>{v||''}</div>;
  if(prop.type==='select'||prop.type==='status')
    return <SelectCell prop={prop} value={v} onSet={onSet} onProp={onProp}/>;
  if(prop.type==='multi')
    return <SelectCell prop={prop} values={v} onSet={onSet} onProp={onProp} multi/>;
  if(prop.type==='checkbox')
    return <div className="cell-in" style={{display:'flex'}}>
      <span className={cx('chk',v&&'on')} style={{cursor:'pointer'}}
        onClick={()=>onSet(!v)}><Ic n="check"/></span></div>;
  if(prop.type==='date')
    return <div className="cell-in" style={{position:'relative'}}>
      <input type="date" value={v||''} onChange={e=>onSet(e.target.value)}
        style={{border:'none',background:'transparent',color:'var(--text)',
          font:'inherit',outline:'none',width:'100%'}}/></div>;
  if(prop.type==='person')
    return <div className="cell-in" style={{display:'flex',alignItems:'center',gap:6}}>
      {v&&<span style={{width:20,height:20,borderRadius:'50%',
        background:'linear-gradient(135deg,#5b86e5,#36d1dc)',display:'flex',
        alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff'}}>
        {v[0].toUpperCase()}</span>}
      <span contentEditable suppressContentEditableWarning style={{outline:'none',flex:1}}
        onBlur={e=>onSet(e.currentTarget.textContent)}>{v||''}</span></div>;
  return <div className="cell-in">{v||''}</div>;
}

window.__NOTION_PART3_DONE=true;
/* =========================================================================
   DATABASE VIEW  — tabs + table/board/gallery/list/calendar
   ========================================================================= */
const PROP_TYPES=[
  ['text','Text','📝'],['number','Number','#'],['select','Select','▾'],
  ['status','Status','◔'],['multi','Multi-select','≣'],['date','Date','📅'],
  ['person','Person','👤'],['checkbox','Checkbox','☑'],
];
const VIEW_ICONS={table:'table',board:'board',gallery:'gallery',list:'list',calendar:'calendar'};

function DatabaseView({db,onChange,openRow,onDelete,onDuplicate}){
  const view=db.views.find(v=>v.id===db.activeView)||db.views[0];
  const [addProp,setAddProp]=useState(false);
  const [propMenu,setPropMenu]=useState(null); // {rect,prop}
  const [viewMenu,setViewMenu]=useState(false);
  const [filterUI,setFilterUI]=useState(false);
  const [dbCtx,setDbCtx]=useState(null);

  function exportCSV(){
    const header=db.props.map(p=>JSON.stringify(p.name)).join(',');
    const lines=db.rows.map(r=>db.props.map(p=>{
      const v=r.cells[p.id]||'';
      return JSON.stringify(Array.isArray(v)?v.join(', '):String(v));
    }).join(','));
    const blob=new Blob([header+'\n'+lines.join('\n')],{type:'text/csv'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download=(view.name||'table')+'.csv';a.click();
  }

  const set=patch=>onChange({...db,...patch});
  const setView=patch=>set({views:db.views.map(v=>v.id===view.id?{...v,...patch}:v)});
  const updateRow=r=>set({rows:db.rows.map(x=>x.id===r.id?r:x)});
  const setCell=(rowId,propId,val)=>set({rows:db.rows.map(r=>r.id===rowId?
    {...r,cells:{...r.cells,[propId]:val}}:r)});
  const setProp=p=>set({props:db.props.map(x=>x.id===p.id?p:x)});
  function addRow(preset){
    const r={id:nid(),icon:'📄',blocks:[],cells:{p_title:'',...(preset||{})}};
    set({rows:[...db.rows,r]});
    return r;
  }
  function addColumn(type){
    const p={id:nid(),name:PROP_TYPES.find(t=>t[0]===type)[1],type};
    if(type==='select'||type==='status'||type==='multi') p.options=[];
    set({props:[...db.props,p]});
    setAddProp(false);
  }
  function delColumn(pid){
    set({props:db.props.filter(p=>p.id!==pid)}); setPropMenu(null);
  }

  // filtered + sorted rows
  const rows=useMemo(()=>{
    let r=[...db.rows];
    if(view.sortProp){
      r.sort((a,b)=>{ const x=(a.cells[view.sortProp]||'')+'',y=(b.cells[view.sortProp]||'')+'';
        return view.sortDir==='desc'?y.localeCompare(x):x.localeCompare(y); });
    }
    return r;
  },[db.rows,view]);

  /* ---- view tab bar ---- */
  const bar=<div className="db-bar">
    {db.views.map(v=><div key={v.id}
      className={cx('db-tab',v.id===view.id&&'on')}
      onClick={()=>set({activeView:v.id})}
      onDoubleClick={()=>{ const n=prompt('Rename view',v.name);
        if(n)set({views:db.views.map(x=>x.id===v.id?{...x,name:n}:x)}); }}>
      <Ic n={VIEW_ICONS[v.type]}/>{v.name}</div>)}
    <div className="db-tool" onClick={e=>setViewMenu(e.currentTarget.getBoundingClientRect())}
      title="Add a view"><Ic n="plus"/></div>
    <div className="spacer"/>
    <div className={cx('db-tool',view.sortProp&&'acc')}
      onClick={e=>setFilterUI(e.currentTarget.getBoundingClientRect())}>
      <Ic n="sort"/>Sort</div>
    <div className="db-tool" onClick={()=>addRow()}>
      <Ic n="plus"/>New</div>
    {viewMenu&&<Popup rect={viewMenu} onClose={()=>setViewMenu(false)} width={180}>
      <div className="menu"><div className="menu-h">Add view</div>
        {Object.keys(VIEW_ICONS).map(t=><div key={t} className="mi"
          onMouseDown={e=>{e.preventDefault();
            const v={id:nid(),name:t[0].toUpperCase()+t.slice(1),type:t,
              groupProp:db.props.find(p=>p.type==='status'||p.type==='select')?.id};
            set({views:[...db.views,v],activeView:v.id}); setViewMenu(false);}}>
          <div className="mi-ic"><Ic n={VIEW_ICONS[t]} style={{width:14,height:14}}/></div>
          <div className="mi-tx" style={{textTransform:'capitalize'}}>{t}</div></div>)}
        {db.views.length>1&&<Fragment><div className="menu-sep"/>
          <div className="mi danger" onMouseDown={e=>{e.preventDefault();
            set({views:db.views.filter(v=>v.id!==view.id),
              activeView:db.views.find(v=>v.id!==view.id).id}); setViewMenu(false);}}>
            <div className="mi-ic"><Ic n="trash" style={{width:14,height:14}}/></div>
            <div className="mi-tx">Delete this view</div></div></Fragment>}
      </div></Popup>}
    {filterUI&&<Popup rect={filterUI} onClose={()=>setFilterUI(false)} width={220}>
      <div className="menu"><div className="menu-h">Sort by</div>
        <div className="mi" onMouseDown={e=>{e.preventDefault();setView({sortProp:null});setFilterUI(false);}}>
          <div className="mi-tx">None</div>{!view.sortProp&&<Ic n="check" style={{width:14,height:14}}/>}</div>
        {db.props.map(p=><div key={p.id} className="mi"
          onMouseDown={e=>{e.preventDefault();
            setView({sortProp:p.id,sortDir:view.sortProp===p.id&&view.sortDir==='asc'?'desc':'asc'});}}>
          <div className="mi-tx">{p.name}</div>
          {view.sortProp===p.id&&<span className="mi-kbd">{view.sortDir==='desc'?'Z→A':'A→Z'}</span>}
        </div>)}
      </div></Popup>}
  </div>;

  const propMenuPop = propMenu && <Popup rect={propMenu.rect} onClose={()=>setPropMenu(null)} width={220}>
    <div className="menu">
      <input className="fld" defaultValue={propMenu.prop.name} autoFocus
        style={{marginBottom:6}}
        onChange={e=>setProp({...propMenu.prop,name:e.target.value})}/>
      <div className="menu-h">Property type</div>
      {PROP_TYPES.map(([t,l,ic])=><div key={t} className="mi"
        onMouseDown={e=>{e.preventDefault();
          const np={...propMenu.prop,type:t};
          if((t==='select'||t==='status'||t==='multi')&&!np.options)np.options=[];
          setProp(np);setPropMenu(null);}}>
        <div className="mi-ic">{ic}</div><div className="mi-tx">{l}</div>
        {propMenu.prop.type===t&&<Ic n="check" style={{width:14,height:14}}/>}</div>)}
      {propMenu.prop.type!=='title'&&<Fragment><div className="menu-sep"/>
        <div className="mi danger" onMouseDown={e=>{e.preventDefault();delColumn(propMenu.prop.id);}}>
          <div className="mi-ic"><Ic n="trash" style={{width:14,height:14}}/></div>
          <div className="mi-tx">Delete property</div></div></Fragment>}
    </div></Popup>;

  /* ============ TABLE ============ */
  function TableV(){
    return <div className="tbl"><table><thead><tr>
      <th className="row-num"> </th>
      {db.props.map(p=><th key={p.id}>
        <div className="th-in" onClick={e=>setPropMenu({rect:e.currentTarget.getBoundingClientRect(),prop:p})}>
          <span>{PROP_TYPES.find(t=>t[0]===p.type)?.[2]||'≡'}</span>{p.name}</div></th>)}
      <th className="add-col" onClick={e=>setAddProp(e.currentTarget.getBoundingClientRect())}>
        <Ic n="plus" style={{width:14,height:14,margin:'0 auto'}}/></th>
    </tr></thead><tbody>
      {rows.map((r,i)=><tr key={r.id}>
        <td className="row-num">{i+1}</td>
        {db.props.map((p,pi)=><td key={p.id} className="cell">
          {pi===0
            ? <div style={{display:'flex',alignItems:'center'}}>
                <span style={{padding:'0 4px 0 8px',cursor:'pointer'}}
                  onClick={()=>openRow(db,r.id)}>{r.icon}</span>
                <div style={{flex:1}}><PropCell prop={p} row={r}
                  onSet={v=>setCell(r.id,p.id,v)} onProp={setProp}/></div>
                <button className="db-tool" style={{padding:'2px 6px',margin:'0 4px'}}
                  onClick={()=>openRow(db,r.id)}>Open</button>
              </div>
            : <PropCell prop={p} row={r} onSet={v=>setCell(r.id,p.id,v)} onProp={setProp}/>}
        </td>)}
        <td/>
      </tr>)}
    </tbody></table>
    <div className="db-addrow" onClick={()=>addRow()}><Ic n="plus"/>New row</div>
    </div>;
  }

  /* ============ BOARD ============ */
  function BoardV(){
    const gp=db.props.find(p=>p.id===view.groupProp)
      ||db.props.find(p=>p.type==='status'||p.type==='select');
    if(!gp) return <div className="empty-state">Add a Select or Status property to use Board view.</div>;
    const [bdrag,setBdrag]=useState(null);
    const opts=[...(gp.options||[]),{id:'__none',name:'No '+gp.name,color:'default'}];
    return <div className="board">
      {opts.map(o=>{
        const cards=rows.filter(r=>(r.cells[gp.id]||'__none')===o.id);
        return <div key={o.id} className="board-col"
          onDragOver={e=>{e.preventDefault();}}
          onDrop={e=>{ if(bdrag){ setCell(bdrag,gp.id,o.id==='__none'?'':o.id); setBdrag(null);} }}>
          <div className="board-col-h">
            <span className="chip" style={{background:colorVar(o.color)}}>{o.name}</span>
            <span className="cnt">{cards.length}</span></div>
          <div className="board-cards">
            {cards.map(r=><div key={r.id} className={cx('board-card',bdrag===r.id&&'dragging')}
              draggable onDragStart={()=>setBdrag(r.id)} onDragEnd={()=>setBdrag(null)}
              onClick={()=>openRow(db,r.id)}>
              <div className="bc-title">{r.icon} {r.cells.p_title||'Untitled'}</div>
              <div className="bc-props">
                {db.props.filter(p=>p.id!==gp.id&&p.type!=='title').map(p=>{
                  const v=r.cells[p.id]; if(!v)return null;
                  if(p.type==='select'||p.type==='status'){
                    const op=(p.options||[]).find(x=>x.id===v); if(!op)return null;
                    return <span key={p.id} className="chip"
                      style={{background:colorVar(op.color)}}>{op.name}</span>;
                  }
                  if(p.type==='date')return <span key={p.id} className="chip"
                    style={{background:'var(--c-default)'}}>📅 {fmtDate(v)}</span>;
                  if(p.type==='person')return <span key={p.id} className="chip"
                    style={{background:'var(--c-default)'}}>👤 {v}</span>;
                  if(p.type==='checkbox')return <span key={p.id} className="chip"
                    style={{background:'var(--c-default)'}}>{v?'☑':'☐'} {p.name}</span>;
                  return null;
                })}
              </div></div>)}
            <div className="board-add" onClick={()=>{ const r=addRow({[gp.id]:o.id==='__none'?'':o.id});
              openRow(db,r.id); }}><Ic n="plus" style={{width:14,height:14}}/>New</div>
          </div></div>;
      })}
    </div>;
  }

  /* ============ GALLERY ============ */
  function GalleryV(){
    return <div><div className="gallery">
      {rows.map(r=><div key={r.id} className="gcard" onClick={()=>openRow(db,r.id)}>
        <div className="gc-cover" style={{background:'var(--bg-input)'}}>{r.icon||'📄'}</div>
        <div className="gc-body">
          <div className="gc-title">{r.cells.p_title||'Untitled'}</div>
          <div className="bc-props">
            {db.props.filter(p=>p.type!=='title').slice(0,3).map(p=>{
              const v=r.cells[p.id]; if(!v)return null;
              if(p.type==='select'||p.type==='status'){
                const op=(p.options||[]).find(x=>x.id===v); if(!op)return null;
                return <span key={p.id} className="chip"
                  style={{background:colorVar(op.color)}}>{op.name}</span>;
              }
              return <span key={p.id} className="chip" style={{background:'var(--c-default)'}}>
                {p.type==='date'?fmtDate(v):(''+v)}</span>;
            })}
          </div></div></div>)}
    </div>
    <div className="db-addrow" style={{border:'none'}} onClick={()=>{const r=addRow();openRow(db,r.id);}}>
      <Ic n="plus"/>New card</div></div>;
  }

  /* ============ LIST ============ */
  function ListV(){
    return <div><div className="listv">
      {rows.map(r=><div key={r.id} className="list-item" onClick={()=>openRow(db,r.id)}>
        <span>{r.icon||'📄'}</span>
        <span className="li-title">{r.cells.p_title||'Untitled'}</span>
        <div className="li-props">
          {db.props.filter(p=>p.type!=='title').slice(0,3).map(p=>{
            const v=r.cells[p.id]; if(!v)return null;
            if(p.type==='select'||p.type==='status'){
              const op=(p.options||[]).find(x=>x.id===v); if(!op)return null;
              return <span key={p.id} className="chip"
                style={{background:colorVar(op.color)}}>{op.name}</span>;
            }
            return <span key={p.id} style={{color:'var(--text-3)',fontSize:13}}>
              {p.type==='date'?fmtDate(v):(''+v)}</span>;
          })}
        </div></div>)}
    </div>
    <div className="db-addrow" style={{border:'none'}} onClick={()=>{const r=addRow();openRow(db,r.id);}}>
      <Ic n="plus"/>New</div></div>;
  }

  /* ============ CALENDAR ============ */
  function CalendarV(){
    const dateProp=db.props.find(p=>p.type==='date');
    const [cur,setCur]=useState(()=>{const d=new Date();return {y:d.getFullYear(),m:d.getMonth()};});
    if(!dateProp) return <div className="empty-state">Add a Date property to use Calendar view.</div>;
    const first=new Date(cur.y,cur.m,1);
    const start=new Date(first); start.setDate(1-first.getDay());
    const cells=[]; for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);cells.push(d);}
    const tIso=todayISO();
    const byDay={}; rows.forEach(r=>{const v=r.cells[dateProp.id];if(v){(byDay[v]=byDay[v]||[]).push(r);}});
    return <div className="calv">
      <div className="cal-head">
        <b>{first.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</b>
        <button className="db-tool" onClick={()=>setCur(c=>{const m=c.m-1;
          return m<0?{y:c.y-1,m:11}:{y:c.y,m};})}><Ic n="back"/></button>
        <button className="db-tool" onClick={()=>{const d=new Date();
          setCur({y:d.getFullYear(),m:d.getMonth()});}}>Today</button>
        <button className="db-tool" onClick={()=>setCur(c=>{const m=c.m+1;
          return m>11?{y:c.y+1,m:0}:{y:c.y,m};})}><Ic n="fwd"/></button>
      </div>
      <div className="cal-grid">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>
          <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((d,i)=>{
          const iso=d.toISOString().slice(0,10);
          const evs=byDay[iso]||[];
          return <div key={i} className={cx('cal-cell',d.getMonth()!==cur.m&&'other')}
            onDoubleClick={()=>{const r=addRow({[dateProp.id]:iso});openRow(db,r.id);}}>
            <div className={cx('cal-num',iso===tIso&&'today')}>{d.getDate()}</div>
            {evs.map(r=><div key={r.id} className="cal-ev"
              onClick={()=>openRow(db,r.id)}>{r.icon} {r.cells.p_title||'Untitled'}</div>)}
          </div>;
        })}
      </div>
      <div className="tree-empty" style={{paddingLeft:0,marginTop:6}}>
        Double-click a day to add an entry.</div>
    </div>;
  }

  const dbCtxItems=[
    {header:'Table'},
    {label:'Rename view',action:()=>{
      const n=prompt('Rename view',view.name);
      if(n)set({views:db.views.map(v=>v.id===view.id?{...v,name:n}:v)});
    }},
    {label:'Add view',action:()=>{
      const el=document.querySelector('.db-bar .db-tool');
      if(el)setViewMenu(el.getBoundingClientRect());
    }},
    {sep:true},
    ...(onDuplicate?[{label:'Duplicate table',action:onDuplicate}]:[]),
    {label:'Export as CSV',action:exportCSV},
    ...(onDelete?[{sep:true},{label:'Delete table',action:onDelete,danger:true}]:[]),
  ];

  return <div className="db" onContextMenu={e=>{e.preventDefault();e.stopPropagation();setDbCtx({x:e.clientX,y:e.clientY});}}>
    {bar}
    {view.type==='table'&&<TableV/>}
    {view.type==='board'&&<BoardV/>}
    {view.type==='gallery'&&<GalleryV/>}
    {view.type==='list'&&<ListV/>}
    {view.type==='calendar'&&<CalendarV/>}
    {propMenuPop}
    {addProp&&<Popup rect={addProp} onClose={()=>setAddProp(false)} width={210}>
      <div className="menu"><div className="menu-h">New property</div>
        {PROP_TYPES.map(([t,l,ic])=><div key={t} className="mi"
          onMouseDown={e=>{e.preventDefault();addColumn(t);}}>
          <div className="mi-ic">{ic}</div><div className="mi-tx">{l}</div></div>)}
      </div></Popup>}
    {dbCtx&&<ContextMenu x={dbCtx.x} y={dbCtx.y} items={dbCtxItems} onClose={()=>setDbCtx(null)}/>}
  </div>;
}

/* =========================================================================
   ROW PEEK  — open a database row as a page
   ========================================================================= */
function RowPeek({db,row,onChange,onClose}){
  const set=patch=>onChange({...row,...patch});
  const setCell=(pid,val)=>onChange({...row,cells:{...row.cells,[pid]:val}});
  const [iconPick,setIconPick]=useState(false);
  return <div className="overlay" onClick={onClose}>
    <div className="modal peek" onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <div style={{display:'flex',gap:8,alignItems:'center',color:'var(--text-3)',fontSize:13}}>
          <Ic n="doc" style={{width:15,height:15}}/> Database entry</div>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>
      <div style={{padding:'18px 40px 30px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
          <span style={{fontSize:44,cursor:'pointer'}}
            onClick={e=>setIconPick(e.currentTarget.getBoundingClientRect())}>{row.icon||'📄'}</span>
          {iconPick&&<EmojiPicker rect={iconPick} onClose={()=>setIconPick(false)}
            onPick={em=>{set({icon:em||'📄'});setIconPick(false);}}/>}
        </div>
        <textarea className="title-input" placeholder="Untitled" rows={1}
          style={{fontSize:32}} value={row.cells.p_title||''}
          onChange={e=>setCell('p_title',e.target.value)}/>
        <div className="peek-props">
          {db.props.filter(p=>p.type!=='title').map(p=>
            <div key={p.id} className="peek-prop">
              <div className="pp-label">
                {PROP_TYPES.find(t=>t[0]===p.type)?.[2]||'≡'} {p.name}</div>
              <div className="pp-val">
                <PropCell prop={p} row={row} onSet={v=>setCell(p.id,v)}
                  onProp={np=>onChange({...row})}/>
              </div>
            </div>)}
        </div>
        <div style={{borderTop:'1px solid var(--border)',marginTop:10,paddingTop:14}}>
          <div className="menu-h" style={{padding:'0 0 6px'}}>NOTES</div>
          <Editable html={row.notes||''} placeholder="Add notes for this entry…"
            style={{minHeight:80}} onInput={h=>set({notes:h})}/>
        </div>
      </div>
    </div>
  </div>;
}

window.__NOTION_PART4_DONE=true;
/* =========================================================================
   PART 5 — Sidebar, Topbar, Modals, App
   ========================================================================= */

/* ---------------- Workspace Switcher popup ---------------- */
function WorkspaceSwitcher({workspaces,activeId,onSwitch,onCreate,onDelete,onReconnect,onClose,rect}){
  const localSupported=isLocalFSSupported();
  return <Popup rect={rect} onClose={onClose} width={300}>
    <div className="menu">
      <div className="menu-h">Switch workspace</div>
      {(workspaces||[]).map(ws=>{
        const isLocal=ws.type==='local';
        const isDemo=ws.type==='demo';
        const localUnavailable=isLocal&&!localSupported;
        const needsAccess=isLocal&&!localUnavailable&&ws.accessible===false;
        const avatarBg=isDemo?'linear-gradient(135deg,#f59e0b,#fbbf24)'
          :isLocal?'linear-gradient(135deg,#7c3aed,#a78bfa)':GDRIVE.gradient;
        const subtitle=isDemo?'🧪 Demo — not saved'
          :isLocal?'💻 Local folder':`${GDRIVE.emoji} Google Drive`;
        const avatarLabel=isDemo?'🧪':isLocal?'💻':GDRIVE.emoji;
        return <div key={ws.id} className={cx('mi',ws.id===activeId&&'hi')} style={{gap:0,paddingRight:6}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flex:1,
            cursor:localUnavailable?'not-allowed':'pointer',minWidth:0,
            opacity:(needsAccess||localUnavailable)?.6:1}}
            onMouseDown={e=>{
              e.preventDefault();
              if(localUnavailable){ alert(LOCAL_FS_UNSUPPORTED_MSG); onClose(); return; }
              if(needsAccess){ onReconnect&&onReconnect(ws.id); onClose(); return; }
              if(ws.id!==activeId) onSwitch(ws.id);
              onClose();
            }}>
            <div className="mi-ic ws-ic" style={{background:avatarBg,color:'#fff',fontWeight:700,
              fontSize:16,border:'none',borderRadius:6,flexShrink:0}}>{avatarLabel}</div>
            <div className="mi-tx" style={{minWidth:0}}>{ws.name}
              <small style={{display:'flex',alignItems:'center',gap:4}}>
                {localUnavailable&&<span style={{color:'#d4894c'}}>💻 Local — needs Chrome / Edge</span>}
                {needsAccess&&<span style={{color:'#d44c47'}}>🔒 Needs access — click to reconnect</span>}
                {!needsAccess&&!localUnavailable&&subtitle}
              </small>
            </div>
            {ws.id===activeId&&<Ic n="check" style={{width:14,height:14,color:'var(--accent)',flexShrink:0}}/>}
          </div>
          {!isDemo&&<button className="icon-btn" style={{width:22,height:22,flexShrink:0,marginLeft:4}}
            title={isLocal?'Remove local workspace from list (files are not deleted)':'Remove Drive workspace from list (folder is not deleted)'}
            onMouseDown={e=>{e.preventDefault();e.stopPropagation();onDelete(ws.id);onClose();}}>
            <Ic n="trash" style={{width:12,height:12,color:'#d44c47'}}/>
          </button>}
        </div>;
      })}
      <div className="menu-sep"/>
      <div className="mi" onMouseDown={e=>{e.preventDefault();onCreate();onClose();}}>
        <div className="mi-ic"><Ic n="plus" style={{width:15,height:15}}/></div>
        <div className="mi-tx">Connect a workspace…</div>
      </div>
    </div>
  </Popup>;
}

function TreeItem({node,nodes,depth,currentId,expanded,toggleExp,openPage,addChild,
  trashNode,archiveNode,onDrop,setModal,favorites,toggleFav,duplicate,exportPage,renameNode}){
  const kids=Object.values(nodes).filter(n=>n.parentId===node.id&&!n.trashed&&!n.archived)
    .sort((a,b)=>(a.sort||0)-(b.sort||0));
  const hasKids=kids.length>0;
  const isOpen=expanded[node.id];
  const [dragOver,setDragOver]=React.useState(false);
  const [ctxMenu,setCtxMenu]=React.useState(null);
  const isFav=(favorites||[]).includes(node.id);
  const isRoot=!node.parentId;

  function openCtx(e){
    e.preventDefault();e.stopPropagation();
    setCtxMenu({x:e.clientX,y:e.clientY});
  }

  const ctxItems=[
    {header: node.kind==='database'?'Database':'Page'},
    {label:'Open',action:()=>openPage(node.id)},
    {label:'Rename',action:()=>{
      const t=prompt('Rename',node.title||'');
      if(t!==null&&t.trim()!=='') renameNode&&renameNode(node.id,t.trim());
    }},
    {sep:true},
    {label:'Add sub-page',action:()=>{toggleExp(node.id,true);addChild(node.id);}},
    {label:'Duplicate',action:()=>duplicate&&duplicate(node.id)},
    {label:'Export as Markdown',action:()=>exportPage&&exportPage(node.id)},
    {sep:true},
    {label:isFav?'Remove from Favorites':'Add to Favorites',action:()=>toggleFav&&toggleFav(node.id)},
    {label:'Copy link',action:()=>navigator.clipboard?.writeText(window.location.href+'#'+node.id)},
    {sep:true},
    {label:'Archive',action:()=>archiveNode&&archiveNode(node.id)},
    {label:'Move to Trash',action:()=>trashNode&&trashNode(node.id),danger:true},
  ];

  return <div>
    <div className={cx('tree-item',currentId===node.id&&'sel',dragOver&&'drop-target')}
      style={{paddingLeft:8+depth*16}}
      draggable
      onDragStart={e=>{e.dataTransfer.setData('node',node.id);e.stopPropagation();}}
      onDragOver={e=>{e.preventDefault();setDragOver(true);}}
      onDragLeave={()=>setDragOver(false)}
      onDrop={e=>{e.preventDefault();e.stopPropagation();setDragOver(false);
        const id=e.dataTransfer.getData('node'); if(id&&id!==node.id) onDrop(id,node.id);}}
      onClick={()=>openPage(node.id)}
      onContextMenu={openCtx}>
      {hasKids
        ? <span className={cx('twist',isOpen&&'open')}
            onClick={e=>{e.stopPropagation();toggleExp(node.id);}}>
            <Ic n="chevron"/></span>
        : <span className="twist blank"/>}
      <span className="tree-emoji">{node.icon||(node.kind==='database'?'🗄️':'📄')}</span>
      <span className="tree-label">{node.title||'Untitled'}</span>
      <span className="tree-actions">
        <button title="More options" onClick={openCtx}>
          <Ic n="dots"/></button>
        <button title="Add page inside" onClick={e=>{e.stopPropagation();
          toggleExp(node.id,true);addChild(node.id);}}>
          <Ic n="plus"/></button>
      </span>
    </div>
    {isOpen&&hasKids&&kids.map(k=>
      <TreeItem key={k.id} node={k} nodes={nodes} depth={depth+1} currentId={currentId}
        expanded={expanded} toggleExp={toggleExp} openPage={openPage}
        addChild={addChild} trashNode={trashNode} archiveNode={archiveNode} onDrop={onDrop}
        setModal={setModal} favorites={favorites} toggleFav={toggleFav}
        duplicate={duplicate} exportPage={exportPage} renameNode={renameNode}/>)}
    {ctxMenu&&<ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={()=>setCtxMenu(null)}/>}
  </div>;
}

/* ---------------- Sidebar ---------------- */
function Sidebar({open,nodes,favorites,currentId,expanded,toggleExp,openPage,addChild,
  trashNode,archiveNode,onDrop,addTop,setModal,workspaces,activeWorkspaceId,
  onSwitchWorkspace,onCreateWorkspace,onDeleteWorkspace,onReconnectLocal,
  toggleFav,duplicate,exportPage,renameNode,onGoHome}){
  const roots=Object.values(nodes)
    .filter(n=>n.parentId===null&&!n.trashed&&!n.archived)
    .sort((a,b)=>(a.sort||0)-(b.sort||0));
  const favNodes=favorites.map(id=>nodes[id]).filter(n=>n&&!n.trashed&&!n.archived);
  const [wsPop,setWsPop]=React.useState(null);
  const activeWs=(workspaces||[]).find(w=>w.id===activeWorkspaceId)||{id:'',name:'Workspace',type:'local'};
  const wsSub=activeWs.type==='demo'?'🧪 Demo — not saved'
    :activeWs.type==='gdrive'?`${GDRIVE.emoji} Google Drive`:'💻 Local folder';
  const navRow=(icon,label,onClick,kbd,active)=>
    <div className={cx('tree-item',active&&'sel')} onClick={onClick}>
      <span className="tree-emoji" style={{fontSize:14}}><Ic n={icon==='layout'?'template':icon==='edit'?'plus':icon==='close'?'x':icon}/></span>
      <span className="tree-label">{label}</span>
      {kbd&&<span style={{fontSize:11,color:'var(--text-3)'}}>{kbd}</span>}
    </div>;
  return <div className={cx('sidebar',!open&&'closed')}>
    <div className="ws">
      <div className="ws-btn" onClick={e=>setWsPop(e.currentTarget.getBoundingClientRect())}
        title="Switch workspace">
        <div className="ws-ava">{(activeWs.name||'W')[0].toUpperCase()}</div>
        <div className="ws-name">{activeWs.name}
          <small>{wsSub}</small>
        </div>
      </div>
      {wsPop&&<WorkspaceSwitcher rect={wsPop} workspaces={workspaces||[activeWs]}
        activeId={activeWorkspaceId} onSwitch={onSwitchWorkspace}
        onCreate={onCreateWorkspace} onDelete={onDeleteWorkspace}
        onReconnect={onReconnectLocal}
        onClose={()=>setWsPop(null)}/>}
    </div>
    <div className="nav">
      <button className="new-page-btn" onClick={()=>addTop()} title={`Create a new page (${fmtShortcut('Alt + N')})`}>
        <span className="np-ic"><Ic n="plus"/></span>
        <span className="np-label">New page</span>
        <span className="np-kbd">{fmtShortcut('Alt + N')}</span>
      </button>
      {navRow('search','Search',()=>setModal({type:'search'}),fmtShortcut('Ctrl/⌘ + K'))}
      {navRow('dashboard','Home',()=>openPage(DASH_ID),null,currentId===DASH_ID)}
    </div>
    <div className="nav-scroll">
      {favNodes.length>0&&<>
        <div className="sec-title"><span>Favorites</span></div>
        <div className="nav">
          {favNodes.map(n=>
            <div key={n.id} className={cx('tree-item',currentId===n.id&&'sel')}
              onClick={()=>openPage(n.id)}>
              <span className="twist"/>
              <span className="tree-emoji">{n.icon||'📄'}</span>
              <span className="tree-label">{n.title||'Untitled'}</span>
            </div>)}
        </div>
      </>}

      <div className="sec-title"><span>Pages</span>
        <button title="Add a page" onClick={()=>addTop()}><Ic n="plus"/></button>
      </div>
      <div className="nav">
        {roots.map(n=>
          <TreeItem key={n.id} node={n} nodes={nodes} depth={0} currentId={currentId}
            expanded={expanded} toggleExp={toggleExp} openPage={openPage}
            addChild={addChild} trashNode={trashNode} archiveNode={archiveNode} onDrop={onDrop}
            setModal={setModal} favorites={favorites} toggleFav={toggleFav}
            duplicate={duplicate} exportPage={exportPage} renameNode={renameNode}/>)}
        {roots.length===0&&<div className="tree-empty">No pages yet</div>}
      </div>

      <div className="nav" style={{marginTop:10}}>
        {navRow('layout','Templates',()=>openPage(TEMPLATES_ID),null,currentId===TEMPLATES_ID)}
        {navRow('import','Import',()=>setModal({type:'import'}))}
        {navRow('database','Storage',()=>openPage(STORAGE_ID),null,currentId===STORAGE_ID)}
        {navRow('archive','Archive',()=>openPage(ARCHIVE_ID),null,currentId===ARCHIVE_ID)}
        {navRow('trash','Trash',()=>openPage(TRASH_ID),null,currentId===TRASH_ID)}
      </div>
    </div>
    <div className="sidebar-foot">
      {navRow('settings','Settings',()=>setModal({type:'settings'}))}
      {navRow('keyboard','Keyboard shortcuts',()=>setModal({type:'shortcuts'}),fmtShortcut('Ctrl/⌘ + /'))}
      <div className="tree-item ws-close" onClick={onGoHome}
        title="Close this workspace and return to the homepage">
        <span className="tree-emoji" style={{fontSize:14}}><Ic n="log-out"/></span>
        <span className="tree-label">Close workspace</span>
      </div>
    </div>
  </div>;
}

/* =========================================================================
   STORAGE PAGE  — shows all uploaded files for the active workspace
   ========================================================================= */
/* ---- Grid card (medium) ---- */
/* ---- File preview modal ---- */
const FP_MIN_W=280, FP_MAX_W=900, FP_DEFAULT_W=400;

function FilePreviewModal({upload,onClose,onPrev,onNext,hasPrev,hasNext}){
  /* 'panel' = right-side drawer (default), 'modal' = centred overlay */
  const [mode,setMode]=useState(()=>{
    try{return localStorage.getItem('fp-view-mode')||'panel';}catch{return'panel';}
  });
  const [panelW,setPanelW]=useState(()=>{
    try{return Math.min(FP_MAX_W,Math.max(FP_MIN_W,+localStorage.getItem('fp-panel-w')||FP_DEFAULT_W));}
    catch{return FP_DEFAULT_W;}
  });
  const dragRef=useRef(null);

  function toggleMode(){
    const next=mode==='panel'?'modal':'panel';
    setMode(next);
    try{localStorage.setItem('fp-view-mode',next);}catch{}
  }

  /* drag-to-resize the panel */
  function onResizeMouseDown(e){
    e.preventDefault();
    const startX=e.clientX;
    const startW=panelW;
    function onMove(ev){
      const newW=Math.min(FP_MAX_W,Math.max(FP_MIN_W,startW+(startX-ev.clientX)));
      setPanelW(newW);
    }
    function onUp(){
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
      setPanelW(w=>{
        try{localStorage.setItem('fp-panel-w',w);}catch{}
        return w;
      });
      document.body.style.cursor='';
      document.body.style.userSelect='';
    }
    document.body.style.cursor='ew-resize';
    document.body.style.userSelect='none';
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  }

  useEffect(()=>{
    const k=e=>{
      if(e.key==='Escape') onClose();
      if(e.key==='ArrowLeft'&&hasPrev) onPrev?.();
      if(e.key==='ArrowRight'&&hasNext) onNext?.();
    };
    document.addEventListener('keydown',k,true);
    return ()=>document.removeEventListener('keydown',k,true);
  },[hasPrev,hasNext]);

  /* push the .main area to the left when the panel is open */
  const isPanel=mode==='panel';
  useEffect(()=>{
    const main=document.querySelector('.main');
    if(!main) return;
    if(isPanel){
      document.documentElement.style.setProperty('--fp-panel-w',panelW+'px');
      main.classList.add('fp-panel-open');
    } else {
      main.classList.remove('fp-panel-open');
    }
    return ()=>{ main.classList.remove('fp-panel-open'); };
  },[isPanel,panelW]);

  const isImg=upload.type?.startsWith('image/');
  const isVideo=upload.type?.startsWith('video/');
  const isAudio=upload.type?.startsWith('audio/');
  const isPdf=upload.type==='application/pdf';
  const isText=upload.type?.startsWith('text/');
  const maxH=isPanel?'calc(100vh - 120px)':'calc(80vh - 100px)';

  function renderBody(){
    if(isImg) return <img src={upload.dataUrl} alt={upload.name}
      style={{maxWidth:'100%',maxHeight:maxH,objectFit:'contain',borderRadius:6}}/>;
    if(isVideo) return <video src={upload.dataUrl} controls autoPlay
      style={{maxWidth:'100%',maxHeight:maxH,borderRadius:6}}/>;
    if(isAudio) return <div style={{width:'100%',padding:'40px 0',textAlign:'center'}}>
      <div style={{fontSize:48,marginBottom:16}}>🎵</div>
      <audio src={upload.dataUrl} controls style={{width:'100%'}}/></div>;
    if(isPdf) return <iframe src={upload.dataUrl} title={upload.name}
      style={{width:'100%',height:maxH,border:'none',borderRadius:6}}/>;
    if(isText) return <pre style={{
      width:'100%',maxHeight:maxH,overflow:'auto',
      background:'var(--bg-input)',borderRadius:6,padding:16,
      fontSize:13,fontFamily:'var(--mono)',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
      {atob(upload.dataUrl.split(',')[1]||'')}
    </pre>;
    return <div style={{padding:'48px 0',textAlign:'center'}}>
      <div style={{fontSize:56,marginBottom:12}}>{FILE_ICON(upload.type)}</div>
      <div style={{color:'var(--text-2)',fontSize:14,marginBottom:20}}>No preview available.</div>
      <a href={upload.dataUrl} download={upload.name} className="btn primary"
        style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px'}}>
        <Ic n="download" style={{width:14,height:14}}/> Download to view
      </a>
    </div>;
  }

  const metaLine=<>
    {fmtBytes(upload.size||0)}
    {upload.uploadedAt?' · '+new Date(upload.uploadedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''}
  </>;

  const toggleBtn=<button className="icon-btn fp-mode-btn"
    title={isPanel?'Expand to overlay':'Move to side panel'} onClick={toggleMode}
    style={{width:30,height:30}}>
    {isPanel ? <Maximize2 size={14}/> : <PanelRight size={14}/>}
  </button>;

  const downloadBtn=<a href={upload.dataUrl} download={upload.name} className="btn ghost"
    style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',fontSize:12}}>
    <Ic n="download" style={{width:13,height:13}}/> Download
  </a>;

  const closeBtn=<button className="icon-btn" style={{width:30,height:30}} title="Close (Esc)" onClick={onClose}>
    <Ic n="x" style={{width:15,height:15}}/>
  </button>;

  const navButtons=(hasPrev||hasNext)&&<>
    <button className="btn ghost" disabled={!hasPrev} onClick={onPrev}
      style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',fontSize:12}}>
      <Ic n="back" style={{width:13,height:13}}/> Previous
    </button>
    <button className="btn ghost" disabled={!hasNext} onClick={onNext}
      style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',fontSize:12}}>
      Next <Ic n="fwd" style={{width:13,height:13}}/>
    </button>
  </>;

  /* ── RIGHT-SIDE PANEL ── */
  if(isPanel) return createPortal(
    <div className="fp-panel" style={{width:panelW}} ref={dragRef}>
      {/* drag handle on left edge */}
      <div className="fp-resize-handle" onMouseDown={onResizeMouseDown} title="Drag to resize"/>
      <div className="fp-panel-header">
        <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
          <span style={{fontSize:18,flexShrink:0}}>{FILE_ICON(upload.type)}</span>
          <div style={{minWidth:0}}>
            <div className="fp-panel-filename">{upload.name}</div>
            <div className="preview-filemeta">{metaLine}</div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
          {toggleBtn}{downloadBtn}{closeBtn}
        </div>
      </div>
      <div className="fp-panel-body">{renderBody()}</div>
      {navButtons&&<div className="preview-nav">{navButtons}</div>}
    </div>,
    document.body
  );

  /* ── CENTRED OVERLAY ── */
  return createPortal(
    <div className="preview-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="preview-modal">
        <div className="preview-header">
          <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
            <span style={{fontSize:18}}>{FILE_ICON(upload.type)}</span>
            <div style={{minWidth:0}}>
              <div className="preview-filename">{upload.name}</div>
              <div className="preview-filemeta">{metaLine}</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
            {toggleBtn}{downloadBtn}{closeBtn}
          </div>
        </div>
        <div className="preview-body">{renderBody()}</div>
        {navButtons&&<div className="preview-nav">{navButtons}</div>}
      </div>
    </div>,
    document.body
  );
}

function UploadCard({upload,onDelete,onPreview}){
  const isImg=upload.type?.startsWith('image/');
  return <div className="upload-card">
    <div className="uc-thumb" onClick={onPreview} style={{cursor:'pointer',position:'relative'}}>
      {isImg
        ? <img src={upload.dataUrl} alt={upload.name} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:6}}/>
        : <div className="uc-icon" style={{'--fc-accent':fileAccentColor(upload.type)}}>{FILE_ICON(upload.type)}</div>}
      <div className="uc-preview-hint"><Eye size={14}/></div>
    </div>
    <div className="uc-info">
      <div className="uc-name" title={upload.name}>{upload.name}</div>
      <div className="uc-meta">
        {fmtBytes(upload.size||0)}
        {upload.uploadedAt?' · '+new Date(upload.uploadedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''}
      </div>
    </div>
    <div className="uc-actions">
      <button className="icon-btn" style={{width:28,height:28}} title="Preview" onClick={onPreview}>
        <Ic n="eye" style={{width:13,height:13}}/>
      </button>
      <a href={upload.dataUrl} download={upload.name} className="icon-btn" title="Download"
        style={{display:'flex',alignItems:'center',justifyContent:'center',width:28,height:28}}>
        <Ic n="download" style={{width:13,height:13}}/>
      </a>
      <button className="icon-btn" style={{width:28,height:28}} title="Delete" onClick={onDelete}>
        <Ic n="trash" style={{width:13,height:13,color:'#d44c47'}}/>
      </button>
    </div>
  </div>;
}

/* ---- Large gallery card ---- */
function UploadCardLarge({upload,onDelete,onPreview}){
  const isImg=upload.type?.startsWith('image/');
  return <div className="upload-card-large">
    <div className="ucl-thumb" onClick={onPreview} style={{cursor:'pointer',position:'relative'}}>
      {isImg
        ? <img src={upload.dataUrl} alt={upload.name}/>
        : <div className="ucl-icon" style={{'--fc-accent':fileAccentColor(upload.type)}}>{FILE_ICON(upload.type)}</div>}
      <div className="uc-preview-hint"><Eye size={16}/></div>
    </div>
    <div className="ucl-footer">
      <div style={{flex:1,minWidth:0}}>
        <div className="ucl-name" title={upload.name}>{upload.name}</div>
        <div className="uc-meta">{fmtBytes(upload.size||0)}</div>
      </div>
      <div style={{display:'flex',gap:2,flexShrink:0}}>
        <button className="icon-btn" style={{width:26,height:26}} title="Preview" onClick={onPreview}>
          <Ic n="eye" style={{width:12,height:12}}/>
        </button>
        <a href={upload.dataUrl} download={upload.name} className="icon-btn" title="Download"
          style={{display:'flex',alignItems:'center',justifyContent:'center',width:26,height:26}}>
          <Ic n="download" style={{width:12,height:12}}/>
        </a>
        <button className="icon-btn" style={{width:26,height:26}} title="Delete" onClick={onDelete}>
          <Ic n="trash" style={{width:12,height:12,color:'#d44c47'}}/>
        </button>
      </div>
    </div>
  </div>;
}

/* ---- List row ---- */
function UploadListRow({upload,onDelete,onPreview}){
  const isImg=upload.type?.startsWith('image/');
  const ext=upload.type?.split('/').pop()||'file';
  const date=upload.uploadedAt?new Date(upload.uploadedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
  return <div className="ul-row">
    <div className="ul-name-cell" onClick={onPreview} style={{cursor:'pointer'}}>
      {isImg
        ? <img src={upload.dataUrl} alt="" className="ul-thumb"/>
        : <span className="ul-file-icon" style={{'--fc-accent':fileAccentColor(upload.type)}}>{FILE_ICON(upload.type)}</span>}
      <span className="ul-fname" title={upload.name}>{upload.name}</span>
    </div>
    <span className="ul-ext">{ext.toUpperCase()}</span>
    <span className="ul-size">{fmtBytes(upload.size||0)}</span>
    <span className="ul-date">{date}</span>
    <div className="ul-actions">
      <button className="icon-btn" style={{width:26,height:26}} title="Preview" onClick={onPreview}>
        <Ic n="eye" style={{width:13,height:13}}/>
      </button>
      <a href={upload.dataUrl} download={upload.name} className="icon-btn" title="Download"
        style={{display:'flex',alignItems:'center',justifyContent:'center',width:26,height:26}}>
        <Ic n="download" style={{width:13,height:13}}/>
      </a>
      <button className="icon-btn" style={{width:26,height:26}} title="Delete" onClick={onDelete}>
        <Ic n="trash" style={{width:13,height:13,color:'#d44c47'}}/>
      </button>
    </div>
  </div>;
}

function StoragePage({uploads,activeWorkspace,onDeleteUpload,onUpload}){
  const [filter,setFilter]=useState('all');
  const [view,setView]=useState('grid'); // 'grid' | 'list' | 'large'
  const [uploading,setUploading]=useState(false);
  const [previewId,setPreviewId]=useState(null);
  const uploadRef=useRef();
  const sorted=[...(uploads||[])].sort((a,b)=>b.uploadedAt-a.uploadedAt);
  const filtered=filter==='all'?sorted
    :filter==='images'?sorted.filter(u=>u.type?.startsWith('image/'))
    :sorted.filter(u=>!u.type?.startsWith('image/'));
  const totalSize=(uploads||[]).reduce((s,u)=>s+(u.size||0),0);
  const previewIdx=filtered.findIndex(u=>u.id===previewId);
  const previewUpload=previewIdx>=0?filtered[previewIdx]:null;

  async function handleFiles(files){
    setUploading(true);
    for(const file of Array.from(files)){
      await onUpload?.(file);
    }
    setUploading(false);
  }

  let locationIcon,locationLabel,locationDetail,folderPath;
  if(activeWorkspace?.type==='gdrive'){
    locationIcon='📁'; locationLabel='Google Drive';
    folderPath=(activeWorkspace.name||'Workspace')+' / Upload';
    locationDetail='Files are stored in your Google Drive workspace under an Upload/ folder.';
  } else {
    locationIcon='💻'; locationLabel='Local folder';
    folderPath=(activeWorkspace?.name||'Workspace')+' / Upload';
    locationDetail='Files are stored in your local workspace folder under an Upload/ subfolder.';
  }

  const VIEW_BTNS=[
    {id:'grid',   icon:'gallery', title:'Grid view'},
    {id:'list',   icon:'list',    title:'List view'},
    {id:'large',  icon:'expand',  title:'Gallery view'},
  ];

  return <div className="storage-page scroll">
    <div className="page-wrap">
      <div className="storage-pg-head">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div className="storage-pg-icon">📦</div>
            <h1 className="storage-pg-title">Storage</h1>
          </div>
          <button className="btn primary" style={{display:'flex',alignItems:'center',gap:6,padding:'7px 14px'}}
            onClick={()=>uploadRef.current?.click()} disabled={uploading}>
            <Ic n="import" style={{width:14,height:14}}/>
            {uploading?'Uploading…':'Upload files'}
          </button>
          <input ref={uploadRef} type="file" multiple style={{display:'none'}}
            onChange={e=>{if(e.target.files?.length) handleFiles(e.target.files); e.target.value='';}}/>
        </div>
        <div className="storage-loc-row">
          <div className="storage-loc-badge">
            <span>{locationIcon}</span>
            <span>{locationLabel}</span>
          </div>
          <div className="storage-loc-path">{folderPath}</div>
          <div className="storage-loc-desc">{locationDetail}</div>
        </div>
      </div>

      <div className="storage-stats-row">
        <div className="st-stat">
          <span className="st-n">{(uploads||[]).length}</span>
          <span className="st-l">Files uploaded</span>
        </div>
        <div className="st-stat">
          <span className="st-n">{fmtBytes(totalSize)}</span>
          <span className="st-l">Total size</span>
        </div>
        <div className="st-stat">
          <span className="st-n">{(uploads||[]).filter(u=>u.type?.startsWith('image/')).length}</span>
          <span className="st-l">Images</span>
        </div>
      </div>

      {(uploads||[]).length===0
        ? <div className="empty-state" style={{marginTop:60}}>
            <div className="es-em">📦</div>
            <b>No uploads yet</b>
            <p>Upload files directly using the button above, or attach them in any page using the image block or the <code>/file</code> command.</p>
            <button className="btn primary" style={{display:'flex',alignItems:'center',gap:6,padding:'8px 18px',margin:'12px auto 0'}}
              onClick={()=>uploadRef.current?.click()} disabled={uploading}>
              <Ic n="import" style={{width:14,height:14}}/>
              {uploading?'Uploading…':'Upload files'}
            </button>
          </div>
        : <>
            {/* toolbar: filters + view toggle */}
            <div className="storage-toolbar">
              <div className="storage-filters">
                {[['all','All files'],['images','🖼️ Images'],['docs','📄 Documents']].map(([f,l])=>
                  <button key={f} className={cx('storage-filter-btn',filter===f&&'on')} onClick={()=>setFilter(f)}>{l}</button>
                )}
              </div>
              <div className="storage-view-toggle">
                {VIEW_BTNS.map(v=>
                  <button key={v.id} className={cx('svt-btn',view===v.id&&'on')}
                    title={v.title} onClick={()=>setView(v.id)}>
                    <Ic n={v.icon} style={{width:15,height:15}}/>
                  </button>
                )}
              </div>
            </div>

            {filtered.length===0
              ? <div className="empty-state" style={{marginTop:40}}>
                  <div className="es-em">🔍</div>
                  <b>No {filter==='images'?'images':'documents'} uploaded yet</b>
                </div>
              : view==='grid'
              ? <div className="upload-grid">
                  {filtered.map(u=><UploadCard key={u.id} upload={u}
                    onDelete={()=>onDeleteUpload(u.id)} onPreview={()=>setPreviewId(u.id)}/>)}
                </div>
              : view==='large'
              ? <div className="upload-grid-large">
                  {filtered.map(u=><UploadCardLarge key={u.id} upload={u}
                    onDelete={()=>onDeleteUpload(u.id)} onPreview={()=>setPreviewId(u.id)}/>)}
                </div>
              : /* list view */
                <div className="upload-list">
                  <div className="ul-header">
                    <span>Name</span><span>Type</span><span>Size</span><span>Date</span><span/>
                  </div>
                  {filtered.map(u=><UploadListRow key={u.id} upload={u}
                    onDelete={()=>onDeleteUpload(u.id)} onPreview={()=>setPreviewId(u.id)}/>)}
                </div>}
          </>}
    </div>
    {previewUpload&&<FilePreviewModal
      upload={previewUpload}
      onClose={()=>setPreviewId(null)}
      hasPrev={previewIdx>0}
      hasNext={previewIdx<filtered.length-1}
      onPrev={()=>setPreviewId(filtered[previewIdx-1].id)}
      onNext={()=>setPreviewId(filtered[previewIdx+1].id)}
    />}
  </div>;
}

/* ---------------- Storage location badge ---------------- */
function StorageBadge({ws, onCreateWorkspace, onGoHome, saveState}) {
  const [pop, setPop] = useState(null);
  if (!ws) return null;
  const isLocal = ws.type === 'local';
  const isDemo = ws.type === 'demo';
  const label = isDemo ? 'Demo' : isLocal ? 'Local' : GDRIVE.shortName;
  const detail = isDemo ? 'Demo — nothing is saved' : isLocal ? 'Saved on this computer' : `Saved to ${GDRIVE.name}`;
  const BIcon = isDemo ? <span style={{fontSize:11,lineHeight:1}}>🧪</span>
    : isLocal ? <HardDrive size={12}/> : <span style={{fontSize:11,lineHeight:1}}>{GDRIVE.emoji}</span>;
  const where = isLocal ? 'your local folder' : GDRIVE.name;
  return <>
    <div className="storage-badge" onClick={e=>setPop(e.currentTarget.getBoundingClientRect())}
      title={`Storage: ${detail}`}>
      {BIcon}
      <span>{label}</span>
    </div>
    {saveState&&<div className={cx('save-pill',saveState)}
      title={saveState==='demo'?'You’re in the demo — changes are not saved. Use “Keep this workspace” to save your work.'
        :saveState==='saving'?`Saving your changes to ${where}…`
        :saveState==='error'?`Could not save to ${where} — your changes are still here. Check your connection or reconnect.`
        :`All changes saved to ${where}.`}>
      {saveState==='saving'?<span className="save-spin"/>
        :saveState==='error'||saveState==='demo'?<Ic n="x" style={{width:13,height:13}}/>
        :<Ic n="check" style={{width:13,height:13}}/>}
      <span className="save-pill-tx">{saveState==='saving'?'Saving…':saveState==='error'?'Unsaved':saveState==='demo'?'Not saved':'Saved'}</span>
    </div>}
    {pop&&<Popup rect={pop} onClose={()=>setPop(null)} width={250}>
      <div style={{padding:'14px 16px 10px'}}>
        <div style={{fontSize:10,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',
          letterSpacing:'.06em',marginBottom:10}}>{isDemo?'Storage':'Saved to'}</div>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
          <div style={{width:40,height:40,borderRadius:10,flexShrink:0,display:'flex',
            alignItems:'center',justifyContent:'center',fontSize:22,
            background: isDemo?'linear-gradient(135deg,#f59e0b,#fbbf24)'
              :isLocal?'linear-gradient(135deg,#7c3aed,#a78bfa)':GDRIVE.gradient}}>
            {isDemo?'🧪':isLocal?'💻':GDRIVE.emoji}
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontWeight:600,fontSize:14,whiteSpace:'nowrap',overflow:'hidden',
              textOverflow:'ellipsis'}}>{detail}</div>
            <div style={{fontSize:11,color:'var(--text-3)',marginTop:2,whiteSpace:'nowrap',
              overflow:'hidden',textOverflow:'ellipsis'}}>{ws.name}</div>
          </div>
        </div>
        <div className="menu-sep"/>
        <div className="mi" style={{borderRadius:7,marginTop:4}}
          onMouseDown={e=>{e.preventDefault();setPop(null);onCreateWorkspace();}}>
          <div className="mi-ic"><Plus size={14}/></div>
          <div className="mi-tx">{isDemo?'Keep this workspace…':'Connect another workspace…'}</div>
        </div>
        {onGoHome&&<div className="mi" style={{borderRadius:7}}
          onMouseDown={e=>{e.preventDefault();setPop(null);onGoHome();}}>
          <div className="mi-ic"><Home size={14}/></div>
          <div className="mi-tx">Close &amp; go to homepage</div>
        </div>}
      </div>
    </Popup>}
  </>;
}



/* ---------------- Topbar ---------------- */
function Topbar({node,nodes,openPage,toggleSidebar,sidebarOpen,toggleFav,isFav,setModal,
  downloadPage,activeWorkspace,onGoHome,saveState}){
  const chain=[]; let c=node;
  while(c){ chain.unshift(c); c=c.parentId?nodes[c.parentId]:null; }
  const [dlMenu,setDlMenu]=useState(null);
  // On-disk location of the current page within the local workspace folder.
  const diskPath=activeWorkspace?.type==='local'&&node
    ? `${activeWorkspace.name}/${nodeDiskPath({nodes},node.id)}` : null;
  return <div className="topbar">
    {!sidebarOpen&&<div className="tb-btn" title="Open sidebar" onClick={toggleSidebar}>
      <Ic n="menu" style={{width:17,height:17}}/></div>}
    <div className="crumbs">
      {chain.map((n,i)=><React.Fragment key={n.id}>
        {i>0&&<span className="crumb-sep">/</span>}
        <div className="crumb" onClick={()=>openPage(n.id)}>
          <span>{n.icon||'📄'}</span>
          <span>{n.title||'Untitled'}</span>
        </div>
      </React.Fragment>)}
    </div>
    {diskPath&&<div className="file-loc" title={"Location inside your workspace folder:\n"+diskPath}
      onClick={()=>navigator.clipboard?.writeText(diskPath)}
      style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--text-3)',
        fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace',cursor:'copy',
        maxWidth:340,minWidth:0,marginLeft:6}}>
      <HardDrive size={12} style={{flexShrink:0}}/>
      <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{diskPath}</span>
    </div>}
    <StorageBadge ws={activeWorkspace} onCreateWorkspace={()=>setModal({type:'create-workspace'})}
      onGoHome={onGoHome} saveState={saveState}/>
    <div className="topbar-actions">
      <div className="tb-btn" title={isFav?'Favorited':'Add to Favorites'}
        onClick={()=>toggleFav(node.id)} style={{color:isFav?'#eab308':undefined}}>
        <Ic n="star" style={{width:17,height:17}}/></div>
      {downloadPage&&<div className="tb-btn" title="Download page"
        onClick={e=>setDlMenu(e.currentTarget.getBoundingClientRect())}>
        <Ic n="download" style={{width:17,height:17}}/>
      </div>}
      {dlMenu&&(()=>{
        const hasSub=Object.values(nodes).some(n=>n.parentId===node.id&&!n.trashed&&!n.archived);
        const fmtRow=(fmt,icon,label,ext,withSub)=>
          <div className="mi" onMouseDown={e=>{e.preventDefault();downloadPage(node.id,fmt,withSub);setDlMenu(null);}}>
            <div className="mi-ic">{icon}</div>
            <div className="mi-tx">{label}<small style={{color:'var(--text-3)'}}>{ext}</small></div>
          </div>;
        return <Popup rect={dlMenu} onClose={()=>setDlMenu(null)} width={230}>
          <div className="menu">
            <div className="menu-h">This page only</div>
            {fmtRow('md','📝','Markdown','.md',false)}
            {fmtRow('txt','📄','Plain text','.txt',false)}
            {fmtRow('html','🌐','HTML','.html',false)}
            {hasSub&&<>
              <div className="menu-sep"/>
              <div className="menu-h">With all sub-pages</div>
              {fmtRow('md','📝','Markdown','.md',true)}
              {fmtRow('txt','📄','Plain text','.txt',true)}
              {fmtRow('html','🌐','HTML  + TOC','.html',true)}
            </>}
          </div>
        </Popup>;
      })()}
      <div className="tb-btn" title="History & more" onClick={()=>setModal({type:'page-menu'})}>
        <Ic n="dots" style={{width:17,height:17}}/></div>
    </div>
  </div>;
}

/* ---------------- Search modal ---------------- */
/* =========================================================================
   FILE IMPORT HELPERS
   ========================================================================= */
function inlineToHtml(t){
  return (t||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g,(_,a,b)=>`<strong>${a||b}</strong>`)
    .replace(/\*(.+?)\*|_(.+?)_/g,(_,a,b)=>`<em>${a||b}</em>`)
    .replace(/~~(.+?)~~/g,'<s>$1</s>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>');
}

// shared helper: headers[] + rows[][] → database block
function buildTableBlock(headers,rows){
  const titleId=nid();
  const extraProps=headers.slice(1).map(h=>({id:nid(),name:h||'Column',type:'text'}));
  const props=[{id:titleId,name:headers[0]||'Name',type:'title'},...extraProps];
  const viewId=nid();
  const dbRows=rows.map(cells=>({
    id:nid(),icon:'📄',blocks:[],
    cells:Object.fromEntries([
      [titleId,cells[0]||''],
      ...extraProps.map((p,i)=>[p.id,cells[i+1]||''])
    ])
  }));
  return {id:nid(),type:'database',db:{
    props,rows:dbRows,
    views:[{id:viewId,name:'Table',type:'table'}],
    activeView:viewId
  }};
}

function markdownToBlocks(md){
  const lines=(md||'').split('\n');
  const blocks=[];
  let i=0;
  while(i<lines.length){
    const l=lines[i];
    // fenced code block
    if(l.startsWith('```')){
      const lang=l.slice(3).trim()||'plain text';
      const code=[];i++;
      while(i<lines.length&&!lines[i].startsWith('```')){code.push(lines[i]);i++;}
      blocks.push({id:nid(),type:'code',code:code.join('\n'),lang});
      i++;continue;
    }
    // table: one or more lines starting with |
    if(l.trim().startsWith('|')){
      const pipeLines=[];
      while(i<lines.length&&lines[i].trim().startsWith('|')){
        pipeLines.push(lines[i].trim());i++;
      }
      const parseCells=row=>row.split('|').slice(1,-1).map(c=>c.trim());
      // separator rows contain only |, -, :, space
      const isSep=row=>!row.replace(/[\|\-\:\s]/g,'').length;
      const dataRows=pipeLines.filter(r=>!isSep(r));
      if(dataRows.length>=1){
        const headers=parseCells(dataRows[0]);
        const bodyRows=dataRows.slice(1).map(parseCells);
        blocks.push(buildTableBlock(headers,bodyRows));
      }
      continue;
    }
    // headings
    if(/^(#{1,6}) /.test(l)){
      const lvl=l.match(/^(#+)/)[1].length;
      const t=l.replace(/^#+\s/,'');
      blocks.push({id:nid(),type:lvl===1?'h1':lvl===2?'h2':'h3',html:inlineToHtml(t)});
      i++;continue;
    }
    if(/^[-*_]{3,}\s*$/.test(l)){blocks.push({id:nid(),type:'divider'});i++;continue;}
    if(l.startsWith('> ')){blocks.push({id:nid(),type:'quote',html:inlineToHtml(l.slice(2))});i++;continue;}
    const todoM=l.match(/^[-*] \[([ xX])\] (.*)/);
    if(todoM){blocks.push({id:nid(),type:'todo',html:inlineToHtml(todoM[2]),checked:todoM[1].toLowerCase()==='x'});i++;continue;}
    if(/^[-*] /.test(l)){blocks.push({id:nid(),type:'bullet',html:inlineToHtml(l.replace(/^[-*] /,''))});i++;continue;}
    if(/^\d+\. /.test(l)){blocks.push({id:nid(),type:'number',html:inlineToHtml(l.replace(/^\d+\. /,''))});i++;continue;}
    if(l.trim()===''){blocks.push({id:nid(),type:'text',html:''});i++;continue;}
    blocks.push({id:nid(),type:'text',html:inlineToHtml(l)});
    i++;
  }
  return blocks.length?blocks:[{id:nid(),type:'text',html:''}];
}

function htmlToBlocks(htmlStr){
  const wrap=document.createElement('div');
  wrap.innerHTML=htmlStr;
  const out=[];
  function walk(el){
    for(const n of el.childNodes){
      if(n.nodeType===3){const t=n.textContent.trim();if(t)out.push({id:nid(),type:'text',html:t});continue;}
      if(n.nodeType!==1)continue;
      const tag=n.tagName.toLowerCase();
      if(tag==='h1'){out.push({id:nid(),type:'h1',html:n.innerHTML});continue;}
      if(tag==='h2'){out.push({id:nid(),type:'h2',html:n.innerHTML});continue;}
      if(['h3','h4','h5','h6'].includes(tag)){out.push({id:nid(),type:'h3',html:n.innerHTML});continue;}
      if(tag==='hr'){out.push({id:nid(),type:'divider'});continue;}
      if(tag==='blockquote'){out.push({id:nid(),type:'quote',html:n.textContent.trim()});continue;}
      if(tag==='pre'){
        const c=n.querySelector('code');
        const lang=(c?.className||'').replace(/language-/,'').trim()||'plain text';
        out.push({id:nid(),type:'code',code:(c||n).textContent,lang});continue;
      }
      if(tag==='table'){
        const headers=[];
        const rows=[];
        // collect header cells from thead or first tr
        const thead=n.querySelector('thead');
        const headerRow=thead
          ? thead.querySelector('tr')
          : n.querySelector('tr');
        if(headerRow){
          headerRow.querySelectorAll('th,td').forEach(c=>headers.push(c.textContent.trim()));
        }
        // collect body rows (skip the header row)
        const allRows=Array.from(n.querySelectorAll('tr'));
        const bodyRows=thead?Array.from((n.querySelector('tbody')||n).querySelectorAll('tr')):allRows.slice(1);
        bodyRows.forEach(tr=>{
          const cells=[];
          tr.querySelectorAll('td,th').forEach(c=>cells.push(c.textContent.trim()));
          if(cells.some(c=>c)) rows.push(cells);
        });
        if(headers.length) out.push(buildTableBlock(headers,rows));
        continue;
      }
      if(tag==='ul'||tag==='ol'){
        const bt=tag==='ul'?'bullet':'number';
        for(const li of n.children){
          if(li.tagName.toLowerCase()!=='li')continue;
          const cb=li.querySelector('input[type=checkbox]');
          if(cb){out.push({id:nid(),type:'todo',html:li.textContent.trim(),checked:cb.checked});}
          else{const cl=li.cloneNode(true);cl.querySelectorAll('ul,ol').forEach(x=>x.remove());
            out.push({id:nid(),type:bt,html:cl.innerHTML.trim()});}
        }
        continue;
      }
      if(tag==='p'){const h=n.innerHTML.trim();out.push({id:nid(),type:'text',html:h});continue;}
      if(tag==='br'){out.push({id:nid(),type:'text',html:''});continue;}
      if(['head','script','style','nav','footer'].includes(tag)) continue;
      walk(n);
    }
  }
  walk(wrap);
  return out.length?out:[{id:nid(),type:'text',html:''}];
}

/* ---------------- Import file modal ---------------- */
function ImportModal({onImport,onClose}){
  const [drag,setDrag]=React.useState(false);
  const [busy,setBusy]=React.useState(false);
  const [err,setErr]=React.useState('');
  const fileRef=React.useRef();

  async function process(file){
    if(!file)return;
    setBusy(true);setErr('');
    try{
      const ext=file.name.split('.').pop().toLowerCase();
      const baseName=file.name.replace(/\.[^/.]+$/,'');
      let title=baseName;
      let blocks;

      if(ext==='md'){
        const text=await file.text();
        const lines=text.split('\n');
        if(lines[0]?.startsWith('# ')){title=lines[0].slice(2).trim();lines.shift();}
        blocks=markdownToBlocks(lines.join('\n'));
      } else if(ext==='txt'){
        const text=await file.text();
        blocks=text.split('\n').map(l=>({id:nid(),type:'text',html:inlineToHtml(l)}));
      } else if(ext==='html'||ext==='htm'){
        const text=await file.text();
        const m=text.match(/<title[^>]*>([^<]+)<\/title>/i);
        if(m)title=m[1].trim();
        blocks=htmlToBlocks(text);
      } else if(ext==='docx'){
        const buf=await file.arrayBuffer();
        const m=await import('mammoth/mammoth.browser');
        const mammoth=m.default||m;
        const res=await mammoth.convertToHtml({arrayBuffer:buf});
        blocks=htmlToBlocks(res.value);
      } else {
        throw new Error('Unsupported format — use .md, .txt, .html, or .docx');
      }

      onImport({title,blocks});
      onClose();
    }catch(e){
      setErr(e.message||'Import failed');
    }finally{
      setBusy(false);
    }
  }

  return <div className="overlay" onClick={onClose}>
    <div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <h3>Import file</h3>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>
      <div style={{padding:'20px 24px 24px'}}>
        <div className={cx('import-zone',drag&&'drag-over',busy&&'import-busy')}
          onDragOver={e=>{e.preventDefault();setDrag(true);}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);process(e.dataTransfer.files[0]);}}
          onClick={()=>!busy&&fileRef.current?.click()}>
          {busy
            ? <><div className="import-ic">⏳</div><p>Importing…</p></>
            : <><div className="import-ic">📂</div>
                <p><strong>Drop a file here</strong> or <span className="import-link">click to browse</span></p>
                <p className="import-formats">.md &nbsp;·&nbsp; .txt &nbsp;·&nbsp; .html &nbsp;·&nbsp; .docx</p></>}
        </div>
        {err&&<div className="import-err">{err}</div>}
        <input ref={fileRef} type="file" style={{display:'none'}}
          accept=".md,.txt,.html,.htm,.docx"
          onChange={e=>process(e.target.files?.[0])}/>
      </div>
    </div>
  </div>;
}

function SearchModal({nodes,openPage,onClose}){
  const [q,setQ]=React.useState('');
  const [hi,setHi]=React.useState(0);
  const inRef=React.useRef();
  React.useEffect(()=>{inRef.current&&inRef.current.focus();},[]);
  const strip=h=>(h||'').replace(/<[^>]+>/g,'');
  const all=Object.values(nodes).filter(n=>!n.trashed);
  const results=React.useMemo(()=>{
    const term=q.trim().toLowerCase();
    if(!term) return all.slice(0,8).map(n=>({n,snippet:''}));
    const out=[];
    all.forEach(n=>{
      const title=(n.title||'').toLowerCase();
      let snippet='';
      if(title.includes(term)) snippet='';
      else{
        const blk=(n.blocks||[]).find(b=>strip(b.html).toLowerCase().includes(term));
        if(blk) snippet=strip(blk.html);
        else return;
      }
      out.push({n,snippet});
    });
    return out.slice(0,30);
  },[q]);
  const path=n=>{const p=[];let c=n.parentId?nodes[n.parentId]:null;
    while(c){p.unshift(c.title||'Untitled');c=c.parentId?nodes[c.parentId]:null;}
    return p.join(' / ');};
  const go=i=>{const r=results[i]; if(r){openPage(r.n.id);onClose();}};
  return <div className="overlay" onClick={onClose}>
    <div className="modal" style={{width:620}} onClick={e=>e.stopPropagation()}>
      <div className="search-in">
        <Ic n="search"/>
        <input ref={inRef} placeholder="Search pages and content…" value={q}
          onChange={e=>{setQ(e.target.value);setHi(0);}}
          onKeyDown={e=>{
            if(e.key==='ArrowDown'){e.preventDefault();setHi(h=>Math.min(h+1,results.length-1));}
            else if(e.key==='ArrowUp'){e.preventDefault();setHi(h=>Math.max(h-1,0));}
            else if(e.key==='Enter'){e.preventDefault();go(hi);}
            else if(e.key==='Escape') onClose();}}/>
      </div>
      <div className="search-res">
        {results.length===0&&<div className="search-empty">No results for “{q}”</div>}
        {results.map((r,i)=>
          <div key={r.n.id} className={cx('sr',i===hi&&'hi')}
            onMouseEnter={()=>setHi(i)} onClick={()=>go(i)}>
            <span className="sr-em">{r.n.icon||'📄'}</span>
            <div className="sr-tx">
              <b>{r.n.title||'Untitled'}</b>
              {r.snippet&&<small>{r.snippet}</small>}
            </div>
            {path(r.n)&&<span className="sr-path">{path(r.n)}</span>}
          </div>)}
      </div>
      <div className="search-foot">
        <span><kbd>↑↓</kbd> Navigate</span>
        <span><kbd>↵</kbd> Open</span>
        <span><kbd>Esc</kbd> Close</span>
      </div>
    </div>
  </div>;
}

/* ---------------- Trash modal ---------------- */
/* Full-page list of trashed / archived pages (shared layout). */
function BinPage({emoji,title,subtitle,folder,rows,searchLabel,emptyText,onPrimary,primaryLabel,onDelete}){
  const [q,setQ]=React.useState('');
  const list=rows.filter(n=>(n.title||'').toLowerCase().includes(q.toLowerCase()));
  return <div className="binpage">
    <div className="binpage-head">
      <div className="binpage-title"><span className="binpage-em">{emoji}</span>{title}</div>
      <div className="binpage-sub">{subtitle} Kept in the <code>{folder}/</code> folder.</div>
    </div>
    <div className="binpage-tools">
      <div className="search-in"><Ic n="search"/>
        <input placeholder={searchLabel} value={q} onChange={e=>setQ(e.target.value)}/></div>
      <span className="binpage-count">{list.length} item{list.length!==1?'s':''}</span>
    </div>
    {list.length===0
      ? <div className="binpage-empty"><div className="bpe-em">{emoji}</div><b>{emptyText}</b></div>
      : <div className="binpage-list">
          {list.map(n=>
            <div key={n.id} className="bp-row">
              <span className="bp-em">{n.icon||(n.kind==='database'?'🗄️':'📄')}</span>
              <div className="bp-tx"><b>{n.title||'Untitled'}</b>
                <small>{n.kind==='database'?'Database':'Page'}</small></div>
              <button className="btn ghost" onClick={()=>onPrimary(n.id)}>{primaryLabel}</button>
              <button className="btn ghost" style={{color:'#d44c47'}} onClick={()=>onDelete(n.id)}>Delete</button>
            </div>)}
        </div>}
  </div>;
}

function TrashPage({nodes,restore,deleteForever}){
  return <BinPage emoji="🗑️" title="Trash" folder="trash"
    subtitle="Deleted pages you can restore or remove permanently."
    searchLabel="Search in Trash…" emptyText="Trash is empty"
    rows={Object.values(nodes).filter(n=>n.trashed)}
    primaryLabel="Restore" onPrimary={restore} onDelete={deleteForever}/>;
}

/* ---------------- Archive modal ---------------- */
function ArchivePage({nodes,unarchiveNode,deleteForever}){
  return <BinPage emoji="📦" title="Archive" folder="archive"
    subtitle="Archived pages you can restore to your workspace."
    searchLabel="Search in Archive…" emptyText="Archive is empty"
    rows={Object.values(nodes).filter(n=>n.archived&&!n.trashed)}
    primaryLabel="Restore" onPrimary={unarchiveNode} onDelete={deleteForever}/>;
}

/* ---------------- Templates modal ---------------- */
const TEMPLATE_CATS=[
  {id:'all',label:'All'},
  {id:'basics',label:'Basics'},
  {id:'personal',label:'Personal'},
  {id:'work',label:'Work'},
  {id:'learning',label:'Learning'},
  {id:'planning',label:'Planning'},
];

const TEMPLATES=[
  /* ── Basics ─────────────────────────────────────── */
  {id:'blank',cat:'basics',icon:'📄',color:'#94a3b8',name:'Blank page',
    desc:'A clean slate — just start writing.',
    tags:['text'],
    blocks:[{type:'text',html:''}]},

  {id:'quick-note',cat:'basics',icon:'⚡',color:'#f59e0b',name:'Quick note',
    desc:'Jot down a thought before it disappears.',
    tags:['text'],
    blocks:[
      {type:'h1',html:'Untitled'},
      {type:'text',html:''},
    ]},

  {id:'todo',cat:'basics',icon:'✅',color:'#22c55e',name:'To-do list',
    desc:'A focused checklist to clear your head.',
    tags:['todo'],
    blocks:[
      {type:'h1',html:'To-do list'},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
    ]},

  /* ── Personal ────────────────────────────────────── */
  {id:'daily-journal',cat:'personal',icon:'🌅',color:'#f97316',name:'Daily journal',
    desc:'Morning check-in, gratitude, highlights, and tomorrow\'s focus.',
    tags:['h3','bullet','todo'],
    blocks:[
      {type:'h1',html:'Daily Journal'},
      {type:'callout',html:'<strong>Date:</strong> &nbsp;&nbsp;&nbsp; <strong>Mood:</strong> 😊',emoji:'🗓️',color:'yellow'},
      {type:'h3',html:'Morning intention'},
      {type:'quote',html:'What do I want to achieve today?'},
      {type:'text',html:''},
      {type:'h3',html:'Grateful for'},
      {type:'bullet',html:''},
      {type:'bullet',html:''},
      {type:'bullet',html:''},
      {type:'h3',html:'Highlights of the day'},
      {type:'text',html:''},
      {type:'h3',html:'Tomorrow\'s focus'},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
    ]},

  {id:'weekly-review',cat:'personal',icon:'📅',color:'#8b5cf6',name:'Weekly review',
    desc:'Reflect on the week, celebrate wins, and plan ahead.',
    tags:['h2','bullet','todo'],
    blocks:[
      {type:'h1',html:'Weekly Review'},
      {type:'callout',html:'Week of:&nbsp;',emoji:'📅',color:'purple'},
      {type:'h2',html:'✅ What went well'},
      {type:'bullet',html:''},
      {type:'bullet',html:''},
      {type:'h2',html:'🔄 What to improve'},
      {type:'bullet',html:''},
      {type:'bullet',html:''},
      {type:'h2',html:'🎯 Top 3 priorities for next week'},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'h2',html:'💡 Key insights'},
      {type:'text',html:''},
    ]},

  {id:'goal-tracker',cat:'personal',icon:'🎯',color:'#10b981',name:'Goal tracker',
    desc:'Define a goal, break it into milestones, track progress.',
    tags:['callout','todo','numbered'],
    blocks:[
      {type:'h1',html:'Goal Tracker'},
      {type:'callout',html:'<strong>Goal:</strong> ',emoji:'🎯',color:'green'},
      {type:'text',html:'<strong>Why it matters:</strong> '},
      {type:'text',html:'<strong>Deadline:</strong> '},
      {type:'divider',html:''},
      {type:'h2',html:'Milestones'},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'h2',html:'Action steps'},
      {type:'numbered',html:''},
      {type:'numbered',html:''},
      {type:'numbered',html:''},
      {type:'h2',html:'Progress notes'},
      {type:'text',html:''},
    ]},

  /* ── Work ────────────────────────────────────────── */
  {id:'meeting-notes',cat:'work',icon:'🤝',color:'#3b82f6',name:'Meeting notes',
    desc:'Agenda, discussion points, decisions, and action items.',
    tags:['h2','numbered','todo'],
    blocks:[
      {type:'h1',html:'Meeting Notes'},
      {type:'callout',html:'<strong>Date:</strong> &nbsp;&nbsp; <strong>Attendees:</strong> ',emoji:'🤝',color:'blue'},
      {type:'text',html:'<strong>Type:</strong> &nbsp;&nbsp;&nbsp; <strong>Duration:</strong> '},
      {type:'divider',html:''},
      {type:'h2',html:'Agenda'},
      {type:'numbered',html:''},
      {type:'numbered',html:''},
      {type:'h2',html:'Notes'},
      {type:'text',html:''},
      {type:'h2',html:'Decisions made'},
      {type:'bullet',html:''},
      {type:'h2',html:'Action items'},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'h2',html:'Next meeting'},
      {type:'text',html:''},
    ]},

  {id:'project-brief',cat:'work',icon:'🚀',color:'#6366f1',name:'Project brief',
    desc:'Overview, goals, scope, stakeholders, timeline, and risks.',
    tags:['h2','callout','bullet'],
    blocks:[
      {type:'h1',html:'Project Brief'},
      {type:'callout',html:'One-line summary of what this project is and why it matters.',emoji:'🚀',color:'purple'},
      {type:'h2',html:'Problem statement'},
      {type:'text',html:'What problem are we solving? Who does it affect?'},
      {type:'h2',html:'Goals & success metrics'},
      {type:'bullet',html:'Goal 1 — '},
      {type:'bullet',html:'Goal 2 — '},
      {type:'h2',html:'Scope'},
      {type:'callout',html:'<strong>In scope:</strong> ',emoji:'✅',color:'green'},
      {type:'callout',html:'<strong>Out of scope:</strong> ',emoji:'🚫',color:'red'},
      {type:'h2',html:'Stakeholders'},
      {type:'bullet',html:'<strong>Owner:</strong> '},
      {type:'bullet',html:'<strong>Team:</strong> '},
      {type:'h2',html:'Timeline'},
      {type:'text',html:'<strong>Start:</strong> &nbsp;&nbsp; <strong>Target launch:</strong> '},
      {type:'h2',html:'Risks & mitigations'},
      {type:'bullet',html:''},
    ]},

  {id:'one-on-one',cat:'work',icon:'💬',color:'#0ea5e9',name:'1:1 Notes',
    desc:'Check-in, agenda, talking points, feedback, and follow-ups.',
    tags:['h2','bullet','todo'],
    blocks:[
      {type:'h1',html:'1:1 Notes'},
      {type:'callout',html:'<strong>With:</strong> &nbsp;&nbsp;&nbsp; <strong>Date:</strong> ',emoji:'💬',color:'blue'},
      {type:'h2',html:'How are things?'},
      {type:'text',html:''},
      {type:'h2',html:'Their agenda'},
      {type:'bullet',html:''},
      {type:'h2',html:'My agenda'},
      {type:'bullet',html:''},
      {type:'h2',html:'Feedback & recognition'},
      {type:'text',html:''},
      {type:'h2',html:'Action items'},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
    ]},

  {id:'sprint-plan',cat:'work',icon:'⚡',color:'#f43f5e',name:'Sprint planning',
    desc:'Sprint goal, committed stories, stretch items, and blockers.',
    tags:['callout','todo','bullet'],
    blocks:[
      {type:'h1',html:'Sprint Planning'},
      {type:'callout',html:'<strong>Sprint:</strong> &nbsp;&nbsp; <strong>Dates:</strong> &nbsp;&nbsp; <strong>Team:</strong> ',emoji:'⚡',color:'red'},
      {type:'h2',html:'Sprint goal'},
      {type:'quote',html:''},
      {type:'h2',html:'Committed items'},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'h2',html:'Stretch items'},
      {type:'todo',html:'',checked:false},
      {type:'h2',html:'Blockers & risks'},
      {type:'bullet',html:''},
      {type:'h2',html:'Definition of done'},
      {type:'bullet',html:''},
      {type:'bullet',html:''},
    ]},

  /* ── Learning ────────────────────────────────────── */
  {id:'study-notes',cat:'learning',icon:'📖',color:'#0891b2',name:'Study notes',
    desc:'Topic overview, key concepts, questions, and a summary.',
    tags:['h2','bullet','todo'],
    blocks:[
      {type:'h1',html:'Study Notes'},
      {type:'callout',html:'<strong>Subject:</strong> &nbsp;&nbsp; <strong>Date:</strong> ',emoji:'📖',color:'blue'},
      {type:'h2',html:'Overview'},
      {type:'text',html:''},
      {type:'h2',html:'Key concepts'},
      {type:'bullet',html:'<strong>Concept:</strong> '},
      {type:'bullet',html:'<strong>Concept:</strong> '},
      {type:'bullet',html:'<strong>Concept:</strong> '},
      {type:'h2',html:'My questions'},
      {type:'todo',html:'',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'h2',html:'Summary in my own words'},
      {type:'quote',html:''},
      {type:'h2',html:'Further reading'},
      {type:'bullet',html:''},
    ]},

  {id:'book-notes',cat:'learning',icon:'📚',color:'#7c3aed',name:'Book notes',
    desc:'Capture key ideas, quotes, and actionable takeaways.',
    tags:['h2','quote','bullet'],
    blocks:[
      {type:'h1',html:'Book Notes'},
      {type:'callout',html:'<strong>Title:</strong> &nbsp;&nbsp; <strong>Author:</strong> &nbsp;&nbsp; <strong>Rating:</strong> ⭐⭐⭐⭐',emoji:'📚',color:'purple'},
      {type:'h2',html:'In one sentence'},
      {type:'quote',html:''},
      {type:'h2',html:'Key ideas'},
      {type:'bullet',html:''},
      {type:'bullet',html:''},
      {type:'bullet',html:''},
      {type:'h2',html:'Favourite quotes'},
      {type:'quote',html:''},
      {type:'h2',html:'How I\'ll apply this'},
      {type:'text',html:''},
      {type:'h2',html:'Action items'},
      {type:'todo',html:'',checked:false},
    ]},

  /* ── Planning ────────────────────────────────────── */
  {id:'travel-plan',cat:'planning',icon:'✈️',color:'#14b8a6',name:'Travel planning',
    desc:'Trip details, packing list, bookings, and day-by-day itinerary.',
    tags:['h2','todo','bullet'],
    blocks:[
      {type:'h1',html:'Travel Planning'},
      {type:'callout',html:'<strong>Destination:</strong> &nbsp;&nbsp; <strong>Dates:</strong> &nbsp;&nbsp; <strong>Budget:</strong> ',emoji:'✈️',color:'green'},
      {type:'h2',html:'Packing list'},
      {type:'todo',html:'Passport / ID',checked:false},
      {type:'todo',html:'Phone & charger',checked:false},
      {type:'todo',html:'',checked:false},
      {type:'h2',html:'Bookings'},
      {type:'bullet',html:'<strong>Flights:</strong> '},
      {type:'bullet',html:'<strong>Hotel:</strong> '},
      {type:'bullet',html:'<strong>Transport:</strong> '},
      {type:'h2',html:'Itinerary'},
      {type:'h3',html:'Day 1'},
      {type:'text',html:''},
      {type:'h3',html:'Day 2'},
      {type:'text',html:''},
      {type:'h2',html:'Notes & tips'},
      {type:'text',html:''},
    ]},
];

const TAG_COLORS={
  h1:'#6366f1',h2:'#8b5cf6',h3:'#a78bfa',
  text:'#64748b',bullet:'#0891b2',numbered:'#0ea5e9',
  todo:'#22c55e',callout:'#f59e0b',quote:'#f97316',
  divider:'#94a3b8',
};

function TemplatesPage({create}){
  const [cat,setCat]=useState('all');
  const filtered=cat==='all'?TEMPLATES:TEMPLATES.filter(t=>t.cat===cat);
  return <div className="binpage">
    <div className="binpage-head">
      <div className="binpage-title"><span className="binpage-em">🧩</span>Templates</div>
      <div className="binpage-sub">Start a new page from a ready-made template — it’s added to your workspace.</div>
    </div>

    {/* ── Category pills ── */}
    <div className="tpl-cats">
      {TEMPLATE_CATS.map(c=>(
        <button key={c.id} className={cx('tpl-cat',cat===c.id&&'sel')}
          onClick={()=>setCat(c.id)}>{c.label}</button>
      ))}
    </div>

    {/* ── Template grid ── */}
    <div className="tpl-page-grid">
      <div className="tpl-grid-new">
        {filtered.map(t=>(
          <div key={t.id} className="tpl-card-new" onClick={()=>create(t)}>
            <div className="tpl-card-hd" style={{'--tpl-col':t.color}}>
              <span className="tpl-card-em">{t.icon}</span>
            </div>
            <div className="tpl-card-bd">
              <div className="tpl-card-nm">{t.name}</div>
              <div className="tpl-card-ds">{t.desc}</div>
              {t.tags&&<div className="tpl-tags">
                {t.tags.map(tag=>(
                  <span key={tag} className="tpl-tag"
                    style={{'--tag-col':TAG_COLORS[tag]||'#94a3b8'}}>{tag}</span>
                ))}
              </div>}
            </div>
            <div className="tpl-card-use">Use template →</div>
          </div>
        ))}
      </div>
    </div>
  </div>;
}

/* ---------------- Shortcuts modal ---------------- */
function ShortcutsModal({onClose}){
  return <div className="overlay" onClick={onClose}>
    <div className="modal wide" onClick={e=>e.stopPropagation()}>
      <div className="modal-h"><h3>Keyboard shortcuts</h3>
        <div className="x" onClick={onClose}><Ic n="x"/></div></div>
      <div className="kbd-list">
        {SHORTCUTS.map((s,i)=>
          <div key={i} className="kbd-item">
            <span>{s[0]}</span>
            <kbd className="kbd">{fmtShortcut(s[1])}</kbd>
          </div>)}
      </div>
    </div>
  </div>;
}

/* ---------------- Prompt modal (replaces browser prompt()) ---------------- */
function PromptModal({title,placeholder,onConfirm,onClose}){
  const [val,setVal]=useState('');
  const inputRef=useRef();
  useEffect(()=>{ setTimeout(()=>inputRef.current?.focus(),50); },[]);
  function submit(e){
    e.preventDefault();
    if(val.trim()) { onConfirm(val.trim()); onClose(); }
  }
  return <div className="overlay" onClick={onClose}>
    <div className="modal" style={{width:420,marginTop:180}} onClick={e=>e.stopPropagation()}>
      <div className="modal-h"><h3>{title}</h3><div className="x" onClick={onClose}><Ic n="x"/></div></div>
      <form onSubmit={submit} style={{padding:'16px 24px 24px',display:'flex',flexDirection:'column',gap:12}}>
        <input ref={inputRef} className="fld" value={val} onChange={e=>setVal(e.target.value)}
          placeholder={placeholder||'Enter name…'} style={{fontSize:15}}/>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!val.trim()}>Create</button>
        </div>
      </form>
    </div>
  </div>;
}

/* ---------------- Create Workspace Modal (cloud vs local) ---------------- */
function CreateWorkspaceModal({onLocalNew,onLocalExisting,onDriveNew,onDriveExisting,onClose,keepDemo}){
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const wrap=fn=>async(...a)=>{ setErr('');setBusy(true);
    try{ await fn(...a); }catch(e){ if(e?.name!=='AbortError') setErr(e?.message||'Something went wrong.'); }
    finally{ setBusy(false); } };
  return <div className="overlay" onClick={onClose}>
    <div className="modal" style={{width:640,maxHeight:'90vh',overflowY:'auto'}}
      onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <h3>{keepDemo?'Keep this workspace':'Connect a workspace'}</h3>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>
      <div style={{padding:'18px 24px 24px'}}>
        {keepDemo&&<div className="keep-demo-note">
          Pick where to store it — everything you made in the demo will be saved there
          as ordinary folders and <code>.md</code> files.
        </div>}
        <ConnectPanel
          onLocalNew={wrap(async (n,d)=>{ await onLocalNew(n,d); })}
          onLocalExisting={wrap(async()=>{ await onLocalExisting(); })}
          onDriveNew={wrap(async (n,d)=>{ await onDriveNew(n,d); })}
          onDriveExisting={wrap(async()=>{ await onDriveExisting(); })}
          busy={busy} error={err}/>
      </div>
    </div>
  </div>;
}



/* ---------------- Cloud Workspaces Browser Modal ---------------- */
function CloudWorkspacesModal({connectedWorkspaces,onReconnect,onClose}){
  const [folders,setFolders]=useState(null);
  const [error,setError]=useState('');
  const [busyId,setBusyId]=useState(null);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        // If the Drive session has expired / never started, ask the user to
        // reconnect before we try to list their workspaces.
        if(!getDriveToken()) await authenticateGoogleDrive();
        const list=await listDriveWorkspaces();
        if(!cancelled) setFolders(list);
      }catch(e){ if(!cancelled){ setError(e.message||'Could not connect to Google Drive.'); setFolders([]); } }
    })();
    return ()=>{ cancelled=true; };
  },[]);
  const connectedIds=new Set((connectedWorkspaces||[]).filter(w=>w.type==='gdrive').map(w=>w.id));
  const open=async f=>{
    setBusyId(f.id);
    try{ await onReconnect(f.id,f.name); onClose(); }
    catch(e){ alert(e.message); }
    finally{ setBusyId(null); }
  };
  return <div className="overlay" onClick={onClose}>
    <div className="modal" style={{width:500,maxHeight:'90vh',overflowY:'auto'}}
      onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <h3>{GDRIVE.emoji} {GDRIVE.name} workspaces</h3>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>
      <div style={{padding:'4px 24px 24px'}}>
        {!error&&folders===null&&
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-3)',fontSize:14}}>
            Loading from {GDRIVE.name}…
          </div>}
        {error&&
          <div style={{color:'#d44c47',fontSize:13,background:'#fff0f0',borderRadius:6,
            padding:'10px 14px',marginBottom:12}}>{error}</div>}
        {folders?.length===0&&
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-3)',fontSize:14}}>
            No workspaces found in {GDRIVE.name}.
          </div>}
        {folders?.length>0&&<>
          <div style={{fontSize:11,color:'var(--text-3)',marginBottom:10}}>
            {folders.length} workspace{folders.length!==1?'s':''} found
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {folders.map(f=>{
              const connected=connectedIds.has(f.id);
              const isBusy=busyId===f.id;
              return <div key={f.id} style={{display:'flex',alignItems:'center',gap:10,
                padding:'10px 12px',borderRadius:8,
                border:`1px solid ${connected?'var(--accent)':'var(--border)'}`,
                background:connected?'var(--accent-soft)':'var(--bg-2)'}}>
                <div style={{width:38,height:38,borderRadius:8,flexShrink:0,background:GDRIVE.gradient,
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{GDRIVE.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13,overflow:'hidden',
                    textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</div>
                  {connected&&<div style={{fontSize:11,color:'var(--accent)',fontWeight:600,marginTop:2}}>● Connected</div>}
                </div>
                <button className="btn primary" style={{fontSize:12,padding:'5px 12px',whiteSpace:'nowrap'}}
                  onClick={()=>open(f)} disabled={isBusy}>
                  {isBusy?'…':connected?'Open':'↩ Open'}
                </button>
              </div>;
            })}
          </div>
        </>}
      </div>
    </div>
  </div>;
}

/* One row in the Manage modal — open / edit (name + description) / delete. */
function ManageRow({f,connected,onOpen,onDelete,onRename}){
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(f.name);
  const [desc,setDesc]=useState('');
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const startEdit=async()=>{
    setName(f.name); setEditing(true); setLoading(true);
    try{ const meta=await readDriveWorkspaceMeta(f.id); setDesc(meta.description||''); }
    catch(_){ setDesc(''); }
    finally{ setLoading(false); }
  };
  const save=async()=>{
    const nn=name.trim();
    if(!nn){ alert('Workspace name cannot be empty.'); return; }
    setBusy(true);
    try{
      if(nn!==f.name) await renameDriveWorkspace(f.id,nn);
      await updateDriveWorkspaceDescription(f.id,desc);
      onRename&&onRename(f.id,nn);
      setEditing(false);
    }catch(e){ alert(e.message); }
    finally{ setBusy(false); }
  };
  const open=async()=>{ setBusy(true); try{ await onOpen(f.id,f.name); }catch(e){ alert(e.message); setBusy(false); } };
  const del=async()=>{ setBusy(true); try{ await onDelete(f); }catch(e){ alert(e.message); } finally{ setBusy(false); } };

  return <div style={{borderRadius:8,border:`1px solid ${editing?'var(--accent)':'var(--border)'}`,
    background:'var(--bg-2)',overflow:'hidden'}}>
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px'}}>
      <div style={{width:38,height:38,borderRadius:8,flexShrink:0,background:GDRIVE.gradient,
        display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{GDRIVE.emoji}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:600,fontSize:13,overflow:'hidden',
          textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</div>
        {connected&&<div style={{fontSize:11,color:'var(--accent)',fontWeight:600,marginTop:2}}>● Connected</div>}
      </div>
      {!editing&&<>
        <button className="btn" style={{fontSize:12,padding:'5px 12px',whiteSpace:'nowrap'}}
          onClick={open} disabled={busy}>{busy?'…':'Open'}</button>
        <button className="btn" style={{fontSize:12,padding:'5px 10px',whiteSpace:'nowrap'}}
          title="Rename / edit description" onClick={startEdit} disabled={busy}>
          <Ic n="settings" style={{width:13,height:13}}/> Edit
        </button>
        <button className="btn" style={{fontSize:12,padding:'5px 10px',whiteSpace:'nowrap',
          color:'#d44c47',borderColor:'color-mix(in srgb,#d44c47 40%,var(--border))'}}
          title="Permanently delete this workspace from Google Drive"
          onClick={del} disabled={busy}>
          <Ic n="trash" style={{width:13,height:13}}/> Delete
        </button>
      </>}
    </div>
    {editing&&<div style={{padding:'2px 12px 14px',display:'flex',flexDirection:'column',gap:10}}>
      <label style={{display:'flex',flexDirection:'column',gap:4}}>
        <span style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em'}}>Name</span>
        <input className="fld" value={name} onChange={e=>setName(e.target.value)}
          placeholder="Workspace name" disabled={busy} autoFocus/>
      </label>
      <label style={{display:'flex',flexDirection:'column',gap:4}}>
        <span style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em'}}>Description</span>
        <textarea className="fld" value={desc} onChange={e=>setDesc(e.target.value)} rows={2}
          placeholder={loading?'Loading…':'Optional description'} disabled={busy||loading}
          style={{resize:'vertical',fontFamily:'inherit'}}/>
      </label>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button className="btn" style={{fontSize:12,padding:'6px 14px'}}
          onClick={()=>setEditing(false)} disabled={busy}>Cancel</button>
        <button className="btn primary" style={{fontSize:12,padding:'6px 14px'}}
          onClick={save} disabled={busy||loading}>{busy?'Saving…':'Save'}</button>
      </div>
    </div>}
  </div>;
}

/* Manage Google Drive workspaces — open, rename / edit description, or delete. */
function ManageWorkspacesModal({connectedWorkspaces,onOpen,onDeleted,onRenamed,onClose}){
  const [folders,setFolders]=useState(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        if(!getDriveToken()) await authenticateGoogleDrive();
        const list=await listDriveWorkspaces();
        if(!cancelled) setFolders(list);
      }catch(e){ if(!cancelled){ setError(e.message||'Could not connect to Google Drive.'); setFolders([]); } }
    })();
    return ()=>{ cancelled=true; };
  },[]);
  const connectedIds=new Set((connectedWorkspaces||[]).filter(w=>w.type==='gdrive').map(w=>w.id));
  const open=async(id,name)=>{ await onOpen(id,name); onClose(); };
  const remove=async f=>{
    if(!confirm(`Permanently delete “${f.name}” from Google Drive?\n\nThis deletes the entire workspace folder and every Markdown file inside it from your Google Drive. This cannot be undone.`)) return;
    await deleteDriveWorkspace(f.id);
    setFolders(list=>(list||[]).filter(x=>x.id!==f.id));
    onDeleted&&onDeleted(f.id);
  };
  const rename=(id,name)=>{
    setFolders(list=>(list||[]).map(x=>x.id===id?{...x,name}:x));
    onRenamed&&onRenamed(id,name);
  };
  return <div className="overlay" onClick={onClose}>
    <div className="modal" style={{width:520,maxHeight:'90vh',overflowY:'auto'}}
      onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <h3><Ic n="cloud" style={{width:18,height:18}}/> Manage {GDRIVE.name} workspaces</h3>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>
      <div style={{padding:'4px 24px 24px'}}>
        <div style={{fontSize:12.5,color:'var(--text-2)',marginBottom:14,lineHeight:1.5}}>
          Open a workspace, rename it or edit its description, or permanently delete it from
          Google Drive. Deleting removes the whole folder and its files — it cannot be undone.
        </div>
        {!error&&folders===null&&
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-3)',fontSize:14}}>
            Loading from {GDRIVE.name}…
          </div>}
        {error&&
          <div style={{color:'#d44c47',fontSize:13,background:'color-mix(in srgb,#d44c47 12%,transparent)',
            borderRadius:6,padding:'10px 14px',marginBottom:12}}>{error}</div>}
        {folders?.length===0&&!error&&
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-3)',fontSize:14}}>
            No workspaces found in {GDRIVE.name}.
          </div>}
        {folders?.length>0&&
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {folders.map(f=>
              <ManageRow key={f.id} f={f} connected={connectedIds.has(f.id)}
                onOpen={open} onDelete={remove} onRename={rename}/>)}
          </div>}
      </div>
    </div>
  </div>;
}



/* ---------------- Custom select dropdown ---------------- */
function CustomSelect({value,onChange,options}){
  const [open,setOpen]=React.useState(false);
  const ref=React.useRef();
  React.useEffect(()=>{
    if(!open) return;
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    setTimeout(()=>document.addEventListener('mousedown',h),0);
    return()=>document.removeEventListener('mousedown',h);
  },[open]);
  const current=options.find(o=>o.value===value);
  return <div ref={ref} className="csel" style={{position:'relative'}}>
    <button className={`csel-btn${open?' open':''}`} onMouseDown={e=>{e.preventDefault();setOpen(o=>!o);}}>
      <div className="csel-opt-left">
        {current?.dot&&<span className="csel-dot" style={{background:current.dot}}/>}
        <span>{current?.label??value}</span>
      </div>
      <Ic n="chevron-down"/>
    </button>
    {open&&<div className="csel-menu">
      {options.map(o=><div key={o.value}
        className={`csel-opt${o.value===value?' sel':''}`}
        onMouseDown={e=>{e.preventDefault();onChange(o.value);setOpen(false);}}>
        <div className="csel-opt-left">
          {o.dot&&<span className="csel-dot" style={{background:o.dot}}/>}
          {o.label}
        </div>
        {o.value===value&&<Ic n="check"/>}
      </div>)}
    </div>}
  </div>;
}

const ACCENT_COLORS=[
  {id:'indigo', label:'Indigo',  light:'#6366f1', dark:'#818cf8'},
  {id:'blue',   label:'Blue',    light:'#3b82f6', dark:'#60a5fa'},
  {id:'ocean',  label:'Ocean',   light:'#0ea5e9', dark:'#38bdf8'},
  {id:'forest', label:'Forest',  light:'#10b981', dark:'#34d399'},
  {id:'rose',   label:'Rose',    light:'#f43f5e', dark:'#fb7185'},
  {id:'sunset', label:'Sunset',  light:'#f59e0b', dark:'#fbbf24'},
  {id:'violet', label:'Violet',  light:'#8b5cf6', dark:'#c084fc'},
];

/* Workspace font choices (applied to page content, saved in info.md). */
const FONT_OPTIONS=[
  {id:'default', label:'Default (Sans)', stack:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"},
  {id:'serif',   label:'Serif',          stack:"Georgia,'Iowan Old Style','Times New Roman',serif"},
  {id:'mono',    label:'Monospace',      stack:"'JetBrains Mono','SFMono-Regular',Menlo,Consolas,monospace"},
];
const fontStack=id=>(FONT_OPTIONS.find(f=>f.id===id)||FONT_OPTIONS[0]).stack;

/* ---------------- Settings modal ---------------- */
function SettingsModal({theme,setTheme,accent,setAccent,font,setFont,description,setDescription,
  pageBgUrl,onUploadBg,onClearBg,nodeCount,activeWorkspace,onGoHome,onClose,onRestartTutorial}){
  const bgInput=React.useRef();
  return <div className="overlay" onClick={onClose}>
    <div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-h"><h3>Settings</h3>
        <div className="x" onClick={onClose}><Ic n="x"/></div></div>
      <div className="set-body">
        <div className="set-row">
          <div className="sr-l"><b>Mode</b><small>Switch between light and dark interface.</small></div>
          <CustomSelect value={theme} onChange={setTheme} options={[
            {value:'light', label:'Light'},
            {value:'dark',  label:'Dark'},
          ]}/>
        </div>
        <div className="set-row set-row-col">
          <div className="sr-l"><b>Accent color</b><small>Choose a color for buttons, links and highlights.</small></div>
          <div className="accent-swatches">
            {ACCENT_COLORS.map(c=><button key={c.id}
              className={cx('accent-swatch',accent===c.id&&'sel')}
              title={c.label}
              style={{'--sw-color':theme==='dark'?c.dark:c.light}}
              onClick={()=>setAccent(c.id)}>
              {accent===c.id&&<Ic n="check"/>}
            </button>)}
          </div>
        </div>
        <div className="set-row">
          <div className="sr-l"><b>Font</b><small>Typeface used for your page content.</small></div>
          <CustomSelect value={font||'default'} onChange={setFont}
            options={FONT_OPTIONS.map(f=>({value:f.id,label:f.label}))}/>
        </div>
        <div className="set-row set-row-col">
          <div className="sr-l"><b>Page background</b><small>Upload a photo to show behind your pages. Stored in the workspace’s Upload/ folder.</small></div>
          <div style={{display:'flex',alignItems:'center',gap:12,marginTop:8}}>
            <div style={{width:88,height:56,borderRadius:8,flexShrink:0,border:'1px solid var(--border)',
              background:pageBgUrl?`center/cover no-repeat url("${pageBgUrl}")`:'var(--bg-input)',
              display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-3)',fontSize:11}}>
              {pageBgUrl?'':'None'}
            </div>
            <input ref={bgInput} type="file" accept="image/*" style={{display:'none'}}
              onChange={e=>{const f=e.target.files?.[0]; if(f) onUploadBg(f); e.target.value='';}}/>
            <button className="btn ghost" onClick={()=>bgInput.current?.click()}>
              {pageBgUrl?'Change…':'Upload…'}
            </button>
            {pageBgUrl&&<button className="btn ghost" onClick={onClearBg}>Remove</button>}
          </div>
        </div>
        <div className="set-row set-row-col">
          <div className="sr-l"><b>Description</b><small>A short note about this workspace (saved in info.md).</small></div>
          <input className="fld" style={{width:'100%',boxSizing:'border-box',marginTop:8}}
            placeholder="Description (optional)" value={description||''}
            onChange={e=>setDescription(e.target.value)}/>
        </div>
        <div className="set-row">
          <div className="sr-l"><b>Pages</b><small>Total pages & databases in this workspace.</small></div>
          <span>{nodeCount}</span>
        </div>
        <div className="set-row">
          <div className="sr-l"><b>Storage</b><small>{activeWorkspace?.type==='gdrive'?'Mirrored to your Google Drive as Markdown files.':'Saved on this computer as Markdown files.'}</small></div>
          <span style={{color:'var(--text-3)'}}>{activeWorkspace?.type==='gdrive'?'Google Drive':'Local'}</span>
        </div>
        <div className="set-row">
          <div className="sr-l"><b>Workspace</b><small>Close this workspace and return to the homepage.</small></div>
          <button className="btn ghost" onClick={onGoHome}>Close workspace</button>
        </div>
        <div className="set-row">
          <div className="sr-l"><b>Tutorial</b><small>Replay the guided tour of the workspace.</small></div>
          <button className="btn ghost" onClick={onRestartTutorial}>Start tour</button>
        </div>
        <div className="set-row" style={{borderBottom:'none'}}>
          <div className="sr-l"><b>About</b></div>
          <span style={{color:'var(--text-3)'}}>v2.1.1</span>
        </div>
      </div>
    </div>
  </div>;
}


/* ---------------- Dashboard ---------------- */
function Dashboard({nodes,favorites,openPage,addTop,setModal,activeWorkspace}){
  const allNodes=Object.values(nodes).filter(n=>!n.trashed&&!n.archived);
  const pageCount=allNodes.filter(n=>n.kind==='page').length;
  const dbCount=allNodes.filter(n=>n.kind==='database').length;
  const favNodes=favorites.map(id=>nodes[id]).filter(n=>n&&!n.trashed&&!n.archived);
  const privatePages=allNodes.filter(n=>n.parentId===null)
    .sort((a,b)=>(a.sort||0)-(b.sort||0)).slice(0,6);
  const hour=new Date().getHours();
  const greeting=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
  return <div className="dash-page">
    <div className="dash-hero">
      <div className="dash-greeting">{greeting}</div>
      <div className="dash-ws-name">{activeWorkspace?.name||'My Workspace'}</div>
    </div>
    <div className="dash-stats">
      <div className="dash-stat"><span className="dash-stat-n">{pageCount}</span><span className="dash-stat-l">Pages</span></div>
      <div className="dash-stat"><span className="dash-stat-n">{dbCount}</span><span className="dash-stat-l">Databases</span></div>
      <div className="dash-stat"><span className="dash-stat-n">{favNodes.length}</span><span className="dash-stat-l">Favorites</span></div>
    </div>
    <div className="dash-actions">
      <button className="dash-action-btn" onClick={()=>addTop('private')}>
        <Ic n="plus" style={{width:18,height:18}}/><span>New page</span>
      </button>
      <button className="dash-action-btn" onClick={()=>openPage(TEMPLATES_ID)}>
        <Ic n="template" style={{width:18,height:18}}/><span>Templates</span>
      </button>
      <button className="dash-action-btn" onClick={()=>setModal({type:'search'})}>
        <Ic n="search" style={{width:18,height:18}}/><span>Search</span>
      </button>
      <button className="dash-action-btn" onClick={()=>setModal({type:'settings'})}>
        <Ic n="settings" style={{width:18,height:18}}/><span>Settings</span>
      </button>
    </div>
    {favNodes.length>0&&<>
      <div className="dash-section-title">⭐ Favorites</div>
      <div className="dash-page-grid">
        {favNodes.map(n=><div key={n.id} className="dash-page-card" onClick={()=>openPage(n.id)}>
          <div className="dpc-cover" style={{background:n.cover||'var(--bg-2)'}}/>
          <div className="dpc-icon">{n.icon||'📄'}</div>
          <div className="dpc-title">{n.title||'Untitled'}</div>
          <div className="dpc-kind">{n.kind==='database'?'Database':'Page'}</div>
        </div>)}
      </div>
    </>}
    {privatePages.length>0&&<>
      <div className="dash-section-title">📂 My Workspace</div>
      <div className="dash-page-grid">
        {privatePages.map(n=><div key={n.id} className="dash-page-card" onClick={()=>openPage(n.id)}>
          <div className="dpc-cover" style={{background:n.cover||'var(--bg-2)'}}/>
          <div className="dpc-icon">{n.icon||'📄'}</div>
          <div className="dpc-title">{n.title||'Untitled'}</div>
          <div className="dpc-kind">{n.kind==='database'?'Database':'Page'}</div>
        </div>)}
      </div>
    </>}
  </div>;
}

/* ---------------- Page actions menu ---------------- */
function PageMenu({node,nodes,onClose,trashNode,duplicate,setModal,downloadPage}){
  const item=(ic,label,fn)=><div className="mi" onClick={()=>{fn();onClose();}}>
    <span className="mi-ic"><Ic n={ic}/></span><span className="mi-tx">{label}</span></div>;
  const hasSub=nodes&&Object.values(nodes).some(n=>n.parentId===node.id&&!n.trashed&&!n.archived);
  const dlRow=(fmt,icon,label,ext,withSub)=>
    <div className="mi" onClick={()=>{downloadPage(node.id,fmt,withSub);onClose();}}>
      <span className="mi-ic">{icon}</span>
      <span className="mi-tx">{label}<small style={{display:'block',color:'var(--text-3)',fontSize:11}}>{ext}</small></span>
    </div>;
  return <div className="overlay" style={{background:'transparent'}} onClick={onClose}>
    <div className="pop menu" style={{position:'absolute',top:50,right:14,width:230}}
      onClick={e=>e.stopPropagation()}>
      {item('copy','Duplicate page',()=>duplicate(node.id))}
      <div className="menu-sep"/>
      <div className="menu-h">This page only</div>
      {dlRow('md','📝','Markdown','.md',false)}
      {dlRow('txt','📄','Plain text','.txt',false)}
      {dlRow('html','🌐','HTML','.html',false)}
      {hasSub&&<>
        <div className="menu-sep"/>
        <div className="menu-h">With all sub-pages</div>
        {dlRow('md','📝','Markdown','.md',true)}
        {dlRow('txt','📄','Plain text','.txt',true)}
        {dlRow('html','🌐','HTML  + TOC','.html',true)}
      </>}
      <div className="menu-sep"/>
      {item('keyboard','Keyboard shortcuts',()=>setModal({type:'shortcuts'}))}
      <div className="menu-sep"/>
      <div className="mi" onClick={()=>{trashNode(node.id);onClose();}}>
        <span className="mi-ic"><Ic n="trash"/></span>
        <span className="mi-tx" style={{color:'#d44c47'}}>Move to Trash</span></div>
    </div>
  </div>;
}

/* =========================================================================
   WORKSPACE  (the authenticated app surface)
   ========================================================================= */
/* =========================================================================
   HOME SCREEN — shown when no workspace is connected
   ========================================================================= */
function ConnectPanel({onLocalNew,onLocalExisting,onDriveNew,onDriveExisting,busy,error}){
  const localOK=isLocalFSSupported();
  const [name,setName]=useState('');
  const [desc,setDesc]=useState('');
  const named=!!name.trim();
  return <div className="connect">
    <div className="connect-block">
      <div className="cb-fields">
        <label className="cb-field">
          <span className="cb-field-ic">◧</span>
          <input className="cb-input" placeholder="Workspace name" value={name}
            onChange={e=>setName(e.target.value)} autoFocus/>
        </label>
        <label className="cb-field">
          <span className="cb-field-ic">✎</span>
          <input className="cb-input" placeholder="Description (optional)" value={desc}
            onChange={e=>setDesc(e.target.value)}/>
        </label>
      </div>

      <div className="cb-choose">Create it in</div>
      <div className="cb-tiles">
        <button className="cb-tile local" disabled={!localOK||busy||!named}
          onClick={()=>onLocalNew(name.trim(),desc.trim())}>
          <span className="cb-tile-ic">💻</span>
          <span className="cb-tile-tx">
            <span className="cb-tile-t">Local folder</span>
            <span className="cb-tile-s">Saved on this computer</span>
          </span>
        </button>
        <button className="cb-tile drive" disabled={busy||!named}
          onClick={()=>onDriveNew(name.trim(),desc.trim())}>
          <span className="cb-tile-ic">📁</span>
          <span className="cb-tile-tx">
            <span className="cb-tile-t">Google Drive</span>
            <span className="cb-tile-s">Synced across devices</span>
          </span>
        </button>
      </div>

      <div className="cb-existing">
        <span>Already have a workspace?</span>
        <button className="cb-link" disabled={!localOK||busy} onClick={onLocalExisting}>Open a folder</button>
        <span className="cb-dot">·</span>
        <button className="cb-link" disabled={busy} onClick={onDriveExisting}>Open from Drive</button>
      </div>
      {!localOK&&<div className="cc-warn">Local folders need Chrome, Edge or Brave — Google Drive works everywhere.</div>}
    </div>
    {error&&<div className="connect-error">{error}</div>}
    {busy&&<div className="connect-busy"><span className="spin"/> Working…</div>}
  </div>;
}

const GitHubIcon=({size=17})=>
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
  </svg>;

/* =========================================================================
   WELCOME PAGE — the public landing for first-time visitors (no workspace
   data in this browser yet). Explains the app; "Get Started" leads to the
   start page (HomeScreen).
   ========================================================================= */
function WelcomePage({onGetStarted,onDemo,onDocs,onAbout,onSelfHost,theme,onToggleTheme}){
  return <div className="home-screen welcome-page">
    <div className="home-aurora" aria-hidden="true">
      <span className="orb o1"/><span className="orb o2"/><span className="orb o3"/><span className="orb o4"/>
      <span className="home-grid"/>
    </div>
    <nav className="home-nav">
      <div className="home-nav-brand">
        <span className="home-nav-mark">◧</span>
        <span className="home-nav-title">Workspace</span>
      </div>
      <div className="home-nav-links">
        <button type="button" className="home-nav-link" onClick={onAbout}>About</button>
        <button type="button" className="home-nav-link" onClick={onSelfHost}>Self-hosting</button>
        <button type="button" className="home-nav-link" onClick={onDocs}>Docs</button>
        <a className="home-nav-link home-nav-icon" href="https://github.com/MohanViswagnaMR/Workspace"
          target="_blank" rel="noopener noreferrer" title="View on GitHub" aria-label="View on GitHub">
          <GitHubIcon/>
        </a>
        {APP_VERSION&&<a className="home-nav-ver"
          href="https://github.com/MohanViswagnaMR/Workspace/tree/main/versions"
          target="_blank" rel="noopener noreferrer" title="Release notes">v{APP_VERSION}</a>}
      </div>
    </nav>
    <div className="welcome-inner">
      <section className="wl-hero">
        <h1 className="wl-title home-rise" style={{animationDelay:'60ms'}}>
          Notes, docs &amp; databases.<br/>
          Saved as plain <span className="grad">Markdown files</span>.
        </h1>
        <p className="wl-sub home-rise" style={{animationDelay:'120ms'}}>
          Workspace is a free, open-source, Notion-style block editor with no accounts and
          no backend. Everything you write lives in ordinary folders and <code>.md</code> files —
          in a folder on your computer or in your own Google Drive — readable and usable
          even if this app goes away.
        </p>
        <div className="wl-actions home-rise" style={{animationDelay:'170ms'}}>
          <button type="button" className="btn-demo" onClick={onGetStarted}>
            Get Started <Ic n="fwd" style={{width:16,height:16}}/>
          </button>
          <button type="button" className="btn-demo-ghost" onClick={onDemo}>
            <Ic n="play" style={{width:15,height:15}}/> Try the demo
          </button>
        </div>
        <div className="wl-hint home-rise" style={{animationDelay:'200ms'}}>
          The demo runs right here in your browser — no sign-up, nothing saved until you keep it.
        </div>
      </section>

      <section className="home-feats wl-feats home-rise" style={{animationDelay:'240ms'}}>
        {[['🧱','Block editor','Headings, to-dos, toggles, callouts, quotes, code, images and files — type / for everything.'],
          ['📊','Databases','Tables, boards, galleries, lists and calendars, with multiple views per database.'],
          ['🗂️','Nested pages','Infinite page hierarchy with instant search, favorites, templates, trash and archive.'],
          ['📁','Plain files, yours','Pages are Markdown files in real folders — open them with any editor, forever.'],
          ['🔒','No account, no cloud','Nothing is sent anywhere except, optionally, your own Google Drive.'],
          ['⚡','Installable & offline','A PWA you can install on desktop or phone; local workspaces work fully offline.']]
          .map(([ic,t,s])=><div className="home-feat" key={t}>
            <span className="home-feat-ic">{ic}</span>
            <span className="home-feat-t">{t}</span>
            <span className="home-feat-s">{s}</span>
          </div>)}
      </section>

      <section className="wl-files home-rise" style={{animationDelay:'280ms'}}>
        <div className="wl-files-copy">
          <h2 className="wl-h2">Your data is just files.</h2>
          <p className="wl-p">
            Each workspace is a self-describing folder tree: pages with children become
            folders, leaf pages are single <code>.md</code> files, and metadata lives in a
            little YAML frontmatter. There is <b>no JSON</b> anywhere in your data — open
            it in any editor, sync it with any tool, keep it forever.
          </p>
          <p className="wl-p">
            Curious how it works? Read the <button type="button" className="home-demo-link"
              onClick={onDocs}>documentation</button> or learn about{' '}
            <button type="button" className="home-demo-link" onClick={onSelfHost}>hosting it yourself</button>.
          </p>
        </div>
        <pre className="wl-tree"><code>{`My Workspace/
├── Upload/            images & attachments
└── Space/             all top-level pages
    ├── Meeting Notes.md
    └── Homework/
        ├── master page.md
        ├── Essay.md
        └── Math/
            ├── Problem set 1.md
            └── Problem set 2.md`}</code></pre>
      </section>

      <div className="home-foot home-rise" style={{animationDelay:'320ms'}}>
        <div className="home-foot-copy">
          © {new Date().getFullYear()} Workspace · Mohan Viswagna MR. All rights reserved.
        </div>
        <button type="button" role="switch" aria-checked={theme==='dark'}
          className={cx('theme-switch',theme==='dark'&&'on')} onClick={onToggleTheme}
          title={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
          aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>
          <Ic n="sun" style={{width:13,height:13}}/>
          <Ic n="moon" style={{width:13,height:13}}/>
          <span className="theme-switch-knob"/>
        </button>
      </div>
    </div>
  </div>;
}

function HomeScreen({pointer,list,busy,error,driveConnected,onConnectDrive,onManage,onDocs,onWelcome,theme,onToggleTheme,onOpen,onRemove,onReconnect,onLocalNew,onLocalExisting,onDriveNew,onDriveExisting}){
  const known=list||[];
  const lastId=pointer?pointer.id:null;
  return <div className="home-screen">
    <div className="home-aurora" aria-hidden="true">
      <span className="orb o1"/><span className="orb o2"/><span className="orb o3"/><span className="orb o4"/>
      <span className="home-grid"/>
    </div>
    <nav className="home-nav">
      <div className="home-nav-brand">
        <span className="home-nav-mark">◧</span>
        <span className="home-nav-title">Workspace</span>
      </div>
      <div className="home-nav-links">
        <button type="button" className="home-nav-link" onClick={onWelcome}>Welcome</button>
        <button type="button" className="home-nav-link" onClick={onDocs}>Docs</button>
        <button type="button" className="home-nav-link" onClick={onManage}>
          <Ic n="cloud" style={{width:15,height:15}}/> Manage workspaces
        </button>
        <a className="home-nav-link home-nav-icon" href="https://github.com/MohanViswagnaMR/Workspace"
          target="_blank" rel="noopener noreferrer" title="View on GitHub" aria-label="View on GitHub">
          <GitHubIcon/>
        </a>
        {APP_VERSION&&<a className="home-nav-ver"
          href="https://github.com/MohanViswagnaMR/Workspace/tree/main/versions"
          target="_blank" rel="noopener noreferrer" title="Release notes">v{APP_VERSION}</a>}
      </div>
    </nav>
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
            error={known.length?'':error}/>
        </div>
      </div>

      <div className="home-foot home-rise" style={{animationDelay:'300ms'}}>
        <div className="home-foot-copy">
          © {new Date().getFullYear()} Workspace · Mohan Viswagna MR. All rights reserved.
        </div>
        <button type="button" role="switch" aria-checked={theme==='dark'}
          className={cx('theme-switch',theme==='dark'&&'on')} onClick={onToggleTheme}
          title={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
          aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>
          <Ic n="sun" style={{width:13,height:13}}/>
          <Ic n="moon" style={{width:13,height:13}}/>
          <span className="theme-switch-knob"/>
        </button>
      </div>
    </div>
  </div>;
}

/* =========================================================================
   DOCS PAGE — full in-app documentation
   ========================================================================= */
const DOCS_TOC=[
  ['overview','Overview'],
  ['quick-start','Quick start & setup'],
  ['workspace-types','Workspace types'],
  ['data-on-disk','How your data is stored'],
  ['interface','The interface'],
  ['blocks','Blocks & the editor'],
  ['slash','Slash commands'],
  ['databases','Databases & views'],
  ['pages','Pages & hierarchy'],
  ['features','Features'],
  ['managing','Managing workspaces'],
  ['shortcuts','Keyboard shortcuts'],
  ['persistence','Persistence & privacy'],
  ['structure','Project structure'],
  ['stack','Tech stack'],
  ['deploy','Deployment'],
  ['troubleshooting','Troubleshooting'],
];

function DocsPage({onBack,theme,onToggleTheme}){
  const scroller=React.useRef(null);
  const [active,setActive]=React.useState('overview');
  const go=id=>{
    const el=document.getElementById('doc-'+id);
    if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
  };
  React.useEffect(()=>{
    const root=scroller.current; if(!root) return;
    const onScroll=()=>{
      // Bottom of the page → always highlight the last section (it can't scroll to the top).
      if(root.scrollTop+root.clientHeight>=root.scrollHeight-4){
        setActive(DOCS_TOC[DOCS_TOC.length-1][0]); return;
      }
      const rootTop=root.getBoundingClientRect().top;
      const offset=110; // px below the sticky top bar
      let current=DOCS_TOC[0][0];
      for(const [id] of DOCS_TOC){
        const el=document.getElementById('doc-'+id);
        if(!el) continue;
        if(el.getBoundingClientRect().top-rootTop<=offset) current=id; else break;
      }
      setActive(current);
    };
    onScroll();
    root.addEventListener('scroll',onScroll,{passive:true});
    return ()=>root.removeEventListener('scroll',onScroll);
  },[]);
  const H=({id,children})=><h2 id={'doc-'+id} className="docs-h2">{children}</h2>;

  return <div className="docs-page">
    <div className="docs-top">
      <button className="docs-back" onClick={onBack} title="Back to homepage">
        <Ic n="back" style={{width:16,height:16}}/> Back
      </button>
      <div className="docs-top-brand">
        <span className="home-nav-mark">◧</span>
        <span className="home-nav-title">Workspace</span>
        <span className="docs-top-tag">Docs</span>
      </div>
      <div className="docs-top-actions">
        <a className="home-nav-link home-nav-icon" href="https://github.com/MohanViswagnaMR/Workspace"
          target="_blank" rel="noopener noreferrer" title="View on GitHub" aria-label="View on GitHub">
          <svg viewBox="0 0 16 16" width="17" height="17" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </a>
        <button type="button" role="switch" aria-checked={theme==='dark'}
          className={cx('theme-switch',theme==='dark'&&'on')} onClick={onToggleTheme}
          title={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
          aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>
          <Ic n="sun" style={{width:13,height:13}}/>
          <Ic n="moon" style={{width:13,height:13}}/>
          <span className="theme-switch-knob"/>
        </button>
      </div>
    </div>

    <div className="docs-body">
      <aside className="docs-toc">
        <div className="docs-toc-title">On this page</div>
        {DOCS_TOC.map(([id,label])=>
          <button key={id} className={cx('docs-toc-link',active===id&&'on')}
            onClick={()=>go(id)}>{label}</button>)}
      </aside>

      <main className="docs-main" ref={scroller}>
        <div className="docs-content">
          <div className="docs-hero">
            <h1 className="docs-title">Workspace documentation</h1>
            <p className="docs-lead">
              A fast, block-based, Notion-style workspace built with <b>Vite + React 18</b>.
              No accounts and no backend — everything you write is stored as ordinary folders
              and Markdown files, either on your computer or mirrored to your Google Drive.
            </p>
            <div className="docs-badges">
              <span className="docs-badge">Version 2.1.1</span>
              <span className="docs-badge">React 18 · Vite 6</span>
              <span className="docs-badge">Plain Markdown storage</span>
            </div>
          </div>

          <H id="overview">Overview</H>
          <p className="docs-p">Workspace is a single place for docs, wikis, tasks and databases.
            Its defining idea: <b>your data is just files</b>. Pages are plain <code>.md</code> files
            with a little YAML frontmatter, and the page hierarchy is mirrored as nested folders — so
            your notes stay readable and usable even if this app goes away.</p>
          <ul className="docs-list">
            <li><b>No account, no login, no cloud lock-in</b> — nothing is sent anywhere except (optionally) your own Google Drive.</li>
            <li><b>Two workspace types</b> — a Local folder (via the File System Access API) or Google Drive.</li>
            <li><b>Block editor</b> — text, headings, to-dos, lists, toggles, quotes, callouts, dividers, code, images and file attachments.</li>
            <li><b>Multi-view databases</b> — table, board, gallery, list and calendar.</li>
            <li><b>Nested pages, slash commands, search, favorites, trash &amp; archive, templates, dark mode and keyboard shortcuts.</b></li>
            <li><b>Import</b> — bring in <code>.docx</code> files.</li>
          </ul>

          <H id="quick-start">Quick start &amp; setup</H>
          <p className="docs-p">You need <b>Node.js 18+</b>. Clone the repository, install dependencies, and start the dev server:</p>
          <pre className="docs-code"><code>{`git clone https://github.com/MohanViswagnaMR/Workspace.git
cd Workspace
npm install
npm run dev`}</code></pre>
          <p className="docs-p">Open <code>http://localhost:5173</code> and pick <b>Local folder</b> or <b>Google Drive</b> from the homepage.</p>
          <table className="docs-table"><thead><tr><th>Command</th><th>What it does</th></tr></thead><tbody>
            <tr><td><code>npm run dev</code></td><td>Start the dev server with hot reload (port 5173)</td></tr>
            <tr><td><code>npm run build</code></td><td>Production build into <code>dist/</code></td></tr>
            <tr><td><code>npm run preview</code></td><td>Preview the production build locally</td></tr>
          </tbody></table>
          <div className="docs-note">
            <b>Browser support:</b> Local folders require a Chromium browser (Chrome, Edge, Brave)
            because they use the File System Access API. Google Drive works in any modern browser.
          </div>

          <H id="workspace-types">Workspace types</H>
          <div className="docs-grid2">
            <div className="docs-card">
              <div className="docs-card-h">💻 Local folder</div>
              <p>Saved on your computer via the File System Access API. Pick a location and the app
              creates a folder you fully own. The directory handle is cached in IndexedDB; Chromium
              asks you to re-grant access once per session (click <b>Reconnect</b>).</p>
            </div>
            <div className="docs-card">
              <div className="docs-card-h">📁 Google Drive</div>
              <p>A real, browsable folder in your Drive that mirrors the exact same layout. Uses the
              <code>drive.file</code> OAuth scope so files are editable directly in Drive. The token
              lives in <code>sessionStorage</code>; sign in again when it expires.</p>
            </div>
          </div>

          <H id="data-on-disk">How your data is stored</H>
          <p className="docs-p">Each workspace is a self-describing folder tree. Pages with children become
            folders holding a <code>master page.md</code>; leaf pages are single <code>.md</code> files.
            Ordering and metadata live in each file's YAML frontmatter. There is <b>no JSON</b> anywhere in your data.</p>
          <pre className="docs-code"><code>{`My Workspace/                 (the folder you picked — its name is the title)
├── Upload/                   uploaded images & file attachments
│   └── sunset.jpg
├── info.md                   appearance settings + description
├── trash/                    trashed pages
├── archive/                  archived pages
└── Space/                    all top-level pages
    ├── Meeting Notes.md      a page with no children
    └── Homework/             a page WITH children → a folder
        ├── master page.md    the "Homework" page's own content
        ├── Essay.md
        └── Math/
            ├── master page.md
            └── Problem set 1.md`}</code></pre>
          <p className="docs-p">A page file is readable on its own — no app required:</p>
          <pre className="docs-code"><code>{`---
id: n_start
title: Getting Started
icon: 📓
order: 0
type: page
favorite: true
---

# 📓 Getting Started

Welcome to your **connected workspace**.

> 💡 Callouts are blockquotes with a leading emoji.

- [x] To-dos are GitHub-style checkboxes`}</code></pre>
          <p className="docs-p">Databases keep their structure (properties, rows and views) in the frontmatter
            <code>db:</code> block and render a readable Markdown table in the body.</p>

          <H id="interface">The interface</H>
          <ul className="docs-list">
            <li><b>Homepage</b> — a top navbar (logo, Docs, Manage workspaces, GitHub), your connected workspaces, a Google&nbsp;Drive connection cloud, connect panels, and a footer with a light/dark switch.</li>
            <li><b>Sidebar</b> — the workspace switcher, a glowing <b>New page</b> button, Search &amp; Home, Favorites, your page tree, and Templates / Import / Storage / Archive / Trash. Settings and Close workspace sit at the bottom.</li>
            <li><b>Topbar</b> — breadcrumbs, favorite toggle, share, and the page menu.</li>
            <li><b>Editor</b> — the block canvas where you write. Hover the left margin of any line to drag it, or click <b>⊕</b> to add a block.</li>
          </ul>

          <H id="blocks">Blocks &amp; the editor</H>
          <p className="docs-p">Everything you see is a <b>block</b>. Type <code>/</code> on an empty line to insert one,
            or use Markdown-style shortcuts (e.g. <code>#</code> + space for a heading). Available block types:</p>
          <div className="docs-chips">
            {CMDS.filter(c=>c.g!=='Database').map(c=>
              <span key={c.id} className="docs-chip"><span className="docs-chip-ic">{c.ic}</span>{c.label}</span>)}
          </div>
          <p className="docs-p">Inline formatting supports <b>bold</b>, <i>italic</i>, underline, strikethrough and
            <code>inline code</code> (see shortcuts below).</p>

          <H id="slash">Slash commands</H>
          <p className="docs-p">Press <kbd className="docs-kbd">/</kbd> at the start of an empty block to open the
            block menu, then type to filter. Commands are grouped into <b>Basic</b>, <b>Database</b> and <b>Media</b>.
            The same menu is how you insert a database view or an embedded sub-page.</p>

          <H id="databases">Databases &amp; views</H>
          <p className="docs-p">A database is a collection of rows with typed properties, viewable five ways.
            Add one from the slash menu, then switch or add views on the fly:</p>
          <div className="docs-grid">
            {CMDS.filter(c=>c.g==='Database').map(c=>
              <div key={c.id} className="docs-mini"><span className="docs-mini-ic">{c.ic}</span>
                <div><b>{c.label.replace(' view','')}</b><small>{c.desc}</small></div></div>)}
          </div>
          <p className="docs-p">Properties, rows and view configuration are serialized into the page's
            <code>db:</code> frontmatter, and a plain Markdown table is written in the body so the data
            stays human-readable outside the app.</p>

          <H id="pages">Pages &amp; hierarchy</H>
          <ul className="docs-list">
            <li><b>Infinite nesting</b> — any page can contain sub-pages; the tree mirrors 1:1 to nested folders on disk.</li>
            <li><b>Drag to reorder / nest</b> — drag pages in the sidebar to reorder them or drop one inside another.</li>
            <li><b>Icons &amp; covers</b> — give pages an emoji icon; ordering is stored per file as <code>order</code>.</li>
            <li><b>Embedded sub-pages</b> — the <b>Page</b> block links a child page inline within a parent.</li>
          </ul>

          <H id="features">Features</H>
          <div className="docs-grid2">
            <div className="docs-card"><div className="docs-card-h">🔍 Search</div><p>Instant fuzzy search across every page — open it with <kbd className="docs-kbd">⌘K</kbd>.</p></div>
            <div className="docs-card"><div className="docs-card-h">⭐ Favorites</div><p>Pin pages to a Favorites section at the top of the sidebar.</p></div>
            <div className="docs-card"><div className="docs-card-h">🗑️ Trash &amp; Archive</div><p>Deleted pages go to Trash (restore or purge); Archive hides pages you want to keep but not see. Both are full pages.</p></div>
            <div className="docs-card"><div className="docs-card-h">🧩 Templates</div><p>Reusable page starters, available as a dedicated Templates page.</p></div>
            <div className="docs-card"><div className="docs-card-h">📥 Import</div><p>Bring in <code>.docx</code> documents — converted to blocks via mammoth.</p></div>
            <div className="docs-card"><div className="docs-card-h">📎 Storage</div><p>Browse every uploaded image and attachment in grid, gallery or list view.</p></div>
            <div className="docs-card"><div className="docs-card-h">🌙 Dark mode &amp; accents</div><p>Light/dark themes plus 7 accent colours (indigo, blue, ocean, forest, rose, sunset, violet). Default is dark + violet.</p></div>
            <div className="docs-card"><div className="docs-card-h">⌨️ Shortcuts</div><p>A full keyboard-driven flow — see the table below.</p></div>
          </div>

          <H id="managing">Managing workspaces</H>
          <ul className="docs-list">
            <li><b>Connect</b> — create a new workspace, open an existing folder, or open one from Drive.</li>
            <li><b>Drive cloud icon</b> — next to “Your workspaces”; green ✓ when connected, grey ✗ when not. Click it to connect/refresh.</li>
            <li><b>Manage workspaces</b> (navbar) — lists every Google Drive workspace with <b>Open</b>, <b>Edit</b> and <b>Delete</b>.</li>
            <li><b>Edit</b> — rename a Drive workspace (renames the Drive folder) and change its description (stored in <code>info.md</code>).</li>
            <li><b>Delete</b> — permanently removes the whole Drive folder and its files. This cannot be undone.</li>
            <li><b>Unlink</b> — removes a workspace from your list without touching the underlying files.</li>
          </ul>

          <H id="shortcuts">Keyboard shortcuts</H>
          <table className="docs-table"><thead><tr><th>Action</th><th>Shortcut</th></tr></thead><tbody>
            {SHORTCUTS.map(([a,k])=><tr key={a}><td>{a}</td><td><kbd className="docs-kbd">{fmtShortcut(k)}</kbd></td></tr>)}
          </tbody></table>

          <H id="persistence">Persistence &amp; privacy</H>
          <ul className="docs-list">
            <li><b>Cookies</b> hold only small pointers — the active workspace (type, name, Drive folder id) and your theme/accent. Never workspace data.</li>
            <li><b>IndexedDB</b> stores the Local folder's directory handle (it can't live in a cookie).</li>
            <li><b>sessionStorage</b> holds the Google Drive OAuth token for the session.</li>
            <li><b>Your content</b> only ever lives in the folder you picked — on your disk, or in your own Drive. Nothing is sent to any third-party server.</li>
          </ul>

          <H id="structure">Project structure</H>
          <table className="docs-table"><thead><tr><th>File</th><th>Responsibility</th></tr></thead><tbody>
            <tr><td><code>index.html</code></td><td>Boot screen and root mount point</td></tr>
            <tr><td><code>vite.config.js</code></td><td>Vite config (vendor chunk splitting)</td></tr>
            <tr><td><code>src/main.jsx</code></td><td>Entry point</td></tr>
            <tr><td><code>src/App.jsx</code></td><td>Restores theme, renders the workspace</td></tr>
            <tr><td><code>src/workspace.jsx</code></td><td>The full app: homepage, docs, editor, databases, sidebar, modals</td></tr>
            <tr><td><code>src/markdown.js</code></td><td>Workspace ⇄ folder-of-Markdown serialization (pure)</td></tr>
            <tr><td><code>src/localfs.js</code></td><td>Local folder storage (File System Access API + IndexedDB)</td></tr>
            <tr><td><code>src/cloudstorage.js</code></td><td>Google Drive folder-tree mirror</td></tr>
            <tr><td><code>src/cookies.js</code></td><td>Cookie helpers (active-workspace pointer + theme)</td></tr>
            <tr><td><code>src/styles.css</code></td><td>Theme tokens, components, dark mode</td></tr>
          </tbody></table>

          <H id="stack">Tech stack</H>
          <table className="docs-table"><thead><tr><th>Layer</th><th>Technology</th></tr></thead><tbody>
            <tr><td>Build tool</td><td>Vite 6</td></tr>
            <tr><td>UI</td><td>React 18</td></tr>
            <tr><td>Storage</td><td>File System Access API · Google Drive API</td></tr>
            <tr><td>Frontmatter</td><td>js-yaml</td></tr>
            <tr><td>Icons</td><td>lucide-react</td></tr>
            <tr><td>Import</td><td>mammoth (<code>.docx</code> → blocks)</td></tr>
          </tbody></table>

          <H id="deploy">Deployment</H>
          <p className="docs-p">The built <code>dist/</code> folder is a static site — host it anywhere (Vercel, Netlify,
            GitHub Pages, any static host). To use Google Drive on a deployed site:</p>
          <ol className="docs-list">
            <li>Add the site's origin as an <b>Authorised JavaScript origin</b> on your Google Cloud OAuth client.</li>
            <li>Ensure the <b>Google Drive API</b> is enabled in the project.</li>
            <li>If the OAuth app is in <b>Testing</b>, add your email as a Test User.</li>
          </ol>

          <H id="troubleshooting">Troubleshooting</H>
          <div className="docs-grid2">
            <div className="docs-card"><div className="docs-card-h">“Local folders need Chrome”</div><p>The File System Access API is Chromium-only. Use Chrome/Edge/Brave, or use a Google Drive workspace instead.</p></div>
            <div className="docs-card"><div className="docs-card-h">Drive says “not connected”</div><p>Your session token expired. Click the cloud icon (or Manage workspaces) to reconnect — connecting needs a click because the OAuth popup requires a user gesture.</p></div>
            <div className="docs-card"><div className="docs-card-h">Drive is slow to open</div><p>Reading a Drive workspace makes one network request per file; large workspaces take longer than local ones. This is expected.</p></div>
            <div className="docs-card"><div className="docs-card-h">A local workspace needs access</div><p>Chromium re-asks for folder permission each session — click <b>Reconnect</b> / <b>Open</b> to re-grant.</p></div>
          </div>

          <div className="docs-foot">
            © {new Date().getFullYear()} Workspace · Mohan Viswagna MR ·{' '}
            <a href="https://github.com/MohanViswagnaMR/Workspace" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
      </main>
    </div>
  </div>;
}

/* =========================================================================
   ABOUT & SELF-HOSTING — simple single-column site pages (docs styling)
   ========================================================================= */
function SitePage({tag,onBack,theme,onToggleTheme,children}){
  return <div className="docs-page">
    <div className="docs-top">
      <button className="docs-back" onClick={onBack} title="Back">
        <Ic n="back" style={{width:16,height:16}}/> Back
      </button>
      <div className="docs-top-brand">
        <span className="home-nav-mark">◧</span>
        <span className="home-nav-title">Workspace</span>
        <span className="docs-top-tag">{tag}</span>
      </div>
      <div className="docs-top-actions">
        <a className="home-nav-link home-nav-icon" href="https://github.com/MohanViswagnaMR/Workspace"
          target="_blank" rel="noopener noreferrer" title="View on GitHub" aria-label="View on GitHub">
          <GitHubIcon/>
        </a>
        <button type="button" role="switch" aria-checked={theme==='dark'}
          className={cx('theme-switch',theme==='dark'&&'on')} onClick={onToggleTheme}
          title={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
          aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>
          <Ic n="sun" style={{width:13,height:13}}/>
          <Ic n="moon" style={{width:13,height:13}}/>
          <span className="theme-switch-knob"/>
        </button>
      </div>
    </div>
    <div className="docs-body">
      <main className="docs-main">
        <div className="docs-content">
          {children}
          <div className="docs-foot">
            © {new Date().getFullYear()} Workspace · Mohan Viswagna MR ·{' '}
            <a href="https://github.com/MohanViswagnaMR/Workspace" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
      </main>
    </div>
  </div>;
}

function AboutPage({onBack,theme,onToggleTheme,onDocs,onSelfHost}){
  return <SitePage tag="About" onBack={onBack} theme={theme} onToggleTheme={onToggleTheme}>
    <div className="docs-hero">
      <h1 className="docs-title">About Workspace</h1>
      <p className="docs-lead">
        A fast, block-based, Notion-style workspace with a simple promise:
        <b> your notes are yours</b> — as plain, readable files, with no account
        and no backend between you and your own words.
      </p>
    </div>

    <h2 className="docs-h2">Why it exists</h2>
    <p className="docs-p">
      Modern note apps are wonderful to write in but keep your work inside their
      own databases, behind their own accounts. If the app changes, breaks, or
      shuts down, your notes go with it. Workspace keeps the writing experience —
      blocks, slash commands, nested pages, databases with views — but stores
      everything as ordinary folders and Markdown files that outlive any app.
    </p>

    <h2 className="docs-h2">The principles</h2>
    <ul className="docs-list">
      <li><b>Files over databases.</b> Every page is a plain <code>.md</code> file with a
        little YAML frontmatter; folders mirror the page hierarchy. No JSON, no
        proprietary formats.</li>
      <li><b>No accounts.</b> There is nothing to sign up for. Your workspace lives in a
        folder on your computer, or — if you choose — a real, browsable folder in your
        own Google Drive.</li>
      <li><b>No lock-in.</b> Stop using the app any day and your notes remain a tidy
        folder of Markdown, readable in any editor, importable anywhere.</li>
      <li><b>Local-first.</b> Installable as an app; local workspaces work fully
        offline. The network is only used for Google Drive, if you connect it.</li>
    </ul>

    <h2 className="docs-h2">What's inside</h2>
    <p className="docs-p">
      A block editor (text, headings, to-dos, lists, toggles, quotes, callouts, code,
      images, files), infinite nested pages, multi-view databases (table, board,
      gallery, list, calendar), instant search, favorites, templates, trash &amp;
      archive, dark mode, and <code>.docx</code> import. See the{' '}
      <button type="button" className="home-demo-link" onClick={onDocs}>full documentation</button>.
    </p>

    <h2 className="docs-h2">Open source &amp; self-hostable</h2>
    <p className="docs-p">
      Workspace is a static site — a Vite + React app with no server of its own. The
      source is on <a href="https://github.com/MohanViswagnaMR/Workspace" target="_blank"
      rel="noopener noreferrer">GitHub</a>, and you can{' '}
      <button type="button" className="home-demo-link" onClick={onSelfHost}>host it yourself</button>{' '}
      on any static host.
    </p>

    <h2 className="docs-h2">Tech</h2>
    <table className="docs-table"><tbody>
      <tr><td>Build tool</td><td>Vite 6</td></tr>
      <tr><td>UI</td><td>React 18</td></tr>
      <tr><td>Storage</td><td>File System Access API · Google Drive API</td></tr>
      <tr><td>Frontmatter</td><td>js-yaml</td></tr>
      <tr><td>Icons</td><td>lucide-react</td></tr>
      <tr><td>Import</td><td>mammoth (<code>.docx</code> → blocks)</td></tr>
    </tbody></table>
  </SitePage>;
}

function SelfHostPage({onBack,theme,onToggleTheme}){
  return <SitePage tag="Self-hosting" onBack={onBack} theme={theme} onToggleTheme={onToggleTheme}>
    <div className="docs-hero">
      <h1 className="docs-title">Self-hosting Workspace</h1>
      <p className="docs-lead">
        Workspace has no backend — the production build is a folder of static files.
        If you can serve HTML, you can host it: Vercel, Netlify, GitHub Pages, an
        nginx box, a Raspberry Pi.
      </p>
    </div>

    <h2 className="docs-h2">1 · Build</h2>
    <pre className="docs-code"><code>{`git clone https://github.com/MohanViswagnaMR/Workspace.git
cd Workspace
npm install
npm run build     # → static site in dist/`}</code></pre>
    <p className="docs-p">
      That's the whole build. <code>npm run preview</code> serves <code>dist/</code> locally
      so you can check it (including the PWA service worker) before deploying.
    </p>

    <h2 className="docs-h2">2 · Deploy the <code>dist/</code> folder</h2>
    <ul className="docs-list">
      <li><b>Vercel / Netlify</b> — point it at the repo; build command <code>npm run build</code>,
        output directory <code>dist</code>. Nothing else to configure.</li>
      <li><b>GitHub Pages</b> — publish the <code>dist/</code> folder (e.g. with an Actions
        workflow). Prefer a custom domain or user site served from the root — see the
        sub-path note below.</li>
      <li><b>Your own server</b> — copy <code>dist/</code> behind nginx/Apache/Caddy. It's
        static files; no Node process is needed in production. Serve over <b>HTTPS</b> —
        the File System Access API, service worker, and Google sign-in all require a
        secure origin (plain <code>http://localhost</code> is fine for testing).</li>
    </ul>
    <p className="docs-note">
      Local-folder workspaces and the offline PWA work out of the box on any HTTPS
      host — no configuration at all. Google Drive is the only feature that needs setup.
    </p>

    <h2 className="docs-h2">3 · (Optional) Google Drive on your domain</h2>
    <p className="docs-p">
      Drive workspaces use Google's browser OAuth flow with a client ID that is public
      by design (there is no secret). To run it on your own domain:
    </p>
    <ul className="docs-list">
      <li>In <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google
        Cloud Console</a>, create a project and enable the <b>Google Drive API</b>.</li>
      <li>Create an <b>OAuth client ID</b> of type <i>Web application</i> and add your
        site's origin (e.g. <code>https://notes.example.com</code>) as an
        <b> Authorised JavaScript origin</b>.</li>
      <li>Put your client ID in <code>src/cloudstorage.js</code> (the
        <code> GDRIVE_CLIENT_ID</code> constant at the top) and rebuild.</li>
    </ul>
    <p className="docs-p">
      Skip all of this if you only want local-folder workspaces — the Drive option
      simply won't authenticate.
    </p>

    <h2 className="docs-h2">Deploying under a sub-path</h2>
    <p className="docs-p">
      The manifest and service worker assume the site is served from the origin root
      (<code>/</code>). If you deploy under a sub-path (e.g.
      <code> example.com/workspace/</code>), set Vite's <code>base</code> in
      <code> vite.config.js</code> and adjust the paths in
      <code> public/manifest.webmanifest</code>, <code>public/sw.js</code>, and the
      service-worker registration in <code>src/main.jsx</code> to match.
    </p>

    <h2 className="docs-h2">Updating</h2>
    <p className="docs-p">
      Pull the new version, <code>npm run build</code>, redeploy <code>dist/</code>.
      The service worker uses the classic lifecycle: a new version activates once all
      tabs are closed — no forced reloads, and your notes are never touched (they live
      in your folders, not on the site).
    </p>
  </SitePage>;
}

/* =========================================================================
   WORKSPACE  (the app surface)
   ========================================================================= */
function Workspace(){
  const [store,setStore]=React.useState(null);   // connected workspace, or null → home
  const [booting,setBooting]=React.useState(true);
  const [home,setHome]=React.useState({pointer:null,list:[],busy:false,error:''});
  const [expanded,setExpanded]=React.useState({});
  const [sidebarOpen,setSidebarOpen]=React.useState(true);
  const [modal,setModal]=React.useState(null);
  const [peek,setPeek]=React.useState(null); // {dbHostId, rowId}
  const [showTutorial,setShowTutorial]=React.useState(false);
  const [sitePage,setSitePage]=React.useState(null); // 'docs' | 'about' | 'selfhost'
  const [entry,setEntry]=React.useState(null);       // null (auto) | 'start' | 'welcome'
  const [homeTheme,setHomeTheme]=React.useState(()=>readTheme().theme);
  const [saveState,setSaveState]=React.useState('saved'); // 'saved' | 'saving' | 'error'
  const driveTimer=React.useRef(null);
  const savedRef=React.useRef({id:null});
  const tutorialShown=React.useRef(false);

  /* ---- homepage dark/light toggle (persists to cookie + <body>) ---- */
  const toggleHomeTheme=()=>{
    setHomeTheme(t=>{
      const next=t==='dark'?'light':'dark';
      writeTheme({theme:next,accent:readTheme().accent});
      document.body.classList.toggle('dark',next==='dark');
      return next;
    });
  };

  /* ---- build the switcher list from local index + the active workspace ---- */
  const buildWsList=(localList,active)=>{
    const list=(localList||[]).map(l=>({...l}));
    if(active&&active.type==='demo')
      list.unshift({id:active.id,name:active.name,type:'demo'});
    if(active&&active.type==='gdrive'&&!list.some(w=>w.id===active.id))
      list.push({id:active.id,name:active.name,type:'gdrive',folderId:active.folderId});
    if(active&&active.type==='local'&&!list.some(w=>w.id===active.id))
      list.push({id:active.id,name:active.name,type:'local',accessible:true});
    return list;
  };

  /* ---- known workspaces to offer on the homepage (locals + last Drive) ---- */
  const homeList=(localList,ptr)=>{
    const list=(localList||[]).map(l=>({...l}));
    if(ptr&&ptr.type==='gdrive'&&ptr.folderId&&!list.some(w=>w.id===ptr.folderId))
      list.push({id:ptr.folderId,name:ptr.name||'Drive workspace',type:'gdrive',folderId:ptr.folderId});
    return list;
  };

  /* ---- merge live Google Drive workspaces into a homepage list (dedup by id) ---- */
  const mergeDriveWorkspaces=(list,driveList)=>{
    const out=(list||[]).map(w=>({...w}));
    (driveList||[]).forEach(d=>{
      if(!out.some(w=>w.id===d.id)) out.push({id:d.id,name:d.name,type:'gdrive',folderId:d.id});
    });
    return out;
  };

  /* ---- assemble store from freshly-loaded data + activate ---- */
  const mountStore=(data,active,theme,accent,localList)=>{
    const info=data.info||{};   // workspace-level appearance (info.md)
    setStore({
      nodes:data.nodes||{},favorites:data.favorites||[],
      currentId:data.currentId||Object.keys(data.nodes||{})[0]||DASH_ID,
      uploads:data.uploads||[],
      theme:info.theme||theme, accent:info.accent||accent,
      font:info.font||'default', description:info.description||'',
      pageBg:info.pageBg||null, pageBgUrl:info.pageBgUrl||null,
      active, localList:localList||[],
      tutorialCompleted:getCookie('ws_tutorial')==='1',
    });
    // Demo workspaces are memory-only — never remember them across reloads.
    if(active.type!=='demo') writeActivePointer(active.type==='gdrive'
      ?{type:'gdrive',name:active.name,folderId:active.folderId,id:active.id}
      :{type:'local',name:active.name,id:active.id});
  };

  /* ---- boot: read cookie pointer, list local workspaces, try to reconnect ---- */
  React.useEffect(()=>{
    let alive=true;
    (async()=>{
      const {theme,accent}=readTheme();
      const localIndex=isLocalFSSupported()?await loadLocalWorkspaceIndex():[];
      const localList=localIndex.map(l=>({id:l.id,name:l.name||l.dirName,type:'local',accessible:l.accessible}));
      const ptr=readActivePointer();
      const driveConnected=!!getDriveToken();
      const goHome=extra=>{
        if(alive){ setHome(h=>({...h,pointer:ptr,list:homeList(localList,ptr),driveConnected,...extra})); setBooting(false); }
        // If we already hold a Drive token, surface every connected Drive
        // workspace in "Your workspaces" (no prompt — token is already live).
        if(driveConnected) listDriveWorkspaces()
          .then(dl=>{ if(alive&&dl.length) setHome(h=>({...h,list:mergeDriveWorkspaces(h.list,dl)})); })
          .catch(()=>{});
      };
      if(!ptr){ goHome(); return; }
      try{
        if(ptr.type==='local'){
          const entry=localIndex.find(l=>l.id===ptr.id);
          if(entry&&entry.accessible){
            const data=await readWorkspaceTree(ptr.id);
            if(alive){ mountStore(data,{id:ptr.id,name:ptr.name||entry.name,type:'local'},theme,accent,localList); setBooting(false); }
            return;
          }
          goHome(); return; // needs a click to grant folder permission
        }
        if(ptr.type==='gdrive'){
          if(getDriveToken()){
            const data=await readGdriveWorkspaceTree(ptr.folderId);
            if(alive){ mountStore(data,{id:ptr.folderId,name:ptr.name,type:'gdrive',folderId:ptr.folderId},theme,accent,localList); setBooting(false); }
            return;
          }
          goHome(); return; // needs a click to re-authenticate
        }
      }catch(e){ goHome({error:e.message}); return; }
      goHome();
    })();
    return ()=>{ alive=false; };
  },[]);

  /* ---- persist on change: write the Markdown tree + theme cookie ---- */
  React.useEffect(()=>{
    if(!store) return;
    writeTheme({theme:store.theme,accent:store.accent});
    document.body.classList.toggle('dark',store.theme==='dark');
    ['indigo','blue','ocean','forest','rose','sunset','violet'].forEach(a=>document.body.classList.remove(`t-${a}`));
    document.body.classList.add(`t-${store.accent||'violet'}`);

    const active=store.active;
    // Demo workspaces live only in memory — nothing is ever written.
    if(active?.type==='demo'){ savedRef.current.id=active.id; setSaveState('demo'); return; }
    // Freshly opened / switched workspace → nothing to save yet; don't rewrite it.
    if(savedRef.current.id!==active.id){ savedRef.current.id=active.id; setSaveState('saved'); return; }

    const info={theme:store.theme,accent:store.accent,font:store.font,description:store.description,pageBg:store.pageBg};
    const payload={nodes:store.nodes,favorites:store.favorites,uploads:store.uploads,info};
    setSaveState('saving');
    clearTimeout(driveTimer.current);
    const delay=active?.type==='gdrive'?1500:600;
    driveTimer.current=setTimeout(async()=>{
      try{
        if(active?.type==='local') await writeWorkspaceTreeNow(active.id,payload);
        else if(active?.type==='gdrive') await writeGdriveWorkspaceTree(active.folderId,payload);
        setSaveState('saved');
      }catch(e){ console.warn('[save] failed:',e.message); setSaveState('error'); }
    },delay);
  },[store]);

  /* ---- kick off the tutorial once, on first connect ---- */
  React.useEffect(()=>{
    if(store&&!store.tutorialCompleted&&!tutorialShown.current){ tutorialShown.current=true; setShowTutorial(true); }
  },[store]);

  /* ---- global keyboard (declared before early return to keep hook order stable) ---- */
  React.useEffect(()=>{
    const h=e=>{
      const meta=e.metaKey||e.ctrlKey;
      if(meta&&e.key==='k'){e.preventDefault();setModal(m=>m&&m.type==='search'?null:{type:'search'});}
      else if(meta&&e.key==='\\'){e.preventDefault();setSidebarOpen(o=>!o);}
      else if(meta&&e.shiftKey&&(e.key==='l'||e.key==='L')){e.preventDefault();
        setStore(s=>s?{...s,theme:s.theme==='dark'?'light':'dark'}:s);}
      else if(meta&&(e.key==='/'||e.key==='?')){e.preventDefault();setModal({type:'shortcuts'});}
      else if(e.altKey&&!e.ctrlKey&&!e.metaKey&&e.code==='KeyN'){e.preventDefault();
        setStore(s=>{
          if(!s) return s;
          const id=nid();
          const sort=Object.values(s.nodes).filter(n=>n.parentId===null&&!n.trashed).length;
          const nn={id,kind:'page',title:'',icon:'',cover:'',parentId:null,sort,blocks:[{id:nid(),type:'text',html:''}]};
          return {...s,nodes:{...s.nodes,[id]:nn},currentId:id};
        });
        setModal(null);}
      else if(e.key==='Escape'){setModal(null);setPeek(null);}
    };
    window.addEventListener('keydown',h);
    return()=>window.removeEventListener('keydown',h);
  },[]);

  /* =================== connect / reconnect handlers =================== */
  const finishConnect=async(data,active)=>{
    const {theme,accent}=readTheme();
    const localIndex=isLocalFSSupported()?await loadLocalWorkspaceIndex():[];
    const localList=localIndex.map(l=>({id:l.id,name:l.name||l.dirName,type:'local',accessible:l.accessible}));
    mountStore(data,active,theme,accent,localList);
    setModal(null); setBooting(false);
    setHome(h=>({...h,pointer:null,busy:false,error:''}));
    setExpanded({});
  };

  /* One-click demo — the seed workspace mounted purely in memory. Nothing is
     asked for and nothing is written; "Keep this workspace" (the in-app
     Connect modal) turns it into a real Local/Drive workspace, content included. */
  const openDemo=async()=>{
    const seed=buildSeed();
    const info={};
    await finishConnect(
      {nodes:seed.nodes,favorites:seed.favorites,currentId:seed.currentId,uploads:[],info},
      {id:'demo',name:'Demo workspace',type:'demo'});
  };

  const connectLocalNew=async(name,description)=>{
    if(!name||!name.trim()) return;
    const id=nid();
    try{
      // User picks a LOCATION; we create the "<name>" folder inside it.
      const rec=await createLocalWorkspaceFolder(id,name.trim());
      let data=null;
      try{ data=await readWorkspaceTree(id); }catch(_){}
      const hasContent=data&&Object.keys(data.nodes||{}).length;
      // If a folder of that name already existed WITH content, open it as-is
      // instead of overwriting it.
      if(rec.alreadyExisted&&hasContent){
        await finishConnect(data,{id,name:rec.name,type:'local'});
        return;
      }
      // New workspaces start empty — sample pages exist only in the demo;
      // keeping the demo carries its current content into the new workspace.
      const seed=store&&store.active?.type==='demo'
        ? {nodes:store.nodes,favorites:store.favorites,currentId:store.currentId}
        : {nodes:{},favorites:[],currentId:null};
      const info={...readTheme(),font:'default',pageBg:null,description:(description||'').trim()};
      data={nodes:seed.nodes,favorites:seed.favorites,currentId:seed.currentId,uploads:[],info};
      await writeWorkspaceTreeNow(id,{nodes:data.nodes,favorites:data.favorites,uploads:[],info});
      await finishConnect(data,{id,name:rec.name,type:'local'});
    }catch(e){ if(e?.name!=='AbortError') alert('Could not create the workspace: '+(e?.message||e)); }
  };

  const connectLocalExisting=async()=>{
    const id=nid();
    try{
      const rec=await openExistingDirectory(id);
      if(!rec.foundFile){
        alert('That folder is not a workspace.\n\nPick a folder that contains a “Space” sub-folder (or its parent).');
        try{ await removeLocalWorkspaceRecord(id); }catch(_){}
        return;
      }
      const data=rec.data||await readWorkspaceTree(id);
      await finishConnect(data,{id,name:rec.name,type:'local'});
    }catch(e){ if(e?.name!=='AbortError') alert('Could not open the folder: '+(e?.message||e)); }
  };

  const connectDriveNew=async(name,description)=>{
    setHome(h=>({...h,busy:true,error:''}));
    try{
      const folderId=await createDriveWorkspace(name);
      // New workspaces start empty — sample pages exist only in the demo;
      // keeping the demo carries its current content into the new workspace.
      const seed=store&&store.active?.type==='demo'
        ? {nodes:store.nodes,favorites:store.favorites,currentId:store.currentId}
        : {nodes:{},favorites:[],currentId:null};
      const info={...readTheme(),font:'default',pageBg:null,description:(description||'').trim()};
      await writeGdriveWorkspaceTree(folderId,{nodes:seed.nodes,favorites:seed.favorites,uploads:[],info});
      await finishConnect({nodes:seed.nodes,favorites:seed.favorites,currentId:seed.currentId,uploads:[],info},
        {id:folderId,name,type:'gdrive',folderId});
    }catch(e){ setHome(h=>({...h,busy:false,error:e.message||'Could not create the Drive workspace.'})); }
  };

  /* Connect (or reconnect) Google Drive from the homepage, then list every
     Drive workspace into "Your workspaces". */
  const connectDriveList=async()=>{
    setHome(h=>({...h,busy:true,error:''}));
    try{
      await authenticateGoogleDrive();
      const dl=await listDriveWorkspaces();
      setHome(h=>({...h,busy:false,driveConnected:true,list:mergeDriveWorkspaces(h.list,dl)}));
    }catch(e){ setHome(h=>({...h,busy:false,error:e.message||'Could not connect to Google Drive.'})); }
  };

  /* A Drive workspace was permanently deleted — drop it from the homepage. */
  const handleDriveWorkspaceDeleted=id=>{
    if(home.pointer&&home.pointer.folderId===id) clearActivePointer();
    setHome(h=>({...h,
      list:(h.list||[]).filter(w=>w.id!==id),
      pointer:h.pointer&&h.pointer.folderId===id?null:h.pointer}));
  };

  /* A Drive workspace was renamed — reflect the new title on the homepage. */
  const handleDriveWorkspaceRenamed=(id,name)=>{
    setHome(h=>{
      const pointer=h.pointer&&h.pointer.folderId===id?{...h.pointer,name}:h.pointer;
      if(pointer!==h.pointer) writeActivePointer(pointer);
      return {...h,
        list:(h.list||[]).map(w=>w.id===id?{...w,name}:w),
        pointer};
    });
  };

  const connectDriveExisting=async(folderId,name)=>{
    // No folderId → open the browser modal, which lists every connected Drive
    // workspace (and prompts a Google reconnect itself if the session lapsed).
    if(!folderId){ setModal({type:'browse-cloud'}); return; }
    setHome(h=>({...h,busy:true,error:''}));
    try{
      await authenticateGoogleDrive();
      const data=await readGdriveWorkspaceTree(folderId);
      await finishConnect(data,{id:folderId,name:name||'Drive workspace',type:'gdrive',folderId});
    }catch(e){ setHome(h=>({...h,busy:false,error:e.message||'Could not connect to Google Drive.'})); }
  };

  /* Open a workspace the user has already connected before (from the homepage
     list). Local needs a permission gesture; Drive needs a token. */
  const openKnownWorkspace=async entry=>{
    if(!entry) return;
    setHome(h=>({...h,busy:true,error:''}));
    try{
      if(entry.type==='local'){
        let handle=(await getLocalWorkspaceRecord(entry.id))?.handle;
        if(!handle){ const rec=await relinkAndRegisterDirectory(entry.id); handle=rec.handle; }
        const {granted,reason}=await requestPermissionForHandleDetailed(handle,true);
        if(!granted){ setHome(h=>({...h,busy:false,error:localPermMessage(reason)})); return; }
        const data=await readWorkspaceTree(entry.id);
        await finishConnect(data,{id:entry.id,name:entry.name,type:'local'});
      }else{
        await authenticateGoogleDrive();
        const data=await readGdriveWorkspaceTree(entry.folderId);
        await finishConnect(data,{id:entry.folderId,name:entry.name,type:'gdrive',folderId:entry.folderId});
      }
    }catch(e){ if(e?.name==='AbortError') setHome(h=>({...h,busy:false})); else setHome(h=>({...h,busy:false,error:e.message})); }
  };

  const reconnectActive=()=>openKnownWorkspace(home.pointer);

  /* Disconnect a known workspace from the homepage list. This ONLY forgets the
     connection — the folder and its Markdown files are never touched. */
  const removeKnownWorkspace=async entry=>{
    if(!entry) return;
    const where=entry.type==='gdrive'?'in Google Drive':'on your computer';
    if(!confirm(`Unlink “${entry.name}”?\n\nThis just removes it from this list — the folder and its Markdown files ${where} are NOT deleted. You can add it back anytime with “Open existing…”.`)) return;
    if(entry.type==='local') await removeLocalWorkspaceRecord(entry.id).catch(()=>{});
    if(home.pointer&&home.pointer.id===entry.id){ clearActivePointer(); }
    setHome(h=>({...h,
      list:(h.list||[]).filter(w=>w.id!==entry.id),
      pointer:h.pointer&&h.pointer.id===entry.id?null:h.pointer}));
  };

  const goHome=async()=>{
    if(store) await flushCurrent();
    clearActivePointer();
    const localIndex=isLocalFSSupported()?await loadLocalWorkspaceIndex():[];
    const localList=localIndex.map(l=>({id:l.id,name:l.name||l.dirName,type:'local',accessible:l.accessible}));
    setStore(null);
    setHome({pointer:readActivePointer(),list:homeList(localList,readActivePointer()),busy:false,error:''});
    setModal(null); setExpanded({});
  };

  /* =================== workspace switching / deletion =================== */
  const flushCurrent=async()=>{
    if(!store) return;
    const a=store.active;
    const info={theme:store.theme,accent:store.accent,font:store.font,description:store.description,pageBg:store.pageBg};
    const payload={nodes:store.nodes,favorites:store.favorites,uploads:store.uploads,info};
    try{
      if(a?.type==='local') await writeWorkspaceTreeNow(a.id,payload);
      else if(a?.type==='gdrive'){ clearTimeout(driveTimer.current); await writeGdriveWorkspaceTree(a.folderId,payload); }
    }catch(_){}
  };

  const switchWorkspace=async wsId=>{
    if(!store||store.active.id===wsId) return;
    const target=(store.localList||[]).find(w=>w.id===wsId)
      ||(store.active.type==='gdrive'&&store.active.id===wsId?store.active:null);
    if(!target) return;
    await flushCurrent();
    try{
      if(target.type==='local'){
        let handle=(store.localList.find(l=>l.id===wsId)||{}).handle||(await getLocalWorkspaceRecord(wsId))?.handle;
        const {granted,reason}=await requestPermissionForHandleDetailed(handle,true);
        if(!granted){ alert(localPermMessage(reason)); return; }
        const data=await readWorkspaceTree(wsId);
        mountStore(data,{id:wsId,name:target.name,type:'local'},store.theme,store.accent,store.localList);
      }else{
        await authenticateGoogleDrive();
        const data=await readGdriveWorkspaceTree(target.folderId);
        mountStore(data,{id:target.folderId,name:target.name,type:'gdrive',folderId:target.folderId},store.theme,store.accent,store.localList);
      }
      setExpanded({});
    }catch(e){ alert('Could not switch workspace: '+(e?.message||e)); }
  };

  const deleteWorkspace=async wsId=>{
    if(!store) return;
    const list=buildWsList(store.localList,store.active);
    const target=list.find(w=>w.id===wsId); if(!target) return;
    const isActive=store.active.id===wsId;
    const msg=target.type==='local'
      ? `Remove “${target.name}” from the list?\n\nThe folder and its Markdown files on your computer are NOT deleted — you can open it again anytime.`
      : `Remove “${target.name}” from the list?\n\nThe folder in Google Drive is NOT deleted — you can reconnect it anytime.`;
    if(!confirm(msg)) return;
    if(target.type==='local') await removeLocalWorkspaceRecord(wsId).catch(()=>{});
    const newLocal=(store.localList||[]).filter(l=>l.id!==wsId);
    if(isActive){
      clearActivePointer();
      setStore(null);
      setHome({pointer:null,list:homeList(newLocal,null),busy:false,error:''});
      setModal(null); setExpanded({});
    }else{
      setStore(s=>({...s,localList:newLocal}));
    }
  };

  if(booting) return <div className="app-loading"><div className="app-loading-logo">◧</div><div className="app-loading-bar"><i /></div></div>;

  if(sitePage==='docs')
    return <DocsPage onBack={()=>setSitePage(null)} theme={homeTheme} onToggleTheme={toggleHomeTheme}/>;
  if(sitePage==='about')
    return <AboutPage onBack={()=>setSitePage(null)} theme={homeTheme} onToggleTheme={toggleHomeTheme}
      onDocs={()=>setSitePage('docs')} onSelfHost={()=>setSitePage('selfhost')}/>;
  if(sitePage==='selfhost')
    return <SelfHostPage onBack={()=>setSitePage(null)} theme={homeTheme} onToggleTheme={toggleHomeTheme}/>;

  /* First visit (no workspace data in this browser) → the Welcome landing.
     Any browser memory — known workspaces, an active pointer, a live Drive
     session — or a "Get Started" click leads to the start page below. The
     start page's "Welcome" nav link shows the landing again on demand. */
  const hasMemory=(home.list||[]).length>0||!!home.pointer||!!home.driveConnected;
  const showWelcome=entry==='welcome'||(entry!=='start'&&!hasMemory);
  if(!store&&showWelcome)
    return <WelcomePage onGetStarted={()=>setEntry('start')} onDemo={openDemo}
      onDocs={()=>setSitePage('docs')} onAbout={()=>setSitePage('about')}
      onSelfHost={()=>setSitePage('selfhost')}
      theme={homeTheme} onToggleTheme={toggleHomeTheme}/>;

  if(!store) return <>
    <HomeScreen pointer={home.pointer} list={home.list} busy={home.busy} error={home.error}
      driveConnected={home.driveConnected} onConnectDrive={connectDriveList}
      onManage={()=>setModal({type:'manage-ws'})} onDocs={()=>setSitePage('docs')}
      onWelcome={()=>setEntry('welcome')}
      theme={homeTheme} onToggleTheme={toggleHomeTheme}
      onOpen={openKnownWorkspace} onRemove={removeKnownWorkspace} onReconnect={reconnectActive}
      onLocalNew={connectLocalNew} onLocalExisting={connectLocalExisting}
      onDriveNew={connectDriveNew} onDriveExisting={()=>connectDriveExisting(null)}/>
    {modal&&modal.type==='browse-cloud'&&
      <CloudWorkspacesModal
        connectedWorkspaces={home.list}
        onReconnect={(folderId,name)=>connectDriveExisting(folderId,name)}
        onClose={()=>{
          setModal(null);
          // If the modal authenticated Drive, reflect it on the homepage.
          if(getDriveToken()) listDriveWorkspaces()
            .then(dl=>setHome(h=>({...h,driveConnected:true,list:mergeDriveWorkspaces(h.list,dl)})))
            .catch(()=>{});
        }}/>}
    {modal&&modal.type==='manage-ws'&&
      <ManageWorkspacesModal
        connectedWorkspaces={home.list}
        onOpen={(folderId,name)=>connectDriveExisting(folderId,name)}
        onDeleted={handleDriveWorkspaceDeleted}
        onRenamed={handleDriveWorkspaceRenamed}
        onClose={()=>{
          setModal(null);
          if(getDriveToken()) listDriveWorkspaces()
            .then(dl=>setHome(h=>({...h,driveConnected:true,list:mergeDriveWorkspaces(h.list,dl)})))
            .catch(()=>{});
        }}/>}
  </>;

  const {nodes,favorites,currentId,theme,accent='violet'}=store;
  const node=currentId===DASH_ID?null:nodes[currentId]||nodes[Object.keys(nodes)[0]]||null;
  const workspaces=buildWsList(store.localList,store.active);
  const activeWorkspaceId=store.active.id;
  const activeWorkspace=workspaces.find(w=>w.id===activeWorkspaceId)||store.active;
  const scopedUploads=store.uploads||[];

  /* ---- helpers ---- */
  const patch=p=>setStore(s=>({...s,...p}));
  const setNodes=fn=>setStore(s=>({...s,nodes:fn(s.nodes)}));
  const updateNode=(id,np)=>setNodes(n=>({...n,[id]:{...n[id],...np}}));
  const openPage=id=>{setStore(s=>({...s,currentId:id}));setPeek(null);setModal(null);};
  const toggleExp=(id,force)=>setExpanded(e=>({...e,[id]:force!==undefined?force:!e[id]}));

  const addNode=(parentId,extra={})=>{
    const id=nid();
    const sibs=Object.values(nodes).filter(n=>n.parentId===parentId&&!n.trashed);
    const nn={id,kind:'page',title:'',icon:'',cover:'',parentId,
      sort:sibs.length,blocks:[{id:nid(),type:'text',html:''}],...extra};
    setNodes(n=>({...n,[id]:nn}));
    return id;
  };
  const addTop=()=>{const id=addNode(null);openPage(id);};
  const addChild=parentId=>{const id=addNode(parentId);setExpanded(e=>({...e,[parentId]:true}));openPage(id);};
  const createChild=parentId=>addNode(parentId); // for subpage blocks (no nav)

  const collectDesc=(id,acc)=>{acc.push(id);
    Object.values(nodes).filter(n=>n.parentId===id).forEach(c=>collectDesc(c.id,acc));};
  const trashNode=id=>{
    const acc=[];collectDesc(id,acc);
    setNodes(n=>{const m={...n};acc.forEach(x=>m[x]={...m[x],trashed:true});return m;});
    setStore(s=>({...s,favorites:s.favorites.filter(f=>!acc.includes(f)),
      currentId:acc.includes(s.currentId)?DASH_ID:s.currentId}));
  };
  const restore=id=>{
    const acc=[];const walk=x=>{acc.push(x);
      Object.values(nodes).filter(n=>n.parentId===x).forEach(c=>walk(c.id));};
    walk(id);
    setNodes(n=>{const m={...n};acc.forEach(x=>m[x]={...m[x],trashed:false});return m;});
  };
  const deleteForever=id=>{
    const acc=[];const walk=x=>{acc.push(x);
      Object.values(nodes).filter(n=>n.parentId===x).forEach(c=>walk(c.id));};
    walk(id);
    setNodes(n=>{const m={...n};acc.forEach(x=>delete m[x]);return m;});
  };
  const moveNode=(id,newParent)=>{
    if(id===newParent) return;
    let c=newParent;while(c){if(c===id) return;c=nodes[c]?nodes[c].parentId:null;}
    updateNode(id,{parentId:newParent});
    setExpanded(e=>({...e,[newParent]:true}));
  };
  const toggleFav=id=>setStore(s=>({...s,
    favorites:s.favorites.includes(id)?s.favorites.filter(f=>f!==id):[...s.favorites,id]}));

  const archiveNode=id=>{
    const acc=[];collectDesc(id,acc);
    setNodes(n=>{const m={...n};acc.forEach(x=>m[x]={...m[x],archived:true});return m;});
    setStore(s=>{
      const fallback=Object.keys(s.nodes).find(k=>!acc.includes(k)&&!s.nodes[k]?.trashed&&!s.nodes[k]?.archived);
      return {...s,favorites:s.favorites.filter(f=>!acc.includes(f)),
        currentId:acc.includes(s.currentId)?fallback||DASH_ID:s.currentId};
    });
  };
  const unarchiveNode=id=>setNodes(n=>({...n,[id]:{...n[id],archived:false}}));

  const duplicate=id=>{
    const src=nodes[id];if(!src) return;
    const copy={...clone(src),id:nid(),title:(src.title||'Untitled')+' (copy)',
      blocks:(src.blocks||[]).map(b=>({...clone(b),id:nid()})),
      db:src.db?clone(src.db):undefined,
      sort:Object.values(nodes).filter(n=>n.parentId===src.parentId).length};
    setNodes(n=>({...n,[copy.id]:copy}));
    openPage(copy.id);
  };

  const exportPage=id=>downloadPage(id,'md',false);

  const downloadPage=(id,format,withSubPages=false)=>{
    const n=nodes[id];if(!n) return;
    let content,type,ext;
    if(withSubPages){
      const tree=collectPageTree(id,nodes);
      if(format==='html'){ content=mergePagesToHTML(tree);type='text/html';ext='.html'; }
      else if(format==='txt'){
        content=tree.map(({node,depth},i)=>{
          const sep=i>0?'\n\n'+'━'.repeat(60)+'\n\n':'';
          const indent=depth>0?'  '.repeat(depth):'';
          return sep+(depth>0?indent+'↳ Sub-page\n':'')+(indent?indent:'')
            +pageToText(node).split('\n').join('\n'+indent);
        }).join('');
        type='text/plain';ext='.txt';
      } else {
        content=tree.map(({node,depth},i)=>{
          if(i===0) return blocksToMarkdown(node);
          const hashes='#'.repeat(Math.min(depth+1,6));
          const subTitle=`${hashes} ${node.icon||''}${node.icon?' ':''}${node.title||'Untitled'}`;
          const body=blocksToMarkdown(node).split('\n').slice(2).join('\n');
          return `\n\n---\n\n<!-- depth ${depth} -->\n${subTitle}\n\n${body}`;
        }).join('');
        type='text/markdown';ext='.md';
      }
    } else {
      if(format==='txt'){ content=pageToText(n);type='text/plain';ext='.txt'; }
      else if(format==='html'){ content=pageToHTML(n);type='text/html';ext='.html'; }
      else { content=blocksToMarkdown(n);type='text/markdown';ext='.md'; }
    }
    const blob=new Blob([content],{type});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(n.title||'Untitled')+(withSubPages?'+sub-pages':'')+ext;a.click();
  };

  const importPage=({title,blocks})=>{
    const id=nid();
    const sort=Object.values(nodes).filter(n=>n.parentId===null&&!n.trashed).length;
    setNodes(n=>({...n,[id]:{id,kind:'page',title:title||'Imported',icon:'📄',cover:'',
      parentId:null,sort,blocks}}));
    openPage(id);
  };

  /* ---- file uploads (written into Upload/ for both Local and Drive) ---- */
  const uploadFile=async file=>{
    const id=nid();
    const base={id,name:file.name,type:file.type||'application/octet-stream',
      size:file.size,uploadedAt:Date.now()};
    const active=store.active;
    const url=URL.createObjectURL(file);
    let localName=null;
    if(active.type==='local'){
      const dataUrl=await readAsDataUrl(file);
      localName=await writeLocalUploadFile(active.id,file.name,dataUrl).catch(()=>null);
    }else if(active.type==='gdrive'){
      const safe=Date.now()+'_'+(file.name||'file').replace(/[^a-zA-Z0-9._-]/g,'_');
      localName=await writeDriveUpload(active.folderId,safe,file).catch(()=>null);
    }
    const rec={...base,localName,wsId:active.id,dataUrl:url};
    setStore(s=>({...s,uploads:[...(s.uploads||[]),rec]}));
    return {...base,url,localName};
  };

  const deleteUpload=id=>{
    const rec=(store.uploads||[]).find(u=>u.id===id);
    if(rec?.localName&&store.active.type==='local')
      deleteLocalUploadFile(store.active.id,rec.localName).catch(()=>{});
    // Drive uploads are pruned by the next tree write (reconcile).
    setStore(s=>({...s,uploads:(s.uploads||[]).filter(u=>u.id!==id)}));
  };

  /* Upload / set / clear the workspace page-background image (saved in info.md). */
  const setPageBackground=async file=>{
    try{
      const rec=await uploadFile(file);
      if(rec?.localName) setStore(s=>({...s,pageBg:rec.localName,pageBgUrl:rec.url}));
    }catch(e){ alert('Could not set the background: '+(e?.message||e)); }
  };
  const clearPageBackground=()=>setStore(s=>({...s,pageBg:null,pageBgUrl:null}));

  const createFromTemplate=t=>{
    const id=addNode(null,{title:t.name,icon:t.icon});
    if(t.db){ updateNode(id,{kind:'database',db:newDB('table'),blocks:undefined}); }
    else{ updateNode(id,{blocks:t.blocks.map(b=>({id:nid(),...b}))}); }
    setModal(null);openPage(id);
  };

  /* ---- row peek (database row as page) ---- */
  const openRow=(dbHostId,rowId)=>setPeek({dbHostId,rowId});
  const getPeekData=()=>{
    if(!peek) return null;
    const host=nodes[peek.dbHostId];
    if(!host) return null;
    let db=null,setDb=null;
    if(host.kind==='database'){
      db=host.db; setDb=ndb=>updateNode(host.id,{db:ndb});
    }else{
      const blk=(host.blocks||[]).find(b=>b.type==='database');
      if(blk){db=blk.db;setDb=ndb=>updateNode(host.id,{blocks:host.blocks.map(b=>
        b.id===blk.id?{...b,db:ndb}:b)});}
    }
    if(!db) return null;
    const row=db.rows.find(r=>r.id===peek.rowId);
    if(!row) return null;
    return {db,setDb,row};
  };
  const peekData=getPeekData();
  const editorOpenRow=(db,rowId)=>openRow(currentId,rowId);
  const lookupNode=id=>nodes[id];
  const isDashboard=currentId===DASH_ID;
  const isStoragePage=currentId===STORAGE_ID;
  const isTrashPage=currentId===TRASH_ID;
  const isArchivePage=currentId===ARCHIVE_ID;
  const isTemplatesPage=currentId===TEMPLATES_ID;
  const renameNode=(id,title)=>updateNode(id,{...(title!==undefined?{title}:{})});

  /* simple full-page topbar (Home / Storage / Trash / Archive) */
  const pageTopbar=(emoji,label)=>
    <div className="topbar">
      {!sidebarOpen&&<div className="tb-btn" title="Open sidebar" onClick={()=>setSidebarOpen(o=>!o)}>
        <Ic n="menu" style={{width:17,height:17}}/></div>}
      <div className="crumbs"><div className="crumb"><span>{emoji}</span><span>{label}</span></div></div>
      <StorageBadge ws={activeWorkspace} onCreateWorkspace={()=>setModal({type:'create-workspace'})} onGoHome={goHome} saveState={saveState}/>
      <div className="topbar-actions"/>
    </div>;

  return <div className={cx('app',theme==='dark'&&'dark',`t-${accent}`)}
    style={{'--ws-font':fontStack(store.font)}}>
    <Sidebar open={sidebarOpen} nodes={nodes} favorites={favorites} currentId={currentId}
      expanded={expanded} toggleExp={toggleExp} openPage={openPage}
      addChild={addChild} trashNode={trashNode} archiveNode={archiveNode} onDrop={moveNode}
      addTop={addTop} setModal={setModal}
      workspaces={workspaces} activeWorkspaceId={activeWorkspaceId}
      onSwitchWorkspace={switchWorkspace}
      onCreateWorkspace={()=>setModal({type:'create-workspace'})}
      onDeleteWorkspace={deleteWorkspace}
      onReconnectLocal={switchWorkspace}
      toggleFav={toggleFav} duplicate={duplicate} exportPage={exportPage}
      renameNode={renameNode} onGoHome={goHome}/>

    <div className={cx('main',store.pageBgUrl&&'has-page-bg')}
      style={store.pageBgUrl?{'--page-bg':`url("${store.pageBgUrl}")`}:undefined}>
      {activeWorkspace.type==='demo'&&<div className="demo-banner">
        <span className="demo-banner-ic">🧪</span>
        <span className="demo-banner-tx"><b>You’re exploring the demo.</b> Edit anything —
          nothing is saved until you keep it.</span>
        <button className="btn primary sm" onClick={()=>setModal({type:'create-workspace'})}>
          Keep this workspace</button>
        <button className="btn ghost sm" onClick={goHome}>Exit demo</button>
      </div>}
      {isStoragePage
        ? <>
            <div className="topbar">
              {!sidebarOpen&&<div className="tb-btn" title="Open sidebar"
                onClick={()=>setSidebarOpen(o=>!o)}>
                <Ic n="menu" style={{width:17,height:17}}/></div>}
              <div className="crumbs">
                <div className="crumb"><span>📦</span><span>Storage</span></div>
              </div>
              <StorageBadge ws={activeWorkspace} onCreateWorkspace={()=>setModal({type:'create-workspace'})}
                onGoHome={goHome} saveState={saveState}/>
              <div className="topbar-actions"/>
            </div>
            <StoragePage uploads={scopedUploads} activeWorkspace={activeWorkspace}
              onDeleteUpload={deleteUpload} onUpload={uploadFile}/>
          </>
        : isDashboard
        ? <>
            <div className="topbar">
              {!sidebarOpen&&<div className="tb-btn" title="Open sidebar"
                onClick={()=>setSidebarOpen(o=>!o)}>
                <Ic n="menu" style={{width:17,height:17}}/></div>}
              <div className="crumbs">
                <div className="crumb"><span>🏠</span><span>Home</span></div>
              </div>
              <StorageBadge ws={activeWorkspace} onCreateWorkspace={()=>setModal({type:'create-workspace'})}
                onGoHome={goHome} saveState={saveState}/>
              <div className="topbar-actions"/>
            </div>
            <Dashboard nodes={nodes} favorites={favorites} openPage={openPage}
              addTop={addTop} setModal={setModal} activeWorkspace={activeWorkspace}/>
          </>
        : isTrashPage
        ? <>{pageTopbar('🗑️','Trash')}
            <TrashPage nodes={nodes} restore={restore} deleteForever={deleteForever}/></>
        : isArchivePage
        ? <>{pageTopbar('📦','Archive')}
            <ArchivePage nodes={nodes} unarchiveNode={unarchiveNode} deleteForever={deleteForever}/></>
        : isTemplatesPage
        ? <>{pageTopbar('🧩','Templates')}
            <TemplatesPage create={createFromTemplate}/></>
        : <>
            <Topbar node={node} nodes={nodes} openPage={openPage}
              toggleSidebar={()=>setSidebarOpen(o=>!o)} sidebarOpen={sidebarOpen}
              toggleFav={toggleFav} isFav={node&&favorites.includes(node.id)} setModal={setModal}
              downloadPage={downloadPage} activeWorkspace={activeWorkspace} onGoHome={goHome}
              saveState={saveState}/>
            {node&&<Editor key={node.id} node={node} update={updateNode}
              createChild={createChild} openPage={openPage}
              lookupNode={lookupNode} openRow={editorOpenRow}
              onUploadFile={uploadFile} uploads={scopedUploads}
              childPages={Object.values(nodes).filter(n=>n.parentId===node.id&&!n.trashed&&!n.archived)
                .sort((a,b)=>(a.sort||0)-(b.sort||0))}/>}
          </>}
    </div>

    {showTutorial&&
      <TutorialOverlay
        onComplete={()=>{setCookie('ws_tutorial','1');patch({tutorialCompleted:true});setShowTutorial(false);}}
        onSkip={()=>{setCookie('ws_tutorial','1');patch({tutorialCompleted:true});setShowTutorial(false);}}/>}

    {peekData&&
      <RowPeek db={peekData.db} row={peekData.row}
        onChange={updatedRow=>peekData.setDb({...peekData.db,
          rows:peekData.db.rows.map(r=>r.id===updatedRow.id?updatedRow:r)})}
        onClose={()=>setPeek(null)}/>}

    {/* modals */}
    {modal&&modal.type==='import'&&
      <ImportModal onImport={importPage} onClose={()=>setModal(null)}/>}
    {modal&&modal.type==='search'&&
      <SearchModal nodes={nodes} openPage={openPage} onClose={()=>setModal(null)}/>}
    {modal&&modal.type==='create-workspace'&&
      <CreateWorkspaceModal keepDemo={activeWorkspace.type==='demo'}
        onLocalNew={connectLocalNew} onLocalExisting={connectLocalExisting}
        onDriveNew={connectDriveNew} onDriveExisting={()=>connectDriveExisting(null)}
        onClose={()=>setModal(null)}/>}
    {modal&&modal.type==='shortcuts'&&
      <ShortcutsModal onClose={()=>setModal(null)}/>}
    {modal&&modal.type==='settings'&&
      <SettingsModal theme={theme} setTheme={t=>patch({theme:t})}
        accent={accent} setAccent={a=>patch({accent:a})}
        font={store.font} setFont={f=>patch({font:f})}
        description={store.description} setDescription={d=>patch({description:d})}
        pageBgUrl={store.pageBgUrl} onUploadBg={setPageBackground} onClearBg={clearPageBackground}
        nodeCount={Object.values(nodes).filter(n=>!n.trashed&&!n.archived).length}
        activeWorkspace={activeWorkspace} onGoHome={goHome}
        onClose={()=>setModal(null)}
        onRestartTutorial={()=>{setModal(null);setShowTutorial(true);}}/>}
    {modal&&modal.type==='page-menu'&&node&&
      <PageMenu node={node} nodes={nodes} onClose={()=>setModal(null)} trashNode={trashNode}
        duplicate={duplicate} setModal={setModal} downloadPage={downloadPage}/>}
    {modal&&modal.type==='browse-cloud'&&
      <CloudWorkspacesModal
        connectedWorkspaces={workspaces}
        onReconnect={(folderId,name)=>connectDriveExisting(folderId,name)}
        onClose={()=>setModal(null)}/>}
  </div>;
}


/* ---- collect node + all non-trashed descendants, depth-first ---- */
function collectPageTree(rootId, allNodes){
  const result=[];
  function walk(id,depth){
    const n=allNodes[id];
    if(!n||n.trashed||n.archived) return;
    result.push({node:n,depth});
    Object.values(allNodes)
      .filter(x=>x.parentId===id&&!x.trashed&&!x.archived)
      .sort((a,b)=>(a.sort||0)-(b.sort||0))
      .forEach(c=>walk(c.id,depth+1));
  }
  walk(rootId,0);
  return result; // [{node, depth}, …]
}

/* markdown export helper */
function blocksToMarkdown(node){
  const strip=h=>(h||'').replace(/<br\s*\/?>/gi,'\n')
    .replace(/<strong>(.*?)<\/strong>/gi,'**$1**')
    .replace(/<em>(.*?)<\/em>/gi,'*$1*')
    .replace(/<code>(.*?)<\/code>/gi,'`$1`')
    .replace(/<[^>]+>/g,'');
  let out=(node.icon?node.icon+' ':'')+'# '+(node.title||'Untitled')+'\n\n';
  (node.blocks||[]).forEach(b=>{
    const t=strip(b.html);
    if(b.type==='h1') out+='# '+t+'\n\n';
    else if(b.type==='h2') out+='## '+t+'\n\n';
    else if(b.type==='h3') out+='### '+t+'\n\n';
    else if(b.type==='bullet') out+='- '+t+'\n';
    else if(b.type==='number') out+='1. '+t+'\n';
    else if(b.type==='todo') out+='- ['+(b.checked?'x':' ')+'] '+t+'\n';
    else if(b.type==='quote') out+='> '+t+'\n\n';
    else if(b.type==='callout') out+='> '+(b.emoji||'💡')+' '+t+'\n\n';
    else if(b.type==='divider') out+='---\n\n';
    else if(b.type==='code') out+='```'+(b.lang||'')+'\n'+(b.code||'')+'\n```\n\n';
    else if(b.type==='image') out+=(b.url?'!['+(b.caption||'')+']('+b.url+')':'')+'\n\n';
    else if(b.type==='bookmark') out+='['+(b.title||b.url)+']('+b.url+')\n\n';
    else if(t) out+=t+'\n\n';
  });
  return out;
}

/* plain-text export */
function pageToText(node){
  const strip=h=>(h||'').replace(/<br\s*\/?>/gi,'\n')
    .replace(/<strong>(.*?)<\/strong>/gi,'$1')
    .replace(/<em>(.*?)<\/em>/gi,'$1')
    .replace(/<code>(.*?)<\/code>/gi,'$1')
    .replace(/<[^>]+>/g,'');
  const title=node.title||'Untitled';
  let out=(node.icon?node.icon+' ':'')+title+'\n'+'='.repeat(title.length)+'\n\n';
  (node.blocks||[]).forEach(b=>{
    const t=strip(b.html);
    if(b.type==='divider') out+='---\n\n';
    else if(b.type==='code') out+=(b.code||'')+'\n\n';
    else if(b.type==='image'&&b.url) out+='[Image: '+b.url+']\n\n';
    else if(b.type==='bookmark'&&b.url) out+=(b.title||b.url)+': '+b.url+'\n\n';
    else if(t) out+=t+'\n\n';
  });
  return out;
}

/* HTML export — shared block renderer */
const _htmlEsc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const _htmlSan=h=>(h||'').replace(/<script[^>]*>.*?<\/script>/gis,'').replace(/\bon\w+="[^"]*"/gi,'');
const _HTML_STYLE=`
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    max-width:720px;margin:48px auto;padding:0 24px;line-height:1.65;color:#37352f;background:#fff}
  nav.toc{background:#f7f6f3;border-radius:8px;padding:16px 20px;margin-bottom:32px}
  nav.toc h2{font-size:.8em;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
    color:#9b9a97;margin:0 0 10px}
  nav.toc ol{margin:0;padding-left:18px;font-size:.93em}
  nav.toc li{margin:4px 0}
  nav.toc a{color:#37352f;text-decoration:none}
  nav.toc a:hover{text-decoration:underline}
  .page-section{margin-bottom:48px}
  .page-title{font-size:2em;font-weight:700;margin:0 0 .3em;display:flex;align-items:center;gap:.2em}
  .depth-badge{font-size:.45em;font-weight:500;background:#e0e0e0;border-radius:20px;
    padding:2px 10px;vertical-align:middle;color:#666;margin-left:8px}
  hr.page-sep{border:none;border-top:3px solid #e0e0e0;margin:40px 0}
  h1{font-size:2em;font-weight:700;margin:1.2em 0 .3em}
  h2{font-size:1.45em;font-weight:600;margin:1.1em 0 .3em}
  h3{font-size:1.15em;font-weight:600;margin:1em 0 .2em}
  p{margin:.4em 0}
  ul,ol{padding-left:1.6em;margin:.4em 0}
  pre{background:#f7f6f3;border-radius:6px;padding:16px;overflow-x:auto;font-size:.88em}
  code{font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:.9em;
    background:#f1f1ef;padding:1px 5px;border-radius:3px}
  pre code{background:none;padding:0;font-size:1em}
  blockquote{border-left:3px solid #d0d0d0;margin:8px 0;padding:4px 12px;color:#6b6b6b}
  .callout{background:#f7f6f3;border-radius:6px;padding:12px 16px;margin:8px 0;
    display:flex;gap:10px;align-items:flex-start}
  .cal-emoji{font-size:1.2em;flex-shrink:0}
  hr{border:none;border-top:1px solid #e0e0e0;margin:20px 0}
  img{max-width:100%;border-radius:4px;display:block;margin:8px 0}
  figcaption{font-size:.85em;color:#9b9a97;margin-top:4px}
  a{color:#2383e2;text-decoration:underline}
  input[type=checkbox]{margin-right:6px}`;

function renderHTMLBlocks(node){
  let body='';
  (node.blocks||[]).forEach(b=>{
    const t=_htmlSan(b.html||'');
    if(b.type==='h1') body+=`<h1>${t}</h1>\n`;
    else if(b.type==='h2') body+=`<h2>${t}</h2>\n`;
    else if(b.type==='h3') body+=`<h3>${t}</h3>\n`;
    else if(b.type==='bullet') body+=`<ul><li>${t}</li></ul>\n`;
    else if(b.type==='number') body+=`<ol><li>${t}</li></ol>\n`;
    else if(b.type==='todo') body+=`<p><label><input type="checkbox"${b.checked?' checked':''} disabled> ${t}</label></p>\n`;
    else if(b.type==='quote') body+=`<blockquote>${t}</blockquote>\n`;
    else if(b.type==='callout') body+=`<div class="callout"><span class="cal-emoji">${_htmlEsc(b.emoji||'💡')}</span>${t}</div>\n`;
    else if(b.type==='divider') body+=`<hr>\n`;
    else if(b.type==='code') body+=`<pre><code class="lang-${_htmlEsc(b.lang||'plain')}">${_htmlEsc(b.code||'')}</code></pre>\n`;
    else if(b.type==='image'&&b.url) body+=`<figure><img src="${_htmlEsc(b.url)}" alt="${_htmlEsc(b.caption||'')}"><figcaption>${_htmlEsc(b.caption||'')}</figcaption></figure>\n`;
    else if(b.type==='bookmark'&&b.url) body+=`<p><a href="${_htmlEsc(b.url)}">${_htmlEsc(b.title||b.url)}</a></p>\n`;
    else if(t) body+=`<p>${t}</p>\n`;
  });
  return body;
}

function pageToHTML(node){
  const title=_htmlEsc((node.icon?node.icon+' ':'')+(node.title||'Untitled'));
  const body=renderHTMLBlocks(node);
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${title}</title>\n<style>${_HTML_STYLE}\n</style>\n</head>\n<body>\n<h1>${title}</h1>\n${body}\n</body>\n</html>`;
}

/* multi-page HTML export with table of contents */
function mergePagesToHTML(tree){
  // tree is [{node, depth}, …]
  const root=tree[0].node;
  const docTitle=_htmlEsc((root.icon?root.icon+' ':'')+(root.title||'Untitled'));

  // table of contents
  const tocItems=tree.map(({node,depth},i)=>{
    const label=_htmlEsc((node.icon?node.icon+' ':'')+(node.title||'Untitled'));
    const indent=depth*14;
    return `<li style="padding-left:${indent}px"><a href="#pg${i}">${label}</a></li>`;
  }).join('\n');

  // sections
  const sections=tree.map(({node,depth},i)=>{
    const title=_htmlEsc((node.icon?node.icon+' ':'')+(node.title||'Untitled'));
    const depthLabel=depth>0?` <span class="depth-badge">${'Sub-page'.repeat(1)} · depth ${depth}</span>`:'';
    const sep=i>0?'<hr class="page-sep">':'' ;
    return `${sep}\n<section class="page-section" id="pg${i}">\n<h1 class="page-title">${title}${depthLabel}</h1>\n${renderHTMLBlocks(node)}\n</section>`;
  }).join('\n');

  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${docTitle}</title>\n<style>${_HTML_STYLE}\n</style>\n</head>\n<body>\n<nav class="toc"><h2>Contents (${tree.length} page${tree.length!==1?'s':''})</h2><ol>${tocItems}</ol></nav>\n${sections}\n</body>\n</html>`;
}

/* ---- exported as the authenticated workspace surface ---- */
export default Workspace;
