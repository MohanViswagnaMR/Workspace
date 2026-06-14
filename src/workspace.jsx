/* =========================================================================
   NOTION — Connected Workspace  (Vite + Firebase edition)
   Block editor, nested pages, multi-view databases, search, trash,
   templates, favorites, dark mode, keyboard shortcuts.
   Persistence is delegated to ./storage (Firestore or localStorage).
   ========================================================================= */
import React, { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Home, Inbox, Settings, Plus, ChevronRight, ChevronDown,
  FileText, Trash2, MoreHorizontal, Star, LayoutTemplate, GripVertical,
  Check, X, Image, Link, Table, Kanban, LayoutGrid, List, Calendar,
  Filter, ArrowUpDown, Sun, Moon, Menu, ChevronLeft, Maximize2,
  Share2, Users, Archive, Upload, LayoutDashboard, RotateCcw, Download,
  Monitor, CloudCheck, CloudUpload, Key, ExternalLink, Copy, Keyboard,
  Cloud, HardDrive, Paperclip, Database, Eye, PanelRight,
} from 'lucide-react';
import {
  loadStore, saveStore,
  searchUsersByEmail, shareWorkspaceWithUser,
  loadSharedWorkspaces, loadNotifications, markNotificationRead,
  deleteSharedWorkspace, transferWorkspaceOwnership,
} from './storage.js';
import { writeLocalUploadFile, deleteLocalUploadFile } from './localfs.js';
import { isFirebaseConfigured } from './firebase.js';
import {
  isLocalFSSupported,
  pickAndRegisterDirectory,
  relinkAndRegisterDirectory,
  openExistingDirectory,
  loadLocalWorkspaceIndex,
  readLocalWorkspace,
  writeLocalWorkspaceDebounced,
  writeLocalWorkspaceNow,
  requestPermissionForHandleDetailed,
  getLocalWorkspaceRecord,
  removeLocalWorkspaceRecord,
  readLocalUploadURL,
} from './localfs.js';

/* Shown when the browser lacks the File System Access API (Firefox/Zen/Safari). */
const LOCAL_FS_UNSUPPORTED_MSG =
  'Local folders require a Chromium browser (Chrome, Edge, or Brave). '+
  'In Firefox or Zen, use cloud sync (Firebase or Google Drive) instead.';

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
  CLOUD_PROVIDERS,
  isCloudProviderConfigured, getCloudClientId, setCloudClientId,
  authenticateProvider, readCloudWorkspace, writeCloudWorkspace,
  listCloudWorkspaces, deleteCloudWorkspace,
  getProviderToken, clearProviderToken,
} from './cloudstorage.js';

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
  ['Quick search / open','Ctrl/⌘ + K'],['New page','Ctrl/⌘ + N'],
  ['Toggle sidebar','Ctrl/⌘ + \\'],['Toggle dark mode','Ctrl/⌘ + Shift + L'],
  ['Open slash menu','/'],['Bold','Ctrl/⌘ + B'],['Italic','Ctrl/⌘ + I'],
  ['Underline','Ctrl/⌘ + U'],['Strikethrough','Ctrl/⌘ + Shift + S'],['Inline code','Ctrl/⌘ + E'],
  ['Indent block','Tab'],['Outdent block','Shift + Tab'],
  ['New block','Enter'],['Soft line break','Shift + Enter'],
  ['Delete block / merge up','Backspace at start'],['Heading','# / ## / ###  + space'],
  ['Bulleted list','-  or  *  + space'],['Numbered list','1.  + space'],
  ['To-do','[]  + space'],['Toggle','>  + space'],['Divider','---'],
  ['Show shortcuts','Ctrl/⌘ + /'],['Close popup','Esc'],
];

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
};

const DASH_ID='__dashboard__';
const STORAGE_ID='__storage__';

function Ic({n, style}) {
  const Icon = ICON_MAP[n];
  if (!Icon) return null;
  const {width, height, ...rest} = style || {};
  const sz = +(width || height || 16);
  return <Icon width={sz} height={sz} strokeWidth={1.8}
    {...(Object.keys(rest).length ? {style: rest} : {})}/>;
}

/* Storage (loadStore / saveStore) is imported from ./storage.js */

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

  return {nodes,favorites:['n_start','n_tasks'],currentId:'n_start',theme:'light',accent:'indigo',
    workspaces:[{id:'ws_main',name:'My Workspace',isPersonal:true,members:[]}],
    activeWorkspaceId:'ws_main',workspaceSnapshots:{},sharedNodes:{},tutorialCompleted:false,uploads:[]};
}

/* =========================================================================
   external-workspace helpers
   -------------------------------------------------------------------------
   "External" = a local-file or cloud-provider workspace. Its pages and
   uploads live only in its own backing (workspace.json + uploads/ folder, or
   the provider file) and must never be written to Firebase. Firebase keeps
   only the workspace list, settings, and personal/shared content.
   ========================================================================= */
const isExternalWs = ws => !!(ws && (ws.isLocalFile || ws.cloudProvider));

/* Replace/insert this workspace's uploads in the global in-memory array. */
function mergeUploads(existing, wsId, incoming){
  return [...(existing||[]).filter(u=>u.wsId!==wsId),
          ...(incoming||[]).map(u=>({...u, wsId}))];
}

/* Strip everything that belongs to an external workspace before saving to
   Firebase. setDoc replaces the whole document, so this also purges any data
   that leaked from earlier (un-sanitised) saves. */
function toCloudStore(store){
  const wss = store.workspaces||[];
  const ext = id => isExternalWs(wss.find(w=>w.id===id));
  const activeId = store.activeWorkspaceId||'ws_main';

  // keep only non-external workspace snapshots
  const snaps = {};
  for(const [id,snap] of Object.entries(store.workspaceSnapshots||{})){
    if(!ext(id)) snaps[id]=snap;
  }

  // the top-level active view must reflect a non-external workspace
  let {nodes,favorites,currentId} = store;
  if(ext(activeId)){
    const personal = snaps['ws_main'] || {};
    nodes     = personal.nodes     || {};
    favorites = personal.favorites || [];
    currentId = personal.currentId || null;
  }

  // drop uploads that belong to external workspaces
  const uploads = (store.uploads||[]).filter(u=>!ext(u.wsId));

  return {...store, nodes, favorites, currentId, workspaceSnapshots:snaps, uploads};
}

/* Build the workspace.json payload for a local workspace: strip the transient
   blob URLs (blocks keep only `localName`; uploads drop `dataUrl`/`wsId`) so the
   file holds durable references only. `live` = {nodes,favorites,currentId,uploads}. */
function dehydrateLocalData(name, live){
  const nodes={};
  for(const [id,n] of Object.entries(live.nodes||{})){
    const blocks=(n.blocks||[]).map(b=> b.localName ? {...b, url:''} : b);
    nodes[id]={...n, blocks};
  }
  const uploads=(live.uploads||[]).map(u=>{
    const {dataUrl, wsId, ...rest}=u;
    return rest;
  });
  return {name, version:2, nodes, favorites:live.favorites||[],
    currentId:live.currentId, uploads};
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

/* =========================================================================
   EDITABLE — uncontrolled contentEditable wrapper
   ========================================================================= */
const Editable = React.forwardRef(function Editable(props,ref){
  const {html,onInput,placeholder,className,onKeyDown,onFocus,onBlur,style}=props;
  const local=useRef();
  const [focused,setFocused]=useState(false);
  const setRef=el=>{ local.current=el; if(typeof ref==='function')ref(el); else if(ref)ref.current=el; };
  useEffect(()=>{ if(local.current && local.current.innerHTML!==(html||'')) local.current.innerHTML=html||''; },[]);
  useEffect(()=>{ // sync external html changes only when not focused
    if(local.current && document.activeElement!==local.current
       && local.current.innerHTML!==(html||'')) local.current.innerHTML=html||'';
  },[html]);
  // placeholder shows only when focused AND the block has no visible text content
  const isEmpty=!(html||'').replace(/<br\s*\/?>/gi,'').replace(/&nbsp;/gi,' ').trim();
  return <div className={cx('ce',className,isEmpty&&focused&&placeholder&&'ph')} contentEditable suppressContentEditableWarning
    ref={setRef} data-ph={placeholder||''} style={style}
    onInput={e=>onInput&&onInput(e.currentTarget.innerHTML)}
    onKeyDown={onKeyDown}
    onFocus={e=>{ setFocused(true); onFocus&&onFocus(e); }}
    onBlur={e=>{ setFocused(false); onBlur&&onBlur(e); }}
    onPaste={e=>{ e.preventDefault();
      const t=(e.clipboardData||window.clipboardData).getData('text/plain');
      document.execCommand('insertText',false,t); }}/>;
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
  let mTop=rect.bottom+4, mLeft=rect.left;
  if(mLeft+mw>window.innerWidth-10) mLeft=window.innerWidth-mw-10;

  // ── submenu position: right side of the main menu, aligned to the hovered row ──
  const sw=sub==='turn'?210:220;
  let sTop=0, sLeft=0;
  if(subRect){
    sTop=subRect.top-6;
    sLeft=mLeft+mw+6;
    // flip left if no room on the right
    if(sLeft+sw>window.innerWidth-10) sLeft=mLeft-sw-6;
    // clamp bottom
    const estH=sub==='turn'?300:360;
    if(sTop+estH>window.innerHeight-10) sTop=window.innerHeight-estH-10;
  }

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
  const {block,index,listNumber,onChange,onEnter,onBackspace,onArrow,onIndent,
    focus,setFocus,onSlash,onBlockAction,openPage,onDragStart,onDragOver,onDrop,
    dragInfo,depth,onUploadFile,uploads} = props;
  const ceRef=useRef();
  const codeRef=useRef();
  const [menu,setMenu]=useState(null);
  const [emoji,setEmoji]=useState(false);
  const [imgPick,setImgPick]=useState(false);
  const T=block.type;
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
      if(e.key==='Enter' && !e.shiftKey){
        e.preventDefault();
        onEnter(block,el);
      }
      if(e.key==='Backspace'){
        if(caretAtStart(el)){
          e.preventDefault(); onBackspace(block,el);
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

  return <div className={cx('blk','b-'+T,dragInfo&&dragInfo.dragId===block.id&&'dragging',dropCls)}
    data-block-id={block.id}
    style={{marginLeft:(depth||0)*26}}
    onDragOver={e=>onDragOver(e,block)} onDrop={e=>onDrop(e,block)}
    onContextMenu={T!=='database'?e=>{
      e.preventDefault();e.stopPropagation();
      setMenu({top:e.clientY,bottom:e.clientY,left:e.clientX,right:e.clientX});
    }:undefined}>
    {T!=='database' && Gutter}
    <div className="blk-body">{body}</div>
    {menu&&<BlockMenu rect={menu} block={block} onClose={()=>setMenu(null)}
      onAction={(a,v)=>{ setMenu(null); onBlockAction(block,a,v); }}/>}
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
  function onEnter(b,el){
    // continue lists; empty list item -> text
    const listish=['bullet','number','todo','toggle'].includes(b.type);
    if(listish && el && el.textContent.trim()===''){
      updateBlock({...b,type:'text',checked:undefined,children:undefined});
      setFocus({id:b.id,pos:'start'}); return;
    }
    let nt='text';
    if(['bullet','number','todo'].includes(b.type)) nt=b.type;
    const blk={id:nid(),type:nt,html:''};
    if(nt==='todo')blk.checked=false;
    insertAfter(b.id,blk);
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
        : <div className="editor" ref={editorDivRef}>
        {blocks.map((b,i)=><Block key={b.id} block={b} index={i} depth={b.depth}
          listNumber={numbers[b.id]}
          onChange={updateBlock} onEnter={onEnter} onBackspace={onBackspace}
          onArrow={onArrow} onIndent={onIndent}
          focus={focus} setFocus={setFocus}
          onSlash={info=>{setSlash(info);setSlashQuery('');}}
          onBlockAction={blockAction} openPage={openPage} openRow={openRow}
          lookupNode={lookupNode}
          onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
          dragInfo={drag} onUploadFile={onUploadFile} uploads={uploads}/>)}
        <div className="blk editor-end-zone" onClick={()=>{
          const EDITABLE=['text','h1','h2','h3','bullet','number','todo','toggle','quote','callout'];
          // walk backwards to find the last editable block
          for(let i=blocks.length-1;i>=0;i--){
            if(EDITABLE.includes(blocks[i].type)){
              setFocus({id:blocks[i].id,pos:'end'}); return;
            }
          }
          // no editable block found — create one
          const b={id:nid(),type:'text',html:''};
          setBlocksH([...blocks,b]); setFocus({id:b.id,pos:'start'});
        }}>
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
function WorkspaceSwitcher({workspaces,activeId,onSwitch,onCreate,onShare,onDelete,onClose,rect,onReconnectLocal,onRelinkLocal,onOpenExisting,onBrowseCloud}){
  const localSupported=isLocalFSSupported();
  return <Popup rect={rect} onClose={onClose} width={300}>
    <div className="menu">
      <div className="menu-h">Switch workspace</div>
      {(workspaces||[]).map(ws=>{
        const isLocal=ws.isLocalFile;
        const prov=ws.cloudProvider?CLOUD_PROVIDERS[ws.cloudProvider]:null;
        // In Firefox/Zen the File System Access API is missing, so local
        // workspaces can never be opened here — show an explanatory note
        // instead of an actionable "reconnect" affordance that only errors.
        const localUnavailable=isLocal&&!localSupported;
        const needsAccess=isLocal&&!localUnavailable&&ws.accessible===false;
        const avatarBg=ws.isPersonal
          ?'linear-gradient(135deg,#ff9a6b,#e8506e)'
          :ws.isShared
            ?'linear-gradient(135deg,#10b981,#059669)'
            :isLocal
              ?'linear-gradient(135deg,#7c3aed,#a78bfa)'
              :prov
                ?prov.gradient
                :'linear-gradient(135deg,#5b86e5,#36d1dc)';
        const subtitle=ws.isPersonal?'Personal'
          :ws.isShared?`Shared by ${ws.ownerEmail||'someone'}`
          :isLocal?`💻 Local · ${ws.dirName||'folder'}`
          :prov?`${prov.emoji} ${prov.name}`
          :'Shared workspace';
        const avatarLabel=isLocal?'💻':prov?prov.emoji:ws.name[0].toUpperCase();

        return <div key={ws.id} className={cx('mi',ws.id===activeId&&'hi')} style={{gap:0,paddingRight:6}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flex:1,
            cursor:localUnavailable?'not-allowed':'pointer',minWidth:0,
            opacity:(needsAccess||localUnavailable)?.6:1}}
            onMouseDown={e=>{
              e.preventDefault();
              if(localUnavailable){ alert(LOCAL_FS_UNSUPPORTED_MSG); onClose(); return; }
              if(needsAccess){ onReconnectLocal&&onReconnectLocal(ws.id); onClose(); return; }
              if(ws.id!==activeId) onSwitch(ws.id);
              onClose();
            }}>
            <div className="mi-ic ws-ic" style={{background:avatarBg,
              color:'#fff',fontWeight:700,fontSize:prov||isLocal?16:12,border:'none',borderRadius:6,
              flexShrink:0,position:'relative'}}>
              {avatarLabel}
            </div>
            <div className="mi-tx" style={{minWidth:0}}>{ws.name}
              <small style={{display:'flex',alignItems:'center',gap:4}}>
                {localUnavailable&&<span style={{color:'#d4894c'}}>💻 Local — needs Chrome / Edge to open</span>}
                {needsAccess&&<span style={{color:'#d44c47'}}>{ws.unlinked?'🔗 Folder not linked here — click to pick it':'🔒 Needs access — click to reconnect'}</span>}
                {!needsAccess&&!localUnavailable&&subtitle}
              </small>
            </div>
            {ws.id===activeId&&<Ic n="check" style={{width:14,height:14,color:'var(--accent)',flexShrink:0}}/>}
          </div>
          {/* action buttons */}
          {!ws.isPersonal&&!ws.isShared&&!isLocal&&!prov&&
            <div style={{display:'flex',gap:2,flexShrink:0,marginLeft:4}}>
              <button className="icon-btn" style={{width:22,height:22}} title="Share workspace"
                onMouseDown={e=>{e.preventDefault();e.stopPropagation();onShare(ws.id);onClose();}}>
                <Ic n="users" style={{width:12,height:12,color:'var(--accent)'}}/>
              </button>
              <button className="icon-btn" style={{width:22,height:22}} title="Delete workspace"
                onMouseDown={e=>{e.preventDefault();e.stopPropagation();onDelete(ws.id);onClose();}}>
                <Ic n="trash" style={{width:12,height:12,color:'#d44c47'}}/>
              </button>
            </div>}
          {(isLocal||prov)&&
            <div style={{display:'flex',gap:2,flexShrink:0,marginLeft:4}}>
              {isLocal&&!localUnavailable&&
                <button className="icon-btn" style={{width:22,height:22}}
                  title="Reconnect / pick the workspace folder again"
                  onMouseDown={e=>{e.preventDefault();e.stopPropagation();onRelinkLocal&&onRelinkLocal(ws.id);onClose();}}>
                  <Ic n="link" style={{width:12,height:12,color:'var(--accent)'}}/>
                </button>}
              <button className="icon-btn" style={{width:22,height:22}}
                title={isLocal?'Remove local workspace from list (files are not deleted)':'Remove cloud workspace from list (file is not deleted)'}
                onMouseDown={e=>{e.preventDefault();e.stopPropagation();onDelete(ws.id);onClose();}}>
                <Ic n="trash" style={{width:12,height:12,color:'#d44c47'}}/>
              </button>
            </div>}
        </div>;
      })}
      <div className="menu-sep"/>
      <div className="mi" onMouseDown={e=>{e.preventDefault();onCreate();onClose();}}>
        <div className="mi-ic"><Ic n="plus" style={{width:15,height:15}}/></div>
        <div className="mi-tx">Create workspace</div>
      </div>
      {onOpenExisting&&<div className="mi" onMouseDown={e=>{e.preventDefault();onOpenExisting();onClose();}}>
        <div className="mi-ic"><Ic n="import" style={{width:15,height:15}}/></div>
        <div className="mi-tx">Open existing workspace folder…</div>
      </div>}
      {onBrowseCloud&&<div className="mi" onMouseDown={async e=>{
        e.preventDefault();
        try{ await onBrowseCloud('gdrive'); onClose(); }
        catch(err){ alert(`Could not connect to Google Drive: ${err.message}`); }
      }}>
        <div className="mi-ic" style={{fontSize:14}}>📁</div>
        <div className="mi-tx">Browse Drive workspaces…</div>
      </div>}
    </div>
  </Popup>;
}

/* ---------------- Share Document Modal ---------------- */
function ShareDocModal({node,shares,onAdd,onRemove,onClose}){
  const [email,setEmail]=React.useState('');
  const [perm,setPerm]=React.useState('view');
  const [copied,setCopied]=React.useState(false);
  function add(){
    const e=email.trim();
    if(!e||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return;
    onAdd(e,perm); setEmail('');
  }
  function copyLink(){
    navigator.clipboard?.writeText(location.href+'?page='+node.id);
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  }
  return <div className="overlay" onClick={onClose}>
    <div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <h3>Share "{node.title||'Untitled'}"</h3>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>
      <div style={{padding:'16px 20px 20px'}}>
        <div style={{display:'flex',gap:8,marginBottom:16}}>
          <input className="fld" placeholder="Invite by email address…" autoFocus
            value={email} onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&add()} style={{flex:1}}/>
          <select value={perm} onChange={e=>setPerm(e.target.value)} className="perm-sel">
            <option value="view">Can view</option>
            <option value="edit">Can edit</option>
          </select>
          <button className="btn primary" onClick={add} style={{padding:'7px 14px'}}>Invite</button>
        </div>
        {(shares||[]).length>0
          ? <><div className="menu-h" style={{padding:'0 0 8px'}}>SHARED WITH</div>
            {(shares||[]).map((s,i)=>
              <div key={i} className="share-person-row">
                <div className="share-ava">{s.email[0].toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:500,fontSize:13,whiteSpace:'nowrap',overflow:'hidden',
                    textOverflow:'ellipsis'}}>{s.email}</div>
                </div>
                <span className="share-badge">{s.permission==='edit'?'Can edit':'Can view'}</span>
                <button className="icon-btn" style={{width:24,height:24}} title="Remove access"
                  onClick={()=>onRemove(s.email)}>
                  <Ic n="x" style={{width:12,height:12}}/></button>
              </div>
            )}</>
          : <div className="share-empty-hint">
              No one invited yet. Add email addresses above to share this page.
            </div>}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
          marginTop:16,paddingTop:12,borderTop:'1px solid var(--border)'}}>
          <span style={{fontSize:12,color:'var(--text-3)'}}>Anyone with the link can view</span>
          <button className="btn ghost" style={{display:'flex',alignItems:'center',gap:6}}
            onClick={copyLink}>
            <Ic n="link" style={{width:14,height:14}}/>
            {copied?'Copied!':'Copy link'}
          </button>
        </div>
      </div>
    </div>
  </div>;
}

/* ---------------- Share Workspace Modal ---------------- */
function ShareWorkspaceModal({workspace,user,currentSnapshot,onUpdateMembers,onClose}){
  const [email,setEmail]=React.useState('');
  const [members,setMembers]=React.useState(workspace.members||[]);
  const [suggestions,setSuggestions]=React.useState([]);
  const [busy,setBusy]=React.useState(false);
  const [err,setErr]=React.useState('');
  const [ok,setOk]=React.useState('');
  const debRef=React.useRef(null);

  // live email search
  React.useEffect(()=>{
    clearTimeout(debRef.current);
    if(!email||email.length<2){ setSuggestions([]); return; }
    debRef.current=setTimeout(async()=>{
      const res=await searchUsersByEmail(email.toLowerCase(),user?.uid);
      setSuggestions(res||[]);
    },300);
  },[email]);

  async function invite(){
    const e=email.trim().toLowerCase();
    if(!e||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)){ setErr('Enter a valid email.'); return; }
    if(members.find(m=>m.email===e)){ setErr('Already a member.'); return; }
    setErr(''); setBusy(true);
    // find the registered user
    const found=suggestions.find(s=>s.email===e)||(await searchUsersByEmail(e,user?.uid))[0];
    if(!found||found.email!==e){
      setErr('No account found for that email. They must sign up first.'); setBusy(false); return;
    }
    try{
      await shareWorkspaceWithUser(
        {wsId:workspace.id,wsName:workspace.name,ownerId:user.uid,
          ownerEmail:user.email,ownerDisplayName:user.displayName,
          snapshot:currentSnapshot},
        {uid:found.uid,email:found.email,role:'editor'},
      );
      const next=[...members,{uid:found.uid,email:found.email,role:'editor',addedAt:Date.now()}];
      setMembers(next); onUpdateMembers(next);
      setEmail(''); setSuggestions([]);
      setOk(`Invite sent to ${found.email}`);
      setTimeout(()=>setOk(''),3000);
    }catch(e){ setErr('Failed to share. Try again.'); }
    setBusy(false);
  }

  function remove(em){
    const next=members.filter(m=>m.email!==em);
    setMembers(next); onUpdateMembers(next);
  }

  if(!isFirebaseConfigured){
    return <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-h"><h3>Share workspace</h3>
          <button className="x" onClick={onClose}><Ic n="x"/></button></div>
        <div className="empty-state" style={{padding:'32px 24px'}}>
          <div className="es-em">🔒</div>
          <b>Cloud sync required</b>
          <p style={{marginTop:6,fontSize:13,color:'var(--text-3)'}}>
            Workspace sharing requires Firebase. Configure .env to enable it.
          </p>
        </div>
      </div>
    </div>;
  }

  return <div className="overlay" onClick={onClose}>
    <div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <h3>Share "{workspace.name}"</h3>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>
      <div style={{padding:'16px 20px 20px'}}>
        <div style={{marginBottom:16,padding:'10px 14px',borderRadius:8,
          background:'var(--accent-soft)',fontSize:13,color:'var(--accent)'}}>
          Members will see this workspace in their workspace menu and receive an inbox notification.
        </div>
        <div style={{position:'relative',marginBottom:suggestions.length?0:16}}>
          <div style={{display:'flex',gap:8}}>
            <input className="fld" placeholder="Search by email address…" autoFocus
              value={email} onChange={e=>{setEmail(e.target.value);setErr('');}}
              onKeyDown={e=>e.key==='Enter'&&invite()} style={{flex:1}}/>
            <button className="btn primary" onClick={invite} disabled={busy}
              style={{padding:'7px 14px',flexShrink:0}}>
              {busy?'…':'Invite'}
            </button>
          </div>
          {suggestions.length>0&&
            <div className="email-suggest-drop">
              {suggestions.map(u=>
                <div key={u.uid} className="email-suggest-item"
                  onMouseDown={e=>{e.preventDefault();setEmail(u.email);setSuggestions([]);}}>
                  <div className="share-ava" style={{width:26,height:26,fontSize:11}}>
                    {u.photoURL
                      ? <img src={u.photoURL} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}} referrerPolicy="no-referrer"/>
                      : u.email[0].toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:500,fontSize:13}}>{u.displayName||u.email}</div>
                    <div style={{fontSize:11,color:'var(--text-3)'}}>{u.email}</div>
                  </div>
                </div>
              )}
            </div>}
        </div>
        {err&&<div className="auth-error" style={{marginBottom:12,marginTop:8}}>{err}</div>}
        {ok&&<div style={{color:'var(--accent)',fontSize:13,marginBottom:12,marginTop:8}}>{ok}</div>}
        {members.length>0
          ? <><div className="menu-h" style={{padding:'8px 0 8px'}}>MEMBERS ({members.length})</div>
            {members.map((m,i)=>
              <div key={i} className="share-person-row">
                <div className="share-ava">{m.email[0].toUpperCase()}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:500,fontSize:13}}>{m.email}</div>
                  <div style={{fontSize:11,color:'var(--text-3)'}}>Full editor access</div>
                </div>
                <button className="icon-btn" style={{width:24,height:24}} title="Remove member"
                  onClick={()=>remove(m.email)}>
                  <Ic n="x" style={{width:12,height:12}}/></button>
              </div>
            )}</>
          : <div className="share-empty-hint">No members yet. Invite people to collaborate.</div>}
      </div>
    </div>
  </div>;
}

/* ---------------- Delete Workspace Modal ---------------- */
function DeleteWorkspaceModal({workspace,onDeleteAll,onLeave,onClose}){
  const [step,setStep]=React.useState('choose'); // 'choose' | 'transfer'
  const [selected,setSelected]=React.useState(null);
  const [busy,setBusy]=React.useState(false);
  const [err,setErr]=React.useState('');
  const members=workspace.members||[];

  async function handleTransfer(){
    if(!selected){setErr('Select a member to transfer ownership to.');return;}
    setBusy(true);setErr('');
    try{await onLeave(selected);}
    catch(e){setErr('Transfer failed. Please try again.');setBusy(false);}
  }

  return <div className="overlay" onClick={onClose}>
    <div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <h3>{step==='choose'?`Delete "${workspace.name}"`:'Transfer ownership'}</h3>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>

      {step==='choose'
        ?<div style={{padding:'16px 20px 20px'}}>
          <div style={{fontSize:13,color:'var(--text-2)',marginBottom:20,lineHeight:1.6}}>
            This workspace is shared with <strong>{members.length} member{members.length!==1?'s':''}</strong>. How would you like to proceed?
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <button style={{padding:'12px 16px',textAlign:'left',border:'1.5px solid #ef4444',
              borderRadius:8,background:'transparent',cursor:'pointer',width:'100%'}}
              onClick={()=>{onClose();onDeleteAll();}}>
              <div style={{fontWeight:600,color:'#ef4444',fontSize:13,marginBottom:3}}>Delete for everyone</div>
              <div style={{fontSize:11,color:'var(--text-3)'}}>Permanently removes this workspace and all its pages for every member</div>
            </button>
            <button style={{padding:'12px 16px',textAlign:'left',border:'1.5px solid var(--border)',
              borderRadius:8,background:'transparent',cursor:'pointer',width:'100%'}}
              onClick={()=>setStep('transfer')}>
              <div style={{fontWeight:600,fontSize:13,marginBottom:3}}>Delete only for me</div>
              <div style={{fontSize:11,color:'var(--text-3)'}}>Transfer ownership to a member and remove from your list</div>
            </button>
          </div>
        </div>

        :<div style={{padding:'16px 20px 20px'}}>
          <div style={{fontSize:13,color:'var(--text-2)',marginBottom:14,lineHeight:1.5}}>
            Choose a member to become the new owner of <strong>"{workspace.name}"</strong>:
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16,maxHeight:240,overflowY:'auto'}}>
            {members.map(m=><div key={m.uid||m.email}
              style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:8,
                cursor:'pointer',
                border:`1.5px solid ${selected?.uid===m.uid?'var(--accent)':'transparent'}`,
                background:selected?.uid===m.uid?'var(--accent-soft)':'var(--bg-2)'}}
              onClick={()=>{setSelected(m);setErr('');}}>
              <div className="share-ava">{m.email[0].toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:500,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.email}</div>
                <div style={{fontSize:11,color:'var(--text-3)'}}>Will become new owner</div>
              </div>
              {selected?.uid===m.uid&&<Ic n="check" style={{width:14,height:14,color:'var(--accent)',flexShrink:0}}/>}
            </div>)}
          </div>
          {err&&<div className="auth-error" style={{marginBottom:12}}>{err}</div>}
          <div style={{display:'flex',gap:8,justifyContent:'space-between',alignItems:'center'}}>
            <button className="btn ghost" onClick={()=>{setStep('choose');setSelected(null);setErr('');}}>← Back</button>
            <button className="btn primary" onClick={handleTransfer} disabled={busy||!selected}>
              {busy?'Transferring…':'Transfer & Leave'}
            </button>
          </div>
        </div>}
    </div>
  </div>;
}

/* ---------------- Shared Panel (right side) ---------------- */
function SharedPanel({nodes,sharedNodes,onOpen,onUnshare,onClose}){
  const list=Object.entries(sharedNodes||{})
    .filter(([,shares])=>shares&&shares.length>0)
    .map(([id,shares])=>({node:nodes[id],id,shares}))
    .filter(x=>x.node&&!x.node.trashed);
  return <div className="shared-panel">
    <div className="shared-panel-h">
      <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:650,
        color:'var(--text-2)',letterSpacing:'.025em'}}>
        <Ic n="share" style={{width:13,height:13}}/>
        SHARED
        {list.length>0&&<span className="shared-count">{list.length}</span>}
      </div>
      <button className="icon-btn" style={{width:22,height:22}} onClick={onClose}
        title="Close shared panel">
        <Ic n="x" style={{width:13,height:13}}/>
      </button>
    </div>
    {list.length===0
      ? <div className="shared-panel-empty">
          <div style={{fontSize:36,marginBottom:10}}>🔗</div>
          <b>No shared pages yet</b>
          <p>Click the share icon on any page in the sidebar to share it.</p>
        </div>
      : <div style={{overflowY:'auto',flex:1,padding:'6px 8px 20px'}}>
          {list.map(({node,id,shares})=>
            <div key={id} className="shared-doc-card">
              <div className="sdc-top" onClick={()=>onOpen(id)}>
                <span style={{fontSize:16,flexShrink:0}}>{node.icon||'📄'}</span>
                <span className="sdc-title">{node.title||'Untitled'}</span>
              </div>
              <div className="sdc-people">
                {shares.map((s,i)=>
                  <div key={i} className="sdc-person">
                    <div className="sdc-ava">{s.email[0].toUpperCase()}</div>
                    <span className="sdc-email">{s.email}</span>
                    <span className="sdc-perm">{s.permission}</span>
                    <button className="sdc-rm" onClick={()=>onUnshare(id,s.email)}
                      title="Remove access">
                      <Ic n="x" style={{width:9,height:9}}/>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
    }
  </div>;
}

/* ---------------- Sidebar tree item ---------------- */
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
    ...(isRoot?[{label:node.section==='private'?'Move to Shared':'Move to Private',
      action:()=>renameNode&&renameNode(node.id,node.title,node.section==='private'?'shared':'private')}]:[]),
    {label:'Copy link',action:()=>navigator.clipboard?.writeText(window.location.href+'#'+node.id)},
    {sep:true},
    {label:'Share',action:()=>setModal&&setModal({type:'share-doc',nodeId:node.id})},
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
      <span className={cx('twist',isOpen&&'open')}
        onClick={e=>{e.stopPropagation(); if(hasKids) toggleExp(node.id); else openPage(node.id);}}>
        <Ic n="chevron"/></span>
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
    {isOpen&&!hasKids&&<div className="tree-empty" style={{paddingLeft:30+depth*16}}>No pages inside</div>}
    {ctxMenu&&<ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={()=>setCtxMenu(null)}/>}
  </div>;
}

/* ---------------- Sidebar ---------------- */
function Sidebar({open,nodes,favorites,currentId,expanded,toggleExp,openPage,addChild,
  trashNode,archiveNode,onDrop,addTop,setModal,workspaces,activeWorkspaceId,
  onSwitchWorkspace,onCreateWorkspace,onShareWorkspace,onDeleteWorkspace,onReconnectLocal,onRelinkLocal,
  onOpenExistingWorkspace,onBrowseCloudWorkspaces,
  toggleFav,duplicate,exportPage,renameNode,user,notifCount}){
  const roots=sec=>Object.values(nodes)
    .filter(n=>n.parentId===null&&n.section===sec&&!n.trashed&&!n.archived)
    .sort((a,b)=>(a.sort||0)-(b.sort||0));
  const favNodes=favorites.map(id=>nodes[id]).filter(n=>n&&!n.trashed&&!n.archived);
  const [wsPop,setWsPop]=React.useState(null);
  const activeWs=(workspaces||[]).find(w=>w.id===activeWorkspaceId)||
    {id:'ws_main',name:'My Workspace',isPersonal:true,members:[]};
  const memberCount=(activeWs.members||[]).length;
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
        <div className="ws-ava">
          {user?.photoURL
            ? <img src={user.photoURL} alt={activeWs.name[0]} referrerPolicy="no-referrer"/>
            : activeWs.name[0].toUpperCase()}
        </div>
        <div className="ws-name">{activeWs.name}
          <small>{activeWs.isLocalFile?`💻 Local · ${activeWs.dirName||'folder'}`:activeWs.cloudProvider?`${CLOUD_PROVIDERS[activeWs.cloudProvider]?.emoji||'☁'} ${CLOUD_PROVIDERS[activeWs.cloudProvider]?.shortName||activeWs.cloudProvider}`:activeWs.isPersonal?'Personal':'Shared'} · {memberCount+1} member{memberCount!==0?'s':''}</small>
        </div>
      </div>
      <div className="icon-btn" title="New page" onClick={()=>addTop('private')}>
        <Ic n="plus"/></div>
      {wsPop&&<WorkspaceSwitcher rect={wsPop} workspaces={workspaces||[activeWs]}
        activeId={activeWorkspaceId} onSwitch={onSwitchWorkspace}
        onCreate={onCreateWorkspace} onShare={onShareWorkspace} onDelete={onDeleteWorkspace}
        onReconnectLocal={onReconnectLocal} onRelinkLocal={onRelinkLocal}
        onOpenExisting={onOpenExistingWorkspace} onBrowseCloud={onBrowseCloudWorkspaces}
        onClose={()=>setWsPop(null)}/>}
    </div>
    <div className="nav">
      {navRow('search','Search',()=>setModal({type:'search'}),'⌘K')}
      {navRow('dashboard','Home',()=>openPage(DASH_ID),null,currentId===DASH_ID)}
      <div className={cx('tree-item')} onClick={()=>setModal({type:'inbox'})}
        style={{position:'relative'}}>
        <span className="tree-emoji" style={{fontSize:14}}><Ic n="inbox"/></span>
        <span className="tree-label">Inbox</span>
        {notifCount>0&&<span className="notif-badge">{notifCount}</span>}
      </div>
      {navRow('settings','Settings',()=>setModal({type:'settings'}))}
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

      <div className="sec-title"><span>My Workspace</span>
        <button title="Add a page" onClick={()=>addTop('private')}><Ic n="plus"/></button>
      </div>
      <div className="nav">
        {roots('private').map(n=>
          <TreeItem key={n.id} node={n} nodes={nodes} depth={0} currentId={currentId}
            expanded={expanded} toggleExp={toggleExp} openPage={openPage}
            addChild={addChild} trashNode={trashNode} archiveNode={archiveNode} onDrop={onDrop}
            setModal={setModal} favorites={favorites} toggleFav={toggleFav}
            duplicate={duplicate} exportPage={exportPage} renameNode={renameNode}/>)}
        {roots('private').length===0&&<div className="tree-empty">No pages yet</div>}
      </div>

      <div className="sec-title"><span>Shared</span>
        <button title="Add a page" onClick={()=>addTop('shared')}><Ic n="plus"/></button>
      </div>
      <div className="nav">
        {roots('shared').map(n=>
          <TreeItem key={n.id} node={n} nodes={nodes} depth={0} currentId={currentId}
            expanded={expanded} toggleExp={toggleExp} openPage={openPage}
            addChild={addChild} trashNode={trashNode} archiveNode={archiveNode} onDrop={onDrop}
            setModal={setModal} favorites={favorites} toggleFav={toggleFav}
            duplicate={duplicate} exportPage={exportPage} renameNode={renameNode}/>)}
        {roots('shared').length===0&&<div className="tree-empty">No shared pages</div>}
      </div>

      <div className="nav" style={{marginTop:10}}>
        {navRow('layout','Templates',()=>setModal({type:'templates'}))}
        {navRow('import','Import',()=>setModal({type:'import'}))}
        {navRow('database','Storage',()=>openPage(STORAGE_ID),null,currentId===STORAGE_ID)}
        {navRow('archive','Archive',()=>setModal({type:'archive'}))}
        {navRow('trash','Trash',()=>setModal({type:'trash'}))}
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
  if(activeWorkspace?.isLocalFile){
    locationIcon='💻'; locationLabel='Local folder';
    folderPath=(activeWorkspace.dirName||'workspace')+' / uploads';
    locationDetail='Files are stored in your local workspace folder under an uploads/ subfolder.';
  } else if(activeWorkspace?.cloudProvider==='gdrive'){
    locationIcon='📁'; locationLabel='Google Drive';
    folderPath='Drive app folder / workspace-uploads';
    locationDetail='Files are embedded in the workspace data saved to Google Drive.';
  } else if(activeWorkspace?.isShared){
    locationIcon='👥'; locationLabel='Shared workspace';
    folderPath='Cloud storage (shared)';
    locationDetail='Files are stored in the shared workspace cloud data.';
  } else {
    locationIcon='☁️'; locationLabel='Cloud storage';
    folderPath='Firebase cloud workspace data';
    locationDetail='Files are embedded in workspace cloud data as encoded content.';
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
function StorageBadge({ws, onCreateWorkspace}) {
  const [pop, setPop] = useState(null);
  if (!ws) return null;
  const prov = ws.cloudProvider ? CLOUD_PROVIDERS[ws.cloudProvider] : null;

  let BIcon, label, detail, subDetail;
  if (ws.isLocalFile) {
    BIcon = <HardDrive size={12}/>;
    label = 'Local';
    detail = 'Saved on this computer';
    subDetail = ws.dirName || 'Local folder';
  } else if (prov) {
    BIcon = <span style={{fontSize:11,lineHeight:1}}>{prov.emoji}</span>;
    label = prov.shortName;
    detail = `Saved to ${prov.name}`;
    subDetail = null;
  } else if (ws.isShared) {
    BIcon = <Users size={12}/>;
    label = 'Shared';
    detail = 'Shared workspace';
    subDetail = ws.ownerEmail ? `Owner: ${ws.ownerEmail}` : null;
  } else {
    BIcon = <Cloud size={12}/>;
    label = 'Cloud';
    detail = 'Saved to Firebase';
    subDetail = null;
  }

  return <>
    <div className="storage-badge" onClick={e=>setPop(e.currentTarget.getBoundingClientRect())}
      title={`Storage: ${detail}`}>
      {BIcon}
      <span>{label}</span>
    </div>
    {pop&&<Popup rect={pop} onClose={()=>setPop(null)} width={250}>
      <div style={{padding:'14px 16px 10px'}}>
        <div style={{fontSize:10,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',
          letterSpacing:'.06em',marginBottom:10}}>Saved to</div>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
          <div style={{width:40,height:40,borderRadius:10,flexShrink:0,display:'flex',
            alignItems:'center',justifyContent:'center',fontSize:22,
            background: ws.isLocalFile?'linear-gradient(135deg,#7c3aed,#a78bfa)'
              :prov?prov.gradient
              :ws.isShared?'linear-gradient(135deg,#10b981,#059669)'
              :'linear-gradient(135deg,#5b86e5,#36d1dc)'}}>
            {ws.isLocalFile?'💻':prov?prov.emoji:ws.isShared?'👥':'☁'}
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontWeight:600,fontSize:14,whiteSpace:'nowrap',overflow:'hidden',
              textOverflow:'ellipsis'}}>{detail}</div>
            {subDetail&&<div style={{fontSize:11,color:'var(--text-3)',marginTop:2,
              whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{subDetail}</div>}
          </div>
        </div>
        <div className="menu-sep"/>
        <div className="mi" style={{borderRadius:7,marginTop:4}}
          onMouseDown={e=>{e.preventDefault();setPop(null);onCreateWorkspace();}}>
          <div className="mi-ic"><Plus size={14}/></div>
          <div className="mi-tx">Save to a different location…</div>
        </div>
      </div>
    </Popup>}
  </>;
}

/* ---------------- Topbar ---------------- */
function Topbar({node,nodes,openPage,toggleSidebar,sidebarOpen,toggleFav,isFav,setModal,
  sharedCount,onToggleSharedPanel,notifCount,downloadPage,activeWorkspace}){
  const chain=[]; let c=node;
  while(c){ chain.unshift(c); c=c.parentId?nodes[c.parentId]:null; }
  const [dlMenu,setDlMenu]=useState(null);
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
    <StorageBadge ws={activeWorkspace} onCreateWorkspace={()=>setModal({type:'create-workspace'})}/>
    <div className="topbar-actions">
      <div className="tb-btn" onClick={()=>setModal({type:'share-doc',nodeId:node.id})}>Share</div>
      <div className="tb-btn" title="Shared documents" style={{position:'relative'}}
        onClick={onToggleSharedPanel}>
        <Ic n="share" style={{width:17,height:17}}/>
        {sharedCount>0&&<span className="tb-badge">{sharedCount}</span>}
      </div>
      <div className="tb-btn" title="Inbox" onClick={()=>setModal({type:'inbox'})}
        style={{position:'relative'}}>
        <Ic n="inbox" style={{width:17,height:17}}/>
        {notifCount>0&&<span className="tb-badge">{notifCount}</span>}
      </div>
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
function TrashModal({nodes,restore,deleteForever,onClose}){
  const [q,setQ]=React.useState('');
  const trashed=Object.values(nodes).filter(n=>n.trashed)
    .filter(n=>(n.title||'').toLowerCase().includes(q.toLowerCase()));
  return <div className="overlay" onClick={onClose}>
    <div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-h"><h3>Trash</h3>
        <div className="x" onClick={onClose}><Ic n="x"/></div></div>
      <div className="search-in" style={{borderBottom:'1px solid var(--border)'}}>
        <Ic n="search"/>
        <input placeholder="Search in Trash…" value={q} onChange={e=>setQ(e.target.value)}/>
      </div>
      <div className="search-res">
        {trashed.length===0&&<div className="search-empty">Trash is empty</div>}
        {trashed.map(n=>
          <div key={n.id} className="sr">
            <span className="sr-em">{n.icon||'📄'}</span>
            <div className="sr-tx"><b>{n.title||'Untitled'}</b></div>
            <button className="btn ghost" onClick={()=>restore(n.id)}>Restore</button>
            <button className="btn ghost" style={{color:'#d44c47'}} onClick={()=>deleteForever(n.id)}>Delete</button>
          </div>)}
      </div>
    </div>
  </div>;
}

/* ---------------- Archive modal ---------------- */
function ArchiveModal({nodes,unarchiveNode,deleteForever,onClose}){
  const [q,setQ]=React.useState('');
  const archived=Object.values(nodes).filter(n=>n.archived&&!n.trashed)
    .filter(n=>(n.title||'').toLowerCase().includes(q.toLowerCase()));
  return <div className="overlay" onClick={onClose}>
    <div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-h"><h3>Archive</h3>
        <div className="x" onClick={onClose}><Ic n="x"/></div></div>
      <div className="search-in" style={{borderBottom:'1px solid var(--border)'}}>
        <Ic n="search"/>
        <input placeholder="Search in Archive…" value={q} onChange={e=>setQ(e.target.value)}/>
      </div>
      <div className="search-res">
        {archived.length===0&&<div className="search-empty">Archive is empty</div>}
        {archived.map(n=>
          <div key={n.id} className="sr">
            <span className="sr-em">{n.icon||'📄'}</span>
            <div className="sr-tx"><b>{n.title||'Untitled'}</b></div>
            <button className="btn ghost" onClick={()=>{unarchiveNode(n.id);}} title="Restore to workspace">Restore</button>
            <button className="btn ghost" style={{color:'#d44c47'}} onClick={()=>deleteForever(n.id)}>Delete</button>
          </div>)}
      </div>
    </div>
  </div>;
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

function TemplatesModal({create,onClose}){
  const [cat,setCat]=useState('all');
  const filtered=cat==='all'?TEMPLATES:TEMPLATES.filter(t=>t.cat===cat);
  return <div className="overlay" onClick={onClose}>
    <div className="modal" style={{width:780,maxHeight:'90vh',display:'flex',flexDirection:'column'}}
      onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <h3>Templates</h3>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>

      {/* ── Category pills ── */}
      <div style={{display:'flex',gap:6,padding:'0 24px 16px',flexWrap:'wrap',flexShrink:0}}>
        {TEMPLATE_CATS.map(c=>(
          <button key={c.id}
            style={{fontSize:12,padding:'5px 14px',borderRadius:20,border:'none',cursor:'pointer',
              fontWeight:600,transition:'background .13s,color .13s',
              background:cat===c.id?'var(--accent)':'var(--bg-3)',
              color:cat===c.id?'#fff':'var(--text-2)'}}
            onClick={()=>setCat(c.id)}>{c.label}
          </button>
        ))}
      </div>

      {/* ── Template grid ── */}
      <div style={{overflowY:'auto',flex:1,padding:'0 24px 24px'}}>
        <div className="tpl-grid-new">
          {filtered.map(t=>(
            <div key={t.id} className="tpl-card-new"
              onClick={()=>{ create(t); onClose(); }}>
              {/* coloured header */}
              <div className="tpl-card-hd" style={{'--tpl-col':t.color}}>
                <span className="tpl-card-em">{t.icon}</span>
              </div>
              {/* body */}
              <div className="tpl-card-bd">
                <div className="tpl-card-nm">{t.name}</div>
                <div className="tpl-card-ds">{t.desc}</div>
                {t.tags&&<div className="tpl-tags">
                  {t.tags.map(tag=>(
                    <span key={tag} className="tpl-tag"
                      style={{'--tag-col':TAG_COLORS[tag]||'#94a3b8'}}>
                      {tag}
                    </span>
                  ))}
                </div>}
              </div>
              <div className="tpl-card-use">Use template →</div>
            </div>
          ))}
        </div>
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
            <kbd className="kbd">{s[1]}</kbd>
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
function CreateWorkspaceModal({onCreateCloud,onCreateLocal,onCreateCloudProvider,onOpenExisting,onClose}){
  const [name,setName]=useState('');
  const [type,setType]=useState('cloud'); // 'cloud' | 'local' | 'gdrive'
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const inputRef=useRef();
  const localSupported=isLocalFSSupported();

  useEffect(()=>{ setTimeout(()=>inputRef.current?.focus(),50); },[]);

  async function submit(e){
    e.preventDefault();
    const n=name.trim(); if(!n) return;
    setErr('');

    if(type==='local'){
      if(!localSupported){ setErr(LOCAL_FS_UNSUPPORTED_MSG); return; }
      setBusy(true);
      try{ await onCreateLocal(n); onClose(); }
      catch(ex){ if(ex.name!=='AbortError') setErr(ex.message||'Could not access the folder.'); }
      finally{ setBusy(false); }
      return;
    }

    if(type==='gdrive'){
      setBusy(true);
      try{ await onCreateCloudProvider('gdrive',n); onClose(); }
      catch(ex){ setErr(ex.message||'Failed to create workspace on Google Drive.'); }
      finally{ setBusy(false); }
      return;
    }

    // Firebase / local-browser cloud
    onCreateCloud(n); onClose();
  }

  const label=(txt,upper)=>(
    <div style={{fontSize:12,fontWeight:600,color:'var(--text-3)',marginBottom:8,
      textTransform:upper?'uppercase':'none',letterSpacing:upper?'.04em':'normal'}}>{txt}</div>
  );

  const card=(t,icon,title,desc,badge,disabled)=>{
    const sel=type===t;
    return <div onClick={()=>!disabled&&setType(t)}
      style={{flex:1,minWidth:'calc(33% - 6px)',
        border:`2px solid ${sel?'var(--accent)':'var(--border)'}`,borderRadius:10,
        padding:'12px 14px',cursor:disabled?'not-allowed':'pointer',transition:'border-color .15s',
        background:sel?'var(--accent-soft)':'var(--bg-2)',opacity:disabled?.55:1,
        boxSizing:'border-box'}}>
      <div style={{fontSize:26,marginBottom:6,lineHeight:1}}>{icon}</div>
      <div style={{fontWeight:600,fontSize:13,marginBottom:3}}>{title}</div>
      <div style={{fontSize:11,color:'var(--text-3)',lineHeight:1.5}}>{desc}</div>
      {badge&&<div style={{marginTop:6,fontSize:10,color:'var(--text-3)'}}>{badge}</div>}
    </div>;
  };

  return <div className="overlay" onClick={onClose}>
    <div className="modal" style={{width:540,maxHeight:'90vh',overflowY:'auto'}}
      onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <h3>Create new workspace</h3>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>
      <form onSubmit={submit} style={{padding:'18px 24px 24px',display:'flex',flexDirection:'column',gap:16}}>

        {/* ── Name ── */}
        <div>
          {label('Workspace name',true)}
          <input ref={inputRef} className="fld" value={name} onChange={e=>setName(e.target.value)}
            placeholder="e.g. Personal, Work, Research…"
            style={{fontSize:15,width:'100%',boxSizing:'border-box'}}/>
        </div>

        {/* ── Storage row 1: Firebase + Local ── */}
        <div>
          {label('Where to save it',true)}
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            {card('cloud','☁️','Firebase Cloud',
              isFirebaseConfigured?'Synced to all devices.':'Browser only (no Firebase).',
              isFirebaseConfigured?null:'⚠ No Firebase')}
            {card('local','💻','This Computer',
              'JSON file in a folder you choose.',
              localSupported?'Chrome / Edge required.':'⚠ Not available in this browser',
              !localSupported)}
          </div>
          {!localSupported&&<div style={{marginTop:8,fontSize:12,color:'var(--text-2)',
            background:'var(--bg-2)',borderRadius:8,padding:'10px 14px',display:'flex',
            gap:8,alignItems:'flex-start'}}>
            <span style={{fontSize:16}}>ℹ️</span>
            <span>{LOCAL_FS_UNSUPPORTED_MSG}</span>
          </div>}
        </div>

        {/* ── Storage row 2: Google Drive ── */}
        <div>
          {label('Or save to Google Drive',true)}
          {card('gdrive','📁','Google Drive',
            'Stored in your Drive app folder — never clutters your Drive.',
            <span style={{color:'#10b981',fontWeight:600}}>✓ Ready to use</span>)}
        </div>

        {/* ── Context hints ── */}
        {type==='local'&&localSupported&&<div style={{fontSize:12,color:'var(--text-2)',
          background:'var(--bg-2)',borderRadius:8,padding:'10px 14px',display:'flex',
          gap:8,alignItems:'flex-start'}}>
          <span style={{fontSize:16}}>📂</span>
          <span>Your OS file picker will open after clicking Create.
          Choose any folder — a <code>workspace.json</code> file will be created inside it.
          The app remembers the folder automatically.</span>
        </div>}

        {type==='gdrive'&&<div style={{fontSize:12,color:'var(--text-2)',
          background:'var(--bg-2)',borderRadius:8,padding:'10px 14px',display:'flex',
          gap:8,alignItems:'flex-start'}}>
          <span style={{fontSize:16}}>📁</span>
          <span>Since you're already signed in with Google, no extra login will appear.
          On first use a brief <em>Drive access consent</em> prompt will pop up.
          Your workspace file is saved in a hidden app folder and won't appear in
          your regular Drive files.</span>
        </div>}

        {err&&<div style={{color:'#d44c47',fontSize:13,background:'#fff0f0',borderRadius:6,
          padding:'8px 12px'}}>{err}</div>}

        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4}}>
          {onOpenExisting&&localSupported&&
            <button type="button" className="btn ghost"
              title="Connect a workspace folder that already exists (e.g. copied from another machine)"
              onClick={()=>{onOpenExisting();onClose();}} disabled={busy}>
              📂 Open existing folder…
            </button>}
          <div style={{flex:1}}/>
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary"
            disabled={!name.trim()||busy||(type==='local'&&!localSupported)}>
            {busy
              ?(type==='gdrive'?'Connecting to Google Drive…'
                :type==='local'?'Opening folder picker…'
                :'Creating…')
              :'Create workspace →'}
          </button>
        </div>
      </form>
    </div>
  </div>;
}

/* ---------------- Cloud Workspaces Browser Modal ---------------- */
function CloudWorkspacesModal({providerId,connectedWorkspaces,onReconnect,onDeleteFromCloud,onClose}){
  const prov=CLOUD_PROVIDERS[providerId];
  const [files,setFiles]=useState(null);
  const [error,setError]=useState('');
  const [busyId,setBusyId]=useState(null);

  useEffect(()=>{
    let cancelled=false;
    listCloudWorkspaces(providerId)
      .then(list=>{ if(!cancelled) setFiles(list); })
      .catch(e=>{ if(!cancelled) setError(e.message); });
    return ()=>{ cancelled=true; };
  },[providerId]);

  const connectedByRef={};
  const connectedByWsId={};
  (connectedWorkspaces||[]).forEach(ws=>{
    if(ws.cloudProvider===providerId){
      if(ws.cloudFileRef) connectedByRef[ws.cloudFileRef]=ws;
      connectedByWsId[ws.id]=ws;
    }
  });

  const getWsId=file=>file.name.replace('workspace-ws-','').replace('.json','');

  const handleReconnect=async file=>{
    setBusyId(file.id);
    try{
      const wsId=getWsId(file);
      await onReconnect(providerId,wsId,file.id,file.appProperties?.wsName||null);
      onClose();
    }catch(e){ alert(e.message); }
    finally{ setBusyId(null); }
  };

  const handleDelete=async file=>{
    const wsId=getWsId(file);
    const name=file.appProperties?.wsName||connectedByRef[file.id]?.name||connectedByWsId[wsId]?.name||'this workspace';
    if(!confirm(`Permanently delete "${name}" from ${prov.name}?\n\nThis action cannot be undone.`)) return;
    setBusyId(file.id);
    try{
      await onDeleteFromCloud(providerId,file.id,wsId);
      setFiles(f=>f.filter(x=>x.id!==file.id));
    }catch(e){ alert(e.message); }
    finally{ setBusyId(null); }
  };

  return <div className="overlay" onClick={onClose}>
    <div className="modal" style={{width:500,maxHeight:'90vh',overflowY:'auto'}}
      onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <h3>{prov.emoji} {prov.name} Workspaces</h3>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>
      <div style={{padding:'4px 24px 24px'}}>
        {!error&&files===null&&
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-3)',fontSize:14}}>
            Loading from {prov.name}…
          </div>}
        {error&&
          <div style={{color:'#d44c47',fontSize:13,background:'#fff0f0',borderRadius:6,
            padding:'10px 14px',marginBottom:12}}>{error}</div>}
        {files?.length===0&&
          <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-3)',fontSize:14}}>
            No workspaces found in {prov.name}.
          </div>}
        {files?.length>0&&<>
          <div style={{fontSize:11,color:'var(--text-3)',marginBottom:10}}>
            {files.length} workspace{files.length!==1?'s':''} found in {prov.name}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {files.map(file=>{
              const wsId=getWsId(file);
              const connected=connectedByRef[file.id]||connectedByWsId[wsId];
              const name=file.appProperties?.wsName||connected?.name;
              const modDate=new Date(file.modifiedTime).toLocaleDateString(undefined,
                {month:'short',day:'numeric',year:'numeric'});
              const isBusy=busyId===file.id;
              return <div key={file.id} style={{display:'flex',alignItems:'center',gap:10,
                padding:'10px 12px',borderRadius:8,
                border:`1px solid ${connected?'var(--accent)':'var(--border)'}`,
                background:connected?'var(--accent-soft)':'var(--bg-2)'}}>
                <div style={{width:38,height:38,borderRadius:8,flexShrink:0,
                  background:prov.gradient,display:'flex',alignItems:'center',
                  justifyContent:'center',fontSize:20}}>{prov.emoji}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13,overflow:'hidden',
                    textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {name||<span style={{color:'var(--text-3)',fontStyle:'italic'}}>Untitled Workspace</span>}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-3)',marginTop:2,display:'flex',alignItems:'center',gap:6}}>
                    <span>Modified {modDate}</span>
                    {connected&&<span style={{color:'var(--accent)',fontWeight:600}}>● Connected</span>}
                  </div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center'}}>
                  {connected
                    ?<span style={{fontSize:11,color:'var(--accent)',padding:'3px 10px',borderRadius:12,
                        background:'var(--accent-soft)',fontWeight:600,
                        border:'1px solid var(--accent)',whiteSpace:'nowrap'}}>✓ Connected</span>
                    :<button className="btn primary" style={{fontSize:12,padding:'5px 12px',whiteSpace:'nowrap'}}
                        onClick={()=>handleReconnect(file)} disabled={isBusy}>
                        {isBusy?'…':'↩ Reconnect'}
                      </button>}
                  <button className="icon-btn" style={{width:28,height:28,flexShrink:0}}
                    title={`Delete from ${prov.name}`}
                    onClick={()=>handleDelete(file)} disabled={isBusy}>
                    <Ic n="trash" style={{width:13,height:13,color:'#d44c47'}}/>
                  </button>
                </div>
              </div>;
            })}
          </div>
        </>}
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

/* ---------------- Settings modal ---------------- */
function SettingsModal({theme,setTheme,accent,setAccent,nodeCount,onClose,user,onSignOut,onRestartTutorial}){
  const initial=(user?.displayName||user?.email||'?').trim().charAt(0).toUpperCase();
  return <div className="overlay" onClick={onClose}>
    <div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-h"><h3>Settings</h3>
        <div className="x" onClick={onClose}><Ic n="x"/></div></div>
      <div className="set-body">
        <div className="set-row account-row">
          <div className="account-id">
            <div className="account-ava">
              {user?.photoURL
                ? <img src={user.photoURL} alt={initial} referrerPolicy="no-referrer"/>
                : initial}
            </div>
            <div className="sr-l">
              <b>{user?.displayName||'Your account'}</b>
              <small>{user?.email||'Signed in'}</small>
            </div>
          </div>
          <button className="btn ghost" onClick={onSignOut}>Sign out</button>
        </div>
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
          <div className="sr-l"><b>Pages</b><small>Total pages & databases in this workspace.</small></div>
          <span>{nodeCount}</span>
        </div>
        <div className="set-row">
          <div className="sr-l"><b>Storage</b><small>{user?.isLocal?'Saved locally in this browser.':'Synced to the cloud for your account.'}</small></div>
          <span style={{color:'var(--text-3)'}}>{user?.isLocal?'Local':'Cloud'}</span>
        </div>
        <div className="set-row">
          <div className="sr-l"><b>Tutorial</b><small>Replay the guided tour of the workspace.</small></div>
          <button className="btn ghost" onClick={onRestartTutorial}>Start tour</button>
        </div>
        <div className="set-row" style={{borderBottom:'none'}}>
          <div className="sr-l"><b>About</b></div>
          <span style={{color:'var(--text-3)'}}>v2.0</span>
        </div>
      </div>
    </div>
  </div>;
}

/* ---------------- Inbox Modal ---------------- */
function InboxModal({notifications,onMarkRead,onSwitchWorkspace,onClose}){
  const unread=(notifications||[]).filter(n=>!n.read);
  function fmtTime(ts){
    if(!ts) return '';
    const d=new Date(ts); const now=Date.now();
    const diff=now-d.getTime();
    if(diff<60000) return 'just now';
    if(diff<3600000) return Math.floor(diff/60000)+'m ago';
    if(diff<86400000) return Math.floor(diff/3600000)+'h ago';
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  }
  return <div className="overlay" onClick={onClose}>
    <div className="modal" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
      <div className="modal-h">
        <h3>Inbox {unread.length>0&&<span style={{fontSize:12,background:'var(--accent)',
          color:'#fff',borderRadius:10,padding:'1px 7px',marginLeft:6}}>{unread.length}</span>}</h3>
        <button className="x" onClick={onClose}><Ic n="x"/></button>
      </div>
      <div style={{maxHeight:420,overflowY:'auto'}}>
        {(notifications||[]).length===0
          ? <div className="empty-state" style={{padding:'40px 24px'}}>
              <div className="es-em">📬</div>
              <b>All caught up</b>
              <p style={{marginTop:4,fontSize:13,color:'var(--text-3)'}}>
                Workspace invitations and mentions will appear here.
              </p>
            </div>
          : (notifications||[]).map(n=>
            <div key={n.id} className={cx('notif-row',!n.read&&'unread')}
              onClick={()=>{ if(!n.read) onMarkRead(n.id); }}>
              <div className="notif-icon">
                {n.type==='workspace_invite'?'🏢':'🔔'}
              </div>
              <div style={{flex:1,minWidth:0}}>
                {n.type==='workspace_invite'
                  ? <>
                      <div className="notif-msg">
                        <b>{n.fromName||n.fromEmail}</b> shared workspace{' '}
                        <b>"{n.wsName}"</b> with you
                      </div>
                      <div style={{marginTop:6}}>
                        <button className="btn primary" style={{fontSize:12,padding:'4px 12px'}}
                          onClick={e=>{e.stopPropagation();onSwitchWorkspace(n.wsId);onClose();if(!n.read)onMarkRead(n.id);}}>
                          Open workspace
                        </button>
                      </div>
                    </>
                  : <div className="notif-msg">{n.body||'New notification'}</div>}
                <div className="notif-time">{fmtTime(n.at)}</div>
              </div>
              {!n.read&&<div className="notif-dot"/>}
            </div>
          )}
      </div>
    </div>
  </div>;
}

/* ---------------- Dashboard ---------------- */
function Dashboard({nodes,favorites,openPage,addTop,setModal,activeWorkspace,sharedNodes}){
  const allNodes=Object.values(nodes).filter(n=>!n.trashed&&!n.archived);
  const pageCount=allNodes.filter(n=>n.kind==='page').length;
  const dbCount=allNodes.filter(n=>n.kind==='database').length;
  const sharedCount=Object.values(sharedNodes||{}).filter(s=>s&&s.length>0).length;
  const favNodes=favorites.map(id=>nodes[id]).filter(n=>n&&!n.trashed&&!n.archived);
  const privatePages=allNodes.filter(n=>n.section==='private'&&n.parentId===null)
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
      <div className="dash-stat"><span className="dash-stat-n">{sharedCount}</span><span className="dash-stat-l">Shared docs</span></div>
      <div className="dash-stat"><span className="dash-stat-n">{favNodes.length}</span><span className="dash-stat-l">Favorites</span></div>
    </div>
    <div className="dash-actions">
      <button className="dash-action-btn" onClick={()=>addTop('private')}>
        <Ic n="plus" style={{width:18,height:18}}/><span>New page</span>
      </button>
      <button className="dash-action-btn" onClick={()=>setModal({type:'templates'})}>
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
function Workspace({ user, onSignOut }){
  const [store,setStore]=React.useState(null);
  const [expanded,setExpanded]=React.useState({});
  const [sidebarOpen,setSidebarOpen]=React.useState(true);
  const [modal,setModal]=React.useState(null);
  const [peek,setPeek]=React.useState(null); // {dbHostId, rowId}
  const [sharedPanelOpen,setSharedPanelOpen]=React.useState(false);
  const [showTutorial,setShowTutorial]=React.useState(false);
  const [notifications,setNotifications]=React.useState([]);

  /* ---- local-file workspace ---- */
  const [localWsIndex,setLocalWsIndex]=React.useState([]); // [{id,name,dirName,accessible},…]
  const localWsData=React.useRef({});  // {[wsId]: {nodes,favorites,currentId}} — in-memory cache
  const localObjURLs=React.useRef({}); // {[wsId]: [blobURL,…]} — transient upload URLs to revoke
  // Local workspaces whose data we've actually read from disk (or created) this
  // session. We ONLY write a local workspace.json for ids in this set — this is
  // the safeguard against clobbering a real folder with placeholder/seed content
  // when the active id and the in-memory content briefly disagree (e.g. boot).
  const loadedLocalWs=React.useRef(new Set());

  /* ---- cloud-provider workspaces ---- */
  const cloudWsData=React.useRef({});      // {[wsId]: {nodes,favorites,currentId}} — session cache
  const cloudWriteTimers=React.useRef({}); // {[wsId]: timerId} — debounce per workspace

  /* ---- load (per-user) ---- */
  React.useEffect(()=>{
    let alive=true;
    (async()=>{
      const [saved, sharedList, notifs] = await Promise.all([
        loadStore(user.uid),
        loadSharedWorkspaces(user.uid),
        loadNotifications(user.uid),
      ]);
      if(!alive) return;
      let init=saved||buildSeed();
      // migrate old combined theme values → split into theme + accent
      const OLD_MAP={ocean:'ocean',forest:'forest',rose:'rose',sunset:'sunset',midnight:'blue'};
      if(init.theme&&OLD_MAP[init.theme]){
        init={...init,accent:OLD_MAP[init.theme],theme:'light'};
      }
      if(!init.accent) init={...init,accent:'indigo'};
      // merge shared workspaces into workspaces list
      if(sharedList.length){
        const existing=(init.workspaces||[]).map(w=>w.id);
        const toAdd=sharedList.filter(sw=>!existing.includes(sw.id));
        if(toAdd.length){
          init={...init,
            workspaces:[...(init.workspaces||[]),...toAdd.map(sw=>({
              id:sw.id,name:sw.wsName,isPersonal:false,isShared:true,
              ownerEmail:sw.ownerEmail,members:sw.members||[],
            }))],
            workspaceSnapshots:{...(init.workspaceSnapshots||{}),
              ...Object.fromEntries(toAdd.map(sw=>[sw.id,sw.snapshot||{}]))},
          };
        }
      }
      // External workspaces need a permission prompt / re-auth before their
      // content can be loaded, and their pages must never be shown under the
      // personal id. So always boot on the personal workspace, rebuilding its
      // view from the ws_main snapshot (also fixes any leaked external nodes
      // that an older build may have stored as the top-level content).
      if(isExternalWs((init.workspaces||[]).find(w=>w.id===(init.activeWorkspaceId||'ws_main')))){
        const personal=(init.workspaceSnapshots||{})['ws_main'];
        const fbId=nid();const fbBlk=nid();
        init={...init,activeWorkspaceId:'ws_main',
          nodes:personal?.nodes||{[fbId]:{id:fbId,kind:'page',title:'',icon:'',cover:'',
            parentId:null,section:'private',sort:0,blocks:[{id:fbBlk,type:'text',html:''}]}},
          favorites:personal?.favorites||[],
          currentId:personal?.currentId||fbId};
      }
      setStore(init);
      setNotifications(notifs||[]);
      if(!init.tutorialCompleted) setShowTutorial(true);
      const b=document.getElementById('boot'); if(b) b.style.display='none';
    })();
    return ()=>{ alive=false; };
  },[user.uid]);

  /* ---- load local-file workspaces from IndexedDB on startup ---- */
  React.useEffect(()=>{
    if(!isLocalFSSupported()) return;
    let alive=true;
    (async()=>{
      const index=await loadLocalWorkspaceIndex();
      if(!alive) return;
      setLocalWsIndex(index);
      // eagerly cache data for workspaces where permission is already granted
      for(const entry of index){
        if(!entry.accessible) continue;
        try{
          let data=await readLocalWorkspace(entry.id);
          if(data){
            data=await hydrateLocalData(entry.id,data);
            loadedLocalWs.current.add(entry.id);
            await upgradeLocalFolderIfNeeded(entry.id,entry.name,data);
            localWsData.current[entry.id]=data;
            if(data.uploads?.length)
              setStore(s=>s?{...s,uploads:mergeUploads(s.uploads,entry.id,data.uploads)}:s);
          }
        }catch(_){}
      }
    })();
    return ()=>{ alive=false; };
  },[]);

  /* ---- persist + theme ---- */
  React.useEffect(()=>{
    if(!store) return;
    // External (local/cloud) workspace data is stripped out — only the
    // workspace list, settings and personal/shared content reach Firebase.
    saveStore(user.uid,toCloudStore(store));

    const activeWs=(store.workspaces||[]).find(w=>w.id===(store.activeWorkspaceId||'ws_main'));

    // write to local file if the active workspace is a local-file workspace
    // (only once its real content has been loaded/created this session)
    if(activeWs?.isLocalFile&&loadedLocalWs.current.has(activeWs.id)){
      const live={nodes:store.nodes,favorites:store.favorites,currentId:store.currentId,
        uploads:(store.uploads||[]).filter(u=>u.wsId===activeWs.id),name:activeWs.name};
      localWsData.current[activeWs.id]=live;                  // hydrated in-memory cache
      writeLocalWorkspaceDebounced(activeWs.id,dehydrateLocalData(activeWs.name,live)); // lean on-disk
    }

    // write to cloud provider if the active workspace has one
    if(activeWs?.cloudProvider){
      const wsId=activeWs.id;
      const snapshot={nodes:store.nodes,favorites:store.favorites,currentId:store.currentId,wsName:activeWs.name,
        uploads:(store.uploads||[]).filter(u=>u.wsId===wsId)};
      cloudWsData.current[wsId]=snapshot;
      // debounced write: 1.5 s
      clearTimeout(cloudWriteTimers.current[wsId]);
      cloudWriteTimers.current[wsId]=setTimeout(async()=>{
        try{
          const newRef=await writeCloudWorkspace(
            activeWs.cloudProvider, wsId, snapshot, activeWs.cloudFileRef||null);
          // update stored file reference if it changed (e.g. first GDrive write)
          if(newRef&&newRef!==activeWs.cloudFileRef){
            setStore(s=>({...s,workspaces:(s.workspaces||[]).map(w=>
              w.id===wsId?{...w,cloudFileRef:newRef}:w)}));
          }
        }catch(e){ console.warn('[cloudstorage] write failed:',e.message); }
      },1500);
    }

    document.body.classList.toggle('dark',store.theme==='dark');
    ['indigo','blue','ocean','forest','rose','sunset','violet']
      .forEach(a=>document.body.classList.remove(`t-${a}`));
    document.body.classList.add(`t-${store.accent||'indigo'}`);
  },[store]);

  /* ---- global keyboard (declared before early return to keep hook order stable) ---- */
  React.useEffect(()=>{
    const h=e=>{
      const meta=e.metaKey||e.ctrlKey;
      if(meta&&e.key==='k'){e.preventDefault();
        setModal(m=>m&&m.type==='search'?null:{type:'search'});}
      else if(meta&&e.key==='\\'){e.preventDefault();setSidebarOpen(o=>!o);}
      else if(meta&&e.shiftKey&&(e.key==='l'||e.key==='L')){e.preventDefault();
        setStore(s=>s?{...s,theme:s.theme==='dark'?'light':'dark'}:s);}
      else if(meta&&(e.key==='/'||e.key==='?')){e.preventDefault();
        setModal({type:'shortcuts'});}
      else if(meta&&e.key==='n'){e.preventDefault();
        setStore(s=>{
          if(!s) return s;
          const id=nid();
          const sort=Object.values(s.nodes)
            .filter(n=>n.parentId===null&&n.section==='private'&&!n.trashed).length;
          const nn={id,kind:'page',title:'',icon:'',cover:'',parentId:null,
            section:'private',sort,blocks:[{id:nid(),type:'text',html:''}]};
          return {...s,nodes:{...s.nodes,[id]:nn},currentId:id};
        });
        setModal(null);}
      else if(e.key==='Escape'){setModal(null);setPeek(null);}
    };
    window.addEventListener('keydown',h);
    return()=>window.removeEventListener('keydown',h);
  },[]);

  if(!store) return <div className="app-loading"><div className="app-loading-logo">◧</div><div className="app-loading-bar"><i /></div></div>;
  const {nodes,favorites,currentId,theme,accent='indigo'}=store;
  const node=currentId===DASH_ID?null:nodes[currentId]||nodes[Object.keys(nodes)[0]]||null;
  const workspaces=store.workspaces||[{id:'ws_main',name:'My Workspace',isPersonal:true,members:[]}];
  const activeWorkspaceId=store.activeWorkspaceId||'ws_main';
  const activeWorkspace=workspaces.find(w=>w.id===activeWorkspaceId)||workspaces[0];
  // uploads scoped to the active workspace (legacy untagged uploads count as personal)
  const scopedUploads=(store.uploads||[]).filter(u=>
    u.wsId===activeWorkspaceId||(!u.wsId&&activeWorkspaceId==='ws_main'));
  const sharedNodes=store.sharedNodes||{};
  const sharedCount=Object.values(sharedNodes).filter(s=>s&&s.length>0).length;
  const notifCount=notifications.filter(n=>!n.read).length;

  /* ---- helpers ---- */
  const patch=p=>setStore(s=>({...s,...p}));
  const setNodes=fn=>setStore(s=>({...s,nodes:fn(s.nodes)}));
  const updateNode=(id,np)=>setNodes(n=>({...n,[id]:{...n[id],...np}}));
  const openPage=id=>{setStore(s=>({...s,currentId:id}));setPeek(null);setModal(null);};
  const toggleExp=(id,force)=>setExpanded(e=>({...e,[id]:force!==undefined?force:!e[id]}));

  const addNode=(parentId,section,extra={})=>{
    const id=nid();
    const sibs=Object.values(nodes).filter(n=>n.parentId===parentId&&!n.trashed);
    const nn={id,kind:'page',title:'',icon:'',cover:'',parentId,
      section:parentId?nodes[parentId].section:section,
      sort:sibs.length,blocks:[{id:nid(),type:'text',html:''}],...extra};
    setNodes(n=>({...n,[id]:nn}));
    return id;
  };
  const addTop=section=>{const id=addNode(null,section);openPage(id);};
  const addChild=parentId=>{const id=addNode(parentId);
    setExpanded(e=>({...e,[parentId]:true}));openPage(id);};
  const createChild=parentId=>addNode(parentId); // for subpage blocks (no nav)

  const collectDesc=(id,acc)=>{acc.push(id);
    Object.values(nodes).filter(n=>n.parentId===id).forEach(c=>collectDesc(c.id,acc));};
  const trashNode=id=>{
    const acc=[];collectDesc(id,acc);
    setNodes(n=>{const m={...n};acc.forEach(x=>m[x]={...m[x],trashed:true});return m;});
    setStore(s=>({...s,favorites:s.favorites.filter(f=>!acc.includes(f)),
      currentId:acc.includes(s.currentId)?'n_start':s.currentId}));
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
    // prevent moving into own descendant
    let c=newParent;while(c){if(c===id) return;c=nodes[c]?nodes[c].parentId:null;}
    updateNode(id,{parentId:newParent,section:nodes[newParent].section});
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
  const unarchiveNode=id=>{
    setNodes(n=>({...n,[id]:{...n[id],archived:false}}));
  };

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
      const tree=collectPageTree(id,nodes); // [{node,depth},…]
      if(format==='html'){
        content=mergePagesToHTML(tree);type='text/html';ext='.html';
      } else if(format==='txt'){
        content=tree.map(({node,depth},i)=>{
          const sep=i>0?'\n\n'+'━'.repeat(60)+'\n\n':'';
          const indent=depth>0?'  '.repeat(depth):'';
          return sep+(depth>0?indent+'↳ Sub-page\n':'')+(indent?indent:'')
            +pageToText(node).split('\n').join('\n'+indent);
        }).join('');
        type='text/plain';ext='.txt';
      } else {
        // markdown
        content=tree.map(({node,depth},i)=>{
          if(i===0) return blocksToMarkdown(node);
          const hashes='#'.repeat(Math.min(depth+1,6));
          const subTitle=`${hashes} ${node.icon||''}${node.icon?' ':''}${node.title||'Untitled'}`;
          // omit the auto-generated title line from blocksToMarkdown (first line)
          const body=blocksToMarkdown(node).split('\n').slice(2).join('\n');
          return `\n\n---\n\n<!-- depth ${depth} -->\n${subTitle}\n\n${body}`;
        }).join('');
        type='text/markdown';ext='.md';
      }
    } else {
      if(format==='txt'){
        content=pageToText(n);type='text/plain';ext='.txt';
      } else if(format==='html'){
        content=pageToHTML(n);type='text/html';ext='.html';
      } else {
        content=blocksToMarkdown(n);type='text/markdown';ext='.md';
      }
    }

    const blob=new Blob([content],{type});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(n.title||'Untitled')+(withSubPages?'+sub-pages':'')+ext;a.click();
  };

  const importPage=({title,blocks})=>{
    const id=nid();
    const sort=Object.values(nodes).filter(n=>n.parentId===null&&n.section==='private'&&!n.trashed).length;
    setNodes(n=>({...n,[id]:{id,kind:'page',title:title||'Imported',icon:'📄',cover:'',
      parentId:null,section:'private',sort,blocks}}));
    openPage(id);
  };

  /* ---- file uploads ---- */
  const trackLocalURL=(wsId,url)=>{
    (localObjURLs.current[wsId]||(localObjURLs.current[wsId]=[])).push(url);
  };
  /* Central upload entry-point. Takes a File, stores it according to the active
     workspace type, adds the record to store.uploads, and returns
     { id, name, type, size, url, localName } for the caller to put on its block.
     - local  → file written to ./uploads (referenced by `localName`); `url` is a
                transient blob URL for display, never persisted.
     - others → base64 data URL (kept inline, as before). */
  const uploadFile=async file=>{
    const id=nid();
    const base={id,name:file.name,type:file.type||'application/octet-stream',
      size:file.size,uploadedAt:Date.now()};
    if(activeWorkspace?.isLocalFile){
      const dataUrl=await readAsDataUrl(file);
      const localName=await writeLocalUploadFile(activeWorkspace.id,file.name,dataUrl).catch(()=>null);
      const url=URL.createObjectURL(file);
      trackLocalURL(activeWorkspace.id,url);
      const rec={...base,localName,wsId:activeWorkspace.id,dataUrl:url};
      setStore(s=>({...s,uploads:[...(s.uploads||[]),rec]}));
      return {...base,url,localName};
    }
    const dataUrl=await readAsDataUrl(file);
    const rec={...base,dataUrl,wsId:activeWorkspaceId};
    setStore(s=>({...s,uploads:[...(s.uploads||[]),rec]}));
    return {...base,url:dataUrl};
  };

  /* Turn the on-disk workspace.json (file references only) into something
     renderable: rebuild a blob URL for every uploaded file from ./uploads and
     plug it into the upload records and the blocks that reference them. Also
     migrates legacy workspaces that still embed base64 (writes those bytes out
     to ./uploads and assigns a localName so the next save is lean). */
  const hydrateLocalData=async(wsId,data)=>{
    if(!data) return data;
    // revoke any prior URLs for this workspace before making new ones
    (localObjURLs.current[wsId]||[]).forEach(u=>{try{URL.revokeObjectURL(u);}catch{}});
    localObjURLs.current[wsId]=[];

    // anything below schema v2 (no version field, base64 inline) is "old format"
    let migrated=(data.version||0)<2;

    const uploads=[...(data.uploads||[])];
    const map={}; // localName -> blob URL
    for(let i=0;i<uploads.length;i++){
      let u=uploads[i];
      // migrate a legacy base64 upload into ./uploads
      if(!u.localName && typeof u.dataUrl==='string' && u.dataUrl.startsWith('data:')){
        const localName=await writeLocalUploadFile(wsId,u.name||'file',u.dataUrl).catch(()=>null);
        if(localName){ u={...u,localName}; uploads[i]=u; migrated=true; }
      }
      if(u.localName && !map[u.localName]){
        const res=await readLocalUploadURL(wsId,u.localName);
        if(res){ map[u.localName]=res.url; trackLocalURL(wsId,res.url); }
      }
    }

    // uploadId -> localName, to migrate base64 image/file blocks
    const idToLocal={};
    for(const u of uploads) if(u.id&&u.localName) idToLocal[u.id]=u.localName;

    const nodes={};
    for(const [id,n] of Object.entries(data.nodes||{})){
      const blocks=(n.blocks||[]).map(b=>{
        let localName=b.localName;
        if(!localName && b.uploadId && idToLocal[b.uploadId]) localName=idToLocal[b.uploadId];
        if(localName && map[localName]) return {...b,localName,url:map[localName]};
        return localName?{...b,localName}:b;
      });
      nodes[id]={...n,blocks};
    }

    const hydratedUploads=uploads.map(u=>
      u.localName&&map[u.localName] ? {...u,dataUrl:map[u.localName]} : u);

    return {...data,nodes,uploads:hydratedUploads,migrated};
  };

  /* If hydrateLocalData reported the folder was in the old format, rewrite
     workspace.json in the new (v2, file-reference) format immediately so the
     folder is upgraded on disk on first open — not only after the next edit. */
  const upgradeLocalFolderIfNeeded=async(wsId,name,data)=>{
    if(!data?.migrated) return;
    try{
      await writeLocalWorkspaceNow(wsId,dehydrateLocalData(name||data.name||'Workspace',
        {nodes:data.nodes,favorites:data.favorites,currentId:data.currentId,uploads:data.uploads}));
    }catch(_){}
  };
  const deleteUpload=id=>{
    const rec=(store.uploads||[]).find(u=>u.id===id);
    if(rec?.localName){
      const ws=workspaces.find(w=>w.id===rec.wsId);
      if(ws?.isLocalFile) deleteLocalUploadFile(rec.wsId,rec.localName).catch(()=>{});
    }
    setStore(s=>({...s,uploads:(s.uploads||[]).filter(u=>u.id!==id)}));
  };

  const createFromTemplate=t=>{
    const id=addNode(null,'private',{title:t.name,icon:t.icon});
    if(t.db){
      updateNode(id,{kind:'database',db:newDB('table'),blocks:undefined});
    }else{
      updateNode(id,{blocks:t.blocks.map(b=>({id:nid(),...b}))});
    }
    setModal(null);openPage(id);
  };



  /* ---- workspace management ---- */
  const switchWorkspace=async wsId=>{
    if(!store||store.activeWorkspaceId===wsId) return;
    const targetWs=(store.workspaces||[]).find(w=>w.id===wsId);

    /* helper: flush current ws to its persistent store before switching */
    const flushCurrent=async()=>{
      const curWs=(store.workspaces||[]).find(w=>w.id===(store.activeWorkspaceId||'ws_main'));
      if(curWs?.isLocalFile&&loadedLocalWs.current.has(curWs.id)){
        await writeLocalWorkspaceNow(curWs.id,dehydrateLocalData(curWs.name,
          {nodes:store.nodes,favorites:store.favorites,currentId:store.currentId,
           uploads:(store.uploads||[]).filter(u=>u.wsId===curWs.id)}));
      }
      if(curWs?.cloudProvider){
        clearTimeout(cloudWriteTimers.current[curWs.id]);
        try{
          await writeCloudWorkspace(curWs.cloudProvider,curWs.id,
            {nodes:store.nodes,favorites:store.favorites,currentId:store.currentId},
            curWs.cloudFileRef||null);
        }catch(_){}
      }
    };

    /* ── local-file workspace ── */
    if(targetWs?.isLocalFile){
      await flushCurrent();
      let data=localWsData.current[wsId];
      if(!data){
        let handle=localWsIndex.find(l=>l.id===wsId)?.handle;
        if(!handle){ const rec=await getLocalWorkspaceRecord(wsId); handle=rec?.handle; }
        const {granted,reason}=await requestPermissionForHandleDetailed(handle,true);
        if(!granted){ alert(localPermMessage(reason)); return; }
        try{ data=await readLocalWorkspace(wsId); }catch(_){ data=null; }
        if(data){ data=await hydrateLocalData(wsId,data); await upgradeLocalFolderIfNeeded(wsId,targetWs?.name,data); }
        setLocalWsIndex(prev=>prev.map(l=>l.id===wsId?{...l,accessible:true}:l));
      }
      const fbId=nid();const fbBlk=nid();
      const fallback={[fbId]:{id:fbId,kind:'page',title:'',icon:'',cover:'',
        parentId:null,section:'private',sort:0,blocks:[{id:fbBlk,type:'text',html:''}]}};
      const ws=data||{nodes:fallback,favorites:[],currentId:fbId};
      // Only cache + allow writes when we actually read real data from disk.
      // If the read failed/was empty we show a transient fallback but DON'T
      // cache it or mark it loaded — otherwise a later switch would treat the
      // empty fallback as real and autosave it over the folder (a wipe).
      if(data){ localWsData.current[wsId]=ws; loadedLocalWs.current.add(wsId); }
      setStore(s=>({...s,
        nodes:ws.nodes||fallback,favorites:ws.favorites||[],currentId:ws.currentId||fbId,
        activeWorkspaceId:wsId,
        uploads:mergeUploads(s.uploads,wsId,ws.uploads||[]),
        workspaceSnapshots:{...(s.workspaceSnapshots||{}),
          [s.activeWorkspaceId||'ws_main']:{nodes:s.nodes,favorites:s.favorites,currentId:s.currentId}},
      }));
      setExpanded({});
      return;
    }

    /* ── third-party cloud provider workspace ── */
    if(targetWs?.cloudProvider){
      await flushCurrent();
      // try in-memory cache first; otherwise authenticate + fetch
      let data=cloudWsData.current[wsId];
      if(!data){
        let token=getProviderToken(targetWs.cloudProvider);
        if(!token){
          try{ token=await authenticateProvider(targetWs.cloudProvider,{loginHint:user?.email||undefined}); }
          catch(e){ alert(`Could not connect to ${CLOUD_PROVIDERS[targetWs.cloudProvider]?.name||targetWs.cloudProvider}: ${e.message}`); return; }
        }
        try{
          data=await readCloudWorkspace(targetWs.cloudProvider,wsId,targetWs.cloudFileRef||null);
        }catch(e){ alert(`Failed to load workspace from ${CLOUD_PROVIDERS[targetWs.cloudProvider]?.name||targetWs.cloudProvider}: ${e.message}`); return; }
      }
      const fbId=nid();const fbBlk=nid();
      const fallback={[fbId]:{id:fbId,kind:'page',title:'',icon:'',cover:'',
        parentId:null,section:'private',sort:0,blocks:[{id:fbBlk,type:'text',html:''}]}};
      const ws=data||{nodes:fallback,favorites:[],currentId:fbId};
      cloudWsData.current[wsId]=ws;
      setStore(s=>({...s,
        nodes:ws.nodes||fallback,favorites:ws.favorites||[],currentId:ws.currentId||fbId,
        activeWorkspaceId:wsId,
        uploads:mergeUploads(s.uploads,wsId,ws.uploads||[]),
        workspaceSnapshots:{...(s.workspaceSnapshots||{}),
          [s.activeWorkspaceId||'ws_main']:{nodes:s.nodes,favorites:s.favorites,currentId:s.currentId}},
      }));
      setExpanded({});
      return;
    }

    /* ── Firebase / in-memory workspace ── */
    await flushCurrent();
    const fbId=nid(); const fbBlk=nid();
    const fallbackNodes={[fbId]:{id:fbId,kind:'page',title:'',icon:'',cover:'',
      parentId:null,section:'private',sort:0,blocks:[{id:fbBlk,type:'text',html:''}]}};
    setStore(s=>{
      if(!s||s.activeWorkspaceId===wsId) return s;
      const curId=s.activeWorkspaceId||'ws_main';
      const updatedSnap={...(s.workspaceSnapshots||{}),
        [curId]:{nodes:s.nodes,favorites:s.favorites,currentId:s.currentId}};
      const target=updatedSnap[wsId];
      if(!target){
        return {...s,nodes:fallbackNodes,favorites:[],currentId:fbId,
          activeWorkspaceId:wsId,workspaceSnapshots:updatedSnap};
      }
      return {...s,nodes:target.nodes,favorites:target.favorites,currentId:target.currentId,
        activeWorkspaceId:wsId,workspaceSnapshots:updatedSnap};
    });
    setExpanded({});
  };
  const createWorkspace=(name)=>{
    if(!name?.trim()) return;
    const id=nid(); const startId=nid(); const startBlk=nid();
    const emptyNodes={[startId]:{id:startId,kind:'page',title:'',icon:'',cover:'',
      parentId:null,section:'private',sort:0,blocks:[{id:startBlk,type:'text',html:''}]}};
    const newWs={id,name:name.trim(),isPersonal:false,members:[]};
    setStore(s=>{
      const curId=s.activeWorkspaceId||'ws_main';
      const snap=s.workspaceSnapshots||{};
      return {...s,workspaces:[...(s.workspaces||[]),newWs],
        nodes:emptyNodes,favorites:[],currentId:startId,activeWorkspaceId:id,
        workspaceSnapshots:{...snap,[curId]:{nodes:s.nodes,favorites:s.favorites,currentId:s.currentId}}};
    });
    setExpanded({});
  };

  const createLocalWorkspace=async(name)=>{
    // throws AbortError if user cancels the folder picker — caller handles it
    const id=nid(); const startId=nid(); const startBlk=nid();
    const emptyNodes={[startId]:{id:startId,kind:'page',title:'',icon:'',cover:'',
      parentId:null,section:'private',sort:0,blocks:[{id:startBlk,type:'text',html:''}]}};
    const initialData={name:name.trim(),version:2,nodes:emptyNodes,favorites:[],currentId:startId,uploads:[]};

    // open OS folder picker + register in IndexedDB
    const rec=await pickAndRegisterDirectory(id,name.trim());

    // NEVER clobber an existing workspace: if the chosen folder already has a
    // workspace.json, open that instead of overwriting it with an empty one.
    let existing=null;
    try{ existing=await readLocalWorkspace(id); }catch(_){}
    if(existing){
      const ok=window.confirm(
        'This folder already contains a workspace ("'+(existing.name||rec.dirName)+'").\n\n'+
        'Open it as-is? (Cancel to pick a different, empty folder — your data will NOT be touched.)');
      if(!ok){ try{ await removeLocalWorkspaceRecord(id); }catch(_){} return; }
      const data=await hydrateLocalData(id,existing);
      const wsName=(data.name||rec.dirName||name.trim()).toString();
      const fbId=nid();
      const ws=data;
      localWsData.current[id]=ws;
      loadedLocalWs.current.add(id);
      const newWs={id,name:wsName,isPersonal:false,isLocalFile:true,dirName:rec.dirName,members:[]};
      setLocalWsIndex(prev=>[...prev,{id,name:wsName,dirName:rec.dirName,
        handle:rec.handle,accessible:true,createdAt:Date.now()}]);
      setStore(s=>{
        const curId=s.activeWorkspaceId||'ws_main';
        const snap=s.workspaceSnapshots||{};
        return {...s,workspaces:[...(s.workspaces||[]),newWs],
          nodes:ws.nodes||emptyNodes,favorites:ws.favorites||[],currentId:ws.currentId||startId,
          activeWorkspaceId:id,
          uploads:mergeUploads(s.uploads,id,ws.uploads||[]),
          workspaceSnapshots:{...snap,[curId]:{nodes:s.nodes,favorites:s.favorites,currentId:s.currentId}}};
      });
      setExpanded({});
      return;
    }

    // folder is empty → safe to write the fresh workspace
    await writeLocalWorkspaceNow(id,initialData);

    const newWs={id,name:name.trim(),isPersonal:false,isLocalFile:true,
      dirName:rec.dirName,members:[]};
    localWsData.current[id]=initialData;
    loadedLocalWs.current.add(id);
    setLocalWsIndex(prev=>[...prev,{id,name:name.trim(),dirName:rec.dirName,
      handle:rec.handle,accessible:true,createdAt:Date.now()}]);
    setStore(s=>{
      const curId=s.activeWorkspaceId||'ws_main';
      const snap=s.workspaceSnapshots||{};
      return {...s,workspaces:[...(s.workspaces||[]),newWs],
        nodes:emptyNodes,favorites:[],currentId:startId,activeWorkspaceId:id,
        workspaceSnapshots:{...snap,[curId]:{nodes:s.nodes,favorites:s.favorites,currentId:s.currentId}}};
    });
    setExpanded({});
  };

  /* Connect an EXISTING workspace folder (e.g. one copied from another machine)
     as a new local workspace — reads its workspace.json without overwriting. */
  const openExistingLocalWorkspace=async()=>{
    const id=nid();
    let rec;
    try{ rec=await openExistingDirectory(id); }
    catch(e){ if(e?.name!=='AbortError') alert('Could not open the folder: '+(e?.message||e)); return; }
    if(!rec.foundFile){
      alert('No workspace.json was found in “'+rec.dirName+'” or its subfolders.\n\n'+
        'Pick the folder that directly contains workspace.json (it must be at the top '+
        'of the chosen folder, or one subfolder deep).');
      return;
    }
    // workspace.json was already read by openExistingDirectory while it held the handle
    let data=rec.data||null;
    if(!data){ try{ data=await readLocalWorkspace(id); }catch(_){} }
    if(!data){ alert('Found workspace.json in “'+rec.dirName+'” but could not read it (it may be corrupted or empty).'); return; }
    data=await hydrateLocalData(id,data);
    const name=(data?.name||rec.dirName||'Workspace').toString();
    await upgradeLocalFolderIfNeeded(id,name,data);
    const fbId=nid();const fbBlk=nid();
    const fallback={[fbId]:{id:fbId,kind:'page',title:'',icon:'',cover:'',
      parentId:null,section:'private',sort:0,blocks:[{id:fbBlk,type:'text',html:''}]}};
    const ws=data||{nodes:fallback,favorites:[],currentId:fbId};
    localWsData.current[id]=ws;
    loadedLocalWs.current.add(id);
    const newWs={id,name,isPersonal:false,isLocalFile:true,dirName:rec.dirName,members:[]};
    setLocalWsIndex(prev=>[...prev,{id,name,dirName:rec.dirName,
      handle:rec.handle,accessible:true,createdAt:Date.now()}]);
    setStore(s=>{
      const curId=s.activeWorkspaceId||'ws_main';
      const snap=s.workspaceSnapshots||{};
      return {...s,workspaces:[...(s.workspaces||[]),newWs],
        nodes:ws.nodes||fallback,favorites:ws.favorites||[],currentId:ws.currentId||fbId,
        activeWorkspaceId:id,
        uploads:mergeUploads(s.uploads,id,ws.uploads||[]),
        workspaceSnapshots:{...snap,[curId]:{nodes:s.nodes,favorites:s.favorites,currentId:s.currentId}}};
    });
    setExpanded({});
  };

  /* Create a workspace stored on a third-party cloud provider */
  const createCloudProviderWorkspace=async(providerId,name)=>{
    // 1. Authenticate (opens OAuth popup — must happen on user gesture)
    let token;
    try{ token=await authenticateProvider(providerId,{loginHint:user?.email||undefined}); }
    catch(e){ throw new Error(`Sign-in failed: ${e.message}`); }

    const id=nid(); const startId=nid(); const startBlk=nid();
    const emptyNodes={[startId]:{id:startId,kind:'page',title:'',icon:'',cover:'',
      parentId:null,section:'private',sort:0,blocks:[{id:startBlk,type:'text',html:''}]}};
    const initialData={nodes:emptyNodes,favorites:[],currentId:startId};

    // 2. Write the initial workspace file to the provider
    let fileRef=null;
    try{ fileRef=await writeCloudWorkspace(providerId,id,initialData,null); }
    catch(e){ throw new Error(`Could not create workspace file: ${e.message}`); }

    const prov=CLOUD_PROVIDERS[providerId];
    const newWs={id,name:name.trim(),isPersonal:false,
      cloudProvider:providerId,cloudFileRef:fileRef,members:[]};
    cloudWsData.current[id]=initialData;
    setStore(s=>{
      const curId=s.activeWorkspaceId||'ws_main';
      const snap=s.workspaceSnapshots||{};
      return {...s,workspaces:[...(s.workspaces||[]),newWs],
        nodes:emptyNodes,favorites:[],currentId:startId,activeWorkspaceId:id,
        workspaceSnapshots:{...snap,[curId]:{nodes:s.nodes,favorites:s.favorites,currentId:s.currentId}}};
    });
    setExpanded({});
  };

  /* Reconnect a workspace that exists in the cloud but was removed locally */
  const reconnectCloudWorkspace=async(providerId,wsId,fileRef,wsName)=>{
    let data;
    try{
      data=await readCloudWorkspace(providerId,wsId,fileRef);
    }catch(e){ throw new Error(`Failed to load workspace: ${e.message}`); }
    const fbId=nid();const fbBlk=nid();
    const fallback={[fbId]:{id:fbId,kind:'page',title:'',icon:'',cover:'',
      parentId:null,section:'private',sort:0,blocks:[{id:fbBlk,type:'text',html:''}]}};
    const ws=data||{nodes:fallback,favorites:[],currentId:fbId};
    const name=wsName||ws.wsName
      ||Object.values(ws.nodes||{}).filter(n=>!n.parentId&&!n.trashed).sort((a,b)=>(a.sort||0)-(b.sort||0))[0]?.title
      ||'Reconnected Workspace';
    const newWs={id:wsId,name,isPersonal:false,cloudProvider:providerId,cloudFileRef:fileRef,members:[]};
    cloudWsData.current[wsId]=ws;
    setStore(s=>{
      if((s.workspaces||[]).some(w=>w.id===wsId)) return s;
      const curId=s.activeWorkspaceId||'ws_main';
      return {...s,workspaces:[...(s.workspaces||[]),newWs],
        nodes:ws.nodes||fallback,favorites:ws.favorites||[],currentId:ws.currentId||fbId,
        activeWorkspaceId:wsId,
        workspaceSnapshots:{...(s.workspaceSnapshots||{}),
          [curId]:{nodes:s.nodes,favorites:s.favorites,currentId:s.currentId}}};
    });
    setExpanded({});
  };

  /* Permanently delete a workspace file from the cloud, and remove locally if connected */
  const deleteWorkspaceFromCloud=async(providerId,fileRef,wsId)=>{
    await deleteCloudWorkspace(providerId,fileRef,wsId);
    const connected=(store.workspaces||[]).find(w=>
      w.cloudProvider===providerId&&(w.cloudFileRef===fileRef||w.id===wsId));
    if(connected) deleteWorkspace(connected.id,{skipConfirm:true});
  };

  const deleteWorkspace=(wsId,opts={})=>{
    if(!wsId||wsId==='ws_main') return;
    const targetWs=(store.workspaces||[]).find(w=>w.id===wsId);
    const prov=targetWs?.cloudProvider?CLOUD_PROVIDERS[targetWs.cloudProvider]:null;
    // For Firebase workspaces with shared members, show the two-option modal
    if(!opts.skipConfirm&&!targetWs?.isLocalFile&&!targetWs?.cloudProvider&&!targetWs?.isShared){
      const members=targetWs?.members||[];
      if(members.length>0){ setModal({type:'delete-workspace',wsId}); return; }
    }
    const msg=targetWs?.isLocalFile
      ?`Remove "${targetWs.name}" from the workspace list?\n\nThe folder and workspace.json file on your computer will NOT be deleted — you can add it back at any time.`
      :targetWs?.cloudProvider
        ?`Remove "${targetWs.name}" from the workspace list?\n\nThe file stored in ${prov?.name||'the cloud provider'} will NOT be deleted — you can reconnect it at any time.`
        :`Delete this workspace? Its pages will be lost.`;
    if(!opts.skipConfirm&&!confirm(msg)) return;
    if(targetWs?.isLocalFile){
      removeLocalWorkspaceRecord(wsId).catch(()=>{});
      setLocalWsIndex(prev=>prev.filter(l=>l.id!==wsId));
      delete localWsData.current[wsId];
    }
    if(targetWs?.cloudProvider){
      delete cloudWsData.current[wsId];
      clearTimeout(cloudWriteTimers.current[wsId]);
      delete cloudWriteTimers.current[wsId];
    }
    // owner deleting a Firebase workspace — remove its sharedWorkspaces doc so
    // collaborators lose access on their next load
    if(!targetWs?.isLocalFile&&!targetWs?.cloudProvider&&!targetWs?.isShared){
      deleteSharedWorkspace(wsId).catch(()=>{});
    }
    // pre-build fallback seed outside setStore to avoid double invocation in strict mode
    const fallbackSeed=buildSeed();
    setStore(s=>{
      const newSnap={...(s.workspaceSnapshots||{})};
      delete newSnap[wsId];
      const newWorkspaces=(s.workspaces||[]).filter(w=>w.id!==wsId);
      if(s.activeWorkspaceId!==wsId) return {...s,workspaces:newWorkspaces,workspaceSnapshots:newSnap};
      const mainTarget=newSnap['ws_main'];
      if(mainTarget){
        return {...s,workspaces:newWorkspaces,nodes:mainTarget.nodes,
          favorites:mainTarget.favorites,currentId:mainTarget.currentId,
          activeWorkspaceId:'ws_main',workspaceSnapshots:newSnap};
      }
      return {...s,workspaces:newWorkspaces,nodes:fallbackSeed.nodes,
        favorites:fallbackSeed.favorites,currentId:fallbackSeed.currentId,
        activeWorkspaceId:'ws_main',workspaceSnapshots:newSnap};
    });
    setExpanded({});
  };
  const leaveWorkspace=async(wsId,newOwner)=>{
    await transferWorkspaceOwnership(wsId,newOwner,user.uid);
    const fallbackSeed=buildSeed();
    setStore(s=>{
      const newSnap={...(s.workspaceSnapshots||{})};
      delete newSnap[wsId];
      const newWorkspaces=(s.workspaces||[]).filter(w=>w.id!==wsId);
      if(s.activeWorkspaceId!==wsId) return {...s,workspaces:newWorkspaces,workspaceSnapshots:newSnap};
      const mainTarget=newSnap['ws_main'];
      if(mainTarget){
        return {...s,workspaces:newWorkspaces,nodes:mainTarget.nodes,
          favorites:mainTarget.favorites,currentId:mainTarget.currentId,
          activeWorkspaceId:'ws_main',workspaceSnapshots:newSnap};
      }
      return {...s,workspaces:newWorkspaces,nodes:fallbackSeed.nodes,
        favorites:fallbackSeed.favorites,currentId:fallbackSeed.currentId,
        activeWorkspaceId:'ws_main',workspaceSnapshots:newSnap};
    });
    setExpanded({});
    setModal(null);
  };

  const updateWorkspaceMembers=(wsId,members)=>{
    setStore(s=>({...s,workspaces:(s.workspaces||[]).map(w=>w.id===wsId?{...w,members}:w)}));
  };

  /* ---- node sharing ---- */
  const shareNode=(nodeId,email,permission)=>{
    setStore(s=>{
      const cur=(s.sharedNodes||{})[nodeId]||[];
      const filtered=cur.filter(x=>x.email!==email);
      return {...s,sharedNodes:{...s.sharedNodes,[nodeId]:[...filtered,
        {email,permission,sharedAt:new Date().toISOString()}]}};
    });
    setSharedPanelOpen(true);
  };
  const unshareNode=(nodeId,email)=>{
    setStore(s=>{
      const cur=(s.sharedNodes||{})[nodeId]||[];
      const next=cur.filter(x=>x.email!==email);
      const sharedNodes={...s.sharedNodes};
      if(next.length) sharedNodes[nodeId]=next; else delete sharedNodes[nodeId];
      return {...s,sharedNodes};
    });
  };

  /* ---- row peek (database row as page) ---- */
  const openRow=(dbHostId,rowId)=>setPeek({dbHostId,rowId});
  // find the db object given host (page-as-database OR a block)
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

  /* ---- editor openRow wrapper: host is current node ---- */
  const editorOpenRow=(db,rowId)=>openRow(currentId,rowId);

  const lookupNode=id=>nodes[id];
  const isDashboard=currentId===DASH_ID;
  const isStoragePage=currentId===STORAGE_ID;

  const renameNode=(id,title,section)=>updateNode(id,{
    ...(title!==undefined?{title}:{}),
    ...(section!==undefined?{section}:{}),
  });

  // enrich workspaces with live accessibility info from localWsIndex
  const enrichedWorkspaces=workspaces.map(ws=>{
    if(!ws.isLocalFile) return ws;
    const local=localWsIndex.find(l=>l.id===ws.id);
    // No local handle on this device (e.g. opened in another browser or after
    // clearing site data): mark it as needing reconnect so the user can re-pick
    // the folder instead of hitting a dead end.
    if(!local) return {...ws,accessible:false,unlinked:true};
    return {...ws,accessible:local.accessible,dirName:local.dirName||ws.dirName};
  });

  // Re-pick the OS folder for a local workspace whose handle is missing on this
  // device, register it under the same id, then switch to it. Must run inside a
  // user gesture (the folder picker requires user activation).
  const relinkLocalWorkspace=async wsId=>{
    if(!isLocalFSSupported()){ alert(LOCAL_FS_UNSUPPORTED_MSG); return; }
    const ws=(workspaces||[]).find(w=>w.id===wsId);
    try{
      const rec=await relinkAndRegisterDirectory(wsId,ws?.name||'Workspace');
      const entry={id:wsId,name:ws?.name||rec.dirName,dirName:rec.dirName,
        handle:rec.handle,accessible:true,createdAt:Date.now()};
      setLocalWsIndex(prev=>prev.some(l=>l.id===wsId)
        ?prev.map(l=>l.id===wsId?entry:l)
        :[...prev,entry]);
      if(!rec.foundFile){
        alert('No existing workspace.json was found in “'+rec.dirName+'” or its subfolders. '+
          'This workspace will start empty here and save into that folder. '+
          'If your content is elsewhere, pick the exact folder that contains workspace.json.');
      }
      // drop any stale cached blank so the new folder is re-read from disk
      delete localWsData.current[wsId];
      if((store?.activeWorkspaceId||'ws_main')===wsId){
        // Already the active workspace — switchWorkspace would no-op, so load
        // the freshly linked folder's content into the current view directly.
        let data=null;
        try{ data=await readLocalWorkspace(wsId); }catch(_){}
        if(data){ data=await hydrateLocalData(wsId,data); await upgradeLocalFolderIfNeeded(wsId,ws?.name,data); }
        if(data){
          loadedLocalWs.current.add(wsId);
          localWsData.current[wsId]=data;
          const fbId=nid();
          setStore(s=>({...s,
            nodes:data.nodes||{},favorites:data.favorites||[],
            currentId:data.currentId||Object.keys(data.nodes||{})[0]||fbId,
            uploads:mergeUploads(s.uploads,wsId,data.uploads||[])}));
          setExpanded({});
        }
      }else{
        await switchWorkspace(wsId);
      }
    }catch(e){
      if(e?.name!=='AbortError') alert('Could not link the folder: '+(e?.message||e));
    }
  };

  const handleReconnectLocal=async wsId=>{
    if(!isLocalFSSupported()){ alert(LOCAL_FS_UNSUPPORTED_MSG); return; }
    // Use the in-memory directory handle so requestPermission() runs inside the
    // click's user-activation window (no IndexedDB await first) — otherwise the
    // browser silently suppresses the permission prompt.
    let handle=localWsIndex.find(l=>l.id===wsId)?.handle;
    if(!handle){ const rec=await getLocalWorkspaceRecord(wsId); handle=rec?.handle; }
    // Folder link lost on this device — let the user re-pick the folder.
    if(!handle){ await relinkLocalWorkspace(wsId); return; }
    const {granted,reason}=await requestPermissionForHandleDetailed(handle,true);
    if(!granted){ alert(localPermMessage(reason)); return; }
    setLocalWsIndex(prev=>prev.map(l=>l.id===wsId?{...l,accessible:true}:l));
    // now switch to it
    await switchWorkspace(wsId);
  };

  const handleBrowseCloudWorkspaces=async(providerId)=>{
    // Authenticate while still inside the user-gesture window
    await authenticateProvider(providerId,{loginHint:user?.email||undefined});
    setModal({type:'browse-cloud',providerId});
  };

  return <div className={cx('app',theme==='dark'&&'dark',`t-${accent}`)}>
    <Sidebar open={sidebarOpen} nodes={nodes} favorites={favorites} currentId={currentId}
      expanded={expanded} toggleExp={toggleExp} openPage={openPage}
      addChild={addChild} trashNode={trashNode} archiveNode={archiveNode} onDrop={moveNode}
      addTop={addTop} setModal={setModal}
      workspaces={enrichedWorkspaces} activeWorkspaceId={activeWorkspaceId}
      onSwitchWorkspace={switchWorkspace}
      onCreateWorkspace={()=>setModal({type:'create-workspace'})}
      onShareWorkspace={wsId=>setModal({type:'share-workspace',wsId})}
      onDeleteWorkspace={deleteWorkspace}
      onReconnectLocal={handleReconnectLocal} onRelinkLocal={relinkLocalWorkspace}
      onOpenExistingWorkspace={isLocalFSSupported()?openExistingLocalWorkspace:undefined}
      onBrowseCloudWorkspaces={handleBrowseCloudWorkspaces}
      toggleFav={toggleFav} duplicate={duplicate} exportPage={exportPage}
      renameNode={renameNode} user={user} notifCount={notifCount}/>

    <div className="main">
      {isStoragePage
        ? <>
            <div className="topbar">
              {!sidebarOpen&&<div className="tb-btn" title="Open sidebar"
                onClick={()=>setSidebarOpen(o=>!o)}>
                <Ic n="menu" style={{width:17,height:17}}/></div>}
              <div className="crumbs">
                <div className="crumb"><span>📦</span><span>Storage</span></div>
              </div>
              <StorageBadge ws={activeWorkspace}
                onCreateWorkspace={()=>setModal({type:'create-workspace'})}/>
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
              <StorageBadge ws={activeWorkspace}
                onCreateWorkspace={()=>setModal({type:'create-workspace'})}/>
              <div className="topbar-actions">
                <div className="tb-btn" title="Shared documents" style={{position:'relative'}}
                  onClick={()=>setSharedPanelOpen(o=>!o)}>
                  <Ic n="share" style={{width:17,height:17}}/>
                  {sharedCount>0&&<span className="tb-badge">{sharedCount}</span>}
                </div>
              </div>
            </div>
            <Dashboard nodes={nodes} favorites={favorites} openPage={openPage}
              addTop={addTop} setModal={setModal}
              activeWorkspace={activeWorkspace} sharedNodes={sharedNodes}/>
          </>
        : <>
            <Topbar node={node} nodes={nodes} openPage={openPage}
              toggleSidebar={()=>setSidebarOpen(o=>!o)} sidebarOpen={sidebarOpen}
              toggleFav={toggleFav} isFav={node&&favorites.includes(node.id)} setModal={setModal}
              sharedCount={sharedCount} onToggleSharedPanel={()=>setSharedPanelOpen(o=>!o)}
              notifCount={notifCount} downloadPage={downloadPage}
              activeWorkspace={activeWorkspace}/>
            {node&&<Editor key={node.id} node={node} update={updateNode}
              createChild={createChild} openPage={openPage}
              lookupNode={lookupNode} openRow={editorOpenRow}
              onUploadFile={uploadFile} uploads={scopedUploads}
              childPages={Object.values(nodes).filter(n=>n.parentId===node.id&&!n.trashed&&!n.archived)
                .sort((a,b)=>(a.sort||0)-(b.sort||0))}/>}
          </>}
    </div>

    {sharedPanelOpen&&
      <SharedPanel nodes={nodes} sharedNodes={sharedNodes}
        onOpen={id=>{openPage(id);}}
        onUnshare={unshareNode}
        onClose={()=>setSharedPanelOpen(false)}/>}

    {showTutorial&&
      <TutorialOverlay
        onComplete={()=>{patch({tutorialCompleted:true});setShowTutorial(false);}}
        onSkip={()=>{patch({tutorialCompleted:true});setShowTutorial(false);}}/>}

    {/* row peek */}
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
    {modal&&modal.type==='trash'&&
      <TrashModal nodes={nodes} restore={restore} deleteForever={deleteForever}
        onClose={()=>setModal(null)}/>}
    {modal&&modal.type==='archive'&&
      <ArchiveModal nodes={nodes} unarchiveNode={unarchiveNode} deleteForever={deleteForever}
        onClose={()=>setModal(null)}/>}
    {modal&&modal.type==='create-workspace'&&
      <CreateWorkspaceModal
        onCreateCloud={name=>{createWorkspace(name);}}
        onCreateLocal={createLocalWorkspace}
        onCreateCloudProvider={createCloudProviderWorkspace}
        onOpenExisting={isLocalFSSupported()?openExistingLocalWorkspace:undefined}
        onClose={()=>setModal(null)}/>}
    {modal&&modal.type==='templates'&&
      <TemplatesModal create={createFromTemplate} onClose={()=>setModal(null)}/>}
    {modal&&modal.type==='shortcuts'&&
      <ShortcutsModal onClose={()=>setModal(null)}/>}
    {modal&&modal.type==='settings'&&
      <SettingsModal theme={theme} setTheme={t=>patch({theme:t})}
        accent={accent} setAccent={a=>patch({accent:a})}
        nodeCount={Object.values(nodes).filter(n=>!n.trashed&&!n.archived).length}
        onClose={()=>setModal(null)}
        user={user} onSignOut={onSignOut}
        onRestartTutorial={()=>{setModal(null);setShowTutorial(true);}}/>}
    {modal&&modal.type==='inbox'&&
      <InboxModal
        notifications={notifications}
        onMarkRead={async id=>{
          setNotifications(prev=>prev.map(n=>n.id===id?{...n,read:true}:n));
          await markNotificationRead(user.uid,id);
        }}
        onSwitchWorkspace={wsId=>switchWorkspace(wsId)}
        onClose={()=>setModal(null)}/>}
    {modal&&modal.type==='share-doc'&&node&&
      <ShareDocModal
        node={nodes[modal.nodeId]||node}
        shares={(sharedNodes)[modal.nodeId]||[]}
        onAdd={(email,perm)=>shareNode(modal.nodeId,email,perm)}
        onRemove={email=>unshareNode(modal.nodeId,email)}
        onClose={()=>setModal(null)}/>}
    {modal&&modal.type==='share-workspace'&&(()=>{
      const targetWs=workspaces.find(w=>w.id===modal.wsId)||activeWorkspace;
      if(targetWs.isPersonal) return null;
      return <ShareWorkspaceModal
        workspace={targetWs}
        user={user}
        currentSnapshot={{nodes,favorites,currentId}}
        onUpdateMembers={members=>updateWorkspaceMembers(targetWs.id,members)}
        onClose={()=>setModal(null)}/>;
    })()}
    {modal&&modal.type==='delete-workspace'&&(()=>{
      const targetWs=workspaces.find(w=>w.id===modal.wsId);
      if(!targetWs) return null;
      return <DeleteWorkspaceModal
        workspace={targetWs}
        onDeleteAll={()=>deleteWorkspace(modal.wsId,{skipConfirm:true})}
        onLeave={newOwner=>leaveWorkspace(modal.wsId,newOwner)}
        onClose={()=>setModal(null)}/>;
    })()}
    {modal&&modal.type==='page-menu'&&node&&
      <PageMenu node={node} nodes={nodes} onClose={()=>setModal(null)} trashNode={trashNode}
        duplicate={duplicate} setModal={setModal} downloadPage={downloadPage}/>}
    {modal&&modal.type==='browse-cloud'&&
      <CloudWorkspacesModal
        providerId={modal.providerId}
        connectedWorkspaces={store.workspaces||[]}
        onReconnect={reconnectCloudWorkspace}
        onDeleteFromCloud={deleteWorkspaceFromCloud}
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
