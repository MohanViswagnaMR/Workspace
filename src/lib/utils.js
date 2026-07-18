/* =========================================================================
   utils.js — tiny pure helpers + shared constants (lowest layer)
   -------------------------------------------------------------------------
   No components, no DOM rendering: id generation, class joining, deep
   clone, date/byte formatting, platform detection, the app version Vite
   injects, and the colour-name palettes (SEL_COLORS / TEXT_COLORS) the
   format menus are built from. Dependencies flow one way:
   utils → ui → components → views — this file imports nothing from src/.
   ========================================================================= */
const nid = () => 'n'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);
const cx = (...a)=>a.filter(Boolean).join(' ');
const clone = o => typeof structuredClone==='function' ? structuredClone(o) : JSON.parse(JSON.stringify(o));
const todayISO = () => new Date().toISOString().slice(0,10);
const fmtDate = iso => { if(!iso) return ''; const d=new Date(iso+'T00:00');
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); };
const fmtBytes = b => { if(!b) return '0 B'; const u=['B','KB','MB','GB']; let i=0;
  while(b>=1024&&i<u.length-1){b/=1024;i++;} return b.toFixed(i>0?1:0)+' '+u[i]; };

/* Injected by Vite from package.json (vite.config.js `define`). */
const APP_VERSION=typeof __APP_VERSION__!=='undefined'?__APP_VERSION__:'';

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

/* Colour-name palettes shared by the slash menu, format bar and databases. */
const SEL_COLORS = ['default','gray','brown','orange','yellow','green','blue','purple','pink','red'];
const TEXT_COLORS = ['default','gray','brown','orange','yellow','green','blue','purple','pink','red'];

export { nid, cx, clone, todayISO, fmtDate, fmtBytes, APP_VERSION,
  IS_MAC, fmtShortcut, SEL_COLORS, TEXT_COLORS };
