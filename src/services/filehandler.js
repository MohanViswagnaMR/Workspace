/* =========================================================================
   filehandler.js — file-handler resolution (pure functions)
   -------------------------------------------------------------------------
   Which plugin opens a 'file' page, and the "-(plugin)" file-name binding
   shared by commitRename and the disk reader. Pure module — workspace.jsx
   wraps resolveHandler in a thin closure over its store state.
   ========================================================================= */

/* File types always offered in Settings → File handlers, even before any
   plugin or file of that type exists — the built-in text editor is the
   default handler for all of them. */
export const DEFAULT_HANDLER_EXTS=['txt','html','css','js','ts','json','py','yaml','xml','csv','sh','sql'];

/* Which plugin opens a 'file' page: explicit "-(plugin)" filename binding →
   the given LAYOUT's Settings override for the extension → first plugin
   whose manifest `handles` the extension, preferring one scoped to this
   layout → null (built-in text editor). Each layout has its own defaults,
   the same handler can serve both, e.g. the built-in Coder Page. */
export const resolveHandler=(node,lay,{plugins,fileHandlers,fileHandlersCode})=>{
  // only PAGE plugins can render a file — a stale override or binding that
  // points at a theme (or a future non-page type) falls back to the text editor
  const isPage=p=>p&&p.manifest.type==='page';
  if(node.plugin) return plugins.find(p=>p.id===node.plugin&&isPage(p))||null;
  const ov=((lay==='code'?fileHandlersCode:fileHandlers)||{})[node.ext];
  if(ov==='text') return null;
  if(ov) return plugins.find(p=>p.id===ov&&isPage(p))||null;
  const claims=p=>isPage(p)&&(p.manifest.handles||[]).includes(node.ext);
  return plugins.find(p=>claims(p)&&p.manifest.layout===lay)
    || plugins.find(p=>claims(p)&&(p.manifest.layout||'all')==='all')
    || null;
};

/* Split a "base-(plugin)" name binding out of a file/page base name.
   Returns {title, plugin} (title untrimmed, exactly the regex capture) or
   null when the name carries no binding. */
export const splitNameBinding=base=>{
  const m=(base||'').match(/^(.*)-\(([\w.-]+)\)$/);
  return m?{title:m[1],plugin:m[2]}:null;
};
