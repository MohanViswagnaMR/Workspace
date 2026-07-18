/* =========================================================================
   WORKSPACE — the app shell (Markdown-on-disk edition)
   Composes the app around the editors: homepage, modals, workspace
   connection & persistence. The Home-layout chrome (sidebar, topbar,
   storage page) lives in ./layouts/homelayout.jsx; the SMART (block) page
   editor in ./views/smart.jsx; the SIMPLE markdown-page editor in
   ./views/markdown.jsx; serialization in ./markdown.js.
   ========================================================================= */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import {
  isLocalFSSupported,
  createLocalWorkspaceFolder,
  relinkAndRegisterDirectory,
  openExistingDirectory,
  loadLocalWorkspaceIndex,
  readWorkspaceTree,
  writeWorkspaceTreeNow,
  requestPermissionForHandleDetailed,
  getLocalWorkspaceRecord,
  removeLocalWorkspaceRecord,
  writeLocalUploadFile,
  deleteLocalUploadFile,
  writeLocalPlugin,
  deleteLocalPlugin,
} from './storage/localfs.js';

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
  authenticateGoogleDrive, getDriveToken,
  createDriveWorkspace, listDriveWorkspaces,
  writeGdriveWorkspaceTree, readGdriveWorkspaceTree,
  writeDriveUpload, deleteDriveWorkspace,
  readDriveWorkspaceMeta, renameDriveWorkspace, updateDriveWorkspaceDescription,
  writeDrivePlugin,
  deleteDrivePlugin,
} from './storage/cloudstorage.js';
import {
  readActivePointer, writeActivePointer, clearActivePointer,
  readTheme, writeTheme, getCookie, setCookie,
} from './storage/cookies.js';
import { markdownToNode, FILE_PAGE_EXT_RE } from './storage/markdown.js';

/* The block editor (smart pages), databases and the shared UI primitives
   live in ./smart.jsx; the plain-markdown page editor lives in ./markdown.jsx. */
import {
  nid, cx, clone,
  CMDS, SHORTCUTS, fmtShortcut, APP_VERSION,
  DASH_ID, TEMPLATES_ID,
  Ic, MdMark, NodeMark,
  newDB, buildSeed,
  Editor, RowPeek,
} from './views/smart.jsx';
import MarkdownEditor from './views/markdown.jsx';
import CustomSelect from './components/ui/select.jsx';
import { GitHubIcon } from './components/Navbar.jsx';
import { ACCENT_COLORS, FONT_OPTIONS, FONT_SIZES, fontStack, fontScale, ensureGoogleFont } from './services/theme.js';
import WelcomePage from './pages/welcome.jsx';
import HomeScreen, { ConnectPanel } from './pages/start.jsx';
import { useLayoutMode, AppLayout, BootScreen } from './layouts/layout.jsx';
import HomeLayout, { TEMPLATES } from './layouts/homelayout.jsx';
import { DEFAULT_HANDLER_EXTS, resolveHandler as resolveFileHandler, splitNameBinding } from './services/filehandler.js';


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
   PART 5 — Modals, App
   (the sidebar, topbar and built-in full pages live in ./layouts/homelayout.jsx)
   ========================================================================= */

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
  const results=React.useMemo(()=>{
    const all=Object.values(nodes).filter(n=>!n.trashed&&n.kind!=='folder');
    const term=q.trim().toLowerCase();
    if(!term) return all.slice(0,8).map(n=>({n,snippet:''}));
    const out=[];
    all.forEach(n=>{
      const title=(n.title||'').toLowerCase();
      let snippet='';
      if(title.includes(term)) snippet='';
      else if(n.kind==='md'){
        // simple markdown pages: search the raw text, snip around the hit
        const md=n.md||'';
        const at=md.toLowerCase().indexOf(term);
        if(at<0) return;
        snippet=md.slice(Math.max(0,at-40),at+term.length+60).replace(/\s+/g,' ').trim();
      }
      else{
        const blk=(n.blocks||[]).find(b=>strip(b.html).toLowerCase().includes(term));
        if(blk) snippet=strip(blk.html);
        else return;
      }
      out.push({n,snippet});
    });
    return out.slice(0,30);
  },[q,nodes]);
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
            <span className="sr-em">{r.n.icon||<NodeMark node={r.n}/>}</span>
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



/* ---------------- Settings modal ---------------- */
/* CustomSelect lives in ./components/ui/select.jsx; the accent/font
   constants live in ./theme.js (both imported above). */
/* ---- external template repositories ----
   A "template repository" is any public GitHub repo holding pages in this
   app's own .md format — in a templates/ folder or at the repo root. It's
   fetched client-side via the GitHub API (CORS-friendly, no auth needed). */
const parseRepoRef=s=>{
  s=(s||'').trim()
    .replace(/^https?:\/\//i,'').replace(/^www\./i,'').replace(/^github\.com\//i,'')
    .replace(/\.git$/i,'').replace(/\/+$/,'');
  const p=s.split('/');
  return p.length>=2&&p[0]&&p[1]?`${p[0]}/${p[1]}`:null;
};
async function fetchRepoTemplates(ref){
  const listDir=async dir=>{
    const r=await fetch(`https://api.github.com/repos/${ref}/contents/${dir}`);
    if(r.status===403) throw new Error('GitHub rate limit reached — try again in a little while.');
    if(!r.ok) return null;
    const items=await r.json();
    return Array.isArray(items)
      ?items.filter(i=>i.type==='file'&&/\.md$/i.test(i.name)&&!/^readme\.md$/i.test(i.name))
      :null;
  };
  let files=await listDir('templates');
  if(!files||!files.length){
    const root=await listDir('');
    if(root===null&&files===null) throw new Error('Repository not found — check the address (it must be public).');
    files=root||[];
  }
  files=files.slice(0,30);   // keep well inside API limits
  const texts=await Promise.all(files.map(async f=>{
    try{ const r=await fetch(f.download_url); return r.ok?await r.text():null; }
    catch{ return null; }
  }));
  const out=[];
  files.forEach((f,i)=>{
    if(texts[i]==null) return;
    try{
      const {node}=markdownToNode(texts[i]);
      out.push({name:f.name,title:node.title||f.name.replace(/\.md$/i,''),icon:node.icon||'',text:texts[i]});
    }catch{/* skip unparsable files */}
  });
  if(!out.length) throw new Error('No template .md files found in this repository (looked in templates/ and the root).');
  return out;
}

const SETTINGS_TABS=[
  {id:'general',   label:'General',   icon:'settings'},
  {id:'theme',     label:'Appearance', icon:'sun'},
  {id:'templates', label:'Templates', icon:'template'},
  {id:'plugins',   label:'Plugins',   icon:'plug'},
  {id:'handlers',  label:'File handlers', icon:'doc'},
  {id:'about',     label:'About',     icon:'info'},
];

/* Ready-made prompt users paste into an AI assistant to generate a plugin.
   Keep in sync with the real contract in plugins.jsx. */
const PLUGIN_AI_PROMPT=`Create a plugin for "Workspace" (a Notion-style app whose pages are plain files).
A plugin is one folder of files:

my-plugin/
├── manifest.json   (required)
├── page.jsx        (required entry — default-exports a React component)
├── lib.js          (optional extra modules, imported as './lib.js')
└── styles.css      (optional; plain CSS, auto-scoped to this plugin)

manifest.json:
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "type": "page",       ← plugin type: "page" (custom page / file handler) or "theme" (a CSS-only skin: no entry, add "styles": "theme.css"). Planned: layout, icons, syntax, components.
  "layout": "all",      ← which app layout it works in: "home", "code" or "all"
  "entry": "page.jsx",
  "icon": "🧩",
  "description": "One line describing it",
  "apiVersion": 1,
  "handles": [".csv"],   ← ONLY for file-handler plugins: the file types it opens. Omit for a custom page plugin.
  "permissions": []      ← ONLY what you actually use: "pages:read" (api.listPages), "pages:navigate" (api.openPage). The user sees and can revoke these.
}
The complete, up-to-date permission list lives in docs/PERMISSIONS.md in the
Workspace repository (github.com/MohanViswagnaMR/Workspace) and in the app's
Docs page under "Plugins & permissions" — check it before declaring anything.

The component contract — page.jsx must contain:
  export default function Page({ data, setData, node, api }) { ... }
- CUSTOM PAGE plugin (no "handles"): data is a JSON object stored in the page's file.
  Call setData(nextObject) with the FULL next state to save. Default everything —
  data starts as {} on a new page.
- FILE-HANDLER plugin (with "handles"): data is the file's raw text (a string).
  Call setData(newText) with the full new text. Whatever you save is written to the
  user's real file byte-for-byte — never corrupt the format.
- node = { id, title, ext }.  api = { listPages(), openPage(id), theme: 'light'|'dark' }.
  api.listPages/api.openPage THROW unless the matching permission is declared in
  manifest.json AND granted by the user — declare only what you call, and don't
  crash the page if an api call throws (wrap in try/catch).

Hard rules:
- Imports: ONLY 'react' and relative files inside the plugin folder ('./lib.js').
  No other npm packages, no CDN/network imports. JSX and React hooks are fine.
- styles.css: use the app's CSS variables for colors so both themes work:
  var(--text) var(--text-2) var(--text-3) var(--bg-card) var(--bg-input)
  var(--border) var(--accent) var(--mono).
- Never crash on empty/undefined data.

TASK: <describe the plugin you want — e.g. "open .csv files as a sortable, editable table">

Output every file in full, each in its own code block, starting with manifest.json.`;
function SettingsModal({theme,setTheme,accent,setAccent,font,setFont,description,setDescription,
  pageBgUrl,onUploadBg,onClearBg,nodeCount,activeWorkspace,onGoHome,onClose,onRestartTutorial,
  onOpenTemplates,customTemplates,onUseTemplate,onRemoveTemplate,
  templateRepo,setTemplateRepo,onImportTemplates,onAddRepoTemplate,
  fontSize,setFontSize,customFonts,onAddFont,onRemoveFont,
  plugins,fileHandlers,fileHandlersCode,setFileHandler,fileExts,onAddPlugin,onAddPluginFiles,onTogglePlugin,onUninstallPlugin,
  devMode,setDevMode}){
  const bgInput=React.useRef();
  const tplInput=React.useRef();
  const [tab,setTab]=React.useState('general');
  /* connected-repository state */
  const [repoInput,setRepoInput]=React.useState('');
  const [repoBusy,setRepoBusy]=React.useState(false);
  const [repoErr,setRepoErr]=React.useState('');
  const [repoTpls,setRepoTpls]=React.useState(null);   // null = not fetched yet
  /* Google Fonts import state */
  const [gfInput,setGfInput]=React.useState('');
  const [gfBusy,setGfBusy]=React.useState(false);
  const [gfErr,setGfErr]=React.useState('');
  /* plugin install state (GitHub URL / folder upload) */
  const [pgUrl,setPgUrl]=React.useState('');
  const [pgBusy,setPgBusy]=React.useState(false);
  const [pgErr,setPgErr]=React.useState('');
  const [pgOk,setPgOk]=React.useState('');
  const [pgWarn,setPgWarn]=React.useState('');
  const [aiCopied,setAiCopied]=React.useState(false);
  const plugDirInput=React.useRef();
  /* a Code-layout plugin installed while Developer mode is off would never
     render — warn right away instead of leaving a dead plugin */
  const warnIfCodeOnly=entry=>{
    if((entry.manifest.layout||'all')==='code'&&!devMode)
      setPgWarn(`“${entry.manifest.name}” is a Code-layout plugin, but Developer mode is off — its pages won't open until you enable Developer mode (Settings → General).`);
  };
  const installPlugin=async()=>{
    if(!pgUrl.trim()||pgBusy) return;
    setPgBusy(true); setPgErr(''); setPgOk(''); setPgWarn('');
    try{
      const entry=await onAddPlugin(pgUrl.trim());
      setPgOk(`Installed “${entry.manifest.name}” — find it under the 🧩 button in the sidebar.`);
      warnIfCodeOnly(entry);
      setPgUrl('');
    }catch(e){ setPgErr(e.message||String(e)); }
    finally{ setPgBusy(false); }
  };
  const uploadPluginFolder=async fileList=>{
    const arr=[...(fileList||[])];
    if(!arr.length||pgBusy) return;
    setPgBusy(true); setPgErr(''); setPgOk(''); setPgWarn('');
    try{
      const files={};
      for(const f of arr){
        const parts=(f.webkitRelativePath||f.name).split('/');
        if(parts.length!==2) continue;   // only files DIRECTLY inside the picked folder
        if(!/\.(json|jsx?|css|md)$/i.test(f.name)||f.size>512*1024) continue;
        files[f.name]=await f.text();
      }
      if(!files['manifest.json'])
        throw new Error('No manifest.json directly inside that folder — pick the plugin folder itself.');
      let man={};
      try{ man=JSON.parse(files['manifest.json']); }
      catch(_){ throw new Error('manifest.json is not valid JSON.'); }
      const folderName=(arr[0].webkitRelativePath||'').split('/')[0];
      const pid=String(man.id||folderName||'plugin')
        .replace(/[^\w.-]+/g,'-').replace(/^[-.]+|[-.]+$/g,'')||'plugin';
      const entry=await onAddPluginFiles({id:pid,files});
      setPgOk(`Installed “${entry.manifest.name}” — find it under the 🧩 button in the sidebar.`);
      warnIfCodeOnly(entry);
    }catch(e){ setPgErr(e.message||String(e)); }
    finally{ setPgBusy(false); if(plugDirInput.current) plugDirInput.current.value=''; }
  };
  const copyAiPrompt=()=>{
    navigator.clipboard?.writeText(PLUGIN_AI_PROMPT)
      .then(()=>{ setAiCopied(true); setTimeout(()=>setAiCopied(false),2000); });
  };
  /* custom file-type input (File handlers tab) */
  const [newExt,setNewExt]=React.useState('');
  const newExtClean=newExt.trim().replace(/^\./,'').toLowerCase();
  const newExtValid=/^[a-z0-9]{1,12}$/.test(newExtClean);
  const addCustomExt=()=>{
    if(!newExtValid) return;
    setFileHandler(newExtClean,'text');   // appears in the table; pick a plugin there
    setNewExt('');
  };
  /* per-plugin permission grants — key format shared with plugins.jsx */
  const [permTick,setPermTick]=React.useState(0);
  const grantsOf=p=>{
    try{
      const s=JSON.parse(localStorage.getItem('wsPluginPerms:'+p.id)||'null');
      if(s&&typeof s==='object'&&!Array.isArray(s)) return s;
    }catch(_){}
    return Object.fromEntries((p.manifest.permissions||[]).map(k=>[k,true]));
  };
  const togglePerm=(p,k)=>{
    const g=grantsOf(p);
    g[k]=g[k]===false;
    try{ localStorage.setItem('wsPluginPerms:'+p.id,JSON.stringify(g)); }catch(_){}
    setPermTick(t=>t+1);
  };
  const addFont=async()=>{
    if(!gfInput.trim()||gfBusy) return;
    setGfBusy(true); setGfErr('');
    try{ await onAddFont(gfInput); setGfInput(''); }
    catch(e){ setGfErr(e.message); }
    finally{ setGfBusy(false); }
  };
  const loadRepo=async ref=>{
    setRepoBusy(true); setRepoErr('');
    try{ setRepoTpls(await fetchRepoTemplates(ref)); return true; }
    catch(e){ setRepoErr(e.message); setRepoTpls([]); return false; }
    finally{ setRepoBusy(false); }
  };
  const connectRepo=async()=>{
    const ref=parseRepoRef(repoInput);
    if(!ref){ setRepoErr('Enter a public GitHub repository, e.g. github.com/user/templates'); return; }
    if(await loadRepo(ref)){ setTemplateRepo(ref); setRepoInput(''); }
  };
  const disconnectRepo=()=>{ setTemplateRepo(''); setRepoTpls(null); setRepoErr(''); };
  /* fetch the connected repo's list the first time the tab is opened */
  React.useEffect(()=>{
    if(tab==='templates'&&templateRepo&&repoTpls===null&&!repoBusy) loadRepo(templateRepo);
  },[tab]);  // eslint-disable-line react-hooks/exhaustive-deps
  const body=
    tab==='general'?<>
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
        <div className="sr-l"><b>App mode</b><small><b>Workspace</b> is the normal
          workspace. <b>Developer</b> unlocks the Code layout — the Home ⟷ Code
          switch at the top of the sidebar, with the file explorer, tabs and
          terminal — and everything the workspace already does keeps working.
          Code-layout plugins need it.</small></div>
        <CustomSelect value={devMode?'developer':'workspace'}
          onChange={v=>setDevMode(v==='developer')} options={[
            {value:'workspace', label:'Workspace'},
            {value:'developer', label:'Developer'},
          ]}/>
      </div>
      <div className="set-row">
        <div className="sr-l"><b>Tutorial</b><small>Replay the guided tour of the workspace.</small></div>
        <button className="btn ghost" onClick={onRestartTutorial}>Start tour</button>
      </div>
      <div className="set-row" style={{borderBottom:'none'}}>
        <div className="sr-l"><b>Workspace</b><small>Close this workspace and return to the homepage.</small></div>
        <button className="btn ghost" onClick={onGoHome}>Close workspace</button>
      </div>
    </>
    :tab==='theme'?<>
      <div className="set-row set-bg-row">
        <div className="sr-l">
          <b>Page background</b>
          <small>Upload a photo to show behind your pages. Stored in the workspace’s Upload/ folder.</small>
          <div className="set-bg-actions">
            <input ref={bgInput} type="file" accept="image/*" style={{display:'none'}}
              onChange={e=>{const f=e.target.files?.[0]; if(f) onUploadBg(f); e.target.value='';}}/>
            <button className="btn ghost" onClick={()=>bgInput.current?.click()}>
              {pageBgUrl?'Change…':'Upload…'}
            </button>
            {pageBgUrl&&<button className="btn ghost" onClick={onClearBg}>Remove</button>}
          </div>
        </div>
        <div className="set-bg-preview"
          style={pageBgUrl?{background:`center/cover no-repeat url("${pageBgUrl}")`}:undefined}>
          {pageBgUrl?'':'No background'}
        </div>
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
        <div className="sr-l"><b>Font</b><small>Typeface used for your page content.</small></div>
        <CustomSelect value={font||'default'} onChange={setFont}
          options={[...FONT_OPTIONS.map(f=>({value:f.id,label:f.label})),
            ...(customFonts||[]).map(n=>({value:'g:'+n,label:n}))]}/>
      </div>
      <div className="set-row">
        <div className="sr-l"><b>Font size</b><small>Size of your page content text.</small></div>
        <CustomSelect value={fontSize||'default'} onChange={setFontSize}
          options={FONT_SIZES.map(f=>({value:f.id,label:f.label}))}/>
      </div>
      <div className="set-row set-row-col" style={{borderBottom:'none'}}>
        <div className="sr-l"><b>Google Fonts</b><small>Import any font from{' '}
          <a href="https://fonts.google.com" target="_blank" rel="noopener noreferrer"
            className="home-demo-link">fonts.google.com</a> by name — it appears in the Font menu above. Needs a network connection to load.</small></div>
        <div className="set-repo-bar">
          <input className="fld" placeholder="e.g. Roboto, Lora, Open Sans"
            value={gfInput} onChange={e=>setGfInput(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter')addFont();}}/>
          <button className="btn primary" disabled={gfBusy} onClick={addFont}>
            {gfBusy?'Adding…':'Add font'}
          </button>
        </div>
        {gfErr&&<div className="set-repo-err">{gfErr}</div>}
        {(customFonts||[]).length>0&&<div className="gf-chips">
          {customFonts.map(n=><span key={n} className="gf-chip" style={{fontFamily:`'${n}',sans-serif`}}>
            {n}
            <button title={`Remove ${n}`} onClick={()=>onRemoveFont(n)}><Ic n="x" style={{width:11,height:11}}/></button>
          </span>)}
        </div>}
      </div>
    </>
    :tab==='templates'?<>
      <div className="set-sec-h set-sec-row"><span>Custom templates</span>
        <input ref={tplInput} type="file" accept=".md,.markdown,text/markdown" multiple
          style={{display:'none'}}
          onChange={e=>{onImportTemplates(e.target.files); e.target.value='';}}/>
        <button className="btn ghost sm" title="Import template pages from .md files"
          onClick={()=>tplInput.current?.click()}>
          <Ic n="import" style={{width:13,height:13}}/> Import…
        </button>
      </div>
      {(customTemplates||[]).length===0
        ? <div className="set-note">
            No custom templates yet. Open a page’s <b>•••</b> menu and choose{' '}
            <b>Save as template</b>, or <b>Import…</b> template <code>.md</code> files.
          </div>
        : (customTemplates||[]).map(n=>
            <div className="set-row" key={n.id}>
              <div className="sr-l set-tpl-name">
                <span className="set-tpl-ic">{n.icon||<NodeMark node={n}/>}</span>
                <b>{n.title||'Untitled'}</b>
              </div>
              <div style={{display:'flex',gap:8,flexShrink:0}}>
                <button className="btn primary sm" onClick={()=>onUseTemplate(n.id)}>Use</button>
                <button className="btn ghost sm" title="Remove from templates (the page itself is kept)"
                  onClick={()=>onRemoveTemplate(n.id)}>Remove</button>
              </div>
            </div>)}
      <div className="set-sec-h">Repository</div>
      <div className="set-row">
        <div className="sr-l"><b>Built-in templates</b><small>{TEMPLATES.length} ready-made layouts — meeting notes, trackers, wikis, planners and more.</small></div>
        <button className="btn primary" onClick={onOpenTemplates}>
          <Ic n="template" style={{width:15,height:15}}/> Open Templates
        </button>
      </div>
      {!templateRepo
        ? <div className="set-row set-row-col" style={{borderBottom:'none'}}>
            <div className="sr-l"><b>Connect to repository</b><small>Add templates shared by others: any public GitHub repository holding template <code>.md</code> pages (in a <code>templates/</code> folder or at its root).</small></div>
            <div className="set-repo-bar">
              <input className="fld" placeholder="github.com/user/template-repo"
                value={repoInput} onChange={e=>setRepoInput(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')connectRepo();}}/>
              <button className="btn primary" disabled={repoBusy} onClick={connectRepo}>
                {repoBusy?'Connecting…':'Connect'}
              </button>
            </div>
            {repoErr&&<div className="set-repo-err">{repoErr}</div>}
          </div>
        : <div className="set-row set-row-col" style={{borderBottom:'none'}}>
            <div className="set-repo-head">
              <div className="sr-l set-tpl-name">
                <span className="set-tpl-ic"><GitHubIcon/></span>
                <div><b>{templateRepo}</b>
                  <small style={{display:'block',color:'var(--text-3)'}}>
                    Connected repository{repoTpls?` · ${repoTpls.length} template${repoTpls.length===1?'':'s'}`:repoBusy?' · loading…':''}
                  </small></div>
              </div>
              <div style={{display:'flex',gap:8,flexShrink:0}}>
                <button className="btn ghost sm" disabled={repoBusy}
                  onClick={()=>loadRepo(templateRepo)}>Refresh</button>
                <button className="btn ghost sm" onClick={disconnectRepo}>Disconnect</button>
              </div>
            </div>
            {repoErr&&<div className="set-repo-err">{repoErr}</div>}
            <div className="set-repo-list">
              {(repoTpls||[]).map(t=>
                <div className="set-row" key={t.name}>
                  <div className="sr-l set-tpl-name">
                    <span className="set-tpl-ic">{t.icon||<NodeMark node={t}/>}</span>
                    <b>{t.title}</b>
                    <small style={{color:'var(--text-3)',flexShrink:0}}>{t.name}</small>
                  </div>
                  <button className="btn primary sm" style={{flexShrink:0}}
                    title="Add to your custom templates"
                    onClick={()=>onAddRepoTemplate(t.text)}>Add</button>
                </div>)}
            </div>
          </div>}
    </>
    :tab==='plugins'?(()=>{
      const plugs=plugins||[];
      return <>
        <div className="set-row set-row-col" style={{borderBottom:'1px solid var(--border)'}}>
          <div className="sr-l"><b>Add a plugin</b><small>Install from any public GitHub
            repository — link the repo itself or the plugin's folder
            (e.g. <code>…/tree/main/plugins/my-plugin</code>) — or upload a plugin folder
            from this computer. It's copied into this workspace's <code>plugins/</code> folder;
            you'll still be asked to enable it before it runs.</small></div>
          <div className="set-repo-bar">
            <input className="fld" placeholder="github.com/user/my-plugin"
              value={pgUrl} onChange={e=>setPgUrl(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')installPlugin();}}/>
            <button className="btn primary" disabled={pgBusy} onClick={installPlugin}>
              {pgBusy?'Installing…':'Add'}
            </button>
            <button className="btn ghost" disabled={pgBusy}
              onClick={()=>plugDirInput.current?.click()}>Upload folder</button>
            <input ref={plugDirInput} type="file" webkitdirectory="" style={{display:'none'}}
              onChange={e=>uploadPluginFolder(e.target.files)}/>
          </div>
          {pgErr&&<div className="set-repo-err">{pgErr}</div>}
          {pgOk&&<div className="set-repo-ok">{pgOk}</div>}
          {pgWarn&&<div className="set-repo-warn">⚠ {pgWarn}</div>}
        </div>
        <div className="set-row set-row-col" style={{borderBottom:'1px solid var(--border)'}}>
          <div className="set-repo-head">
            <div className="sr-l"><b>Create one with AI</b><small>Copy this prompt into an AI
              assistant, describe the page or file format you want at the bottom, and save
              the files it produces as a folder — then upload it above.</small></div>
            <button className="btn ghost sm" style={{flexShrink:0}} onClick={copyAiPrompt}>
              {aiCopied?'Copied!':'Copy prompt'}</button>
          </div>
          <pre className="set-ai-prompt">{PLUGIN_AI_PROMPT}</pre>
        </div>
        {plugs.length===0
          ? <div className="set-empty">
              <span className="set-empty-ic"><Ic n="plug" style={{width:28,height:28}}/></span>
              <b>No plugins in this workspace</b>
              <small>Install one from GitHub above, or create your own at
                <code> plugins/&lt;id&gt;/</code> inside the workspace folder —
                a <code>manifest.json</code> plus a <code>page.jsx</code> that default-exports a
                React component. Reload to pick it up.</small>
            </div>
          : plugs.map(p=>{
              const grants=grantsOf(p);
              const compat=p.compat||{ok:true,checks:[]};
              return <div className="set-row set-row-col" key={p.id+'·'+permTick}>
                <div className="set-repo-head">
                  <div className="sr-l"><b>{p.manifest.icon} {p.manifest.name}</b>
                    <small>{p.manifest.description||'Custom page plugin.'} · v{p.manifest.version}
                      {' · '}{p.manifest.type} plugin
                      {(p.manifest.handles||[]).length>0&&
                        <> · handles {p.manifest.handles.map(h=>'.'+h).join(', ')}</>}</small></div>
                  <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
                    {/* themes have no page to consent on — this switch IS their consent;
                        for regular plugins it enables (or disables) the current version */}
                    {compat.ok&&(p.manifest.type==='theme'||!p.builtin)&&
                      <label className="plug-enable"
                        title={p.manifest.type==='theme'?'Apply this theme workspace-wide'
                          :'Enable this plugin version now (otherwise you’re asked when one of its pages first opens)'}>
                        <input type="checkbox" checked={!!p.enabled}
                          onChange={e=>onTogglePlugin&&onTogglePlugin(p,e.target.checked)}/>
                        <span>{p.manifest.type==='theme'?'Applied':'Enabled'}</span>
                      </label>}
                    <span className={cx('plug-badge',compat.ok?'ok':'bad')}
                      title={compat.checks.map(c=>`${c.pass?'✓':'✕'} ${c.label}${c.detail?' — '+c.detail:''}`).join('\n')}>
                      {compat.ok?'✓ Compatible':'✕ Incompatible'}</span>
                    <span style={{color:'var(--text-3)',fontFamily:'var(--mono)',fontSize:11}}>
                      {p.builtin?'built-in':`plugins/${p.id}/`}</span>
                    {!p.builtin&&<button className="btn ghost sm"
                      title={`Delete plugins/${p.id}/ from this workspace`}
                      onClick={()=>onUninstallPlugin&&onUninstallPlugin(p)}>Uninstall</button>}
                  </div>
                </div>
                {!compat.ok&&<div className="set-repo-err">
                  {compat.checks.filter(c=>!c.pass).map(c=>c.label+(c.detail?' — '+c.detail:'')).join(' · ')}
                </div>}
                <div className="plug-perms">
                  {(p.permInfo||[]).length===0
                    ? <small className="plug-perm-none">No permissions requested — this plugin
                        can only read &amp; write its own pages.</small>
                    : p.permInfo.map(pi=><label key={pi.key} className="plug-perm-row" title={pi.desc}>
                        <input type="checkbox" disabled={!pi.known}
                          checked={pi.known&&grants[pi.key]!==false}
                          onChange={()=>togglePerm(p,pi.key)}/>
                        <span>{pi.label}{!pi.known&&' (unknown — cannot grant)'}</span>
                      </label>)}
                </div>
              </div>;
            })}
      </>;
    })()
    :tab==='handlers'?(()=>{
      // only PAGE plugins can open files — themes are CSS-only skins and
      // future types (layouts, icons…) aren't file handlers either
      const plugs=(plugins||[]).filter(p=>p.manifest.type==='page');
      // defaults always listed, plus anything claimed by a plugin, present in
      // the workspace, or already overridden in either layout's map
      const exts=[...new Set([
        ...DEFAULT_HANDLER_EXTS,
        ...plugs.flatMap(p=>p.manifest.handles||[]),
        ...(fileExts||[]),
        ...Object.keys(fileHandlers||{}),
        ...Object.keys(fileHandlersCode||{}),
      ])].sort();
      // Auto per layout: prefer a plugin scoped to that layout, then an 'all' one
      const autoFor=(ext,lay)=>
        plugs.find(p=>(p.manifest.handles||[]).includes(ext)&&p.manifest.layout===lay)
        ||plugs.find(p=>(p.manifest.handles||[]).includes(ext)&&(p.manifest.layout||'all')==='all');
      // a dropdown only offers plugins that DECLARE the extension in their
      // manifest "handles" (and fit the layout) — a page plugin with no
      // handles isn't a file handler (bind it per-file with "name-(id).ext")
      const plugsFor=(ext,lay)=>plugs.filter(p=>{
        const l=p.manifest.layout||'all';
        return (l==='all'||l===lay)&&(p.manifest.handles||[]).includes(ext);
      });
      return <>
        <p className="set-note">Which page opens each file type — <b>each layout has
          its own default</b> (e.g. the IDE-style Coder Page for <code>.py</code>,
          in both layouts). A file named
          <code> name-(plugin-id).ext</code> always uses that plugin; everything else
          follows this table. <b>Auto</b> means: the first plugin that declares the
          type in its manifest's <code>"handles"</code> (preferring one made for that
          layout), or the built-in text editor when none does.</p>
        <div className="set-row set-row-col" style={{borderBottom:'1px solid var(--border)'}}>
          <div className="sr-l"><b>Add a file type</b><small>Missing a format —
            say <code>.ipynb</code>? Add any text-file extension, then pick which page opens
            it below (it starts on the built-in text editor). Files of that type inside the
            workspace appear as pages the next time it loads.</small></div>
          <div className="set-repo-bar">
            <input className="fld" placeholder=".ipynb" value={newExt}
              onChange={e=>setNewExt(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')addCustomExt();}}/>
            <button className="btn primary" disabled={!newExtValid} onClick={addCustomExt}>
              Add type</button>
          </div>
          {newExt.trim()!==''&&!newExtValid&&
            <div className="set-repo-err">Letters and digits only, up to 12 characters — e.g. <code>ipynb</code>.</div>}
        </div>
        {exts.map(ext=>{
          const isCustom=!DEFAULT_HANDLER_EXTS.includes(ext)
            &&!plugs.some(p=>(p.manifest.handles||[]).includes(ext))
            &&!(fileExts||[]).includes(ext);
          const describe=(val,lay)=>{
            const auto=autoFor(ext,lay);
            return val==='auto'?(auto?`Auto — ${auto.manifest.name}`:'Auto — text editor')
              : val==='text'?'Built-in text editor'
              : (plugs.find(p=>p.id===val)?.manifest.name||`missing plugin "${val}"`);
          };
          const hVal=(fileHandlers||{})[ext]||'auto';
          const cVal=(fileHandlersCode||{})[ext]||'auto';
          return <div className="set-row" key={ext}>
            <div className="sr-l"><b style={{fontFamily:'var(--mono)'}}>.{ext}</b>
              <small>Home: {describe(hVal,'home')} · Code: {describe(cVal,'code')}
                {isCustom&&' · custom type (Auto in both removes it)'}</small></div>
            <div className="set-lay-selects">
              {[['home','Home',hVal],['code','Code',cVal]].map(([lay,label,val])=>{
                const auto=autoFor(ext,lay);
                return <label key={lay} className="set-lay-select">
                  <span>{label}</span>
                  <select className="set-select" value={val}
                    onChange={e=>setFileHandler(ext,e.target.value,lay)}>
                    <option value="auto">Auto{auto?` (${auto.manifest.name})`:' (text editor)'}</option>
                    <option value="text">Built-in text editor</option>
                    {plugsFor(ext,lay).map(p=><option key={p.id} value={p.id}>{p.manifest.name}</option>)}
                    {/* keep a stale/name-bound selection visible instead of a blank select */}
                    {val!=='auto'&&val!=='text'&&!plugsFor(ext,lay).some(p=>p.id===val)&&
                      <option value={val}>{plugs.find(p=>p.id===val)?.manifest.name||`missing plugin "${val}"`}</option>}
                  </select>
                </label>;
              })}
            </div>
          </div>;
        })}
      </>;
    })()
    :<>{/* about */}
      <div className="set-row">
        <div className="sr-l"><b>Version</b><small>The release of Workspace you’re running.</small></div>
        <span style={{color:'var(--text-3)'}}>{APP_VERSION?'v'+APP_VERSION:'—'}</span>
      </div>
      <div className="set-row">
        <div className="sr-l"><b>Release notes</b><small>What changed in each version.</small></div>
        <a className="btn ghost" href="https://github.com/MohanViswagnaMR/Workspace/tree/main/versions"
          target="_blank" rel="noopener noreferrer">View</a>
      </div>
      <div className="set-row" style={{borderBottom:'none'}}>
        <div className="sr-l"><b>Source code</b><small>Workspace is free and open source.</small></div>
        <a className="btn ghost" href="https://github.com/MohanViswagnaMR/Workspace"
          target="_blank" rel="noopener noreferrer">GitHub</a>
      </div>
    </>;
  return <div className="overlay" onClick={onClose}>
    <div className="modal wide set-modal" onClick={e=>e.stopPropagation()}>
      <div className="set-side">
        <div className="set-side-title">Settings</div>
        {SETTINGS_TABS.map(t=>
          <div key={t.id} className={cx('set-tab',tab===t.id&&'sel')} onClick={()=>setTab(t.id)}>
            <Ic n={t.icon} style={{width:15,height:15}}/>
            <span>{t.label}</span>
          </div>)}
      </div>
      <div className="set-main">
        <div className="modal-h"><h3>{SETTINGS_TABS.find(t=>t.id===tab)?.label}</h3>
          <div className="x" onClick={onClose}><Ic n="x"/></div></div>
        <div className="set-body">{body}</div>
      </div>
    </div>
  </div>;
}

/* ---------------- Page actions menu ---------------- */
function PageMenu({node,nodes,onClose,trashNode,duplicate,setModal,downloadPage,toggleTemplate,toggleToc}){
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
      {item('template',node.template?'Remove from templates':'Save as template',
        ()=>toggleTemplate(node.id))}
      {node.kind!=='database'&&node.kind!=='md'&&item('list',node.toc?'Hide table of contents':'Show table of contents',
        ()=>toggleToc(node.id))}
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
/* The Welcome landing lives in ./pages/welcome.jsx; the start page
   (HomeScreen) and ConnectPanel in ./pages/start.jsx (imported above). */

/* =========================================================================
   WORKSPACE  (the app surface)
   ========================================================================= */
/* Docs / About / Self-hosting are website pages most sessions never open —
   they load as a separate chunk on first visit (see sitepages.jsx). */
const PluginHost=React.lazy(()=>import('./plugins.jsx').then(m=>({default:m.PluginHost})));
const ThemeStyles=React.lazy(()=>import('./plugins.jsx').then(m=>({default:m.ThemeStyles})));
const DocsPage=React.lazy(()=>import('./pages/sitepages.jsx').then(m=>({default:m.DocsPage})));
const AboutPage=React.lazy(()=>import('./pages/sitepages.jsx').then(m=>({default:m.AboutPage})));
const SelfHostPage=React.lazy(()=>import('./pages/sitepages.jsx').then(m=>({default:m.SelfHostPage})));
const PluginStorePage=React.lazy(()=>import('./pages/sitepages.jsx').then(m=>({default:m.PluginStorePage})));
/* The Code layout chunk, BootScreen and the layout/devMode state live in ./layout.jsx. */

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
  const [homeAccent,setHomeAccent]=React.useState(()=>readTheme().accent);
  const [saveState,setSaveState]=React.useState('saved'); // 'saved' | 'saving' | 'error'
  const driveTimer=React.useRef(null);
  const savedRef=React.useRef({id:null});
  const tutorialShown=React.useRef(false);

  /* ---- workspace plugins (plugins/<id>/ folders + the built-in samples) ----
     Lives up here with the other hooks — everything below the early returns
     runs a variable number of times per mount. */
  const [plugins,setPlugins]=React.useState([]);
  const [pendingRename,setPendingRename]=React.useState(null); // node id → topbar auto-rename
  /* app layout ('home' | 'code') + Developer mode — persisted state owned by
     ./layout.jsx (two useState calls inside; keep this position in hook order). */
  const {layout,setLayout,devMode,setDevMode}=useLayoutMode();
  // id of a just-created page whose typed NAME decides its kind
  // (hello.py → file, notes.md → simple md, plain name → smart page)
  const creatingRef=React.useRef(null);
  React.useEffect(()=>{
    if(creatingRef.current&&creatingRef.current!==store?.currentId) creatingRef.current=null;
  },[store?.currentId]);
  const pluginWsId=store?.active?.id||null;
  React.useEffect(()=>{
    let alive=true;
    setPlugins([]);
    const aw=store?.active;
    if(!aw) return;
    import('./plugins.jsx')
      .then(m=>m.discoverPlugins(aw))
      .then(list=>{ if(alive) setPlugins(list); })
      .catch(()=>{});
    return ()=>{alive=false;};
  },[pluginWsId]);

  /* ---- homepage dark/light toggle (persists to cookie + <body>) ---- */
  const toggleHomeTheme=()=>{
    setHomeTheme(t=>{
      const next=t==='dark'?'light':'dark';
      writeTheme({theme:next,accent:readTheme().accent});
      document.body.classList.toggle('dark',next==='dark');
      return next;
    });
  };

  /* ---- homepage accent picker (persists to cookie + <body>) ---- */
  const changeHomeAccent=id=>{
    setHomeAccent(id);
    writeTheme({theme:readTheme().theme,accent:id});
    ACCENT_COLORS.forEach(c=>document.body.classList.remove(`t-${c.id}`));
    document.body.classList.add(`t-${id}`);
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
      fontSize:info.fontSize||'default', customFonts:info.customFonts||[],
      pageBg:info.pageBg||null, pageBgUrl:info.pageBgUrl||null,
      templateRepo:info.templateRepo||'',
      fileHandlers:info.fileHandlers||{},   // ext → plugin id | 'text' (Home layout)
      fileHandlersCode:info.fileHandlersCode||{},   // same map, Code layout
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
    document.body.classList.add(`t-${store.accent||'rose'}`);
    // expose the workspace font to popups portaled to <body> (block menus etc.)
    document.body.style.setProperty('--ws-font',fontStack(store.font));

    const active=store.active;
    // Demo workspaces live only in memory — nothing is ever written.
    if(active?.type==='demo'){ savedRef.current.id=active.id; setSaveState('demo'); return; }
    // Freshly opened / switched workspace → nothing to save yet; don't rewrite it.
    if(savedRef.current.id!==active.id){ savedRef.current.id=active.id; setSaveState('saved'); return; }

    const info={theme:store.theme,accent:store.accent,font:store.font,fontSize:store.fontSize,customFonts:store.customFonts,description:store.description,pageBg:store.pageBg,templateRepo:store.templateRepo,fileHandlers:store.fileHandlers,fileHandlersCode:store.fileHandlersCode};
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

  /* ---- make sure this workspace's imported Google Fonts are loaded ---- */
  React.useEffect(()=>{
    (store?.customFonts||[]).forEach(ensureGoogleFont);
  },[store?.customFonts]);

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
        const id=nid();
        setStore(s=>{
          if(!s) return s;
          const sort=Object.values(s.nodes).filter(n=>n.parentId===null&&!n.trashed).length;
          const nn={id,kind:'page',title:'',icon:'',cover:'',parentId:null,sort,blocks:[{id:nid(),type:'text',html:''}]};
          return {...s,nodes:{...s.nodes,[id]:nn},currentId:id};
        });
        // name-first: the topbar asks for the file name, which decides the kind
        creatingRef.current=id;
        setPendingRename(id);
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

  /* Wizard extras (ConnectPanel's create flow): append the chosen starter
     pages to a fresh seed, and pre-enable the chosen plugins (consent by
     content hash — the exact mechanism Settings → Plugins uses). */
  const seedWithPages=(seed,opts)=>{
    const pages=opts?.pages||[];
    if(!pages.length) return seed;
    const nodes={...seed.nodes};
    let sort=Object.values(nodes).filter(n=>n.parentId===null&&!n.trashed).length;
    let first=null;
    pages.forEach(p=>{
      const pid=nid(); first=first||pid;
      nodes[pid]={id:pid,kind:'page',title:p.title,icon:p.icon,cover:'',parentId:null,
        sort:sort++,blocks:(p.blocks||[]).map(b=>({id:nid(),...b}))};
    });
    return {...seed,nodes,currentId:seed.currentId||first};
  };
  /* Install the wizard's GitHub plugins into the new workspace's plugins/
     folder, then pre-enable everything chosen (hash consent). Demo keeps
     installs in memory only — nothing has a disk yet. */
  const applyChosenPlugins=async(opts,active)=>{
    const ids=opts?.plugins||[], install=opts?.install||[];
    if(!ids.length&&!install.length) return;
    try{
      const m=await import('./plugins.jsx');
      for(const raw of install){
        try{
          if(active?.type==='local') await writeLocalPlugin(active.id,raw.id,raw.files);
          else if(active?.type==='gdrive') await writeDrivePlugin(active.folderId,raw.id,raw.files);
        }catch(e){ console.warn('[wizard] plugin install failed:',raw.id,e?.message); }
      }
      const entries=[...await Promise.all(install.map(r=>m.buildPluginEntry(r))),
        ...await m.discoverPlugins(null)];
      entries.filter(p=>ids.includes(p.id)).forEach(p=>m.setPluginEnabled(p,true));
    }catch(_){}
  };

  const connectLocalNew=async(name,description,opts)=>{
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
      // New workspaces start empty (unless the wizard picked starter pages) —
      // keeping the demo carries its current content into the new workspace.
      const seed=seedWithPages(store&&store.active?.type==='demo'
        ? {nodes:store.nodes,favorites:store.favorites,currentId:store.currentId}
        : {nodes:{},favorites:[],currentId:null},opts);
      const info={...readTheme(),font:'default',pageBg:null,description:(description||'').trim()};
      data={nodes:seed.nodes,favorites:seed.favorites,currentId:seed.currentId,uploads:[],info};
      await writeWorkspaceTreeNow(id,{nodes:data.nodes,favorites:data.favorites,uploads:[],info});
      await applyChosenPlugins(opts,{id,type:'local'});
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

  const connectDriveNew=async(name,description,opts)=>{
    setHome(h=>({...h,busy:true,error:''}));
    try{
      const folderId=await createDriveWorkspace(name);
      // New workspaces start empty (unless the wizard picked starter pages) —
      // keeping the demo carries its current content into the new workspace.
      const seed=seedWithPages(store&&store.active?.type==='demo'
        ? {nodes:store.nodes,favorites:store.favorites,currentId:store.currentId}
        : {nodes:{},favorites:[],currentId:null},opts);
      const info={...readTheme(),font:'default',pageBg:null,description:(description||'').trim()};
      await writeGdriveWorkspaceTree(folderId,{nodes:seed.nodes,favorites:seed.favorites,uploads:[],info});
      await applyChosenPlugins(opts,{type:'gdrive',folderId});
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
    const info={theme:store.theme,accent:store.accent,font:store.font,fontSize:store.fontSize,customFonts:store.customFonts,description:store.description,pageBg:store.pageBg,templateRepo:store.templateRepo,fileHandlers:store.fileHandlers,fileHandlersCode:store.fileHandlersCode};
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

  if(booting) return <BootScreen/>;

  if(sitePage==='docs')
    return <React.Suspense fallback={<BootScreen/>}>
      <DocsPage onBack={()=>setSitePage(null)} theme={homeTheme} onToggleTheme={toggleHomeTheme}/>
    </React.Suspense>;
  if(sitePage==='about')
    return <React.Suspense fallback={<BootScreen/>}>
      <AboutPage onBack={()=>setSitePage(null)} theme={homeTheme} onToggleTheme={toggleHomeTheme}
        onDocs={()=>setSitePage('docs')} onSelfHost={()=>setSitePage('selfhost')}/>
    </React.Suspense>;
  if(sitePage==='selfhost')
    return <React.Suspense fallback={<BootScreen/>}>
      <SelfHostPage onBack={()=>setSitePage(null)} theme={homeTheme} onToggleTheme={toggleHomeTheme}/>
    </React.Suspense>;
  if(sitePage==='plugins')
    return <React.Suspense fallback={<BootScreen/>}>
      <PluginStorePage onBack={()=>setSitePage(null)} theme={homeTheme} onToggleTheme={toggleHomeTheme}/>
    </React.Suspense>;

  /* First visit (no workspace data in this browser) → the Welcome landing.
     Any browser memory — known workspaces, an active pointer, a live Drive
     session — or a "Get Started" click leads to the start page below. The
     start page's "Welcome" nav link shows the landing again on demand. */
  const hasMemory=(home.list||[]).length>0||!!home.pointer||!!home.driveConnected;
  const showWelcome=entry==='welcome'||(entry!=='start'&&!hasMemory);
  if(!store&&showWelcome)
    return <WelcomePage onGetStarted={()=>setEntry('start')} onDemo={openDemo}
      onDocs={()=>setSitePage('docs')} onAbout={()=>setSitePage('about')}
      onSelfHost={()=>setSitePage('selfhost')} onPlugins={()=>setSitePage('plugins')}
      theme={homeTheme} onToggleTheme={toggleHomeTheme}
      accent={homeAccent} onAccent={changeHomeAccent}/>;

  if(!store) return <>
    <HomeScreen pointer={home.pointer} list={home.list} busy={home.busy} error={home.error}
      driveConnected={home.driveConnected} onConnectDrive={connectDriveList}
      onDocs={()=>setSitePage('docs')} onPlugins={()=>setSitePage('plugins')}
      onWelcome={()=>setEntry('welcome')}
      theme={homeTheme} onToggleTheme={toggleHomeTheme}
      accent={homeAccent} onAccent={changeHomeAccent}
      devMode={devMode}
      onDevMode={on=>{setDevMode(on);if(on)setLayout('code');}}
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

  const {nodes,favorites,currentId,theme,accent='rose'}=store;
  const node=currentId===DASH_ID?null:nodes[currentId]||nodes[Object.keys(nodes)[0]]||null;
  const workspaces=buildWsList(store.localList,store.active);
  const activeWorkspaceId=store.active.id;
  const activeWorkspace=workspaces.find(w=>w.id===activeWorkspaceId)||store.active;
  const scopedUploads=store.uploads||[];

  /* ---- helpers ---- */
  const patch=p=>setStore(s=>({...s,...p}));
  const setNodes=fn=>setStore(s=>({...s,nodes:fn(s.nodes)}));
  const updateNode=(id,np)=>setNodes(n=>({...n,[id]:{...n[id],...np}}));

  const openPage=id=>{
    // folders have no content — clicking one just expands/collapses it
    if(nodes[id]?.kind==='folder'){setExpanded(e=>({...e,[id]:!e[id]}));return;}
    setStore(s=>({...s,currentId:id}));setPeek(null);setModal(null);
  };
  const toggleExp=(id,force)=>setExpanded(e=>({...e,[id]:force!==undefined?force:!e[id]}));
  // plain object (not a hook — this code sits below conditional returns)
  const pluginApi={
    listPages:()=>Object.values(nodes)
      .filter(n=>n&&!n.trashed&&!n.archived&&n.kind!=='folder')
      .map(n=>({id:n.id,title:n.title,kind:n.kind})),
    openPage,
    theme:store.theme,
  };
  /* Install a plugin from raw {id, files}: write it into the workspace's
     plugins/ (local/Drive; demo stays in-memory), then add it to the live
     plugin list. The consent gate still applies when a page first opens. */
  const installPluginRaw=async raw=>{
    const mod=await import('./plugins.jsx');
    const aw=store.active;
    if(aw?.type==='local') await writeLocalPlugin(aw.id,raw.id,raw.files);
    else if(aw?.type==='gdrive') await writeDrivePlugin(aw.folderId||aw.id,raw.id,raw.files);
    const entry=await mod.buildPluginEntry(raw);
    // prepend: workspace plugins stay ahead of the built-ins, so an installed
    // handler wins resolveHandler's first-match for a shared extension
    setPlugins(prev=>[entry,...prev.filter(p=>p.id!==entry.id)]);
    return entry;
  };
  /* Settings → Plugins "Applied/Approved" switch: store hash-consent, then
     refresh the entry's enabled snapshot so ThemeStyles & the UI re-render. */
  const togglePlugin=async(p,on)=>{
    const m=await import('./plugins.jsx');
    m.setPluginEnabled(p,on);
    setPlugins(list=>list.map(x=>x.id===p.id?{...x,enabled:on}:x));
  };
  /* Uninstall a workspace plugin: delete plugins/<id>/ from storage, forget
     its consent + permission grants, re-discover (which also restores a
     built-in the plugin was overriding). Built-ins can't be uninstalled.
     Returns true on success so callers can close detail views. */
  const uninstallPlugin=async p=>{
    if(p.builtin) return false;
    if(!confirm(`Uninstall “${p.manifest.name}”?\n\nThis deletes plugins/${p.id}/ from this workspace. Pages made with it stay on disk and show “plugin missing” until it's reinstalled.`)) return false;
    const aw=store.active;
    try{
      if(aw?.type==='local') await deleteLocalPlugin(aw.id,p.id);
      else if(aw?.type==='gdrive') await deleteDrivePlugin(aw.folderId||aw.id,p.id);
      // demo installs live only in memory — nothing on disk to delete
    }catch(e){
      if(e?.name!=='NotFoundError'){ alert('Could not delete the plugin folder: '+(e?.message||e)); return false; }
    }
    const m=await import('./plugins.jsx');
    m.clearPluginState(p.id);
    m.discoverPlugins(aw).then(setPlugins).catch(()=>{
      setPlugins(list=>list.filter(x=>x.id!==p.id));
    });
    return true;
  };
  const addPluginFromGithub=async url=>{
    const mod=await import('./plugins.jsx');
    return installPluginRaw(await mod.fetchGithubPlugin(url));
  };
  /* Which plugin opens a 'file' page — thin closure over the pure resolver in
     ./services/filehandler.js, fed the live plugin list + Settings overrides. */
  const resolveHandler=(n,lay=(devMode?layout:'home'))=>
    resolveFileHandler(n,lay,{plugins,
      fileHandlers:store.fileHandlers,fileHandlersCode:store.fileHandlersCode});

  const addNode=(parentId,extra={})=>{
    const id=nid();
    const sibs=Object.values(nodes).filter(n=>n.parentId===parentId&&!n.trashed);
    const nn={id,kind:'page',title:'',icon:'',cover:'',parentId,
      sort:sibs.length,blocks:[{id:nid(),type:'text',html:''}],...extra};
    setNodes(n=>({...n,[id]:nn}));
    return id;
  };
  // kind: 'page' (smart, block-based — default), 'md' (simple raw markdown),
  // or 'plugin:<id>' (custom page rendered by a workspace plugin)
  const kindExtra=kind=>{
    if(kind==='md') return {kind:'md',md:'',blocks:undefined};
    if(typeof kind==='string'&&kind.startsWith('plugin:')){
      const pid=kind.slice(7);
      const man=plugins.find(p=>p.id===pid)?.manifest;
      return {kind:'plugin',plugin:pid,data:'',blocks:undefined,
        icon:man?.icon||'🧩',title:man?.name||''};
    }
    return {};
  };
  const addTop=kind=>{const id=addNode(null,kindExtra(kind));openPage(id);};
  const addChild=(parentId,kind)=>{const id=addNode(parentId,kindExtra(kind));setExpanded(e=>({...e,[parentId]:true}));openPage(id);};
  const createChild=(parentId,kind)=>addNode(parentId,kindExtra(kind)); // for subpage blocks (no nav)
  const addFolder=parentId=>{
    const name=prompt('Folder name','New folder');
    if(name===null) return;
    addNode(parentId||null,{kind:'folder',title:name.trim()||'New folder',blocks:[]});
    if(parentId) setExpanded(e=>({...e,[parentId]:true}));
  };
  const registerExt=(name,ext)=>{
    if(!FILE_PAGE_EXT_RE.test(name)&&!(store.fileHandlers||{})[ext])
      patch({fileHandlers:{...(store.fileHandlers||{}),[ext]:'text'}});
  };
  /* Kind-aware rename used by the topbar crumb. File pages edit their WHOLE
     name (the extension picks the handler); unknown extensions are
     auto-registered as custom types so the file survives the next disk load.
     For a JUST-CREATED page (creatingRef) the typed name also decides the
     KIND: "hello.py" → file page, "notes.md" → simple md page,
     "Board-(kanban).md" → plugin page, a plain name → smart page. */
  const commitRename=(n,raw)=>{
    const creating=creatingRef.current===n.id;
    creatingRef.current=null;
    let name=(raw||'').trim().replace(/[\/\\:*?"<>|]/g,' ').trim();
    if(!name) return;
    if(creating&&n.kind==='page'){
      const m=name.match(/^(.*?)\.([^.]+)$/);
      if(m&&m[2].toLowerCase()==='md'){
        const bind=splitNameBinding(m[1]);   // plugin binding in the name
        if(bind) updateNode(n.id,{kind:'plugin',plugin:bind.plugin,data:'',blocks:undefined,
          title:bind.title.trim()||'Untitled',icon:plugins.find(p=>p.id===bind.plugin)?.manifest.icon||''});
        else updateNode(n.id,{kind:'md',md:'',blocks:undefined,title:m[1]||'Untitled'});
        return;
      }
      if(m){
        // "base-(plugin).ext" binds the handler in the FILE NAME — store it
        // split (title "base.ext" + plugin), exactly like the disk reader
        const ext=m[2].toLowerCase();
        const bind=splitNameBinding(m[1]);
        registerExt(name,ext);
        updateNode(n.id,{kind:'file',title:bind?bind.title.trim()+'.'+m[2]:name,
          ext,plugin:bind?bind.plugin:'',data:'',blocks:undefined});
        return;
      }
      updateNode(n.id,{title:name});
      return;
    }
    if(n.kind!=='file'){ updateNode(n.id,{title:name}); return; }
    if(!/\.[^.]+$/.test(name)) name+='.'+(n.ext||'txt');
    // the rename input shows the full disk name incl. any "-(plugin)" binding —
    // re-split it, so editing the binding rebinds (and removing it unbinds)
    const fm=name.match(/^(.*?)\.([^.]+)$/);
    const ext=fm[2].toLowerCase();
    const bind=splitNameBinding(fm[1]);
    registerExt(name,ext);
    updateNode(n.id,{title:bind?bind.title.trim()+'.'+fm[2]:name,ext,plugin:bind?bind.plugin:''});
  };
  /* "New page" — the page is created empty, and the topbar immediately asks
     for its NAME (full file name, extension included), which decides the kind. */
  const addNamedPage=parentId=>{
    const id=addNode(parentId||null,{});
    if(parentId) setExpanded(e=>({...e,[parentId]:true}));
    creatingRef.current=id;
    setPendingRename(id);
    openPage(id);
  };
  /* Non-interactive variant (code-layout terminal / explorer +): the name is
     already known — create and apply the same name-decides-kind logic. */
  const createNamed=(name,parentId)=>{
    const id=addNode(parentId||null,{});
    creatingRef.current=id;
    commitRename({id,kind:'page'},name);
    openPage(id);
    return id;
  };
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

  /* ---- custom templates: a `template` flag on the page, saved in frontmatter ---- */
  const toggleTemplate=id=>setNodes(n=>n[id]?{...n,[id]:{...n[id],template:!n[id].template}}:n);
  /* ---- side table of contents: a `toc` flag on the page, saved in frontmatter ---- */
  const toggleToc=id=>setNodes(n=>n[id]?{...n,[id]:{...n[id],toc:!n[id].toc}}:n);

  /* ---- imported Google Fonts: validated by name, listed in info.md ---- */
  const addCustomFont=async raw=>{
    // normalize to Google's Title Case family names ("open sans" → "Open Sans")
    const name=raw.trim().replace(/\s+/g,' ').split(' ')
      .map(w=>w[0]?w[0].toUpperCase()+w.slice(1):'').join(' ');
    if(!name) throw new Error('Enter a font name.');
    if((store.customFonts||[]).includes(name)) return;
    let r=null;
    try{ r=await fetch(`https://fonts.googleapis.com/css2?family=${name.replace(/ /g,'+')}&display=swap`); }
    catch{ throw new Error('Couldn’t reach Google Fonts — check your connection.'); }
    if(!r.ok) throw new Error(`“${name}” wasn’t found on Google Fonts — check the spelling.`);
    ensureGoogleFont(name);
    setStore(s=>({...s,customFonts:[...(s.customFonts||[]),name]}));
  };
  const removeCustomFont=name=>setStore(s=>({...s,
    customFonts:(s.customFonts||[]).filter(f=>f!==name),
    ...(s.font===`g:${name}`?{font:'default'}:{})}));

  const useCustomTemplate=id=>{
    const src=nodes[id];if(!src) return;
    const copy={...clone(src),id:nid(),template:undefined,parentId:null,
      blocks:(src.blocks||[]).map(b=>({...clone(b),id:nid()})),
      db:src.db?clone(src.db):undefined,
      sort:Object.values(nodes).filter(n=>n.parentId===null).length};
    setNodes(n=>({...n,[copy.id]:copy}));
    openPage(copy.id);   // openPage also closes the settings modal
  };
  /* Add pages (as Markdown text) to the workspace as custom templates — used by
     the settings Import… button and by "Add" from a connected repository. */
  const addTemplatesFromTexts=texts=>{
    setNodes(n=>{
      const out={...n};
      let sort=Object.values(n).filter(x=>x.parentId===null&&!x.trashed&&!x.archived).length;
      texts.forEach(t=>{
        try{
          const {node}=markdownToNode(t);
          const nn={...node,id:nid(),parentId:null,template:true,
            trashed:undefined,archived:undefined,sort:sort++};
          out[nn.id]=nn;
        }catch(e){ console.warn('[templates] import failed:',e.message); }
      });
      return out;
    });
  };
  const importTemplateFiles=async fileList=>{
    const files=Array.from(fileList||[]).filter(f=>/\.(md|markdown)$/i.test(f.name));
    if(!files.length) return;
    addTemplatesFromTexts(await Promise.all(files.map(f=>f.text())));
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
    setNodes(n=>({...n,[id]:{id,kind:'page',title:title||'Imported',icon:'',cover:'',
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
      // write the File object directly — no base64 round trip in memory
      localName=await writeLocalUploadFile(active.id,file.name,file).catch(()=>null);
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
      // demo workspaces have no disk to write to — show it for the session
      else if(store.active?.type==='demo') setStore(s=>({...s,pageBg:null,pageBgUrl:rec.url}));
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
  const renameNode=(id,title)=>updateNode(id,{...(title!==undefined?{title}:{})});

  /* One editor router for BOTH layouts (home + code). */
  const renderPageEditor=n=>
    n.kind==='md'
      ? <MarkdownEditor key={n.id} node={n} update={updateNode}/>
      : n.kind==='plugin'||n.kind==='file'
      ? <React.Suspense fallback={<div className="scroll page-scroll"/>}>
          <PluginHost key={n.id} node={n}
            plugin={n.kind==='plugin'
              ? plugins.find(p=>p.id===n.plugin)
              : resolveHandler(n)}
            update={updateNode} api={pluginApi} layout={layout} devMode={devMode}/>
        </React.Suspense>
      : <Editor key={n.id} node={n} update={updateNode}
          createChild={createChild} openPage={openPage}
          lookupNode={lookupNode} openRow={editorOpenRow}
          onUploadFile={uploadFile} uploads={scopedUploads}
          childPages={Object.values(nodes).filter(x=>x.parentId===n.id&&!x.trashed&&!x.archived&&x.kind!=='folder')
            .sort((a,b)=>(a.sort||0)-(b.sort||0))}/>;

  return <div className={cx('app',theme==='dark'&&'dark',`t-${accent}`)}
    style={{'--ws-font':fontStack(store.font),'--ws-fs':fontScale(store.fontSize)}}>
    {/* enabled theme plugins restyle the whole app; the chunk only loads if one exists */}
    {plugins.some(p=>p.manifest.type==='theme'&&p.enabled)&&
      <React.Suspense fallback={null}><ThemeStyles plugins={plugins}/></React.Suspense>}
    <AppLayout layout={layout} devMode={devMode}
      codeProps={{nodes,currentId,openPage,
        renderEditor:renderPageEditor,createNamed,addFolder,
        trashNode,restore,deleteForever,updateNode,wsName:activeWorkspace?.name,
        plugins,saveState,
        onTogglePlugin:togglePlugin,onInstallPlugin:installPluginRaw,
        onUninstallPlugin:uninstallPlugin,
        setLayout,setModal,dashId:DASH_ID,goHome}}>
    <HomeLayout nodes={nodes} favorites={favorites} currentId={currentId} node={node}
      expanded={expanded} toggleExp={toggleExp} openPage={openPage}
      addChild={addChild} addTop={addTop} addFolder={addFolder} addNamedPage={addNamedPage}
      trashNode={trashNode} archiveNode={archiveNode} moveNode={moveNode}
      restore={restore} deleteForever={deleteForever} unarchiveNode={unarchiveNode}
      duplicate={duplicate} exportPage={exportPage} renameNode={renameNode} toggleFav={toggleFav}
      workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} activeWorkspace={activeWorkspace}
      switchWorkspace={switchWorkspace} deleteWorkspace={deleteWorkspace} goHome={goHome}
      setModal={setModal} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
      layout={layout} setLayout={setLayout} devMode={devMode}
      pageBgUrl={store.pageBgUrl} saveState={saveState}
      scopedUploads={scopedUploads} deleteUpload={deleteUpload} uploadFile={uploadFile}
      downloadPage={downloadPage} updateNode={updateNode} commitRename={commitRename}
      pendingRename={pendingRename}
      pendingIsCreate={pendingRename!=null&&creatingRef.current===pendingRename}
      clearPendingRename={()=>setPendingRename(null)}
      createFromTemplate={createFromTemplate} renderPageEditor={renderPageEditor}/>
    </AppLayout>

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
        fontSize={store.fontSize} setFontSize={v=>patch({fontSize:v})}
        customFonts={store.customFonts||[]} onAddFont={addCustomFont} onRemoveFont={removeCustomFont}
        description={store.description} setDescription={d=>patch({description:d})}
        pageBgUrl={store.pageBgUrl} onUploadBg={setPageBackground} onClearBg={clearPageBackground}
        nodeCount={Object.values(nodes).filter(n=>!n.trashed&&!n.archived).length}
        activeWorkspace={activeWorkspace} onGoHome={goHome}
        onClose={()=>setModal(null)}
        onOpenTemplates={()=>{setModal(null);openPage(TEMPLATES_ID);}}
        customTemplates={Object.values(nodes).filter(n=>n.template&&!n.trashed&&!n.archived)
          .sort((a,b)=>(a.title||'').localeCompare(b.title||''))}
        onUseTemplate={useCustomTemplate} onRemoveTemplate={toggleTemplate}
        templateRepo={store.templateRepo||''} setTemplateRepo={v=>patch({templateRepo:v})}
        onImportTemplates={importTemplateFiles}
        onAddRepoTemplate={t=>addTemplatesFromTexts([t])}
        onRestartTutorial={()=>{setModal(null);setShowTutorial(true);}}
        plugins={plugins} onTogglePlugin={togglePlugin} onUninstallPlugin={uninstallPlugin}
        fileHandlers={store.fileHandlers||{}}
        fileHandlersCode={store.fileHandlersCode||{}}
        setFileHandler={(ext,val,lay)=>{
          const key=lay==='code'?'fileHandlersCode':'fileHandlers';
          const fh={...(store[key]||{})};
          if(val==='auto') delete fh[ext]; else fh[ext]=val;
          patch({[key]:fh});
        }}
        fileExts={[...new Set(Object.values(nodes)
          .filter(n=>n&&n.kind==='file'&&!n.trashed&&!n.archived&&n.ext)
          .map(n=>n.ext))]}
        onAddPlugin={addPluginFromGithub}
        onAddPluginFiles={installPluginRaw}
        devMode={devMode} setDevMode={setDevMode}/>}
    {modal&&modal.type==='page-menu'&&node&&
      <PageMenu node={node} nodes={nodes} onClose={()=>setModal(null)} trashNode={trashNode}
        duplicate={duplicate} setModal={setModal} downloadPage={downloadPage}
        toggleTemplate={toggleTemplate} toggleToc={toggleToc}/>}
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
  // simple markdown pages export verbatim (plus the title heading)
  if(node.kind==='md')
    return (node.icon?node.icon+' ':'')+'# '+(node.title||'Untitled')+'\n\n'+(node.md||'');
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
  if(node.kind==='md') return out+(node.md||'')+'\n';
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
  // simple markdown pages have no blocks — convert the raw markdown just for
  // this HTML export (the stored .md file itself is never touched)
  const blocks=node.kind==='md'?markdownToBlocks(node.md||''):(node.blocks||[]);
  blocks.forEach(b=>{
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
/* Named exports are shared with the lazy-loaded site pages (sitepages.jsx). */
export { CMDS, SHORTCUTS, fmtShortcut, cx, Ic, APP_VERSION, GitHubIcon };
export default Workspace;
