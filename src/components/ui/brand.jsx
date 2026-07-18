/* =========================================================================
   ui/brand.jsx — the ◧ + name brand chip
   -------------------------------------------------------------------------
   ONE component for every surface that shows the mark and a name: the site
   navbar (welcome/start), the docs-page headers (pass className +`tag`),
   and the code layout's title bar (pass `small` + the workspace name).
   Styles are the existing .home-nav-mark/.home-nav-title tokens, so every
   instance stays visually identical.
   ========================================================================= */
import React from 'react';
import { cx } from '../../lib/utils.js';

export default function Brand({ name = 'Workspace', tag, small, className }) {
  return <div className={cx(className || 'home-nav-brand', small && 'brand-sm')}>
    <span className="home-nav-mark">◧</span>
    <span className="home-nav-title" title={name}>{name}</span>
    {tag && <span className="docs-top-tag">{tag}</span>}
  </div>;
}
