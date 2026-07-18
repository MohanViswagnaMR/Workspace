/* =========================================================================
   markdown.js — workspace ⇆ folder-of-Markdown serialization
   =========================================================================
   The workspace lives on disk as plain folders + Markdown files so the data
   stays readable and usable without the app. This module is the single source
   of truth for that mapping. It is PURE (no DOM, no browser/filesystem APIs)
   so it can be unit-tested in Node and reused by both localfs.js (File System
   Access API) and cloudstorage.js (Google Drive).

   On-disk layout (relative to the workspace root folder):

     <Workspace Title>/
     ├── Upload/                 uploaded files (images, attachments)
     └── Space/                  all top-level pages
         ├── <title>.md          a page with no children
         └── <title>/            a page WITH children → a folder
             ├── master page.md  the page's own content + frontmatter
             └── <child>.md …     recurses (folders for children-with-children)

   Each .md file is YAML frontmatter (id, title, icon, cover, order, type,
   favorite, template, and — for databases — the full db structure) followed by a GFM
   body. Node hierarchy is reconstructed from the folder nesting; ordering
   from the `order` frontmatter field. No JSON is used anywhere on disk.
   ========================================================================= */
import yaml from 'js-yaml';

/* ---------------------------------------------------------------- ids ---- */
let _idc = 0;
const nid = () =>
  'n' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3) + (_idc++).toString(36);

/* ---------------------------------------------------------- inline text -- */
/* Editor blocks store rich text as a small HTML subset. Convert both ways
   between that HTML and Markdown inline syntax. */
export function htmlInlineToMd(h) {
  return (h || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<s>(.*?)<\/s>/gi, '~~$1~~')
    .replace(/<strike>(.*?)<\/strike>/gi, '~~$1~~')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // underline + inline colour/highlight survive as a tiny HTML subset
    // (Markdown has no syntax for them); protect from the strip below
    .replace(/<span class="((?:tc|bg)-[a-z]+)">/gi, '\x00span $1\x00')
    .replace(/<\/span>/gi, '\x00/span\x00')
    .replace(/<u>/gi, '\x00u\x00')
    .replace(/<\/u>/gi, '\x00/u\x00')
    .replace(/<[^>]+>/g, '')
    .replace(/\x00span ((?:tc|bg)-[a-z]+)\x00/g, '<span class="$1">')
    .replace(/\x00\/span\x00/g, '</span>')
    .replace(/\x00u\x00/g, '<u>')
    .replace(/\x00\/u\x00/g, '</u>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function inlineToHtml(t) {
  return (t || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // re-admit the small HTML subset kept in the Markdown (underline, colour, highlight)
    .replace(/&lt;span class="((?:tc|bg)-[a-z]+)"&gt;/gi, '<span class="$1">')
    .replace(/&lt;\/span&gt;/gi, '</span>')
    .replace(/&lt;(\/?)u&gt;/gi, '<$1u>')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
    .replace(/\*(.+?)\*|_(.+?)_/g, (_, a, b) => `<em>${a || b}</em>`)
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

/* ---------------------------------------------------------- filenames ---- */
const RESERVED_BASE = 'master page';

/* md plugin pages carry their binding IN THE FILENAME: "Title-(plugin-id).md".
   That keeps the page↔plugin mapping visible in the file system, and a file
   hand-named this way binds to its plugin even with no frontmatter. */
export const PLUGIN_NAME_RE = /^(.*)-\(([\w.-]+)\)$/;

/* Non-.md files under Space/ become 'file' pages handled by handler plugins
   (or the built-in text editor). Text formats only — binary is not a page. */
export const FILE_PAGE_EXT_RE =
  /\.(txt|html?|css|js|jsx|ts|tsx|json|py|rb|go|rs|java|c|h|cpp|sh|bash|yaml|yml|toml|xml|svg|csv|sql|ini|conf|log)$/i;

export function slugifyTitle(title) {
  let s = (title || '').trim()
    .replace(/[\/\\:*?"<>|]/g, ' ')   // path-illegal characters
    .replace(/[\x00-\x1f]/g, ' ')     // control characters
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) s = 'Untitled';
  return s.slice(0, 100);
}

/* --------------------------------------------------------- frontmatter --- */
function splitFrontmatter(text) {
  const t = (text || '').replace(/^﻿/, '');
  const m = t.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: t, hasFm: false };
  let meta = {};
  try { meta = yaml.load(m[1]) || {}; } catch (_) { meta = {}; }
  return { meta, body: t.slice(m[0].length), hasFm: true };
}

function stripLeadingTitle(body) {
  // Drop a single leading "# …" line (+ following blank) — it duplicates the
  // frontmatter title and is present only for human readability.
  return (body || '').replace(/^\s*#\s+[^\n]*\n(?:\n)?/, '');
}

/* ------------------------------------------------------------ database --- */
function emptyDb() {
  return {
    props: [{ id: 'p_title', name: 'Name', type: 'title' }],
    rows: [],
    views: [{ id: 'v1', name: 'Table', type: 'table' }],
    activeView: 'v1',
  };
}

/* Render a database as a readable GFM table. Option ids are resolved to their
   display names (the ids live only in frontmatter). This body is regenerated
   on every write and IGNORED on read — the frontmatter `db` is authoritative. */
function dbToTable(db) {
  if (!db) return '';
  const props = db.props || [];
  if (!props.length) return '';
  const cell = (prop, row) => {
    const v = row && row.cells ? row.cells[prop.id] : undefined;
    if (v == null || v === '') return '';
    if (prop.type === 'status' || prop.type === 'select') {
      const o = (prop.options || []).find(o => o.id === v);
      return o ? o.name : String(v);
    }
    return String(v);
  };
  const esc = c => c.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  let out = '| ' + props.map(p => esc(p.name || '')).join(' | ') + ' |\n';
  out += '| ' + props.map(() => '---').join(' | ') + ' |\n';
  (db.rows || []).forEach(r => {
    out += '| ' + props.map(p => esc(cell(p, r))).join(' | ') + ' |\n';
  });
  return out + '\n';
}

/* Comment line written before an inline smart table (database block) so the
   reader can tell it apart from a simple table — both render as GFM tables. */
const SMART_TABLE_MARK = '<!--smart-table-->';

/* ---------------------------------------------------------- block → md --- */
function blockToMd(b, nodesMap) {
  const t = htmlInlineToMd(b.html);
  switch (b.type) {
    case 'h1': return '# ' + t + '\n\n';
    case 'h2': return '## ' + t + '\n\n';
    case 'h3': return '### ' + t + '\n\n';
    case 'bullet': return '- ' + t + '\n';
    case 'number': return '1. ' + t + '\n';
    case 'todo': return '- [' + (b.checked ? 'x' : ' ') + '] ' + t + '\n';
    case 'quote': return '> ' + t + '\n\n';
    case 'callout': return '> ' + (b.emoji || '💡') + ' ' + t + '\n\n';
    case 'divider': return '---\n\n';
    case 'code':
      return '```' + (b.lang && b.lang !== 'plain text' ? b.lang : '') + '\n' + (b.code || '') + '\n```\n\n';
    case 'toggle': {
      const kids = (b.children || []).map(c => blockToMd(c, nodesMap)).join('');
      return '<details>\n<summary>' + t + '</summary>\n\n' + kids + '</details>\n\n';
    }
    case 'image': {
      const src = b.localName ? 'Upload/' + b.localName : (b.url || '');
      return src ? '![' + (b.caption || '') + '](' + src + ')\n\n' : '';
    }
    case 'file': {
      const src = b.localName ? 'Upload/' + b.localName : (b.url || '');
      return src ? '📎 [' + (b.fileName || 'file') + '](' + src + ')\n\n' : '';
    }
    case 'bookmark':
      return b.url ? '🔖 [' + (b.title || b.url) + '](' + b.url + ')\n\n' : '';
    case 'subpage': {
      const child = nodesMap && nodesMap[b.pageId];
      const label = (child && child.title) || 'Sub-page';
      return b.pageId ? '📄 [' + label + '](#' + b.pageId + ')\n\n' : '';
    }
    case 'table': {
      // simple table → plain GFM table
      const tb = b.table || { header: [''], rows: [] };
      const esc = c => String(c ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      let out = '| ' + tb.header.map(esc).join(' | ') + ' |\n';
      out += '| ' + tb.header.map(() => '---').join(' | ') + ' |\n';
      (tb.rows || []).forEach(r => {
        out += '| ' + tb.header.map((_, ci) => esc(r[ci] || '')).join(' | ') + ' |\n';
      });
      return out + '\n';
    }
    // the marker keeps smart tables distinguishable from simple ones on read
    case 'database': return SMART_TABLE_MARK + '\n' + dbToTable(b.db);
    case 'text':
    default: return t ? t + '\n\n' : '\n';
  }
}

function blocksToMd(blocks, nodesMap) {
  return (blocks || []).map(b => blockToMd(b, nodesMap)).join('');
}

/* ---------------------------------------------------------- md → blocks -- */
const EMOJI_START = /^\p{Extended_Pictographic}/u;
const MARKER_RE = /^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s+\[([^\]]*)\]\(([^)]*)\)\s*$/u;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]*)\)\s*$/;

function bodyToBlocks(body) {
  const lines = (body || '').split('\n');
  const blocks = [];
  let i = 0;
  let smartNext = false;   // set by the smart-table marker comment
  const push = b => blocks.push({ id: nid(), ...b });

  while (i < lines.length) {
    const l = lines[i];
    const trimmed = l.trim();

    // marker: the next pipe table is a smart table (inline database)
    if (trimmed === SMART_TABLE_MARK) { smartNext = true; i++; continue; }

    // <details> … </details>  → toggle
    if (/^<details>/i.test(trimmed)) {
      i++;
      let summary = '';
      const inner = [];
      while (i < lines.length && !/^<\/details>/i.test(lines[i].trim())) {
        const sm = lines[i].match(/^\s*<summary>([\s\S]*?)<\/summary>\s*$/i);
        if (sm) summary = sm[1];
        else inner.push(lines[i]);
        i++;
      }
      i++; // consume </details>
      push({ type: 'toggle', html: inlineToHtml(summary), collapsed: false,
        children: bodyToBlocks(inner.join('\n')).map(c => ({ ...c, id: nid() })) });
      continue;
    }

    // fenced code
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim() || 'plain text';
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i++; }
      i++;
      push({ type: 'code', code: code.join('\n'), lang });
      continue;
    }

    // pipe table → simple table block; with the marker → smart table
    // (inline database — fidelity is best-effort)
    if (trimmed.startsWith('|')) {
      const pipe = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { pipe.push(lines[i].trim()); i++; }
      const parse = row => row.split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim().replace(/\\\|/g, '|'));
      const isSep = row => !row.replace(/[|\-:\s]/g, '').length;
      const dataRows = pipe.filter(r => !isSep(r));
      if (dataRows.length >= 1) {
        const headers = parse(dataRows[0]);
        const rows = dataRows.slice(1).map(parse);
        if (smartNext) push(buildTableBlock(headers, rows));
        else push({ type: 'table', table: { header: headers,
          rows: rows.map(r => headers.map((_, ci) => r[ci] || '')) } });
      }
      smartNext = false;
      continue;
    }

    // headings
    const hm = l.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      const lvl = hm[1].length;
      push({ type: lvl === 1 ? 'h1' : lvl === 2 ? 'h2' : 'h3', html: inlineToHtml(hm[2]) });
      i++; continue;
    }

    // horizontal rule
    if (/^[-*_]{3,}\s*$/.test(trimmed)) { push({ type: 'divider' }); i++; continue; }

    // image
    const im = trimmed.match(IMAGE_RE);
    if (im) {
      const src = im[2];
      const b = { type: 'image', caption: im[1], url: '' };
      if (/^Upload\//.test(src)) b.localName = src.slice('Upload/'.length);
      else b.url = src;
      push(b); i++; continue;
    }

    // emoji-marked links → file / bookmark / subpage
    const mk = trimmed.match(MARKER_RE);
    if (mk) {
      const [, emoji, label, target] = mk;
      if (emoji.startsWith('📄') && target.startsWith('#')) {
        push({ type: 'subpage', pageId: target.slice(1) });
      } else if (emoji.startsWith('📎')) {
        const b = { type: 'file', fileName: label, url: '', fileType: '', fileSize: 0 };
        if (/^Upload\//.test(target)) b.localName = target.slice('Upload/'.length);
        else b.url = target;
        push(b);
      } else if (emoji.startsWith('🔖')) {
        push({ type: 'bookmark', url: target, title: label });
      } else {
        push({ type: 'text', html: inlineToHtml(trimmed) });
      }
      i++; continue;
    }

    // blockquote → callout (leading emoji) or quote
    if (trimmed.startsWith('>')) {
      const content = l.replace(/^\s*>\s?/, '');
      if (EMOJI_START.test(content)) {
        const sp = content.indexOf(' ');
        const emoji = sp === -1 ? content : content.slice(0, sp);
        const rest = sp === -1 ? '' : content.slice(sp + 1);
        push({ type: 'callout', html: inlineToHtml(rest), emoji, color: 'gray' });
      } else {
        push({ type: 'quote', html: inlineToHtml(content) });
      }
      i++; continue;
    }

    // task list
    const todo = l.match(/^[-*]\s\[([ xX])\]\s(.*)$/);
    if (todo) { push({ type: 'todo', html: inlineToHtml(todo[2]), checked: todo[1].toLowerCase() === 'x' }); i++; continue; }

    // lists
    if (/^[-*]\s/.test(l)) { push({ type: 'bullet', html: inlineToHtml(l.replace(/^[-*]\s/, '')) }); i++; continue; }
    if (/^\d+\.\s/.test(l)) { push({ type: 'number', html: inlineToHtml(l.replace(/^\d+\.\s/, '')) }); i++; continue; }

    // blank line(s) — paragraph-style blocks end with one blank separator
    // line, so the first blank after them is NOT content; every additional
    // blank in the run is a deliberate empty block. List items emit no
    // separator, so after them every blank line counts.
    if (trimmed === '') {
      let n = 0;
      while (i < lines.length && lines[i].trim() === '') { n++; i++; }
      const prev = blocks[blocks.length - 1];
      const prevSep = prev && !['bullet', 'number', 'todo'].includes(prev.type)
        && !(prev.type === 'text' && !prev.html);
      for (let k = prevSep ? 1 : 0; k < n; k++) push({ type: 'text', html: '' });
      continue;
    }

    // paragraph
    push({ type: 'text', html: inlineToHtml(l) });
    i++;
  }

  // strip all leading/trailing empty-text noise (keep interior spacers)
  let a = 0, z = blocks.length;
  while (a < z && blocks[a].type === 'text' && !blocks[a].html) a++;
  while (z > a && blocks[z - 1].type === 'text' && !blocks[z - 1].html) z--;
  const cleaned = blocks.slice(a, z);
  return cleaned.length ? cleaned : [{ id: nid(), type: 'text', html: '' }];
}

/* headers[] + rows[][] → embedded database block (inline tables) */
function buildTableBlock(headers, rows) {
  const titleId = nid();
  const extra = headers.slice(1).map(h => ({ id: nid(), name: h || 'Column', type: 'text' }));
  const props = [{ id: titleId, name: headers[0] || 'Name', type: 'title' }, ...extra];
  const viewId = nid();
  const dbRows = rows.map(cells => ({
    id: nid(), icon: '📄', blocks: [],
    cells: Object.fromEntries([[titleId, cells[0] || ''], ...extra.map((p, idx) => [p.id, cells[idx + 1] || ''])]),
  }));
  return { type: 'database', db: { props, rows: dbRows, views: [{ id: viewId, name: 'Table', type: 'table' }], activeView: viewId } };
}

/* ===================================================== node ⇆ markdown === */
export function nodeToMarkdown(node, opts = {}) {
  const nodesMap = opts.nodesMap || {};
  const fm = {
    id: node.id,
    title: node.title || 'Untitled',
    type: node.kind === 'database' ? 'database'
      : node.kind === 'folder' ? 'folder'
      : node.kind === 'md' ? 'markdown'
      : node.kind === 'plugin' ? 'plugin'
      : node.kind === 'file' ? 'file' : 'page',
    order: node.sort || 0,
  };
  if (node.kind === 'plugin') fm.plugin = node.plugin || '';
  // 'file' pages only pass through here for trash/ and archive/ (live ones are
  // written raw by buildFolderPlan) — keep ext/plugin so restore is lossless.
  if (node.kind === 'file') { fm.ext = node.ext || ''; if (node.plugin) fm.plugin = node.plugin; }
  if (node.icon) fm.icon = node.icon;
  if (node.cover) fm.cover = node.cover;
  if (opts.isFavorite) fm.favorite = true;
  if (node.template) fm.template = true;
  if (node.toc) fm.toc = true;   // show the side table of contents
  // Trashed / archived pages live flat in trash/ or archive/ — record the flag +
  // parentId so they restore to their original place (live pages derive parentId
  // from folder nesting).
  if (opts.trashed) { fm.trashed = true; fm.parentId = node.parentId || null; }
  if (opts.archived) { fm.archived = true; fm.parentId = node.parentId || null; }
  if (node.kind === 'database') fm.db = node.db || emptyDb();

  const front = '---\n' + yaml.dump(fm, { lineWidth: -1, noRefs: true }) + '---\n\n';
  // Simple markdown pages are saved VERBATIM — no generated "# title" line
  // (it would be stripped back out on read, mangling the user's own content).
  if (node.kind === 'md') {
    const raw = node.md || '';
    return front + raw + (raw.endsWith('\n') || raw === '' ? '' : '\n');
  }
  // Plugin pages: the body is the plugin's own data string (usually JSON),
  // saved verbatim like simple md pages — the app never interprets it.
  // 'file' pages in trash/archive keep their raw content the same way.
  if (node.kind === 'plugin' || node.kind === 'file') {
    const raw = node.data || '';
    return front + raw + (raw.endsWith('\n') || raw === '' ? '' : '\n');
  }
  const head = '# ' + (node.icon ? node.icon + ' ' : '') + (node.title || 'Untitled') + '\n\n';
  const body = node.kind === 'database'
    ? dbToTable(node.db || emptyDb())
    : blocksToMd(node.blocks || [], nodesMap);
  return front + head + body;
}

export function markdownToNode(text, opts = {}) {
  const { meta, body, hasFm } = splitFrontmatter(text);
  const id = meta.id || nid();
  // A filename shaped "Title-(plugin-id)" binds the file to that plugin even
  // when there is no frontmatter (hand-made files).
  const nameBind = !hasFm && opts.fallbackTitle ? opts.fallbackTitle.match(PLUGIN_NAME_RE) : null;
  // `type: markdown` → a SIMPLE page (raw markdown, no blocks). A file with
  // no frontmatter at all (dropped into the folder by hand) is treated the
  // same way — it IS plain markdown, so it opens verbatim instead of being
  // converted into blocks.
  const kind = meta.type === 'database' ? 'database'
    : meta.type === 'folder' ? 'folder'
    : meta.type === 'file' ? 'file'
    : (meta.type === 'plugin' || nameBind) ? 'plugin'
    : (meta.type === 'markdown' || !hasFm) ? 'md' : 'page';
  const node = {
    id, kind,
    title: meta.title || (nameBind ? nameBind[1].trim() : opts.fallbackTitle) || 'Untitled',
    icon: meta.icon || '',
    cover: meta.cover || '',
    sort: typeof meta.order === 'number' ? meta.order : 0,
    parentId: meta.parentId ?? null,   // authoritative for trash/; Space/ overrides via folders
  };
  if (meta.trashed) node.trashed = true;
  if (meta.archived) node.archived = true;
  if (meta.template) node.template = true;
  if (meta.toc) node.toc = true;
  if (kind === 'database') {
    node.db = meta.db || emptyDb();
  } else if (kind === 'folder') {
    node.blocks = [];       // folders have no content of their own
  } else if (kind === 'md') {
    // verbatim — no title-strip, no block conversion. Only the single blank
    // separator line the writer emits after the frontmatter is consumed, so
    // repeated save/load cycles never drift the content.
    node.md = body.replace(/^\n/, '');
  } else if (kind === 'plugin') {
    // same verbatim + one-newline rule as md pages
    node.plugin = meta.plugin || (nameBind ? nameBind[2] : '');
    node.data = body.replace(/^\n/, '');
  } else if (kind === 'file') {
    // trash/archive form of a file page (live ones never carry frontmatter)
    node.ext = (meta.ext || '').toLowerCase();
    node.plugin = meta.plugin || '';
    node.data = body.replace(/^\n/, '');
  } else {
    node.blocks = bodyToBlocks(stripLeadingTitle(body));
  }
  return { node, favorite: !!meta.favorite };
}

/* ===================================================== workspace info === */
/* info.md holds this workspace's appearance settings (theme, accent, font, and
   an optional uploaded page-background image referenced by its Upload/ name).
   It lives at the workspace root and travels with the folder — no JSON. */
export function infoToMarkdown(info = {}) {
  const fm = {
    theme: info.theme === 'dark' ? 'dark' : 'light',
    accent: info.accent || 'indigo',
    font: info.font || 'default',
  };
  if (info.description) fm.description = info.description;
  if (info.pageBg) fm.pageBackground = info.pageBg;   // Upload/ filename
  if (info.templateRepo) fm.templateRepo = info.templateRepo;   // "owner/repo" on GitHub
  if (info.fontSize && info.fontSize !== 'default') fm.fontSize = info.fontSize;
  if ((info.customFonts || []).length) fm.customFonts = info.customFonts;   // Google Fonts names
  // per-workspace file-type → handler-plugin overrides (Settings → File
  // handlers) — one map per layout: fileHandlers = Home, fileHandlersCode = Code
  if (info.fileHandlers && Object.keys(info.fileHandlers).length) fm.fileHandlers = info.fileHandlers;
  if (info.fileHandlersCode && Object.keys(info.fileHandlersCode).length) fm.fileHandlersCode = info.fileHandlersCode;
  const front = '---\n' + yaml.dump(fm, { lineWidth: -1, noRefs: true }) + '---\n\n';
  return front +
    '# Workspace info\n\n' +
    'This file stores this workspace’s appearance settings — theme, accent colour, ' +
    'font, and (optionally) a custom page-background image kept in the `Upload/` ' +
    'folder. Change these in the app’s **Settings**, or edit the values above.\n';
}

export function markdownToInfo(text) {
  const { meta } = splitFrontmatter(text);
  return {
    theme: meta.theme === 'dark' ? 'dark' : 'light',
    accent: meta.accent || 'indigo',
    font: meta.font || 'default',
    description: meta.description || '',
    pageBg: meta.pageBackground || null,
    templateRepo: meta.templateRepo || '',
    fontSize: meta.fontSize || 'default',
    customFonts: Array.isArray(meta.customFonts)
      ? meta.customFonts.filter(f => typeof f === 'string') : [],
    fileHandlers: (meta.fileHandlers && typeof meta.fileHandlers === 'object'
      && !Array.isArray(meta.fileHandlers)) ? meta.fileHandlers : {},
    fileHandlersCode: (meta.fileHandlersCode && typeof meta.fileHandlersCode === 'object'
      && !Array.isArray(meta.fileHandlersCode)) ? meta.fileHandlersCode : {},
  };
}

/* ================================================= workspace ⇆ folders === */
/* Produce the flat file/upload plan for an entire workspace. Paths are
   relative to the workspace root folder. */
export function buildFolderPlan(store) {
  const nodes = store.nodes || {};
  const favSet = new Set(store.favorites || []);
  const all = Object.values(nodes).filter(Boolean);
  const live = all.filter(n => !n.trashed && !n.archived);
  const archived = all.filter(n => n.archived);
  const trashed = all.filter(n => n.trashed && !n.archived);
  const liveIds = new Set(live.map(n => n.id));

  const childrenOf = {};
  live.forEach(n => {
    // A live node whose parent isn't live (parent trashed/deleted) becomes
    // top-level, so it is never orphaned out of the written tree.
    const key = (n.parentId && liveIds.has(n.parentId)) ? n.parentId : '';
    (childrenOf[key] || (childrenOf[key] = [])).push(n);
  });
  Object.values(childrenOf).forEach(arr => arr.sort((a, b) => (a.sort || 0) - (b.sort || 0)));

  const files = [];
  const usedByDir = {};
  const uniqueName = (dir, base) => {
    const set = usedByDir[dir] || (usedByDir[dir] = new Set());
    let name = base, i = 1;
    while (set.has(name.toLowerCase())) { name = base + '_' + i; i++; }
    set.add(name.toLowerCase());
    return name;
  };

  const dirs = [];   // folder-kind directories (no master page.md inside)
  const walk = (parentKey, dirPath) => {
    for (const node of childrenOf[parentKey] || []) {
      const hasKids = (childrenOf[node.id] || []).length > 0;
      // Plugin pages encode their handler in the filename: "Title-(plugin-id)"
      const base = node.kind === 'plugin' && node.plugin
        ? slugifyTitle(node.title) + '-(' + node.plugin + ')'
        : slugifyTitle(node.title);
      // 'file' pages (a .py/.html/… file in Space/) are written back VERBATIM
      // under their own filename — no frontmatter (it would corrupt the file).
      if (node.kind === 'file') {
        const m = (node.title || 'file.txt').match(/^(.*?)(\.[^.]+)?$/);
        // an explicit handler binding rides in the name: "base-(plugin).ext"
        const fbase = slugifyTitle(m[1] || 'file') + (node.plugin ? '-(' + node.plugin + ')' : '');
        const fext = m[2] || '';
        const set = usedByDir[dirPath] || (usedByDir[dirPath] = new Set());
        let fname = fbase + fext, fi = 1;
        while (set.has(fname.toLowerCase())) { fname = fbase + '_' + fi + fext; fi++; }
        set.add(fname.toLowerCase());
        files.push({ path: dirPath + '/' + fname, text: node.data || '' });
        continue;
      }
      // A folder is a directory WITHOUT a master page.md — that absence is
      // exactly what distinguishes it from a page-with-subpages on disk.
      if (node.kind === 'folder') {
        const folderName = uniqueName(dirPath, base);
        const folderPath = dirPath + '/' + folderName;
        usedByDir[folderPath] = new Set();
        dirs.push(folderPath);
        walk(node.id, folderPath);
        continue;
      }
      const text = nodeToMarkdown(node, { nodesMap: nodes, isFavorite: favSet.has(node.id) });
      if (hasKids) {
        const folderName = uniqueName(dirPath, base);
        const folderPath = dirPath + '/' + folderName;
        usedByDir[folderPath] = new Set([RESERVED_BASE]); // reserve master page.md
        files.push({ path: folderPath + '/master page.md', text });
        walk(node.id, folderPath);
      } else {
        files.push({ path: dirPath + '/' + uniqueName(dirPath, base) + '.md', text });
      }
    }
  };
  walk('', 'Space');

  // Trashed / archived pages are stored flat in trash/ or archive/ (they keep
  // parentId in frontmatter so they can be restored to their original place).
  trashed.sort((a, b) => (a.sort || 0) - (b.sort || 0)).forEach(node => {
    const text = nodeToMarkdown(node, { nodesMap: nodes, trashed: true });
    files.push({ path: 'trash/' + uniqueName('trash', slugifyTitle(node.title)) + '.md', text });
  });
  archived.sort((a, b) => (a.sort || 0) - (b.sort || 0)).forEach(node => {
    const text = nodeToMarkdown(node, { nodesMap: nodes, archived: true });
    files.push({ path: 'archive/' + uniqueName('archive', slugifyTitle(node.title)) + '.md', text });
  });

  // Workspace appearance settings → info.md at the root (always present).
  files.push({ path: 'info.md', text: infoToMarkdown(store.info || {}) });

  const uploads = (store.uploads || [])
    .filter(u => u.localName || u.dataUrl)
    .map(u => ({ name: u.localName || (slugifyTitle(u.name || 'file') || 'file'), record: u }));

  return { files, dirs, uploads };
}

/* Relative on-disk path of one node within its workspace folder, consistent
   with buildFolderPlan (same slugging + per-directory de-duplication). Returns
   e.g. "Space/Homework/master page.md" or "Space/Meeting Notes.md", or null. */
export function nodeDiskPath(store, nodeId) {
  const nodes = store.nodes || {};
  if (!nodes[nodeId]) return null;
  const kidsOf = id => Object.values(nodes)
    .filter(x => x && !x.trashed && !x.archived && (x.parentId || null) === (id || null))
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));

  // ancestry root → target
  const chain = [];
  for (let n = nodes[nodeId]; n; n = n.parentId ? nodes[n.parentId] : null) chain.unshift(n);

  // sibling's base name, consistent with buildFolderPlan's naming rules
  const baseOf = s => s.kind === 'plugin' && s.plugin
    ? slugifyTitle(s.title) + '-(' + s.plugin + ')'
    : s.kind === 'file'
    ? (m => slugifyTitle(m[1] || 'file') + (s.plugin ? '-(' + s.plugin + ')' : '') + (m[2] || ''))
        ((s.title || 'file.txt').match(/^(.*?)(\.[^.]+)?$/))
    : slugifyTitle(s.title);

  // resolve the de-duplicated base name of `node` among its siblings
  const nameOf = (node, parentId, dirHasMaster) => {
    const used = new Set(dirHasMaster ? [RESERVED_BASE] : []);
    let chosen = 'Untitled';
    for (const s of kidsOf(parentId)) {
      let base = baseOf(s), name = base, i = 1;
      while (used.has(name.toLowerCase())) { name = base + '_' + i; i++; }
      used.add(name.toLowerCase());
      if (s.id === node.id) chosen = name;
    }
    return chosen;
  };

  const segs = ['Space'];
  for (let k = 0; k < chain.length; k++) {
    const node = chain[k];
    const parentId = k === 0 ? null : chain[k - 1].id;
    // page-dirs reserve master page.md; folder-dirs don't have one
    const base = nameOf(node, parentId, k > 0 && chain[k - 1].kind !== 'folder');
    const hasKids = kidsOf(node.id).length > 0;
    segs.push(k === chain.length - 1
      ? (node.kind === 'folder' ? base
        : node.kind === 'file' ? base
        : hasKids ? base + '/master page.md' : base + '.md')
      : base);
  }
  return segs.join('/');
}

/* Reconstruct nodes from a flat list of parsed .md files.
   `files` = [{ path, text }] where path is relative to the root and begins
   with "Space/". `dirs` (optional) lists every directory under the root the
   reader saw (e.g. "Space/Projects") so folders that hold no files still
   appear. A directory WITHOUT a master page.md is a folder; one WITH it is a
   page-with-subpages. Returns { nodes, favorites, currentId }. */
export function parseFolderTree(files, dirs) {
  const parsed = [];       // { node, dir, isMaster }
  const folderNode = {};   // folder-relative-path (under Space) → node id
  const favorites = [];
  const flatNodes = [];   // trash/ + archive/ — parentId comes from frontmatter, not folders
  let info = null;

  // info.md first: its fileHandlers map can register CUSTOM file extensions
  // (e.g. ipynb) that should open as 'file' pages beyond the built-in list.
  const infoFile = (files || []).find(f => f && f.path && f.path.replace(/^\/+/, '') === 'info.md');
  if (infoFile) info = markdownToInfo(infoFile.text);
  const customExts = new Set([...Object.keys(info?.fileHandlers || {}),
    ...Object.keys(info?.fileHandlersCode || {})].map(e => e.toLowerCase()));

  for (const f of files || []) {
    if (!f || !f.path) continue;
    const rel = f.path.replace(/^\/+/, '');
    // Non-.md text files under Space/ are 'file' pages — content kept VERBATIM,
    // rendered by a handler plugin (or the built-in text editor). No metadata
    // lives in these files, so hierarchy comes from folders, title = filename.
    // "base-(plugin-id).ext" binds THIS file to that handler plugin, exactly
    // like plugin .md pages; without it, the workspace's per-extension default
    // (Settings → File handlers) decides.
    if (!rel.endsWith('.md')) {
      const relExt = (rel.match(/\.([^./]+)$/) || [, ''])[1].toLowerCase();
      if (rel.startsWith('Space/') && (FILE_PAGE_EXT_RE.test(rel) || customExts.has(relExt))) {
        const sub = rel.slice('Space/'.length);
        const parts = sub.split('/');
        const fileName = parts.pop();
        const fm2 = fileName.match(/^(.*?)(\.[^.]+)$/);           // base + .ext
        const bind = fm2 ? fm2[1].match(PLUGIN_NAME_RE) : null;   // base = "title-(plugin)"?
        parsed.push({
          node: { id: nid(), kind: 'file',
            title: bind ? bind[1].trim() + fm2[2] : fileName,
            plugin: bind ? bind[2] : '',
            ext: (fileName.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase(),
            icon: '', cover: '', sort: 5e5, parentId: null, data: f.text },
          dir: parts.join('/'), isMaster: false,
        });
      }
      continue;
    }
    if (rel === 'info.md') continue;   // already parsed above
    if (rel.startsWith('Space/')) {
      const sub = rel.slice('Space/'.length);
      const parts = sub.split('/');
      const fileBase = parts.pop();
      const dir = parts.join('/');
      const isMaster = fileBase.toLowerCase() === 'master page.md';
      // frontmatter-less files fall back to their filename (or, for a
      // master page, the enclosing folder name) as the title
      const fallbackTitle = isMaster ? (dir.split('/').pop() || 'Untitled')
        : fileBase.replace(/\.md$/i, '');
      const { node, favorite } = markdownToNode(f.text, { fallbackTitle });
      parsed.push({ node, dir, isMaster });
      if (favorite) favorites.push(node.id);
      if (isMaster) folderNode[dir] = node.id;
    } else if (rel.startsWith('trash/')) {
      const { node } = markdownToNode(f.text, { fallbackTitle: rel.split('/').pop().replace(/\.md$/i, '') });
      node.trashed = true;                 // keep node.parentId from frontmatter
      flatNodes.push(node);
    } else if (rel.startsWith('archive/')) {
      const { node } = markdownToNode(f.text, { fallbackTitle: rel.split('/').pop().replace(/\.md$/i, '') });
      node.archived = true;                // keep node.parentId from frontmatter
      flatNodes.push(node);
    }
  }

  // Directories that exist but have no master page.md are FOLDERS — synthesize
  // a folder node for each (metadata-free on disk: title = directory name).
  const nodes = {};
  const allDirs = new Set();
  const addDirChain = dir => {
    const parts = dir.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) allDirs.add(parts.slice(0, i).join('/'));
  };
  parsed.forEach(p => { if (p.dir) addDirChain(p.dir); });
  (dirs || []).forEach(d => {
    const rel = String(d).replace(/^\/+/, '');
    if (rel.startsWith('Space/')) addDirChain(rel.slice('Space/'.length));
  });
  [...allDirs].sort((a, b) => a.split('/').length - b.split('/').length).forEach((dir, i) => {
    if (folderNode[dir] !== undefined) return;   // has a master page → a page
    const node = { id: nid(), kind: 'folder', title: dir.split('/').pop(),
      icon: '', cover: '', sort: 1e6 + i, parentId: null, blocks: [] };
    folderNode[dir] = node.id;
    nodes[node.id] = node;
    node._dir = dir;   // resolved to parentId below, then removed
  });
  Object.values(nodes).forEach(n => {
    if (!n._dir) return;
    const enclosing = n._dir.split('/').slice(0, -1).join('/');
    n.parentId = enclosing ? (folderNode[enclosing] ?? null) : null;
    delete n._dir;
  });

  for (const p of parsed) {
    let parentId = null;
    if (p.isMaster) {
      const enclosing = p.dir.split('/').slice(0, -1).join('/');
      parentId = enclosing ? (folderNode[enclosing] ?? null) : null;
    } else {
      parentId = p.dir ? (folderNode[p.dir] ?? null) : null;
    }
    p.node.parentId = parentId;
    nodes[p.node.id] = p.node;
  }
  for (const n of flatNodes) nodes[n.id] = n;

  // currentId = first LIVE top-level page by order (folders can't be opened)
  const tops = Object.values(nodes)
    .filter(n => !n.parentId && !n.trashed && !n.archived && n.kind !== 'folder')
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const currentId = tops.length ? tops[0].id : null;

  return { nodes, favorites, currentId, info };
}
