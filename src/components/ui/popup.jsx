/* =========================================================================
   popup.jsx — anchored popup portal + tiny confirm hint
   -------------------------------------------------------------------------
   Popup renders its children in a body portal positioned against an anchor
   rect (below by default, or to the right with placement='right'), closing
   on outside-click / Escape. Every menu-style popover in the app (slash
   menu, pickers, database menus) is built on it. ConfirmHint is the small
   inline "are you sure" hint line.
   ========================================================================= */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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

function ConfirmHint({msg}){ return <div className="hint">{msg}</div>; }

export { Popup, ConfirmHint };
