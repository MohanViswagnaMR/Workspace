/* =========================================================================
   theme.js — workspace appearance constants & font helpers
   -------------------------------------------------------------------------
   The accent palette, font choices and font-size scale shared by the
   homepage, the Settings modal and the app shell, plus the Google-Fonts
   stylesheet injector. Pure module — no React.
   ========================================================================= */

export const ACCENT_COLORS=[
  {id:'indigo', label:'Indigo',  light:'#6366f1', dark:'#818cf8'},
  {id:'blue',   label:'Blue',    light:'#3b82f6', dark:'#60a5fa'},
  {id:'ocean',  label:'Ocean',   light:'#0ea5e9', dark:'#38bdf8'},
  {id:'forest', label:'Forest',  light:'#10b981', dark:'#34d399'},
  {id:'rose',   label:'Rose',    light:'#f43f5e', dark:'#fb7185'},
  {id:'sunset', label:'Sunset',  light:'#f59e0b', dark:'#fbbf24'},
  {id:'violet', label:'Violet',  light:'#8b5cf6', dark:'#c084fc'},
];

/* Workspace font choices (applied to page content, saved in info.md).
   Imported Google Fonts are stored as `g:<Family>` values on top of these. */
export const FONT_OPTIONS=[
  {id:'default', label:'Default (Sans)', stack:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"},
  {id:'serif',   label:'Serif',          stack:"Georgia,'Iowan Old Style','Times New Roman',serif"},
  {id:'mono',    label:'Monospace',      stack:"'JetBrains Mono','SFMono-Regular',Menlo,Consolas,monospace"},
];
export const fontStack=id=>{
  if(id&&id.startsWith('g:')) return `'${id.slice(2)}','Inter',-apple-system,sans-serif`;
  return (FONT_OPTIONS.find(f=>f.id===id)||FONT_OPTIONS[0]).stack;
};

/* Page-content font size (a scale factor over the default sizes). */
export const FONT_SIZES=[
  {id:'small',   label:'Small',       scale:.9},
  {id:'default', label:'Default',     scale:1},
  {id:'large',   label:'Large',       scale:1.15},
  {id:'xl',      label:'Extra large', scale:1.3},
];
export const fontScale=id=>(FONT_SIZES.find(f=>f.id===id)||FONT_SIZES[1]).scale;

/* Load a Google Font by injecting its stylesheet (regular weight; the browser
   synthesizes bold). Cross-origin, so the service worker never caches it —
   offline it falls back to the default stack. */
export const ensureGoogleFont=name=>{
  const id='gf-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
  if(document.getElementById(id)) return;
  const l=document.createElement('link');
  l.id=id; l.rel='stylesheet';
  l.href=`https://fonts.googleapis.com/css2?family=${name.replace(/ /g,'+')}&display=swap`;
  document.head.appendChild(l);
};
