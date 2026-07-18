/* =========================================================================
   ui/savepill.jsx — the save-state pill (✓ Saved · Saving… · Unsaved)
   -------------------------------------------------------------------------
   ONE component for every layout: the HOME topbar (next to the storage
   badge) and the CODE layout's status bar (pass `compact`). States:
   'saved' | 'saving' | 'error' | 'demo'. Styles live in styles.css
   (.save-pill) so both layouts render the identical pill.
   ========================================================================= */
import React from 'react';
import { cx } from '../../lib/utils.js';
import { Ic } from './icons.jsx';

export default function SavePill({ state, where = 'your workspace', compact }) {
  if (!state) return null;
  return <div className={cx('save-pill', state, compact && 'compact')}
    title={state === 'demo' ? 'You’re in the demo — changes are not saved. Use “Keep this workspace” to save your work.'
      : state === 'saving' ? `Saving your changes to ${where}…`
      : state === 'error' ? `Could not save to ${where} — your changes are still here. Check your connection or reconnect.`
      : `All changes saved to ${where}.`}>
    {state === 'saving' ? <span className="save-spin"/>
      : state === 'error' || state === 'demo' ? <Ic n="x" style={{ width: 13, height: 13 }}/>
      : <Ic n="check" style={{ width: 13, height: 13 }}/>}
    <span className="save-pill-tx">{state === 'saving' ? 'Saving…'
      : state === 'error' ? 'Unsaved' : state === 'demo' ? 'Not saved' : 'Saved'}</span>
  </div>;
}
