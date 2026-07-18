/* =========================================================================
   RightClickMenu.jsx — the block context menu (drag-handle ⋮⋮ / right-click)
   -------------------------------------------------------------------------
   BlockMenu is the per-block menu: the selection FormatBar on top (for
   text-carrying blocks), spelling suggestions, "Turn into" with its
   side-submenu, duplicate and delete. Both panels portal to <body> and
   clamp themselves inside the viewport. FormatBar applies inline commands
   through the editor-provided `onCmd(cmd, value?)`.
   ========================================================================= */
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cx, SEL_COLORS, TEXT_COLORS } from '../lib/utils.js';
import { Ic } from './ui/icons.jsx';

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

export { BlockMenu, FormatBar };
