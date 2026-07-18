/* =========================================================================
   homelayout.jsx — the HOME LAYOUT (Notion-style chrome)
   -------------------------------------------------------------------------
   The default app shell around the editors, extracted from workspace.jsx:
   workspace switcher + sidebar tree, the topbar (crumbs, inline rename,
   storage badge), and the built-in full pages — Storage, Dashboard, Trash,
   Archive and Templates. The default-exported HomeLayout renders it all
   from flat props handed down by Workspace() (state, handlers and
   renderPageEditor) — nothing here imports workspace.jsx back, so the
   layout stays cycle-free.
   ========================================================================= */
import React, { useState, useEffect, useRef } from 'react';
import { Eye, HardDrive, Plus, Home } from 'lucide-react';
import {
  cx, fmtBytes, fmtShortcut,
  DASH_ID, STORAGE_ID, TRASH_ID, ARCHIVE_ID, TEMPLATES_ID,
  Ic, NodeMark, FolderMark,
  Popup, FILE_ICON, fileAccentColor, ContextMenu, FilePreviewModal,
} from '../views/smart.jsx';
import { GDRIVE } from '../storage/cloudstorage.js';
import { isLocalFSSupported } from '../storage/localfs.js';
import { nodeDiskPath } from '../storage/markdown.js';
import SavePill from '../components/ui/savepill.jsx';

/* Shown when the browser lacks the File System Access API (Firefox/Zen/Safari). */
const LOCAL_FS_UNSUPPORTED_MSG =
  'Local folders require a Chromium browser (Chrome, Edge, or Brave). '+
  'In Firefox or Safari, use a Google Drive workspace instead.';

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

function TreeItem({node,childrenMap,depth,currentId,expanded,toggleExp,openPage,addChild,
  addFolder,trashNode,archiveNode,onDrop,setModal,favorites,toggleFav,duplicate,exportPage,renameNode}){
  const kids=childrenMap[node.id]||[];
  const hasKids=kids.length>0;
  const isFolder=node.kind==='folder';
  const isOpen=expanded[node.id];
  const [dragOver,setDragOver]=React.useState(false);
  const [ctxMenu,setCtxMenu]=React.useState(null);
  const isFav=(favorites||[]).includes(node.id);
  const isRoot=!node.parentId;

  function openCtx(e){
    e.preventDefault();e.stopPropagation();
    setCtxMenu({x:e.clientX,y:e.clientY});
  }

  const ctxItems=isFolder?[
    {header:'Folder'},
    {label:'Rename',action:()=>{
      const t=prompt('Rename',node.title||'');
      if(t!==null&&t.trim()!=='') renameNode&&renameNode(node.id,t.trim());
    }},
    {sep:true},
    {label:'Add page inside',action:()=>{toggleExp(node.id,true);addChild(node.id);}},
    {label:'Add Markdown page inside',action:()=>{toggleExp(node.id,true);addChild(node.id,'md');}},
    {label:'Add folder inside',action:()=>addFolder&&addFolder(node.id)},
    {sep:true},
    {label:'Archive',action:()=>archiveNode&&archiveNode(node.id)},
    {label:'Move to Trash',action:()=>trashNode&&trashNode(node.id),danger:true},
  ]:[
    {header: node.kind==='database'?'Database':node.kind==='md'?'Markdown page'
      :node.kind==='plugin'?'Plugin page':node.kind==='file'?'File':'Page'},
    {label:'Open',action:()=>openPage(node.id)},
    {label:'Rename',action:()=>{
      const t=prompt('Rename',node.title||'');
      if(t!==null&&t.trim()!=='') renameNode&&renameNode(node.id,t.trim());
    }},
    {sep:true},
    {label:'Add sub-page',action:()=>{toggleExp(node.id,true);addChild(node.id);}},
    {label:'Add Markdown sub-page',action:()=>{toggleExp(node.id,true);addChild(node.id,'md');}},
    {label:'Add folder inside',action:()=>addFolder&&addFolder(node.id)},
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
      onClick={()=>isFolder?toggleExp(node.id):openPage(node.id)}
      onContextMenu={openCtx}>
      {(hasKids||isFolder)
        ? <span className={cx('twist',isOpen&&'open')}
            onClick={e=>{e.stopPropagation();toggleExp(node.id);}}>
            <Ic n="chevron"/></span>
        : <span className="twist blank"/>}
      <span className="tree-emoji">{isFolder?<FolderMark open={!!isOpen}/>:node.icon||(node.kind==='database'?'🗄️':<NodeMark node={node}/>)}</span>
      <span className="tree-label">{node.title||'Untitled'}</span>
      <span className="tree-actions">
        <button title="More options" onClick={openCtx}>
          <Ic n="dots"/></button>
        <button title="Add page inside" onClick={e=>{e.stopPropagation();
          toggleExp(node.id,true);addChild(node.id);}}>
          <Ic n="plus"/></button>
      </span>
    </div>
    {isOpen&&isFolder&&!hasKids&&
      <div className="tree-empty" style={{paddingLeft:30+depth*16}}>Empty folder</div>}
    {isOpen&&hasKids&&kids.map(k=>
      <TreeItem key={k.id} node={k} childrenMap={childrenMap} depth={depth+1} currentId={currentId}
        expanded={expanded} toggleExp={toggleExp} openPage={openPage}
        addChild={addChild} addFolder={addFolder} trashNode={trashNode} archiveNode={archiveNode} onDrop={onDrop}
        setModal={setModal} favorites={favorites} toggleFav={toggleFav}
        duplicate={duplicate} exportPage={exportPage} renameNode={renameNode}/>)}
    {ctxMenu&&<ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={()=>setCtxMenu(null)}/>}
  </div>;
}

/* ---------------- Sidebar ---------------- */
function Sidebar({open,nodes,favorites,currentId,expanded,toggleExp,openPage,addChild,
  trashNode,archiveNode,onDrop,addTop,addFolder,setModal,workspaces,activeWorkspaceId,
  onSwitchWorkspace,onCreateWorkspace,onDeleteWorkspace,onReconnectLocal,
  toggleFav,duplicate,exportPage,renameNode,onGoHome,toggleSidebar,addNamedPage,
  layout,setLayout,devMode}){
  // one O(n) pass instead of an O(n) filter per tree item — the sidebar
  // re-renders on every store change, so this is hot
  const childrenMap=React.useMemo(()=>{
    const m={};
    Object.values(nodes).forEach(n=>{
      if(!n||n.trashed||n.archived) return;
      const k=n.parentId||'';
      (m[k]||(m[k]=[])).push(n);
    });
    Object.values(m).forEach(a=>a.sort((x,y)=>(x.sort||0)-(y.sort||0)));
    return m;
  },[nodes]);
  const roots=childrenMap['']||[];
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
      <button className="icon-btn sb-collapse" onClick={toggleSidebar}
        title={`Close sidebar (${fmtShortcut('Ctrl/⌘ + \\')})`}
        aria-label="Close sidebar">
        <Ic n="panel-left-close"/>
      </button>
      {wsPop&&<WorkspaceSwitcher rect={wsPop} workspaces={workspaces||[activeWs]}
        activeId={activeWorkspaceId} onSwitch={onSwitchWorkspace}
        onCreate={onCreateWorkspace} onDelete={onDeleteWorkspace}
        onReconnect={onReconnectLocal}
        onClose={()=>setWsPop(null)}/>}
    </div>
    {/* layout switch — Home (this Notion-style layout) ⟷ Code (VS Code-style).
        Developer mode only; workspace mode gets a plain Home row instead. */}
    {devMode&&<div className="layout-switch">
      <button className={cx('ls-btn',layout!=='code'&&'on')}
        title="Home layout — pages & databases"
        onClick={()=>{ setLayout&&setLayout('home'); openPage(DASH_ID); }}>
        <Ic n="home" style={{width:14,height:14}}/> Home
      </button>
      <button className={cx('ls-btn',layout==='code'&&'on')}
        title="Code layout — explorer, tabs & terminal"
        onClick={()=>setLayout&&setLayout('code')}>
        <span style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:12}}>&lt;/&gt;</span> Code
      </button>
    </div>}
    <div className="nav">
      {!devMode&&navRow('home','Home',()=>openPage(DASH_ID),null,currentId===DASH_ID)}
      <button className="new-page-btn" onClick={()=>addNamedPage(null)}
        title={`Create a new page — name it first: hello.py, notes.md, or a plain name for a smart page (${fmtShortcut('Alt + N')})`}>
        <span className="np-ic"><Ic n="plus"/></span>
        <span className="np-label">New page</span>
        <span className="np-kbd">{fmtShortcut('Alt + N')}</span>
      </button>
      {navRow('search','Search',()=>setModal({type:'search'}),fmtShortcut('Ctrl/⌘ + K'))}
    </div>
    <div className="nav-scroll">
      {favNodes.length>0&&<>
        <div className="sec-title"><span>Favorites</span></div>
        <div className="nav">
          {favNodes.map(n=>
            <div key={n.id} className={cx('tree-item',currentId===n.id&&'sel')}
              onClick={()=>openPage(n.id)}>
              <span className="twist"/>
              <span className="tree-emoji">{n.icon||<NodeMark node={n}/>}</span>
              <span className="tree-label">{n.title||'Untitled'}</span>
            </div>)}
        </div>
      </>}

      <div className="sec-title"><span>Pages</span>
        <button title="Add a folder" onClick={()=>addFolder(null)}><Ic n="folder-plus"/></button>
        <button title="Add a page — the name decides the kind: hello.py, notes.md, or a plain name"
          onClick={()=>addNamedPage(null)}><Ic n="plus"/></button>
      </div>
      <div className="nav">
        {roots.map(n=>
          <TreeItem key={n.id} node={n} childrenMap={childrenMap} depth={0} currentId={currentId}
            expanded={expanded} toggleExp={toggleExp} openPage={openPage}
            addChild={addChild} addFolder={addFolder} trashNode={trashNode} archiveNode={archiveNode} onDrop={onDrop}
            setModal={setModal} favorites={favorites} toggleFav={toggleFav}
            duplicate={duplicate} exportPage={exportPage} renameNode={renameNode}/>)}
        {roots.length===0&&<div className="tree-empty">No pages yet</div>}
      </div>

    </div>
    <div className="sidebar-foot">
      <div className="foot-icons">
        {[['template','Templates',()=>openPage(TEMPLATES_ID),currentId===TEMPLATES_ID],
          ['import','Import',()=>setModal({type:'import'}),false],
          ['database','Storage',()=>openPage(STORAGE_ID),currentId===STORAGE_ID],
          ['archive','Archive',()=>openPage(ARCHIVE_ID),currentId===ARCHIVE_ID],
          ['trash','Trash',()=>openPage(TRASH_ID),currentId===TRASH_ID]]
          .map(([ic,label,fn,active])=>
            <button key={label} className={cx(active&&'on')} title={label}
              aria-label={label} onClick={fn}>
              <Ic n={ic} style={{width:16,height:16}}/>
            </button>)}
      </div>
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
    <SavePill state={saveState} where={where}/>
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



/* The current page's FULL on-disk name for the topbar: "Title.md",
   "Title-(plugin-id).md", "name.py", "name-(handler).py". */
function crumbDiskName(n){
  if(!n) return 'Untitled';
  if(n.kind==='folder') return n.title||'Untitled';
  if(n.kind==='file'){
    const m=(n.title||'file.txt').match(/^(.*?)(\.[^.]+)?$/);
    return (m[1]||'file')+(n.plugin?'-('+n.plugin+')':'')+(m[2]||'');
  }
  if(n.kind==='plugin') return (n.title||'Untitled')+'-('+(n.plugin||'plugin')+').md';
  return (n.title||'Untitled')+'.md';
}
/* Fixed part shown after the rename input (files edit their whole name). */
const crumbSuffix=n=>!n?'':n.kind==='file'?''
  :n.kind==='plugin'?'-('+(n.plugin||'plugin')+').md'
  :n.kind==='folder'?'':'.md';

/* ---------------- Topbar ---------------- */
function Topbar({node,nodes,openPage,toggleSidebar,sidebarOpen,toggleFav,isFav,setModal,
  downloadPage,activeWorkspace,onGoHome,saveState,update,commitRename,
  pendingRename,pendingIsCreate,clearPendingRename}){
  const chain=[]; let c=node;
  while(c){ chain.unshift(c); c=c.parentId?nodes[c.parentId]:null; }
  const [dlMenu,setDlMenu]=useState(null);
  /* Inline rename: clicking the CURRENT page's name in the crumbs turns it
     into a text input with the name pre-selected. Enter/blur saves, Esc cancels.
     Newly created pages land here automatically (pendingRename); creation
     edits the FULL file name (extension decides the page kind). */
  const [renaming,setRenaming]=useState(false);
  const [fullEdit,setFullEdit]=useState(false);   // editing the whole name, no fixed suffix
  const [draft,setDraft]=useState('');
  const lastNodeId=useRef(null);
  const startRename=full=>{ if(!node) return;
    setDraft(node.title||''); setFullEdit(!!full); setRenaming(true); };
  useEffect(()=>{
    if(node&&pendingRename===node.id){
      startRename(node.kind==='file'||pendingIsCreate);
      clearPendingRename&&clearPendingRename();
    }
    // reset only when the PAGE changes — clearing pendingRename must not
    // cancel the rename it just started
    else if(lastNodeId.current!==(node?.id??null)) setRenaming(false);
    lastNodeId.current=node?.id??null;
  },[node?.id,pendingRename]);
  // On-disk location of the current page within the local workspace folder.
  const diskPath=activeWorkspace?.type==='local'&&node
    ? `${activeWorkspace.name}/${nodeDiskPath({nodes},node.id)}` : null;
  return <div className="topbar">
    {!sidebarOpen&&<div className="tb-btn" title="Open sidebar" onClick={toggleSidebar}>
      <Ic n="menu" style={{width:17,height:17}}/></div>}
    <div className="crumbs">
      {chain.map((n,i)=>{
        const last=i===chain.length-1;
        return <React.Fragment key={n.id}>
          {i>0&&<span className="crumb-sep">/</span>}
          <div className={cx('crumb',last&&renaming&&'renaming')}
            title={last?'Rename':undefined}
            onClick={()=>{ if(last){ if(!renaming) startRename(n.kind==='file'); } else openPage(n.id); }}>
            <span>{n.icon||<NodeMark node={n}/>}</span>
            {last&&renaming
              ? <>
                  <input className="crumb-rename" value={draft}
                    placeholder={fullEdit&&node.kind!=='file'?'name · hello.py · notes.md':'Untitled'}
                    ref={el=>{ if(el&&!el.dataset.init){ el.dataset.init='1';
                      // next tick, so it wins over the page editor's autoFocus
                      setTimeout(()=>{ el.focus(); el.select(); },0); } }}
                    style={{width:Math.min(Math.max(draft.length+2,fullEdit?24:8),42)+'ch'}}
                    onChange={e=>setDraft(e.target.value)}
                    onClick={e=>e.stopPropagation()}
                    onKeyDown={e=>{
                      if(e.key==='Enter'){ e.preventDefault(); e.currentTarget.blur(); }
                      else if(e.key==='Escape'){ e.currentTarget.dataset.esc='1'; e.currentTarget.blur(); }
                    }}
                    onBlur={e=>{
                      setRenaming(false);
                      if(e.currentTarget.dataset.esc) return;
                      const t=e.currentTarget.value.trim();
                      if(t!==(node.title||''))
                        (commitRename||((nn,v)=>update(nn.id,{title:v})))(node,t);
                    }}/>
                  {!fullEdit&&crumbSuffix(node)&&<span className="crumb-suffix">{crumbSuffix(node)}</span>}
                </>
              : <span>{last?crumbDiskName(n):(n.title||'Untitled')}</span>}
          </div>
        </React.Fragment>;
      })}
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
              <span className="bp-em">{n.kind==='folder'?<FolderMark/>:n.icon||(n.kind==='database'?'🗄️':<NodeMark node={n}/>)}</span>
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

export const TEMPLATES=[
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

/* ---------------- Dashboard ---------------- */
function Dashboard({nodes,favorites,openPage,addTop,setModal,activeWorkspace}){
  const allNodes=Object.values(nodes).filter(n=>!n.trashed&&!n.archived);
  const pageCount=allNodes.filter(n=>n.kind==='page').length;
  const dbCount=allNodes.filter(n=>n.kind==='database').length;
  const favNodes=favorites.map(id=>nodes[id]).filter(n=>n&&!n.trashed&&!n.archived);
  const privatePages=allNodes.filter(n=>n.parentId===null&&n.kind!=='folder')
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
          <div className="dpc-icon">{n.icon||<NodeMark node={n} size={22}/>}</div>
          <div className="dpc-title">{n.title||'Untitled'}</div>
          <div className="dpc-kind">{n.kind==='database'?'Database':n.kind==='md'?'Markdown':n.kind==='plugin'?'Plugin':n.kind==='file'?'File':'Page'}</div>
        </div>)}
      </div>
    </>}
    {privatePages.length>0&&<>
      <div className="dash-section-title">📂 My Workspace</div>
      <div className="dash-page-grid">
        {privatePages.map(n=><div key={n.id} className="dash-page-card" onClick={()=>openPage(n.id)}>
          <div className="dpc-cover" style={{background:n.cover||'var(--bg-2)'}}/>
          <div className="dpc-icon">{n.icon||<NodeMark node={n} size={22}/>}</div>
          <div className="dpc-title">{n.title||'Untitled'}</div>
          <div className="dpc-kind">{n.kind==='database'?'Database':n.kind==='md'?'Markdown':n.kind==='plugin'?'Plugin':n.kind==='file'?'File':'Page'}</div>
        </div>)}
      </div>
    </>}
  </div>;
}

/* ---------------- the assembled Home layout ---------------- */
/* Renders exactly the chrome workspace.jsx used to inline as AppLayout's
   children: the sidebar plus the main column (demo banner, built-in pages
   with their topbars, or the page topbar + editor). All state and handlers
   arrive as flat props from Workspace(). */
export default function HomeLayout({nodes,favorites,currentId,node,expanded,toggleExp,openPage,
  addChild,addTop,addFolder,addNamedPage,trashNode,archiveNode,moveNode,restore,deleteForever,
  unarchiveNode,duplicate,exportPage,renameNode,toggleFav,workspaces,activeWorkspaceId,
  activeWorkspace,switchWorkspace,deleteWorkspace,goHome,setModal,sidebarOpen,setSidebarOpen,
  layout,setLayout,devMode,pageBgUrl,saveState,scopedUploads,deleteUpload,uploadFile,
  downloadPage,updateNode,commitRename,pendingRename,pendingIsCreate,clearPendingRename,
  createFromTemplate,renderPageEditor}){
  const isDashboard=currentId===DASH_ID;
  const isStoragePage=currentId===STORAGE_ID;
  const isTrashPage=currentId===TRASH_ID;
  const isArchivePage=currentId===ARCHIVE_ID;
  const isTemplatesPage=currentId===TEMPLATES_ID;

  /* simple full-page topbar (Home / Storage / Trash / Archive) */
  const pageTopbar=(emoji,label)=>
    <div className="topbar">
      {!sidebarOpen&&<div className="tb-btn" title="Open sidebar" onClick={()=>setSidebarOpen(o=>!o)}>
        <Ic n="menu" style={{width:17,height:17}}/></div>}
      <div className="crumbs"><div className="crumb"><span>{emoji}</span><span>{label}</span></div></div>
      <StorageBadge ws={activeWorkspace} onCreateWorkspace={()=>setModal({type:'create-workspace'})} onGoHome={goHome} saveState={saveState}/>
      <div className="topbar-actions"/>
    </div>;

  return <>
    <Sidebar open={sidebarOpen} nodes={nodes} favorites={favorites} currentId={currentId}
      expanded={expanded} toggleExp={toggleExp} openPage={openPage}
      addChild={addChild} trashNode={trashNode} archiveNode={archiveNode} onDrop={moveNode}
      addTop={addTop} addFolder={addFolder} setModal={setModal}
      workspaces={workspaces} activeWorkspaceId={activeWorkspaceId}
      onSwitchWorkspace={switchWorkspace}
      onCreateWorkspace={()=>setModal({type:'create-workspace'})}
      onDeleteWorkspace={deleteWorkspace}
      onReconnectLocal={switchWorkspace}
      toggleFav={toggleFav} duplicate={duplicate} exportPage={exportPage}
      renameNode={renameNode} onGoHome={goHome}
      toggleSidebar={()=>setSidebarOpen(o=>!o)}
      addNamedPage={addNamedPage} layout={layout} setLayout={setLayout} devMode={devMode}/>

    <div className={cx('main',pageBgUrl&&'has-page-bg')}
      style={pageBgUrl?{'--page-bg':`url("${pageBgUrl}")`}:undefined}>
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
              addTop={()=>addNamedPage(null)} setModal={setModal} activeWorkspace={activeWorkspace}/>
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
              saveState={saveState} update={updateNode} commitRename={commitRename}
              pendingRename={pendingRename}
              pendingIsCreate={pendingIsCreate}
              clearPendingRename={clearPendingRename}/>
            {node&&renderPageEditor(node)}
          </>}
    </div>
  </>;
}
