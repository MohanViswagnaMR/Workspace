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
   favorite, and — for databases — the full db structure) followed by a GFM
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
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function inlineToHtml(t) {
  return (t || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
    .replace(/\*(.+?)\*|_(.+?)_/g, (_, a, b) => `<em>${a || b}</em>`)
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

/* ---------------------------------------------------------- filenames ---- */
const RESERVED_BASE = 'master page';

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
  if (!m) return { meta: {}, body: t };
  let meta = {};
  try { meta = yaml.load(m[1]) || {}; } catch (_) { meta = {}; }
  return { meta, body: t.slice(m[0].length) };
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
    case 'database': return dbToTable(b.db);
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
  const push = b => blocks.push({ id: nid(), ...b });

  while (i < lines.length) {
    const l = lines[i];
    const trimmed = l.trim();

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

    // pipe table → embedded database (inline DB fidelity is best-effort)
    if (trimmed.startsWith('|')) {
      const pipe = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { pipe.push(lines[i].trim()); i++; }
      const parse = row => row.split('|').slice(1, -1).map(c => c.trim().replace(/\\\|/g, '|'));
      const isSep = row => !row.replace(/[|\-:\s]/g, '').length;
      const dataRows = pipe.filter(r => !isSep(r));
      if (dataRows.length >= 1) {
        const headers = parse(dataRows[0]);
        const rows = dataRows.slice(1).map(parse);
        push(buildTableBlock(headers, rows));
      }
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

    // blank line
    if (trimmed === '') { push({ type: 'text', html: '' }); i++; continue; }

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
    type: node.kind === 'database' ? 'database' : 'page',
    order: node.sort || 0,
  };
  if (node.icon) fm.icon = node.icon;
  if (node.cover) fm.cover = node.cover;
  if (opts.isFavorite) fm.favorite = true;
  // Trashed / archived pages live flat in trash/ or archive/ — record the flag +
  // parentId so they restore to their original place (live pages derive parentId
  // from folder nesting).
  if (opts.trashed) { fm.trashed = true; fm.parentId = node.parentId || null; }
  if (opts.archived) { fm.archived = true; fm.parentId = node.parentId || null; }
  if (node.kind === 'database') fm.db = node.db || emptyDb();

  const front = '---\n' + yaml.dump(fm, { lineWidth: -1, noRefs: true }) + '---\n\n';
  const head = '# ' + (node.icon ? node.icon + ' ' : '') + (node.title || 'Untitled') + '\n\n';
  const body = node.kind === 'database'
    ? dbToTable(node.db || emptyDb())
    : blocksToMd(node.blocks || [], nodesMap);
  return front + head + body;
}

export function markdownToNode(text) {
  const { meta, body } = splitFrontmatter(text);
  const id = meta.id || nid();
  const kind = meta.type === 'database' ? 'database' : 'page';
  const node = {
    id, kind,
    title: meta.title || 'Untitled',
    icon: meta.icon || '',
    cover: meta.cover || '',
    sort: typeof meta.order === 'number' ? meta.order : 0,
    parentId: meta.parentId ?? null,   // authoritative for trash/; Space/ overrides via folders
  };
  if (meta.trashed) node.trashed = true;
  if (meta.archived) node.archived = true;
  if (kind === 'database') {
    node.db = meta.db || emptyDb();
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

  const walk = (parentKey, dirPath) => {
    for (const node of childrenOf[parentKey] || []) {
      const hasKids = (childrenOf[node.id] || []).length > 0;
      const base = slugifyTitle(node.title);
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

  return { files, uploads };
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

  // resolve the de-duplicated base name of `node` among its siblings
  const nameOf = (node, parentId, dirHasMaster) => {
    const used = new Set(dirHasMaster ? [RESERVED_BASE] : []);
    let chosen = 'Untitled';
    for (const s of kidsOf(parentId)) {
      let base = slugifyTitle(s.title), name = base, i = 1;
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
    const base = nameOf(node, parentId, k > 0); // nested node-folders reserve master page.md
    const hasKids = kidsOf(node.id).length > 0;
    segs.push(k === chain.length - 1 ? (hasKids ? base + '/master page.md' : base + '.md') : base);
  }
  return segs.join('/');
}

/* Reconstruct nodes from a flat list of parsed .md files.
   `files` = [{ path, text }] where path is relative to the root and begins
   with "Space/". Returns { nodes, favorites, currentId }. */
export function parseFolderTree(files) {
  const parsed = [];       // { node, dir, isMaster }
  const folderNode = {};   // folder-relative-path (under Space) → node id
  const favorites = [];
  const flatNodes = [];   // trash/ + archive/ — parentId comes from frontmatter, not folders
  let info = null;

  for (const f of files || []) {
    if (!f || !f.path || !f.path.endsWith('.md')) continue;
    const rel = f.path.replace(/^\/+/, '');
    if (rel === 'info.md') { info = markdownToInfo(f.text); continue; }
    if (rel.startsWith('Space/')) {
      const sub = rel.slice('Space/'.length);
      const { node, favorite } = markdownToNode(f.text);
      const parts = sub.split('/');
      const fileBase = parts.pop();
      const dir = parts.join('/');
      const isMaster = fileBase.toLowerCase() === 'master page.md';
      parsed.push({ node, dir, isMaster });
      if (favorite) favorites.push(node.id);
      if (isMaster) folderNode[dir] = node.id;
    } else if (rel.startsWith('trash/')) {
      const { node } = markdownToNode(f.text);
      node.trashed = true;                 // keep node.parentId from frontmatter
      flatNodes.push(node);
    } else if (rel.startsWith('archive/')) {
      const { node } = markdownToNode(f.text);
      node.archived = true;                // keep node.parentId from frontmatter
      flatNodes.push(node);
    }
  }

  const nodes = {};
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

  // currentId = first LIVE top-level node by order
  const tops = Object.values(nodes)
    .filter(n => !n.parentId && !n.trashed && !n.archived)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const currentId = tops.length ? tops[0].id : null;

  return { nodes, favorites, currentId, info };
}
