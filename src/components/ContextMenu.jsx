/* =========================================================================
   ContextMenu.jsx — generic right-click popup positioned at the cursor
   -------------------------------------------------------------------------
   The primitive menu used by databases and blocks: takes a flat list of
   {label, action, kbd, danger} items (plus {sep} / {header} rows), clamps
   itself inside the viewport at the click point, and closes on
   outside-click / Escape.
   ========================================================================= */
import React, { useEffect, useRef } from 'react';
import { cx } from '../lib/utils.js';

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

export { ContextMenu };
