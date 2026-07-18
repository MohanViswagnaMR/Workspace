/* =========================================================================
   coderpage.jsx — "Coder Page", the IDE-style code editor
   -------------------------------------------------------------------------
   The built-in file-handler plugin for the CODE layout (plugins.jsx imports
   this file as ?raw text and ships it as the 'coder-page' built-in, so this
   single file IS the plugin source — it may only import 'react').

   VS Code-inspired editor page:
     · a line-number gutter on the left (right-aligned, dimmed; the active
       line's number is bright)
     · the code fills the full width beside it — no centered card
     · lightweight syntax colours (comments / strings / numbers / keywords)
       via a highlighted layer behind a transparent-text textarea
     · active-line background, Tab inserts spaces, Enter keeps indentation
     · a status strip: Ln/Col, line count, language, encoding

   Contract: default-exports a component receiving { data, setData, node } —
   for 'file' pages data is the RAW text, saved back verbatim.
   ========================================================================= */
import React, { useEffect, useMemo, useRef, useState } from 'react';

const LH = 21;          // line height px — every layer must agree on this
const PAD_V = 12;       // top/bottom padding of the code area
const MAX_HL = 200000;  // above this many chars, skip highlighting (plain text)

/* ------------------------------------------------------------ languages -- */
const KW_C = 'abstract as async await break case catch class const continue default delete do else enum export extends false finally fn for from func function go if impl implements import in instanceof interface let match mut new null of package private protected public pub return static struct super switch this throw true try type typeof undefined use var void while yield';
const KW_PY = 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield False';
const KW_SH = 'case do done echo elif else esac exit export fi for function if in local return then while';
const KW_SQL = 'ALTER AND AS BY CREATE DELETE DROP FROM GROUP HAVING INNER INSERT INTO JOIN KEY LEFT LIMIT NOT NULL ON OR ORDER OUTER PRIMARY RIGHT SELECT SET TABLE UPDATE VALUES WHERE alter and as by create delete drop from group having inner insert into join key left limit not null on or order outer primary right select set table update values where';

const LANGS = {
  js:  { name: 'JavaScript', kw: KW_C, line: '\\/\\/', block: true },
  jsx: { name: 'JSX',        kw: KW_C, line: '\\/\\/', block: true },
  ts:  { name: 'TypeScript', kw: KW_C, line: '\\/\\/', block: true },
  tsx: { name: 'TSX',        kw: KW_C, line: '\\/\\/', block: true },
  java:{ name: 'Java',       kw: KW_C, line: '\\/\\/', block: true },
  c:   { name: 'C',          kw: KW_C, line: '\\/\\/', block: true },
  h:   { name: 'C header',   kw: KW_C, line: '\\/\\/', block: true },
  cpp: { name: 'C++',        kw: KW_C, line: '\\/\\/', block: true },
  go:  { name: 'Go',         kw: KW_C, line: '\\/\\/', block: true },
  rs:  { name: 'Rust',       kw: KW_C, line: '\\/\\/', block: true },
  json:{ name: 'JSON',       kw: 'true false null' },
  py:  { name: 'Python',     kw: KW_PY, line: '#' },
  rb:  { name: 'Ruby',       kw: KW_PY, line: '#' },
  sh:  { name: 'Shell',      kw: KW_SH, line: '#' },
  bash:{ name: 'Bash',       kw: KW_SH, line: '#' },
  yaml:{ name: 'YAML',       kw: 'true false null', line: '#' },
  yml: { name: 'YAML',       kw: 'true false null', line: '#' },
  toml:{ name: 'TOML',       kw: 'true false', line: '#' },
  ini: { name: 'INI',        kw: '', line: '[#;]' },
  conf:{ name: 'Config',     kw: '', line: '#' },
  css: { name: 'CSS',        kw: '', block: true, prop: true },
  sql: { name: 'SQL',        kw: KW_SQL, line: '--' },
  csv: { name: 'CSV',        kw: '' },
  log: { name: 'Log',        kw: '' },
  txt: { name: 'Plain text', kw: '' },
  html:{ name: 'HTML', markup: true },
  xml: { name: 'XML',  markup: true },
  svg: { name: 'SVG',  markup: true },
};

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* One alternation regex per language; parallel class list tells which group
   matched. Escaped plain text is emitted between matches, so the highlighted
   layer always contains EXACTLY the textarea's text (alignment never drifts). */
function buildMatcher(lang) {
  const parts = [], cls = [];
  const add = (re, c) => { parts.push('(' + re + ')'); cls.push(c); };
  if (lang.markup) {
    add('<!--[\\s\\S]*?(?:-->|$)', 'cdr-c');
    add('"[^"\\n]*"?|\'[^\'\\n]*\'?', 'cdr-s');
    add('<\\/?[\\w-]+|\\/?>', 'cdr-t');
    add('[\\w-]+(?==)', 'cdr-a');
  } else {
    if (lang.block) add('\\/\\*[\\s\\S]*?(?:\\*\\/|$)', 'cdr-c');
    if (lang.line) add(lang.line + '.*', 'cdr-c');
    add('"(?:\\\\.|[^"\\\\\\n])*"?|\'(?:\\\\.|[^\'\\\\\\n])*\'?|`(?:\\\\.|[^`\\\\])*`?', 'cdr-s');
    if (lang.prop) add('[\\w-]+(?=\\s*:)', 'cdr-a');
    if (lang.kw) add('\\b(?:' + lang.kw.trim().split(/\s+/).join('|') + ')\\b', 'cdr-k');
    add('\\b0x[\\da-fA-F]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?\\b', 'cdr-n');
  }
  return { re: new RegExp(parts.join('|'), 'g'), cls };
}

function highlight(text, ext) {
  const lang = LANGS[ext];
  if (!lang || text.length > MAX_HL) return esc(text);
  const { re, cls } = buildMatcher(lang);
  let out = '', last = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index));
    const gi = m.slice(1).findIndex(g => g !== undefined);
    out += `<span class="${cls[gi]}">` + esc(m[0]) + '</span>';
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;   // safety against zero-width loops
  }
  return out + esc(text.slice(last));
}

/* --------------------------------------------------------------- styles -- */
/* Injected once by the component itself so the plugin stays a single file.
   Token colours are VS Code's default light / dark theme colours; everything
   else uses the app's theme tokens. The :has() rules make the hosting page
   wrapper full-bleed and viewport-pinned (the textarea is the scroller). */
const CSS = `
.page-scroll:has(.cdr){display:flex;flex-direction:column;overflow:hidden;}
.page-wrap:has(> .cdr){flex:1;min-height:0;display:flex;flex-direction:column;
  max-width:none;padding:0;}
.cdr{flex:1;min-height:0;display:flex;flex-direction:column;
  font-family:var(--mono);background:var(--bg);}
.cdr-bar{display:flex;align-items:center;gap:10px;padding:7px 16px;flex-shrink:0;
  border-bottom:1px solid var(--border);font-size:12px;color:var(--text-2);}
.cdr-bar b{color:var(--text);font-weight:600;}
.cdr-body{flex:1;min-height:0;display:flex;}
.cdr-gutter{flex-shrink:0;overflow:hidden;text-align:right;user-select:none;
  padding:0 4px 0 10px;border-right:1px solid var(--border);
  color:var(--text-3);background:var(--bg);}
.cdr-gutter-inner{padding:${PAD_V}px 10px ${PAD_V}px 0;
  font-size:12.5px;line-height:${LH}px;will-change:transform;}
.cdr-gutter-inner .on{color:var(--text);font-weight:600;}
.cdr-code{flex:1;min-width:0;position:relative;overflow:hidden;}
.cdr-active{position:absolute;left:0;right:0;height:${LH}px;z-index:0;
  background:rgba(127,127,127,.09);pointer-events:none;}
.cdr-hl{position:absolute;top:0;left:0;z-index:1;margin:0;pointer-events:none;
  padding:${PAD_V}px 24px ${PAD_V}px 16px;min-width:100%;
  font-family:var(--mono);font-size:13px;line-height:${LH}px;tab-size:4;
  color:var(--text);will-change:transform;}
.cdr-input{position:absolute;inset:0;z-index:2;resize:none;border:none;outline:none;
  padding:${PAD_V}px 24px ${PAD_V}px 16px;background:transparent;
  color:transparent;caret-color:var(--text);white-space:pre;overflow:auto;
  font-family:var(--mono);font-size:13px;line-height:${LH}px;tab-size:4;}
.cdr-input::selection{background:color-mix(in srgb,var(--accent) 28%,transparent);}
.cdr-status{display:flex;align-items:center;gap:18px;flex-shrink:0;
  padding:4px 16px;border-top:1px solid var(--border);
  font-size:11.5px;color:var(--text-3);}
.cdr-status span:first-child{color:var(--text-2);}
.cdr-k{color:#af00db;} body.dark .cdr-k{color:#c586c0;}
.cdr-s{color:#a31515;} body.dark .cdr-s{color:#ce9178;}
.cdr-c{color:#008000;font-style:italic;} body.dark .cdr-c{color:#6a9955;}
.cdr-n{color:#098658;} body.dark .cdr-n{color:#b5cea8;}
.cdr-t{color:#800000;} body.dark .cdr-t{color:#569cd6;}
.cdr-a{color:#e50000;} body.dark .cdr-a{color:#9cdcfe;}
`;

/* ------------------------------------------------------------ component -- */
export default function CoderPage({ data, setData, node }) {
  const text = typeof data === 'string' ? data : '';
  const ext = String(node.ext || 'txt').toLowerCase();
  const lang = LANGS[ext] || { name: '.' + ext };
  const [cursor, setCursor] = useState({ ln: 0, col: 0 });
  const taRef = useRef(null), hlRef = useRef(null), gutRef = useRef(null), actRef = useRef(null);

  useEffect(() => {
    if (document.getElementById('cdr-css')) return;
    const el = document.createElement('style');
    el.id = 'cdr-css';
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  const lines = useMemo(() => text.split('\n'), [text]);
  const html = useMemo(() => highlight(text, ext) + '\n', [text, ext]);

  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  /* the textarea is the ONLY scroller — the highlight layer, gutter and
     active-line bar just follow it */
  const sync = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (hlRef.current) hlRef.current.style.transform =
      `translate(${-ta.scrollLeft}px,${-ta.scrollTop}px)`;
    if (gutRef.current) gutRef.current.style.transform =
      `translateY(${-ta.scrollTop}px)`;
    if (actRef.current) actRef.current.style.top =
      `${PAD_V + cursorRef.current.ln * LH - ta.scrollTop}px`;
  };
  useEffect(sync, [cursor, text]);

  const readCursor = () => {
    const ta = taRef.current;
    if (!ta) return;
    const before = ta.value.slice(0, ta.selectionStart);
    const ln = (before.match(/\n/g) || []).length;
    setCursor({ ln, col: before.length - before.lastIndexOf('\n') - 1 });
  };

  const onKeyDown = e => {
    const ta = e.currentTarget;
    if (e.key === 'Tab') {
      e.preventDefault();
      ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
      setData(ta.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      const indent = (ta.value.slice(lineStart, s).match(/^[ \t]*/) || [''])[0];
      ta.setRangeText('\n' + indent, s, ta.selectionEnd, 'end');
      setData(ta.value);
    }
  };

  return <div className="cdr">
    <div className="cdr-bar">
      <b>{node.title}</b>
    </div>
    <div className="cdr-body">
      <div className="cdr-gutter">
        <div className="cdr-gutter-inner" ref={gutRef}
          style={{ width: `${Math.max(2, String(lines.length).length)}ch` }}>
          {lines.map((_, i) =>
            <div key={i} className={i === cursor.ln ? 'on' : ''}>{i + 1}</div>)}
        </div>
      </div>
      <div className="cdr-code">
        <div className="cdr-active" ref={actRef} style={{ top: PAD_V }}/>
        <pre className="cdr-hl" ref={hlRef} aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: html }}/>
        <textarea className="cdr-input" ref={taRef} spellCheck={false} wrap="off"
          value={text}
          onChange={e => { setData(e.target.value); readCursor(); }}
          onScroll={sync}
          onKeyDown={onKeyDown}
          onKeyUp={readCursor}
          onClick={readCursor}/>
      </div>
    </div>
    <div className="cdr-status">
      <span>Ln {cursor.ln + 1}, Col {cursor.col + 1}</span>
      <span>{lines.length} line{lines.length === 1 ? '' : 's'}</span>
      <span>Spaces: 2</span>
      <span>UTF-8</span>
      <span style={{ marginLeft: 'auto' }}>{lang.name || '.' + ext}</span>
    </div>
  </div>;
}
