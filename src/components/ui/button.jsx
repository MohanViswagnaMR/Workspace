/* =========================================================================
   ui/button.jsx — the system buttons
   -------------------------------------------------------------------------
   Button      — the standard app button. Wraps the house .btn classes so
                 every button in the app shares one look:
                   <Button>Save</Button>                    (primary)
                   <Button variant="ghost" size="sm">…</Button>
   TileButton  — the big option tile (icon chip + title + subtitle) used by
                 the connect launcher, the storage pickers and anywhere a
                 choice is presented as a card. One structure everywhere so
                 choices always look like the same system.
   ========================================================================= */
import React from 'react';
import { cx } from '../../lib/utils.js';

export default function Button({variant='primary',size,block,className,children,...rest}){
  return <button type="button" className={cx('btn',variant,size,block&&'block',className)} {...rest}>
    {children}
  </button>;
}

export function TileButton({icon,title,sub,className,...rest}){
  return <button type="button" className={cx('cb-tile',className)} {...rest}>
    <span className="cb-tile-ic">{icon}</span>
    <span className="cb-tile-tx">
      <span className="cb-tile-t">{title}</span>
      <span className="cb-tile-s">{sub}</span>
    </span>
  </button>;
}
