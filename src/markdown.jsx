/* =========================================================================
   markdown.jsx — the SIMPLE .MD PAGE editor
   -------------------------------------------------------------------------
   A simple page (node.kind === 'md') has no blocks at all: its content is a
   single raw Markdown string (node.md) edited in a plain textarea and saved
   to disk VERBATIM — what you type is exactly what lands in the .md file
   (below the frontmatter). No block conversion happens on edit, ever.
   No page head either (no cover / icon / title section) — the page shows
   only the text; the title is renamed from the sidebar / topbar and lives
   in the frontmatter. A live rendered preview sits on the right (toggle in
   the stats bar); the preview is display-only and never written back.
   The smart (block) page editor lives in ./smart.jsx.
   ========================================================================= */
import React, { useMemo, useRef, useState } from 'react';
import { cx, Popup } from './smart.jsx';

/* Markdown syntax cheat-sheet shown by the floating guide button. */
const GUIDE = [
  ['Headings', [['# Text', 'Heading 1'], ['## Text', 'Heading 2'], ['### Text', 'Heading 3']]],
  ['Text style', [['**text**', 'Bold'], ['*text*', 'Italic'], ['~~text~~', 'Strikethrough'], ['`code`', 'Inline code']]],
  ['Lists', [['- item', 'Bullet list'], ['1. item', 'Numbered list'], ['- [ ] task', 'To-do'], ['- [x] task', 'Done to-do']]],
  ['Blocks', [['> text', 'Quote'], ['``` … ```', 'Code block'], ['---', 'Divider'],
    ['| a | b |', 'Table row'], ['| --- | --- |', 'Table header line']]],
  ['Media', [['[title](url)', 'Link'], ['![alt](url)', 'Image']]],
];

/* ---- tiny Markdown → HTML renderer (preview only) ----
   Input is escaped before any tags are produced, and link/image URLs are
   restricted to safe protocols, so the HTML is safe to inject. */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeUrl = u => /^\s*(https?:|mailto:|#|\/|\.)/i.test(u) ? u.trim() : '#';

/* Inline marks — operates on already-escaped text. Code spans are pulled out
   first so their contents are never touched by the other patterns. */
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push('<code>' + c + '</code>'); return '\u0000' + (codes.length - 1) + '\u0000'; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s[^)]*)?\)/g, (_, a, u) => `<img src="${safeUrl(u)}" alt="${a}">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s[^)]*)?\)/g, (_, t, u) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/(^|[^\w_])_([^_\n]+)_/g, '$1<i>$2</i>');
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

function mdToHtml(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = []; const p = []; let i = 0;
  const flushP = () => { if (p.length) { out.push('<p>' + p.map(l => inline(esc(l))).join('<br>') + '</p>'); p.length = 0; } };
  while (i < lines.length) {
    const l = lines[i]; let m;
    if (/^```/.test(l)) {                                      // fenced code
      flushP(); const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>'); continue;
    }
    if (/^\s*$/.test(l)) { flushP(); i++; continue; }
    if ((m = l.match(/^(#{1,6})\s+(.*)/))) {                   // heading
      flushP(); const h = m[1].length;
      out.push(`<h${h}>` + inline(esc(m[2])) + `</h${h}>`); i++; continue;
    }
    if (/^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { flushP(); out.push('<hr>'); i++; continue; }
    if (/^\s*>/.test(l)) {                                     // blockquote (recursive)
      flushP(); const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*> ?/, '')); i++; }
      out.push('<blockquote>' + mdToHtml(buf.join('\n')) + '</blockquote>'); continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {                    // list (flat, + tasks)
      flushP(); const ordered = /^\s*\d/.test(l);
      const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
      const items = [];
      while (i < lines.length && re.test(lines[i])) { items.push(lines[i].replace(re, '')); i++; }
      out.push((ordered ? '<ol>' : '<ul>') + items.map(t => {
        const task = t.match(/^\[([ xX])\]\s+(.*)/);
        return task
          ? `<li class="task"><input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(esc(task[2]))}</li>`
          : '<li>' + inline(esc(t)) + '</li>';
      }).join('') + (ordered ? '</ol>' : '</ul>')); continue;
    }
    if (l.includes('|') && i + 1 < lines.length &&             // table
        /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      flushP();
      const row = s => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => inline(esc(c.trim())));
      const head = row(l); i += 2; const body = [];
      while (i < lines.length && lines[i].includes('|')) { body.push(row(lines[i])); i++; }
      out.push('<table><thead><tr>' + head.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
        body.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    p.push(l); i++;
  }
  flushP();
  return out.join('\n');
}

export default function MarkdownEditor({ node, update }) {
  const [preview, setPreview] = useState(true);
  const [guide, setGuide] = useState(null);
  const md = node.md || '';

  /* Proportional scroll-sync between the two panes. Whichever pane the user
     is scrolling "drives" for a moment; the mirrored scrollTop assignment
     fires a scroll event on the other pane, which is ignored while driven. */
  const edRef = useRef(null), pvRef = useRef(null);
  const driver = useRef(null), driverTimer = useRef(0);
  const onScrollSync = e => {
    const src = e.currentTarget;
    const dst = src === edRef.current ? pvRef.current : edRef.current;
    if (!dst) return;
    if (driver.current && driver.current !== src) return;
    driver.current = src;
    clearTimeout(driverTimer.current);
    driverTimer.current = setTimeout(() => { driver.current = null; }, 150);
    const smax = src.scrollHeight - src.clientHeight;
    const dmax = dst.scrollHeight - dst.clientHeight;
    if (smax > 0 && dmax >= 0) dst.scrollTop = (src.scrollTop / smax) * dmax;
  };

  const stats = useMemo(() => {
    const words = md.split(/\s+/).filter(Boolean).length;
    const lines = md === '' ? 0 : md.split('\n').length;
    return { words, chars: md.length, lines };
  }, [md]);
  const html = useMemo(() => preview ? mdToHtml(md) : '', [md, preview]);

  const setMd = value => update(node.id, { md: value });

  /* Tab inserts two spaces instead of leaving the editor. */
  const onKeyDown = e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: en } = el;
      el.setRangeText('  ', s, en, 'end');
      setMd(el.value);
    }
  };

  return <div className="scroll page-scroll md-page" key={node.id}>
    <button className="md-guide-btn" title="Markdown guide — what to type for each format"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setGuide(g => g ? null : r); }}>?</button>
    {guide && <Popup rect={guide} onClose={() => setGuide(null)} width={270}>
      <div className="md-guide">
        <div className="md-guide-title">Markdown guide</div>
        {GUIDE.map(([section, rows]) => <React.Fragment key={section}>
          <div className="md-guide-h">{section}</div>
          {rows.map(([syntax, label]) => <div className="md-guide-row" key={syntax}>
            <code>{syntax}</code><span>{label}</span>
          </div>)}
        </React.Fragment>)}
      </div>
    </Popup>}
    <div className="page-wrap">
      <div className={cx('md-split', preview && 'with-preview')}>
        <textarea autoFocus ref={edRef}
          className="md-editor" spellCheck
          placeholder={'Write Markdown…\n\n# Heading\n**bold**, *italic*, `code`, - lists, > quotes — saved to disk exactly as typed.'}
          value={md}
          onChange={e => setMd(e.target.value)}
          onScroll={onScrollSync}
          onKeyDown={onKeyDown}/>
        {preview && <div className="md-preview" ref={pvRef} onScroll={onScrollSync}
          dangerouslySetInnerHTML={{ __html: html }}/>}
      </div>
    </div>
    <div className="page-stats md-stats">
      <span>{stats.words} word{stats.words === 1 ? '' : 's'} · {stats.lines} line{stats.lines === 1 ? '' : 's'} · {stats.chars} character{stats.chars === 1 ? '' : 's'}</span>
      <button className="stats-toggle" onClick={() => setPreview(v => !v)}>
        {preview ? 'Hide preview' : 'Show preview'}
      </button>
    </div>
  </div>;
}
