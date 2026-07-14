/* =========================================================================
   smart.jsx — the SMART PAGE (block editor) + shared UI primitives
   -------------------------------------------------------------------------
   Everything that renders or edits BLOCK-based content lives here: the
   contentEditable block editor (Editable / Block / Editor), the slash and
   block menus, databases (smart tables) with all their views, plus the
   shared UI primitives they are built from (Popup, ContextMenu, pickers,
   icons, caret helpers). workspace.jsx composes the app around these; the
   SIMPLE markdown-page editor lives in ./markdown.jsx. Dependencies flow
   one way: workspace.jsx → smart.jsx (never back).
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
  Cloud, HardDrive, Paperclip, Database, Eye, PanelRight, PanelLeftClose, LogOut, Unlink,
  Puzzle, Info, FolderPlus, Folder, FolderOpen,
  Play,
} from 'lucide-react';
import { loadDict, isMisspelled, suggest } from './spellcheck.js';

/* ---------- utils ---------- */
const nid = () => 'n'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);
const cx = (...a)=>a.filter(Boolean).join(' ');
const clone = o => typeof structuredClone==='function' ? structuredClone(o) : JSON.parse(JSON.stringify(o));
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = iso => { if(!iso) return ''; const d=new Date(iso+'T00:00');
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); };
const fmtBytes = b => { if(!b) return '0 B'; const u=['B','KB','MB','GB']; let i=0;
  while(b>=1024&&i<u.length-1){b/=1024;i++;} return b.toFixed(i>0?1:0)+' '+u[i]; };

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
  {g:'Basic',id:'mdpage',label:'Markdown page',desc:'Embed a simple sub-page — plain .md, no blocks',ic:'🗒️',kw:'markdown md simple plain page subpage'},
  {g:'Table',id:'table',label:'Simple table',desc:'Plain rows and columns of text',ic:'⊞',kw:'table simple grid rows columns'},
  {g:'Smart table',id:'db-table',label:'Table view',desc:'Every row is a page; switch views anytime',ic:'⊟',kw:'smart table database grid'},
  {g:'Smart table',id:'db-board',label:'Board view',desc:'Kanban-style board',ic:'▥',kw:'board kanban database smart'},
  {g:'Smart table',id:'db-gallery',label:'Gallery view',desc:'Cards in a grid',ic:'▦',kw:'gallery cards database smart'},
  {g:'Smart table',id:'db-list',label:'List view',desc:'Minimal list',ic:'☰',kw:'list database smart'},
  {g:'Smart table',id:'db-calendar',label:'Calendar view',desc:'Rows on a calendar',ic:'📅',kw:'calendar database date smart'},
  {g:'Media',id:'image',label:'Image',desc:'Upload or embed an image',ic:'🖼️',kw:'image picture photo upload'},
  {g:'Media',id:'file',label:'File attachment',desc:'Attach any file or document',ic:'📎',kw:'file attach upload pdf doc'},
  {g:'Media',id:'bookmark',label:'Web bookmark',desc:'Save a link as a card',ic:'🔗',kw:'bookmark link url web'},
  {g:'Media',id:'code',label:'Code',desc:'Code with syntax style',ic:'</>',kw:'code snippet'},
  // inline formatting — applied to the current block's text (see applySlash)
  {g:'Format',id:'fmt-bold',label:'Bold',desc:'Make the text bold',ic:<b>B</b>,kw:'bold strong format',fmt:'bold'},
  {g:'Format',id:'fmt-italic',label:'Italic',desc:'Make the text italic',ic:<i>I</i>,kw:'italic emphasis format',fmt:'italic'},
  ...TEXT_COLORS.filter(c=>c!=='default').map(c=>({g:'Color',id:'fmt-tc-'+c,
    label:c[0].toUpperCase()+c.slice(1)+' text',desc:'Colour the text '+c,
    ic:<span className={'tc-'+c} style={{fontWeight:800}}>A</span>,kw:c+' color colour text',fmt:'tc-'+c})),
  ...SEL_COLORS.filter(c=>c!=='default').map(c=>({g:'Highlight',id:'fmt-bg-'+c,
    label:c[0].toUpperCase()+c.slice(1)+' highlight',desc:'Highlight the text in '+c,
    ic:<span className={'bg-'+c} style={{padding:'0 5px',borderRadius:4}}>A</span>,kw:c+' highlight background',fmt:'bg-'+c})),
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
  'panel-left-close': PanelLeftClose, puzzle: Puzzle, info: Info, 'folder-plus': FolderPlus,
  folder: Folder, 'folder-open': FolderOpen,
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

/* Default icon for SIMPLE markdown pages: just the text "md" — plain styled
   text (no SVG box), so at default size it matches the page-title text size. */
function MdMark({size=16}){
  return <span className="md-mark" aria-hidden="true"
    style={{fontSize:Math.round(size*0.9),fontWeight:800,lineHeight:1,
      fontFamily:"ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace",
      letterSpacing:'-0.5px'}}>md</span>;
}
/* Default icon for SMART (block) pages: the lucide page/document icon. */
const PageMark=({size=15})=>
  <Ic n="doc" style={{width:size,height:size,color:'var(--text-2)'}}/>;
/* Kind-aware default: "md" badge for simple pages, page icon otherwise.
   (Used wherever a node has no custom emoji icon.) */
const NodeMark=({node,size=15})=>
  node&&node.kind==='md'?<MdMark size={size}/>:<PageMark size={size}/>;
/* Default folder icon (simple outline, not an emoji). */
const FolderMark=({open,size=15})=>
  <Ic n={open?'folder-open':'folder'} style={{width:size,height:size,color:'var(--text-2)'}}/>;

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

  // ---- a sample FILE page (kind:'file') — handled by a file-handler plugin
  // (the demo ships "Code Viewer") or the built-in text editor as fallback.
  add({id:'n_script',kind:'file',title:'hello.py',ext:'py',plugin:'',
    parentId:null,sort:9,icon:'',cover:'',
    data:'# A sample Python file living right in the workspace.\n'+
      '# Files like .py/.html/.css/.js open through File Handler plugins\n'+
      '# (Settings → Plugins → File handlers).\n\n'+
      'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("Workspace"))\n'});

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
    spellCheck ref={setRef} data-ph={placeholder||''} style={style}
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
        const head = c.g!==lastG ? <div className="menu-h" key={'h'+c.g}>{c.g}</div> : null;
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
function BlockMenu({rect,block,onClose,onAction,onFmt,canFormat,spell,onSpell}){
  const [sub,setSub]=useState(null);      // 'turn' | null
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

  // ── main menu position ──  (wider when the format toolbar is shown)
  const mw=canFormat?312:210;
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
  const sw=210;
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
          {canFormat && <>
            <FormatBar onCmd={onFmt}/>
            <div className="menu-sep"/>
          </>}
          {spell && spell.suggestions.length>0 && <>
            <div className="menu-h">Spelling</div>
            {spell.suggestions.map(s=><div key={s} className="mi"
              onMouseDown={e=>{e.preventDefault();onSpell(s);}}>
              <div className="mi-ic">✓</div><div className="mi-tx spell-sug">{s}</div>
            </div>)}
            <div className="menu-sep"/>
          </>}
          {block.type!=='table'&&<div className={cx('mi',sub==='turn'&&'hi')}
            onMouseEnter={e=>openSub('turn',e)}
            onMouseDown={e=>{e.preventDefault();openSub('turn',e);}}>
            <div className="mi-ic">⇄</div><div className="mi-tx">Turn into</div>
            <Ic n="chevron" style={{width:13,height:13}}/></div>}
          <div className="mi" onMouseDown={e=>{e.preventDefault();onAction('duplicate');}}>
            <div className="mi-ic">⧉</div><div className="mi-tx">Duplicate</div>
            <span className="mi-kbd">⌘D</span></div>
          <div className="menu-sep"/>
          <div className="mi danger" onMouseDown={e=>{e.preventDefault();onAction('delete');}}>
            <div className="mi-ic"><Ic n="trash" style={{width:15,height:15}}/></div>
            <div className="mi-tx">Delete</div><span className="mi-kbd">Del</span></div>
        </div>
      </div>,
      document.body
    )}

    {sub==='turn'&&subRect&&createPortal(
      <div className="pop" ref={subRef} style={{top:sTop,left:sLeft,width:sw}}>
        <div className="menu">
          <div className="menu-h">Turn into</div>
          {turnTypes.map(([t,l,ic])=><div key={t} className="mi"
            onMouseDown={e=>{e.preventDefault();onAction('turn',t);}}>
            <div className="mi-ic">{ic}</div><div className="mi-tx">{l}</div>
          </div>)}
        </div>
      </div>,
      document.body
    )}
  </>;
}

/* ---- Selection format toolbar (bold / italic / colour / highlight) ---- */
/* Rendered at the top of the block context menu; `onCmd(cmd, value?)` applies
   the command to the current selection (or the whole block when none). */
function FormatBar({onCmd}){
  const [sub,setSub]=useState(null); // 'color' | 'bg'
  const pd=f=>e=>{ e.preventDefault(); e.stopPropagation(); f(); };
  const Btn=({title,cmd,children})=>
    <button className="fmt-btn" title={title} onMouseDown={pd(()=>onCmd(cmd))}>{children}</button>;
  return <div className="fmt-in-menu">
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
  </div>;
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
/* Memoized: the Editor re-renders on every keystroke, but its handler props
   are identity-stable (see the live-ref pattern in Editor), so only the block
   actually being edited re-renders. */
const Block=React.memo(function Block(props){
  const {block,index,listNumber,onChange,onEnter,onBackspace,onDeleteForward,onArrow,onIndent,
    focus,setFocus,onSlash,onBlockAction,openPage,onDragStart,onDragOver,onDrop,
    isDragSource,dropPos,depth,onUploadFile,uploads,selected} = props;
  const ceRef=useRef();
  const codeRef=useRef();
  const [menu,setMenu]=useState(null);
  const [emoji,setEmoji]=useState(false);
  const [imgPick,setImgPick]=useState(false);
  const T=block.type;
  // block types that carry inline-formattable text (drive the format toolbar)
  const canFormat=['text','h1','h2','h3','quote','todo','bullet','number','toggle','callout'].includes(T);
  // selection formatting (right-click menu) — applies to the current selection
  const applyFormat=(a,v)=>{
    const el=ceRef.current; if(!el) return;
    // unwrap any <code> spans overlapping the selection; returns whether any existed
    const unwrapCode=()=>{
      const sel=window.getSelection();
      if(!sel.rangeCount) return false;
      const range=sel.getRangeAt(0);
      const codes=[...el.querySelectorAll('code')].filter(c=>range.intersectsNode(c));
      codes.forEach(c=>{ const p=c.parentNode;
        while(c.firstChild) p.insertBefore(c.firstChild,c);
        p.removeChild(c); p.normalize(); });
      return codes.length>0;
    };
    if(a==='bold') document.execCommand('bold');
    else if(a==='italic') document.execCommand('italic');
    else if(a==='underline') document.execCommand('underline');
    else if(a==='strike') document.execCommand('strikeThrough');
    else if(a==='code'){
      const sel=window.getSelection();
      if(sel.rangeCount){
        // remember the selection as text offsets so it survives the DOM edit
        const r=sel.getRangeAt(0);
        const measure=(c,o)=>{const rr=document.createRange();
          rr.selectNodeContents(el); rr.setEnd(c,o); return rr.toString().length;};
        const from=measure(r.startContainer,r.startOffset), to=measure(r.endContainer,r.endOffset);
        if(from!==to){
          // toggle: unwrap if already code, otherwise wrap the (plain) text
          if(!unwrapCode()){
            const text=r.toString();
            r.deleteContents();
            const code=document.createElement('code'); code.textContent=text;
            r.insertNode(code);
          }
          // restore the selection over the same text so it stays highlighted
          const locate=off=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n,c=0;
            while((n=w.nextNode())){if(c+n.nodeValue.length>=off)return[n,off-c];c+=n.nodeValue.length;}
            return[el,el.childNodes.length];};
          const [sn,so]=locate(from),[en,eo]=locate(to);
          const nr=document.createRange(); nr.setStart(sn,so); nr.setEnd(en,eo);
          sel.removeAllRanges(); sel.addRange(nr);
        }
      }
    }
    else if(a==='clear'){
      document.execCommand('removeFormat');
      applySelSpan('tc-','default'); applySelSpan('bg-','default');
      unwrapCode();
    }
    else if(a==='color') applySelSpan('tc-',v);
    else if(a==='bg') applySelSpan('bg-',v);
    onChange({...block,html:el.innerHTML});
  };
  // format toolbar inside the block menu — apply to the current selection, or
  // the whole block when nothing is selected
  const formatFromMenu=(a,v)=>{
    const el=ceRef.current; if(!el) return;
    const sel=window.getSelection();
    const hasSel=sel.rangeCount && !sel.isCollapsed
      && el.contains(sel.anchorNode) && el.contains(sel.focusNode);
    if(!hasSel){
      el.focus();
      const r=document.createRange(); r.selectNodeContents(el);
      sel.removeAllRanges(); sel.addRange(r);
    }
    applyFormat(a,v);
  };
  // replace the currently-selected (misspelled) word with a spelling suggestion
  const replaceSelection=(text)=>{
    const el=ceRef.current; if(!el) return;
    const sel=window.getSelection();
    if(!sel.rangeCount || sel.isCollapsed) return;
    const r=sel.getRangeAt(0);
    r.deleteContents();
    r.insertNode(document.createTextNode(text));
    sel.collapseToEnd();
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
      // slash — only open the menu at the start of the block or right after
      // whitespace; typing "/" inside a word (URLs, and/or, 24/7) shouldn't fire
      if(e.key==='/'){
        const before=textBeforeCaret(el);
        if(before===''||/\s$/.test(before)){
          setTimeout(()=>{ const r=el.getBoundingClientRect();
            onSlash({blockId:block.id,rect:r,el}); },0);
        }
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
        // only merge/convert when there's a plain caret; a selected range
        // should just be deleted natively by the browser
        if(window.getSelection().isCollapsed && caretAtStart(el)){
          e.preventDefault(); onBackspace(block,el);
        }
      }
      if(e.key==='Delete'){
        if(window.getSelection().isCollapsed && caretAtEnd(el)){
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
      const el=ceRef.current;
      // a numeric pos places the caret at that character offset (e.g. the
      // junction after a merge); otherwise 'start' / 'end'
      if(typeof focus.pos==='number'){ el.focus(); setCaretTextOffset(el,focus.pos); }
      else placeCaret(el,focus.pos==='start'?'start':'end');
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
      <span className="sp-emoji">{pg?pg.icon||<NodeMark node={pg}/>:<PageMark/>}</span>
      <span className="sp-title">{pg?(pg.title||'Untitled'):'(deleted page)'}</span>
    </div>;
  }
  else if(T==='database'){
    body=<div className="db"><DatabaseView db={block.db}
      onChange={ndb=>onChange({...block,db:ndb})} openRow={props.openRow}
      onDelete={()=>onBlockAction(block,'delete')}
      onDuplicate={()=>onBlockAction(block,'duplicate')}/></div>;
  }
  else if(T==='table'){
    body=<SimpleTableBlock block={block} onChange={onChange}/>;
  }
  else body=renderText('Type something…');

  const dropCls = dropPos ? (dropPos==='above'?'drop-above':'drop-below') : '';

  return <div className={cx('blk','b-'+T,selected&&'blk-sel',isDragSource&&'dragging',dropCls)}
    data-block-id={block.id}
    style={{marginLeft:(depth||0)*26}}
    onDragOver={e=>onDragOver(e,block)} onDrop={e=>onDrop(e,block)}
    onContextMenu={T!=='database'?e=>{
      e.preventDefault();e.stopPropagation();
      loadDict().catch(()=>{}); // no-op once loaded; warms it on first use
      // a single selected, misspelled word → offer spelling suggestions at the
      // top of the (custom) block menu
      let spell=null;
      const sel=window.getSelection();
      const word=sel.rangeCount && !sel.isCollapsed
        && ceRef.current && ceRef.current.contains(sel.anchorNode)
        && ceRef.current.contains(sel.focusNode) ? sel.toString().trim() : '';
      if(word && !/\s/.test(word) && isMisspelled(word)){
        const sug=suggest(word,4);
        if(sug.length) spell={word,suggestions:sug};
      }
      setMenu({top:e.clientY,bottom:e.clientY,left:e.clientX,right:e.clientX,spell});
    }:undefined}>
    {T!=='database' && Gutter}
    <div className="blk-body">{body}</div>
    {menu&&<BlockMenu rect={menu} block={block} canFormat={canFormat}
      spell={menu.spell} onSpell={w=>{ setMenu(null); replaceSelection(w); }}
      onClose={()=>setMenu(null)} onFmt={formatFromMenu}
      onAction={(a,v)=>{ setMenu(null); onBlockAction(block,a,v); }}/>}
  </div>;
});

window.__NOTION_PART2_DONE=true;
/* =========================================================================
   SIMPLE TABLE BLOCK — plain rows & columns (a GFM table on disk); for
   multi-view tables whose rows are pages, use the smart table (database).
   ========================================================================= */
function SimpleTableBlock({block,onChange}){
  const tb=block.table||{header:[''],rows:[]};
  const set=nt=>onChange({...block,table:nt});
  const setHeader=(ci,v)=>{const header=[...tb.header];header[ci]=v;set({...tb,header});};
  const setCell=(ri,ci,v)=>set({...tb,rows:tb.rows.map((r,i)=>{
    if(i!==ri) return r; const nr=[...r]; nr[ci]=v; return nr;})});
  const addRow=()=>set({...tb,rows:[...tb.rows,tb.header.map(()=>'')]});
  const addCol=()=>set({header:[...tb.header,''],rows:tb.rows.map(r=>[...r,''])});
  const delRow=ri=>set({...tb,rows:tb.rows.filter((_,i)=>i!==ri)});
  const delCol=ci=>{if(tb.header.length<=1)return;
    set({header:tb.header.filter((_,i)=>i!==ci),rows:tb.rows.map(r=>r.filter((_,i)=>i!==ci))});};
  const stop=e=>{if(e.key!=='Escape')e.stopPropagation();};
  return <div className="stbl" onKeyDown={stop}>
    <div className="stbl-scroll">
      <table>
        <thead><tr>
          {tb.header.map((h,ci)=><th key={ci}>
            <input value={h} placeholder={'Column '+(ci+1)}
              onChange={e=>setHeader(ci,e.target.value)}/>
            <button className="stbl-del" title="Delete column"
              onClick={()=>delCol(ci)}><Ic n="x" style={{width:11,height:11}}/></button>
          </th>)}
          <th className="stbl-addcol">
            <button title="Add column" onClick={addCol}><Ic n="plus" style={{width:13,height:13}}/></button>
          </th>
        </tr></thead>
        <tbody>
          {tb.rows.map((r,ri)=><tr key={ri}>
            {tb.header.map((_,ci)=><td key={ci}>
              <input value={r[ci]||''} onChange={e=>setCell(ri,ci,e.target.value)}/>
            </td>)}
            <td className="stbl-rowend">
              <button className="stbl-del" title="Delete row"
                onClick={()=>delRow(ri)}><Ic n="x" style={{width:11,height:11}}/></button>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <button className="stbl-addrow" onClick={addRow}>
      <Ic n="plus" style={{width:13,height:13}}/> New row
    </button>
  </div>;
}

/* =========================================================================
   PAGE EDITOR
   ========================================================================= */
/* ---- side table of contents (per-page, toggled from the ••• menu) ---- */
const stripHtml=h=>{const d=document.createElement('div');d.innerHTML=h||'';return (d.textContent||'').trim();};

function TocRail({headings}){
  const ref=React.useRef();
  const [active,setActive]=React.useState(null);
  /* highlight the section currently at the top of the viewport */
  React.useEffect(()=>{
    const scroller=ref.current?.closest('.scroll');
    if(!scroller||!headings.length){ setActive(null); return; }
    const onScroll=()=>{
      const top=scroller.getBoundingClientRect().top;
      let cur=headings[0].id;
      for(const h of headings){
        const el=scroller.querySelector(`[data-block-id="${CSS.escape(h.id)}"]`);
        if(el&&el.getBoundingClientRect().top<=top+130) cur=h.id;
      }
      setActive(cur);
    };
    onScroll();
    scroller.addEventListener('scroll',onScroll,{passive:true});
    return()=>scroller.removeEventListener('scroll',onScroll);
  },[headings]);
  const go=id=>{
    const scroller=ref.current?.closest('.scroll');
    const el=scroller&&scroller.querySelector(`[data-block-id="${CSS.escape(id)}"]`);
    if(!el) return;
    el.scrollIntoView({behavior:'smooth',block:'start'});
    el.classList.add('toc-flash');
    setTimeout(()=>el.classList.remove('toc-flash'),1300);
  };
  return <div className="toc-wrap" ref={ref}>
    <nav className="toc">
      <div className="toc-title">On this page</div>
      {headings.length===0
        ? <div className="toc-empty">Add headings to this page to build its table of contents.</div>
        : headings.map(h=><div key={h.id}
            className={cx('toc-item','toc-l'+h.level,active===h.id&&'on')}
            onClick={()=>go(h.id)} title={h.text}>{h.text||'Untitled'}</div>)}
    </nav>
  </div>;
}
function Editor({node,update,createChild,openPage,lookupNode,openRow,childPages=[],onUploadFile,uploads}){
  const [focus,setFocus]=useState(null);
  const [slash,setSlash]=useState(null); // {blockId,rect,el}
  const [drag,setDrag]=useState(null);   // {dragId,overId,pos}
  const [iconPick,setIconPick]=useState(false);
  const [coverPick,setCoverPick]=useState(false);
  const blocks=node.blocks||[];
  // warm the spell-check dictionary once the page is idle — it's a 350 KB
  // fetch that shouldn't compete with the initial load
  useEffect(()=>{ const t=setTimeout(()=>loadDict().catch(()=>{}),2500);
    return ()=>clearTimeout(t); },[]);

  /* ── live refs ──
     Block is memoized (React.memo), which only pays off when its handler
     props keep the same identity across renders. Every handler below is a
     stable useCallback that reads the CURRENT blocks/props through these
     refs instead of closing over them. */
  const liveBlocks=useRef(blocks); liveBlocks.current=blocks;
  const updateRef=useRef(); updateRef.current=update;
  const nodeIdRef=useRef(); nodeIdRef.current=node.id;
  const openPageRef=useRef(); openPageRef.current=openPage;
  const openRowRef=useRef(); openRowRef.current=openRow;
  const lookupNodeRef=useRef(); lookupNodeRef.current=lookupNode;
  const onUploadFileRef=useRef(); onUploadFileRef.current=onUploadFile;
  const dragRef=useRef(null); dragRef.current=drag;

  const setBlocks=useCallback(nb=>updateRef.current(nodeIdRef.current,{blocks:nb}),[]);
  const stOpenPage=useCallback((...a)=>openPageRef.current(...a),[]);
  const stOpenRow=useCallback((...a)=>openRowRef.current(...a),[]);
  const stLookupNode=useCallback(id=>lookupNodeRef.current(id),[]);
  const stUploadFile=useCallback((...a)=>onUploadFileRef.current?.(...a),[]);

  /* ── undo / redo (block-structural history) ── */
  const undoStack=useRef([]);
  const redoStack=useRef([]);
  const setBlocksH=useCallback(nb=>{  // history-aware setter for structural ops
    undoStack.current=[...undoStack.current.slice(-20), liveBlocks.current];
    redoStack.current=[];
    setBlocks(nb);
  },[setBlocks]);
  // a focused contentEditable keeps its own DOM (the sync effect skips it), so
  // blur it before restoring history — otherwise the focused block still shows
  // its pre-undo text while state reverts, duplicating content
  function blurActiveCe(){
    const ae=document.activeElement;
    if(ae && ae.isContentEditable && ae.blur) ae.blur();
  }
  function undo(){
    if(!undoStack.current.length) return;
    const prev=undoStack.current[undoStack.current.length-1];
    undoStack.current=undoStack.current.slice(0,-1);
    redoStack.current=[liveBlocks.current,...redoStack.current.slice(0,20)];
    blurActiveCe();
    setBlocks(prev);
  }
  function redo(){
    if(!redoStack.current.length) return;
    const next=redoStack.current[0];
    redoStack.current=redoStack.current.slice(1);
    undoStack.current=[...undoStack.current.slice(-100),liveBlocks.current];
    blurActiveCe();
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
  const updateBlock=useCallback(b=>setBlocks(liveBlocks.current.map(x=>x.id===b.id?b:x)),[setBlocks]);
  const idx=id=>liveBlocks.current.findIndex(b=>b.id===id);

  const insertAfter=useCallback((afterId,blk)=>{
    const bs=liveBlocks.current;
    const i=bs.findIndex(b=>b.id===afterId);
    const nb=[...bs]; nb.splice(i+1,0,blk); setBlocksH(nb);
    setFocus({id:blk.id,pos:'start'});
  },[setBlocksH]);
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
  // clicking the empty space below the content adds a fresh block to type in —
  // unless the last block is already an empty editable one, which we just focus
  function addOrFocusEnd(){
    const EDITABLE=['text','h1','h2','h3','bullet','number','todo','toggle','quote','callout'];
    const last=blocks[blocks.length-1];
    const isEmpty = last && EDITABLE.includes(last.type)
      && !(last.html||'').replace(/<br\s*\/?>/gi,'').replace(/&nbsp;/gi,' ').trim();
    if(isEmpty){ setFocus({id:last.id,pos:'end'}); return; }
    const b={id:nid(),type:'text',html:''};
    setBlocksH([...blocks,b]); setFocus({id:b.id,pos:'start'});
  }
  const onEnter=useCallback((b,el)=>{
    const bs=liveBlocks.current;
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
    const i=bs.findIndex(x=>x.id===b.id);
    const nb=bs.map(x=>x.id===b.id&&split?{...x,html:split.before}:x);
    nb.splice(i+1,0,blk);
    setBlocksH(nb);
    setFocus({id:blk.id,pos:'start'});
  },[setBlocksH,updateBlock]);
  const onBackspace=useCallback((b,el)=>{
    const bs=liveBlocks.current;
    const i=bs.findIndex(x=>x.id===b.id);
    // media/embed blocks should be deleted on backspace, not converted to text
    if(['image','file','bookmark','divider','subpage'].includes(b.type)){
      const nb=bs.filter(x=>x.id!==b.id);
      if(!nb.length) nb.push({id:nid(),type:'text',html:''});
      setBlocksH(nb);
      if(i>0) setFocus({id:bs[i-1].id,pos:'end'});
      return;
    }
    if(b.type==='code'){
      const nb=bs.filter(x=>x.id!==b.id); setBlocksH(nb);
      if(i>0)setFocus({id:bs[i-1].id,pos:'end'}); return;
    }
    // A styled block (heading, list, todo, quote, callout, toggle) only strips
    // back to plain text when there's nowhere to merge into — it's the first
    // block, or a toggle that still has children (merging would orphan them).
    // Otherwise it merges: its text moves up into the previous block.
    const styled=b.type!=='text';
    const toggleWithKids=b.type==='toggle' && (b.children||[]).length;
    if(styled && (i===0 || toggleWithKids)){
      updateBlock({...b,type:'text',checked:undefined,children:undefined,
        emoji:undefined,color:b.color}); setFocus({id:b.id,pos:'start'}); return;
    }
    if(i===0) return;
    const prev=bs[i-1];
    if(['divider','image','file','bookmark','subpage','database'].includes(prev.type)){
      // delete the media block above instead
      setBlocksH(bs.filter(x=>x.id!==prev.id)); return;
    }
    // caret lands at the junction — the end of prev's original text, before
    // the content that just merged in
    const jd=document.createElement('div'); jd.innerHTML=prev.html||'';
    const junction=jd.textContent.length;
    const merged={...prev,html:(prev.html||'')+(b.html||'')};
    const nb=bs.filter(x=>x.id!==b.id).map(x=>x.id===prev.id?merged:x);
    setBlocksH(nb); setFocus({id:prev.id,pos:junction});
  },[setBlocksH,updateBlock]);
  // Delete at the end of a block — pull the next block's content up into it
  const onDeleteForward=useCallback((b,el)=>{
    const bs=liveBlocks.current;
    const i=bs.findIndex(x=>x.id===b.id);
    const next=bs[i+1];
    if(!next) return;
    if(['divider','image','file','bookmark','subpage'].includes(next.type)){
      // delete the media block below instead of merging
      setBlocksH(bs.filter(x=>x.id!==next.id)); return;
    }
    if(next.type==='code'||next.type==='database') return;
    if(next.type==='toggle'&&(next.children||[]).length) return; // don't orphan its children
    // an empty current block just disappears; the next block keeps its type
    if(b.type==='text'&&!(b.html||'').replace(/<br\s*\/?>/gi,'').trim()){
      setBlocksH(bs.filter(x=>x.id!==b.id));
      setFocus({id:next.id,pos:'start'}); return;
    }
    // merge, keeping the caret at the junction (this block stays focused, so
    // update its DOM directly — the state sync skips focused blocks)
    const junction=el?caretTextOffset(el):null;
    const merged={...b,html:(b.html||'')+(next.html||'')};
    if(el){ el.innerHTML=merged.html; if(junction!=null) setCaretTextOffset(el,junction); }
    setBlocksH(bs.filter(x=>x.id!==next.id).map(x=>x.id===b.id?merged:x));
  },[setBlocksH]);
  const onArrow=useCallback((dir,b)=>{
    const bs=liveBlocks.current;
    const i=bs.findIndex(x=>x.id===b.id);
    const t=dir==='up'?i-1:i+1;
    if(t>=0&&t<bs.length) setFocus({id:bs[t].id,pos:'end'});
  },[]);
  const onIndent=useCallback((b,delta)=>{
    const cur=b.depth||0;
    updateBlock({...b,depth:Math.max(0,Math.min(cur+delta,5))});
  },[updateBlock]);
  const blockAction=useCallback((b,action,val)=>{
    const bs=liveBlocks.current;
    const i=bs.findIndex(x=>x.id===b.id);
    // when a multi-block selection is active and includes the clicked block,
    // the action applies to every selected block
    const sel=blockSelRef.current;
    const lo=sel?Math.min(sel.a,sel.b):-1, hi=sel?Math.max(sel.a,sel.b):-1;
    const multi=!!sel&&hi>lo&&i>=lo&&i<=hi;
    if(action==='delete'){
      const nb=multi?bs.filter((_,idx)=>idx<lo||idx>hi):bs.filter(x=>x.id!==b.id);
      if(!nb.length)nb.push({id:nid(),type:'text',html:''});
      if(multi)setBlockSel(null);
      setBlocksH(nb); return;
    }
    if(action==='duplicate'){
      if(multi){
        const copies=bs.slice(lo,hi+1).map(x=>({...clone(x),id:nid()}));
        const nb=[...bs]; nb.splice(hi+1,0,...copies); setBlocksH(nb); return;
      }
      const copy={...clone(b),id:nid()};
      const nb=[...bs]; nb.splice(i+1,0,copy); setBlocksH(nb); return;
    }
    if(action==='add-below'){
      insertAfter(b.id,{id:nid(),type:'text',html:''}); return;
    }
    if(action==='turn'){
      const conv=x=>{
        const p={...x,type:val};
        if(val==='todo')p.checked=p.checked||false;
        if(val==='toggle'){p.collapsed=false;p.children=p.children||[];}
        if(val==='callout')p.emoji=p.emoji||'💡';
        return p;
      };
      if(multi){ setBlocksH(bs.map((x,idx)=>idx>=lo&&idx<=hi?conv(x):x)); return; }
      updateBlock(conv(b)); return;
    }
  },[setBlocksH,insertAfter,updateBlock]);
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

    // formatting commands (bold / italic / colour / highlight) apply to the
    // block's text in place, keeping the block; they don't create a new block
    if(cmd.fmt){
      if(el){
        const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        el.innerHTML=esc(text);               // drop the "/query", keep the text
        el.focus();
        const sel=window.getSelection();
        const r=document.createRange(); r.selectNodeContents(el);
        sel.removeAllRanges(); sel.addRange(r);
        if(cmd.fmt==='bold') document.execCommand('bold');
        else if(cmd.fmt==='italic') document.execCommand('italic');
        else if(cmd.fmt.startsWith('tc-')) applySelSpan('tc-',cmd.fmt.slice(3));
        else if(cmd.fmt.startsWith('bg-')) applySelSpan('bg-',cmd.fmt.slice(3));
        updateBlock({...b,html:el.innerHTML});
        if(text) setCaretTextOffset(el,el.textContent.length);
      }
      return;
    }

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
        case 'table': return {id,type:'table',table:{
          header:['Column 1','Column 2','Column 3'],
          rows:[['','',''],['','','']]}};
        case 'page': {
          const child=createChild(node.id);
          return {id,type:'subpage',pageId:child};
        }
        case 'mdpage': {
          const child=createChild(node.id,'md');
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
    // block types that hold text — these convert the current block in place
    const inline=['text','h1','h2','h3','quote','todo','bullet','number','toggle','callout'];
    if(text.trim()===''){
      // empty block — replace it with the new block
      setBlocksH(blocks.map(x=>x.id===b.id?nb:x));
      if(inline.includes(nb.type)) setFocus({id:nb.id,pos:'start'});
    } else if(inline.includes(nb.type)){
      // block already has text — convert it in place, keeping the text
      const conv={...nb,id:b.id,html:text};
      setBlocksH(blocks.map(x=>x.id===b.id?conv:x));
      setFocus({id:b.id,pos:'end'});
    } else {
      // divider / image / file / bookmark / code / page / database can't hold
      // the text — keep it here and insert the new block right after
      const i=idx(b.id); const arr=[...blocks]; arr[i]={...b,html:text};
      arr.splice(i+1,0,nb); setBlocksH(arr);
      // b keeps focus (so the state sync skips it) — strip the "/query" from
      // its DOM directly and drop the caret at the end
      if(el){ el.innerHTML=text; setCaretTextOffset(el,el.textContent.length); }
    }
  }
  // track slash query via input on the editing element
  useEffect(()=>{
    if(!slash) return;
    const el=slash.el;
    const read=()=>{
      const t=el.textContent||'';
      const m=t.match(/\/([a-z0-9 ]*)$/i);
      // the "/" was deleted (backspace) → close the menu
      if(!m){ setSlash(null); setSlashQuery(''); return; }
      setSlashQuery(m[1]);
    };
    el.addEventListener('input',read);
    return ()=>el.removeEventListener('input',read);
  },[slash]);
  const [slashQuery,setSlashQuery]=useState('');
  const onSlash=useCallback(info=>{setSlash(info);setSlashQuery('');},[]);

  // drag & drop blocks
  const onDragStart=useCallback((e,b)=>{ setDrag({dragId:b.id}); e.dataTransfer.effectAllowed='move'; },[]);
  const onDragOver=useCallback((e,b)=>{
    const d=dragRef.current;
    if(!d) return; e.preventDefault();
    const r=e.currentTarget.getBoundingClientRect();
    const pos=e.clientY<r.top+r.height/2?'above':'below';
    if(d.overId!==b.id||d.pos!==pos) setDrag({...d,overId:b.id,pos});
  },[]);
  const onDrop=useCallback((e,b)=>{
    const d=dragRef.current;
    if(!d||d.dragId===b.id){ setDrag(null); return; }
    e.preventDefault();
    const bs=liveBlocks.current;
    const moving=bs.find(x=>x.id===d.dragId);
    let rest=bs.filter(x=>x.id!==d.dragId);
    let ti=rest.findIndex(x=>x.id===b.id);
    if(d.pos==='below')ti++;
    rest.splice(ti,0,moving);
    setBlocksH(rest); setDrag(null);
  },[setBlocksH]);
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

  const headings=useMemo(()=>blocks
    .filter(b=>b.type==='h1'||b.type==='h2'||b.type==='h3')
    .map(b=>({id:b.id,level:+b.type[1],text:stripHtml(b.html)})),[blocks]);
  const showToc=!!node.toc&&node.kind!=='database';

  // word, paragraph & block counts over the page (code excluded from words)
  const stats=useMemo(()=>{
    const TEXTY=['text','h1','h2','h3','bullet','number','todo','toggle','quote','callout'];
    let words=0,paras=0;
    blocks.forEach(b=>{
      if(!TEXTY.includes(b.type)) return;
      const t=stripHtml(b.html);
      if(!t) return;
      paras++;
      words+=t.split(/\s+/).filter(Boolean).length;
    });
    return {words,paras,blocks:blocks.length};
  },[blocks]);

  return <div className={cx('scroll','page-scroll',showToc&&'has-toc')} key={node.id}>
    {showToc&&<TocRail headings={headings}/>}
    {node.cover && <div className="cover" style={{background:node.cover}}>
      <div className="cover-tools">
        <button onClick={()=>setCoverPick(true)}>Change cover</button>
        <button onClick={()=>update(node.id,{cover:null})}>Remove</button>
      </div></div>}
    <div className="page-wrap">
      <div className="page-head">
        <div className={cx('page-head-row',!node.cover&&'nocover')}>
          <div className="icon-big"
            onClick={e=>setIconPick(e.currentTarget.getBoundingClientRect())}>
            {node.icon||<PageMark size={58}/>}</div>
          <textarea className="title-input" placeholder="Untitled" rows={1}
            value={node.title} onChange={e=>{update(node.id,{title:e.target.value});
              e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px';}}
            ref={el=>{if(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}}}
            onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();
              if(blocks[0])setFocus({id:blocks[0].id,pos:'start'}); }}}/>
        </div>
        {iconPick&&<EmojiPicker rect={iconPick} onClose={()=>setIconPick(false)}
          onPick={em=>{update(node.id,{icon:em||''});setIconPick(false);}}/>}
        <div className="page-meta-tools">
          {!node.icon&&<button className="meta-btn" onClick={e=>setIconPick(
            e.currentTarget.getBoundingClientRect())}>😀 Add icon</button>}
          {!node.cover&&<button className="meta-btn" onClick={()=>setCoverPick(true)}>
            <Ic n="image"/> Add cover</button>}
        </div>
      </div>

      {node.kind==='database'
        ? <div style={{paddingBottom:'30vh'}}><DatabaseView db={node.db}
            onChange={ndb=>update(node.id,{db:ndb})} openRow={openRow}/></div>
        : <div className={cx('editor',blockSel&&'bsel')} ref={editorDivRef}
        onMouseDown={onSelMouseDown}
        onClick={e=>{ if(e.target===e.currentTarget&&!blockSelRef.current) addOrFocusEnd(); }}>
        {blocks.map((b,i)=><Block key={b.id} block={b} index={i} depth={b.depth}
          listNumber={numbers[b.id]}
          selected={!!blockSel&&i>=Math.min(blockSel.a,blockSel.b)&&i<=Math.max(blockSel.a,blockSel.b)}
          onChange={updateBlock} onEnter={onEnter} onBackspace={onBackspace}
          onDeleteForward={onDeleteForward} onArrow={onArrow} onIndent={onIndent}
          focus={focus&&focus.id===b.id?focus:null} setFocus={setFocus}
          onSlash={onSlash}
          onBlockAction={blockAction} openPage={stOpenPage} openRow={stOpenRow}
          lookupNode={stLookupNode}
          onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
          isDragSource={!!drag&&drag.dragId===b.id}
          dropPos={drag&&drag.overId===b.id?drag.pos:null}
          onUploadFile={stUploadFile} uploads={uploads}/>)}
        <div className="blk editor-end-zone" onClick={addOrFocusEnd}>
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
                <span className="sp-emoji">{child.icon||<NodeMark node={child}/>}</span>
                <span className="sp-title">{child.title||'Untitled'}</span>
              </div>)}
          </div>;
        })()}
      </div>}
    </div>
    {node.kind!=='database'&&
      <div className="page-stats">
        {stats.words} word{stats.words===1?'':'s'} · {stats.paras} paragraph{stats.paras===1?'':'s'} · {stats.blocks} block{stats.blocks===1?'':'s'}
      </div>}

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

/* The five view renderers are top-level components (not defined inside
   DatabaseView) so React keeps them MOUNTED across database edits — otherwise
   their local state (calendar month, board drag) resets on every change. */

/* ============ TABLE ============ */
function TableV({db,rows,openRow,setCell,setProp,addRow,setPropMenu,setAddProp}){
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
function BoardV({db,view,rows,setCell,addRow,openRow}){
  const [bdrag,setBdrag]=useState(null);
  const gp=db.props.find(p=>p.id===view.groupProp)
    ||db.props.find(p=>p.type==='status'||p.type==='select');
  if(!gp) return <div className="empty-state">Add a Select or Status property to use Board view.</div>;
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
function GalleryV({db,rows,openRow,addRow}){
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
function ListV({db,rows,openRow,addRow}){
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
function CalendarV({db,rows,addRow,openRow}){
  const [cur,setCur]=useState(()=>{const d=new Date();return {y:d.getFullYear(),m:d.getMonth()};});
  const dateProp=db.props.find(p=>p.type==='date');
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
    {view.type==='table'&&<TableV db={db} rows={rows} openRow={openRow} setCell={setCell}
      setProp={setProp} addRow={addRow} setPropMenu={setPropMenu} setAddProp={setAddProp}/>}
    {view.type==='board'&&<BoardV db={db} view={view} rows={rows} setCell={setCell}
      addRow={addRow} openRow={openRow}/>}
    {view.type==='gallery'&&<GalleryV db={db} rows={rows} openRow={openRow} addRow={addRow}/>}
    {view.type==='list'&&<ListV db={db} rows={rows} openRow={openRow} addRow={addRow}/>}
    {view.type==='calendar'&&<CalendarV db={db} rows={rows} addRow={addRow} openRow={openRow}/>}
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
/* ---- File preview modal ---- */
const FP_MIN_W=280, FP_MAX_W=900, FP_DEFAULT_W=400;

/* Text-file preview: uploads are blob/object URLs (not base64 data URLs), so
   the body has to be fetched, not atob-decoded. */
function TextFilePreview({url,maxH}){
  const [txt,setTxt]=useState(null);
  useEffect(()=>{
    let alive=true;
    setTxt(null);
    fetch(url).then(r=>r.text()).then(t=>{ if(alive) setTxt(t); })
      .catch(()=>{ if(alive) setTxt('Could not load the file contents.'); });
    return ()=>{ alive=false; };
  },[url]);
  return <pre style={{
    width:'100%',maxHeight:maxH,overflow:'auto',
    background:'var(--bg-input)',borderRadius:6,padding:16,
    fontSize:13,fontFamily:'var(--mono)',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
    {txt==null?'Loading…':txt}
  </pre>;
}

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
    if(isText) return <TextFilePreview url={upload.dataUrl} maxH={maxH}/>;
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

/* ---- shared exports (consumed by workspace.jsx / markdown.jsx / sitepages.jsx) ---- */
export {
  nid, cx, clone, todayISO, fmtDate, fmtBytes,
  SEL_COLORS, TEXT_COLORS, COVERS, EMOJI, ALL_EMOJI, PAGE_EMOJI, CODE_LANGS,
  CMDS, SHORTCUTS, IS_MAC, fmtShortcut, ICON_MAP, APP_VERSION,
  DASH_ID, STORAGE_ID, TRASH_ID, ARCHIVE_ID, TEMPLATES_ID,
  Ic, MdMark, PageMark, NodeMark, FolderMark,
  newDB, mkRow, buildSeed,
  Popup, EmojiPicker, ConfirmHint, ImagePicker, FILE_ICON, FilePicker,
  FILE_TYPE_COLOR, fileAccentColor, FileBlockBody, ContextMenu,
  placeCaret, caretAtStart, caretAtEnd, textBeforeCaret, caretTextOffset,
  splitHtmlAtCaret, setCaretTextOffset, applySelSpan, linkifyHtml,
  Editable, SlashMenu, BlockMenu, FormatBar, CodeLangSelect,
  Block, SimpleTableBlock, stripHtml, TocRail, Editor,
  SelectCell, PropCell, PROP_TYPES, VIEW_ICONS,
  TableV, BoardV, GalleryV, ListV, CalendarV, DatabaseView, RowPeek,
  TextFilePreview, FilePreviewModal,
};
