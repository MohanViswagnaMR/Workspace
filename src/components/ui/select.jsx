/* =========================================================================
   select.jsx — the custom select dropdown
   -------------------------------------------------------------------------
   A styled replacement for <select> used by the Settings modal and the
   homepage footer (accent picker). Options are {value, label, dot?} where
   dot is an optional color swatch shown before the label.
   ========================================================================= */
import React from 'react';
import { Ic } from '../../views/smart.jsx';

export default function CustomSelect({value,onChange,options}){
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
