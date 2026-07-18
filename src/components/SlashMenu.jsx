/* =========================================================================
   SlashMenu.jsx — the "/" command menu + its command catalog (CMDS)
   -------------------------------------------------------------------------
   Typing "/" in the block editor opens this grouped, keyboard-navigable
   list of every insertable block and inline format. CMDS is the single
   registry the menu filters over; the editor's applySlash handler receives
   the picked entry. Built on the shared Popup primitive.
   ========================================================================= */
import React, { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { cx, SEL_COLORS, TEXT_COLORS } from '../lib/utils.js';
import { Popup } from './ui/popup.jsx';

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

export { CMDS, SlashMenu };
