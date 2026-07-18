/* =========================================================================
   services/plugin.js — THE PLUGIN-TYPE REGISTRY (plain module, no React)
   -------------------------------------------------------------------------
   What a plugin IS. Like VS Code extensions, plugins come in TYPES; this
   registry is the single source of truth for every type the app knows about.

   APPEND-ONLY: never remove or rename an entry. A planned type must be
   listed here BEFORE it is implemented, so older app versions reject it
   with a clear "planned, not yet supported" message rather than "unknown".
   (Flip status 'planned' → 'supported' in the release that implements it.)
   ========================================================================= */
export const PLUGIN_TYPES = {
  page:       { label: 'Page',       desc: 'A custom page type or file handler — default-exports a React component.', status: 'supported' },
  theme:      { label: 'Theme',      desc: 'A CSS-only skin: colors, fonts, chrome — applied workspace-wide while enabled.', status: 'supported' },
  layout:     { label: 'Layout',     desc: 'An entire alternative app layout, toggleable like Home/Code.', status: 'planned' },
  icons:      { label: 'Icons',      desc: 'Replaces the icon set / file-type marks.', status: 'planned' },
  syntax:     { label: 'Syntax',     desc: 'Adds syntax highlighting definitions for the code editors.', status: 'planned' },
  components: { label: 'Components', desc: 'New block types / UI elements for the editors.', status: 'planned' },
};

/* The types this app version can actually run — derived, never hand-listed. */
export const SUPPORTED_PLUGIN_TYPES =
  Object.keys(PLUGIN_TYPES).filter(t => PLUGIN_TYPES[t].status === 'supported');

/* Info for one type → { label, desc, status } | null (unknown type). */
export function pluginTypeInfo(t) {
  const e = PLUGIN_TYPES[t];
  return e ? { label: e.label, desc: e.desc, status: e.status } : null;
}
