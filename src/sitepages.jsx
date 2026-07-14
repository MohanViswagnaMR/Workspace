/* =========================================================================
   sitepages.jsx — Docs, About and Self-hosting pages
   -------------------------------------------------------------------------
   These are website-style pages most sessions never open, so they live in
   their own chunk: workspace.jsx pulls them in with React.lazy(() =>
   import('./sitepages.jsx')), keeping them out of the main bundle.
   ========================================================================= */
import React from 'react';
import { CMDS, SHORTCUTS, fmtShortcut, cx, Ic, APP_VERSION, GitHubIcon } from './workspace.jsx';

/* =========================================================================
   DOCS PAGE — full in-app documentation
   ========================================================================= */
const DOCS_TOC=[
  ['overview','Overview'],
  ['quick-start','Quick start & setup'],
  ['workspace-types','Workspace types'],
  ['data-on-disk','How your data is stored'],
  ['interface','The interface'],
  ['blocks','Blocks & the editor'],
  ['slash','Slash commands'],
  ['databases','Databases & views'],
  ['pages','Pages & hierarchy'],
  ['features','Features'],
  ['managing','Managing workspaces'],
  ['shortcuts','Keyboard shortcuts'],
  ['permissions','Plugins & permissions'],
  ['persistence','Persistence & privacy'],
  ['structure','Project structure'],
  ['stack','Tech stack'],
  ['deploy','Deployment'],
  ['troubleshooting','Troubleshooting'],
];

export function DocsPage({onBack,theme,onToggleTheme}){
  const scroller=React.useRef(null);
  const [active,setActive]=React.useState('overview');
  const go=id=>{
    const el=document.getElementById('doc-'+id);
    if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
  };
  React.useEffect(()=>{
    const root=scroller.current; if(!root) return;
    const onScroll=()=>{
      // Bottom of the page → always highlight the last section (it can't scroll to the top).
      if(root.scrollTop+root.clientHeight>=root.scrollHeight-4){
        setActive(DOCS_TOC[DOCS_TOC.length-1][0]); return;
      }
      const rootTop=root.getBoundingClientRect().top;
      const offset=110; // px below the sticky top bar
      let current=DOCS_TOC[0][0];
      for(const [id] of DOCS_TOC){
        const el=document.getElementById('doc-'+id);
        if(!el) continue;
        if(el.getBoundingClientRect().top-rootTop<=offset) current=id; else break;
      }
      setActive(current);
    };
    onScroll();
    root.addEventListener('scroll',onScroll,{passive:true});
    return ()=>root.removeEventListener('scroll',onScroll);
  },[]);
  const H=({id,children})=><h2 id={'doc-'+id} className="docs-h2">{children}</h2>;

  return <div className="docs-page">
    <div className="docs-top">
      <button className="docs-back" onClick={onBack} title="Back to homepage">
        <Ic n="back" style={{width:16,height:16}}/> Back
      </button>
      <div className="docs-top-brand">
        <span className="home-nav-mark">◧</span>
        <span className="home-nav-title">Workspace</span>
        <span className="docs-top-tag">Docs</span>
      </div>
      <div className="docs-top-actions">
        <a className="home-nav-link home-nav-icon" href="https://github.com/MohanViswagnaMR/Workspace"
          target="_blank" rel="noopener noreferrer" title="View on GitHub" aria-label="View on GitHub">
          <GitHubIcon/>
        </a>
        <button type="button" role="switch" aria-checked={theme==='dark'}
          className={cx('theme-switch',theme==='dark'&&'on')} onClick={onToggleTheme}
          title={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
          aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>
          <Ic n="sun" style={{width:13,height:13}}/>
          <Ic n="moon" style={{width:13,height:13}}/>
          <span className="theme-switch-knob"/>
        </button>
      </div>
    </div>

    <div className="docs-body">
      <aside className="docs-toc">
        <div className="docs-toc-title">On this page</div>
        {DOCS_TOC.map(([id,label])=>
          <button key={id} className={cx('docs-toc-link',active===id&&'on')}
            onClick={()=>go(id)}>{label}</button>)}
      </aside>

      <main className="docs-main" ref={scroller}>
        <div className="docs-content">
          <div className="docs-hero">
            <h1 className="docs-title">Workspace documentation</h1>
            <p className="docs-lead">
              A fast, block-based, Notion-style workspace built with <b>Vite + React 18</b>.
              No accounts and no backend — everything you write is stored as ordinary folders
              and Markdown files, either on your computer or mirrored to your Google Drive.
            </p>
            <div className="docs-badges">
              {APP_VERSION&&<span className="docs-badge">Version {APP_VERSION}</span>}
              <span className="docs-badge">React 18 · Vite 6</span>
              <span className="docs-badge">Plain Markdown storage</span>
            </div>
          </div>

          <H id="overview">Overview</H>
          <p className="docs-p">Workspace is a single place for docs, wikis, tasks and databases.
            Its defining idea: <b>your data is just files</b>. Pages are plain <code>.md</code> files
            with a little YAML frontmatter, and the page hierarchy is mirrored as nested folders — so
            your notes stay readable and usable even if this app goes away.</p>
          <ul className="docs-list">
            <li><b>No account, no login, no cloud lock-in</b> — nothing is sent anywhere except (optionally) your own Google Drive.</li>
            <li><b>Two workspace types</b> — a Local folder (via the File System Access API) or Google Drive.</li>
            <li><b>Block editor</b> — text, headings, to-dos, lists, toggles, quotes, callouts, dividers, code, images and file attachments.</li>
            <li><b>Multi-view databases</b> — table, board, gallery, list and calendar.</li>
            <li><b>Nested pages, slash commands, search, favorites, trash &amp; archive, templates, dark mode and keyboard shortcuts.</b></li>
            <li><b>Import</b> — bring in <code>.docx</code> files.</li>
          </ul>

          <H id="quick-start">Quick start &amp; setup</H>
          <p className="docs-p">You need <b>Node.js 18+</b>. Clone the repository, install dependencies, and start the dev server:</p>
          <pre className="docs-code"><code>{`git clone https://github.com/MohanViswagnaMR/Workspace.git
cd Workspace
npm install
npm run dev`}</code></pre>
          <p className="docs-p">Open <code>http://localhost:5173</code> and pick <b>Local folder</b> or <b>Google Drive</b> from the homepage.</p>
          <table className="docs-table"><thead><tr><th>Command</th><th>What it does</th></tr></thead><tbody>
            <tr><td><code>npm run dev</code></td><td>Start the dev server with hot reload (port 5173)</td></tr>
            <tr><td><code>npm run build</code></td><td>Production build into <code>dist/</code></td></tr>
            <tr><td><code>npm run preview</code></td><td>Preview the production build locally</td></tr>
          </tbody></table>
          <div className="docs-note">
            <b>Browser support:</b> Local folders require a Chromium browser (Chrome, Edge, Brave)
            because they use the File System Access API. Google Drive works in any modern browser.
          </div>

          <H id="workspace-types">Workspace types</H>
          <div className="docs-grid2">
            <div className="docs-card">
              <div className="docs-card-h">💻 Local folder</div>
              <p>Saved on your computer via the File System Access API. Pick a location and the app
              creates a folder you fully own. The directory handle is cached in IndexedDB; Chromium
              asks you to re-grant access once per session (click <b>Reconnect</b>).</p>
            </div>
            <div className="docs-card">
              <div className="docs-card-h">📁 Google Drive</div>
              <p>A real, browsable folder in your Drive that mirrors the exact same layout. Uses the
              <code>drive.file</code> OAuth scope so files are editable directly in Drive. The token
              lives in <code>sessionStorage</code>; sign in again when it expires.</p>
            </div>
          </div>

          <H id="data-on-disk">How your data is stored</H>
          <p className="docs-p">Each workspace is a self-describing folder tree. Pages with children become
            folders holding a <code>master page.md</code>; leaf pages are single <code>.md</code> files.
            Ordering and metadata live in each file's YAML frontmatter. There is <b>no JSON</b> anywhere in your data.</p>
          <pre className="docs-code"><code>{`My Workspace/                 (the folder you picked — its name is the title)
├── Upload/                   uploaded images & file attachments
│   └── sunset.jpg
├── info.md                   appearance settings + description
├── trash/                    trashed pages
├── archive/                  archived pages
└── Space/                    all top-level pages
    ├── Meeting Notes.md      a page with no children
    └── Homework/             a page WITH children → a folder
        ├── master page.md    the "Homework" page's own content
        ├── Essay.md
        └── Math/
            ├── master page.md
            └── Problem set 1.md`}</code></pre>
          <p className="docs-p">A page file is readable on its own — no app required:</p>
          <pre className="docs-code"><code>{`---
id: n_start
title: Getting Started
icon: 📓
order: 0
type: page
favorite: true
---

# 📓 Getting Started

Welcome to your **connected workspace**.

> 💡 Callouts are blockquotes with a leading emoji.

- [x] To-dos are GitHub-style checkboxes`}</code></pre>
          <p className="docs-p">Databases keep their structure (properties, rows and views) in the frontmatter
            <code>db:</code> block and render a readable Markdown table in the body.</p>

          <H id="interface">The interface</H>
          <ul className="docs-list">
            <li><b>Homepage</b> — a top navbar (logo, Docs, Manage workspaces, GitHub), your connected workspaces, a Google&nbsp;Drive connection cloud, connect panels, and a footer with a light/dark switch.</li>
            <li><b>Sidebar</b> — the workspace switcher, a glowing <b>New page</b> button, Search &amp; Home, Favorites, your page tree, and Templates / Import / Storage / Archive / Trash. Settings and Close workspace sit at the bottom.</li>
            <li><b>Topbar</b> — breadcrumbs, favorite toggle, share, and the page menu.</li>
            <li><b>Editor</b> — the block canvas where you write. Hover the left margin of any line to drag it, or click <b>⊕</b> to add a block.</li>
          </ul>

          <H id="blocks">Blocks &amp; the editor</H>
          <p className="docs-p">Everything you see is a <b>block</b>. Type <code>/</code> on an empty line to insert one,
            or use Markdown-style shortcuts (e.g. <code>#</code> + space for a heading). Available block types:</p>
          <div className="docs-chips">
            {CMDS.filter(c=>c.g!=='Database').map(c=>
              <span key={c.id} className="docs-chip"><span className="docs-chip-ic">{c.ic}</span>{c.label}</span>)}
          </div>
          <p className="docs-p">Inline formatting supports <b>bold</b>, <i>italic</i>, underline, strikethrough and
            <code>inline code</code> (see shortcuts below).</p>

          <H id="slash">Slash commands</H>
          <p className="docs-p">Press <kbd className="docs-kbd">/</kbd> at the start of an empty block to open the
            block menu, then type to filter. Commands are grouped into <b>Basic</b>, <b>Database</b> and <b>Media</b>.
            The same menu is how you insert a database view or an embedded sub-page.</p>

          <H id="databases">Databases &amp; views</H>
          <p className="docs-p">A database is a collection of rows with typed properties, viewable five ways.
            Add one from the slash menu, then switch or add views on the fly:</p>
          <div className="docs-grid">
            {CMDS.filter(c=>c.g==='Database').map(c=>
              <div key={c.id} className="docs-mini"><span className="docs-mini-ic">{c.ic}</span>
                <div><b>{c.label.replace(' view','')}</b><small>{c.desc}</small></div></div>)}
          </div>
          <p className="docs-p">Properties, rows and view configuration are serialized into the page's
            <code>db:</code> frontmatter, and a plain Markdown table is written in the body so the data
            stays human-readable outside the app.</p>

          <H id="pages">Pages &amp; hierarchy</H>
          <ul className="docs-list">
            <li><b>Infinite nesting</b> — any page can contain sub-pages; the tree mirrors 1:1 to nested folders on disk.</li>
            <li><b>Drag to reorder / nest</b> — drag pages in the sidebar to reorder them or drop one inside another.</li>
            <li><b>Icons &amp; covers</b> — give pages an emoji icon; ordering is stored per file as <code>order</code>.</li>
            <li><b>Embedded sub-pages</b> — the <b>Page</b> block links a child page inline within a parent.</li>
          </ul>

          <H id="features">Features</H>
          <div className="docs-grid2">
            <div className="docs-card"><div className="docs-card-h">🔍 Search</div><p>Instant fuzzy search across every page — open it with <kbd className="docs-kbd">⌘K</kbd>.</p></div>
            <div className="docs-card"><div className="docs-card-h">⭐ Favorites</div><p>Pin pages to a Favorites section at the top of the sidebar.</p></div>
            <div className="docs-card"><div className="docs-card-h">🗑️ Trash &amp; Archive</div><p>Deleted pages go to Trash (restore or purge); Archive hides pages you want to keep but not see. Both are full pages.</p></div>
            <div className="docs-card"><div className="docs-card-h">🧩 Templates</div><p>Reusable page starters, available as a dedicated Templates page.</p></div>
            <div className="docs-card"><div className="docs-card-h">📥 Import</div><p>Bring in <code>.docx</code> documents — converted to blocks via mammoth.</p></div>
            <div className="docs-card"><div className="docs-card-h">📎 Storage</div><p>Browse every uploaded image and attachment in grid, gallery or list view.</p></div>
            <div className="docs-card"><div className="docs-card-h">🌙 Dark mode &amp; accents</div><p>Light/dark themes plus 7 accent colours (indigo, blue, ocean, forest, rose, sunset, violet). Default is dark + violet.</p></div>
            <div className="docs-card"><div className="docs-card-h">⌨️ Shortcuts</div><p>A full keyboard-driven flow — see the table below.</p></div>
          </div>

          <H id="managing">Managing workspaces</H>
          <ul className="docs-list">
            <li><b>Connect</b> — create a new workspace, open an existing folder, or open one from Drive.</li>
            <li><b>Drive cloud icon</b> — next to “Your workspaces”; green ✓ when connected, grey ✗ when not. Click it to connect/refresh.</li>
            <li><b>Manage workspaces</b> (navbar) — lists every Google Drive workspace with <b>Open</b>, <b>Edit</b> and <b>Delete</b>.</li>
            <li><b>Edit</b> — rename a Drive workspace (renames the Drive folder) and change its description (stored in <code>info.md</code>).</li>
            <li><b>Delete</b> — permanently removes the whole Drive folder and its files. This cannot be undone.</li>
            <li><b>Unlink</b> — removes a workspace from your list without touching the underlying files.</li>
          </ul>

          <H id="shortcuts">Keyboard shortcuts</H>
          <table className="docs-table"><thead><tr><th>Action</th><th>Shortcut</th></tr></thead><tbody>
            {SHORTCUTS.map(([a,k])=><tr key={a}><td>{a}</td><td><kbd className="docs-kbd">{fmtShortcut(k)}</kbd></td></tr>)}
          </tbody></table>

          <H id="permissions">Plugins &amp; permissions</H>
          <p className="docs-p">Workspaces can hold <b>custom page plugins</b> — a folder at
            <code> plugins/&lt;id&gt;/</code> with a <code>manifest.json</code> and a
            <code> page.jsx</code> that default-exports a React component. Plugins render new
            page types (habit trackers, kanbans…) and <b>file handlers</b> open other file
            formats (<code>.py</code>, <code>.html</code>, <code>.csv</code>…) as pages.
            Install them from Settings → Plugins (GitHub URL or folder upload), and every
            plugin must be explicitly enabled before it runs.</p>
          <p className="docs-p">A plugin must <b>declare each app service it uses</b> in its
            manifest's <code>"permissions"</code> array. The consent screen shows the request,
            each grant can be revoked any time in Settings → Plugins, and undeclared or revoked
            calls throw instead of working silently. These are the permissions a plugin can ask
            for:</p>
          {/* keep in sync with PERMISSIONS in src/plugins.jsx and docs/PERMISSIONS.md */}
          <table className="docs-table"><thead><tr><th>Permission</th><th>Grants</th><th>Api</th></tr></thead><tbody>
            <tr><td><code>pages:read</code></td><td>See the id, title and kind of every live page in the workspace</td><td><code>api.listPages()</code></td></tr>
            <tr><td><code>pages:navigate</code></td><td>Navigate to another page</td><td><code>api.openPage(id)</code></td></tr>
          </tbody></table>
          <p className="docs-p">No permission is needed for a plugin's own page —
            <code> data</code>/<code>setData</code> (its content), <code>node</code>
            (<code>id / title / ext</code>) and <code>api.theme</code> are always available.
            Every plugin is also <b>compatibility-tested</b> on install and on every load:
            manifest validity, supported <code>apiVersion</code>, recognized permissions, and a
            real compile of its code — failures show a report instead of running.</p>
          <p className="docs-p">Full developer reference: <code>docs/PERMISSIONS.md</code> in
            the repository; the source-of-truth registry is <code>PERMISSIONS</code> in
            <code> src/plugins.jsx</code>.</p>

          <H id="persistence">Persistence &amp; privacy</H>
          <ul className="docs-list">
            <li><b>Cookies</b> hold only small pointers — the active workspace (type, name, Drive folder id) and your theme/accent. Never workspace data.</li>
            <li><b>IndexedDB</b> stores the Local folder's directory handle (it can't live in a cookie).</li>
            <li><b>sessionStorage</b> holds the Google Drive OAuth token for the session.</li>
            <li><b>Your content</b> only ever lives in the folder you picked — on your disk, or in your own Drive. Nothing is sent to any third-party server.</li>
          </ul>

          <H id="structure">Project structure</H>
          <table className="docs-table"><thead><tr><th>File</th><th>Responsibility</th></tr></thead><tbody>
            <tr><td><code>index.html</code></td><td>Boot screen and root mount point</td></tr>
            <tr><td><code>vite.config.js</code></td><td>Vite config (vendor chunk splitting)</td></tr>
            <tr><td><code>src/main.jsx</code></td><td>Entry point</td></tr>
            <tr><td><code>src/App.jsx</code></td><td>Restores theme, renders the workspace</td></tr>
            <tr><td><code>src/workspace.jsx</code></td><td>App shell: homepage, sidebar, topbar, modals, routing</td></tr>
            <tr><td><code>src/smart.jsx</code></td><td>The smart (block) page editor, databases and shared primitives</td></tr>
            <tr><td><code>src/markdown.jsx</code></td><td>The simple .md page editor with live preview</td></tr>
            <tr><td><code>src/plugins.jsx</code></td><td>Custom page plugins: loader, permissions, compatibility tests (lazy-loaded)</td></tr>
            <tr><td><code>src/sitepages.jsx</code></td><td>Docs, About and Self-hosting pages (lazy-loaded)</td></tr>
            <tr><td><code>src/markdown.js</code></td><td>Workspace ⇄ folder-of-Markdown serialization (pure)</td></tr>
            <tr><td><code>src/localfs.js</code></td><td>Local folder storage (File System Access API + IndexedDB)</td></tr>
            <tr><td><code>src/cloudstorage.js</code></td><td>Google Drive folder-tree mirror</td></tr>
            <tr><td><code>src/cookies.js</code></td><td>Cookie helpers (active-workspace pointer + theme)</td></tr>
            <tr><td><code>src/styles.css</code></td><td>Theme tokens, components, dark mode</td></tr>
          </tbody></table>

          <H id="stack">Tech stack</H>
          <table className="docs-table"><thead><tr><th>Layer</th><th>Technology</th></tr></thead><tbody>
            <tr><td>Build tool</td><td>Vite 6</td></tr>
            <tr><td>UI</td><td>React 18</td></tr>
            <tr><td>Storage</td><td>File System Access API · Google Drive API</td></tr>
            <tr><td>Frontmatter</td><td>js-yaml</td></tr>
            <tr><td>Icons</td><td>lucide-react</td></tr>
            <tr><td>Import</td><td>mammoth (<code>.docx</code> → blocks)</td></tr>
          </tbody></table>

          <H id="deploy">Deployment</H>
          <p className="docs-p">The built <code>dist/</code> folder is a static site — host it anywhere (Vercel, Netlify,
            GitHub Pages, any static host). To use Google Drive on a deployed site:</p>
          <ol className="docs-list">
            <li>Add the site's origin as an <b>Authorised JavaScript origin</b> on your Google Cloud OAuth client.</li>
            <li>Ensure the <b>Google Drive API</b> is enabled in the project.</li>
            <li>If the OAuth app is in <b>Testing</b>, add your email as a Test User.</li>
          </ol>

          <H id="troubleshooting">Troubleshooting</H>
          <div className="docs-grid2">
            <div className="docs-card"><div className="docs-card-h">“Local folders need Chrome”</div><p>The File System Access API is Chromium-only. Use Chrome/Edge/Brave, or use a Google Drive workspace instead.</p></div>
            <div className="docs-card"><div className="docs-card-h">Drive says “not connected”</div><p>Your session token expired. Click the cloud icon (or Manage workspaces) to reconnect — connecting needs a click because the OAuth popup requires a user gesture.</p></div>
            <div className="docs-card"><div className="docs-card-h">Drive is slow to open</div><p>Reading a Drive workspace makes one network request per file; large workspaces take longer than local ones. This is expected.</p></div>
            <div className="docs-card"><div className="docs-card-h">A local workspace needs access</div><p>Chromium re-asks for folder permission each session — click <b>Reconnect</b> / <b>Open</b> to re-grant.</p></div>
          </div>

          <div className="docs-foot">
            © {new Date().getFullYear()} Workspace · Mohan Viswagna MR ·{' '}
            <a href="https://github.com/MohanViswagnaMR/Workspace" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
      </main>
    </div>
  </div>;
}

/* =========================================================================
   ABOUT & SELF-HOSTING — simple single-column site pages (docs styling)
   ========================================================================= */
function SitePage({tag,onBack,theme,onToggleTheme,children}){
  return <div className="docs-page">
    <div className="docs-top">
      <button className="docs-back" onClick={onBack} title="Back">
        <Ic n="back" style={{width:16,height:16}}/> Back
      </button>
      <div className="docs-top-brand">
        <span className="home-nav-mark">◧</span>
        <span className="home-nav-title">Workspace</span>
        <span className="docs-top-tag">{tag}</span>
      </div>
      <div className="docs-top-actions">
        <a className="home-nav-link home-nav-icon" href="https://github.com/MohanViswagnaMR/Workspace"
          target="_blank" rel="noopener noreferrer" title="View on GitHub" aria-label="View on GitHub">
          <GitHubIcon/>
        </a>
        <button type="button" role="switch" aria-checked={theme==='dark'}
          className={cx('theme-switch',theme==='dark'&&'on')} onClick={onToggleTheme}
          title={theme==='dark'?'Switch to light mode':'Switch to dark mode'}
          aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>
          <Ic n="sun" style={{width:13,height:13}}/>
          <Ic n="moon" style={{width:13,height:13}}/>
          <span className="theme-switch-knob"/>
        </button>
      </div>
    </div>
    <div className="docs-body">
      <main className="docs-main">
        <div className="docs-content">
          {children}
          <div className="docs-foot">
            © {new Date().getFullYear()} Workspace · Mohan Viswagna MR ·{' '}
            <a href="https://github.com/MohanViswagnaMR/Workspace" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
      </main>
    </div>
  </div>;
}

export function AboutPage({onBack,theme,onToggleTheme,onDocs,onSelfHost}){
  return <SitePage tag="About" onBack={onBack} theme={theme} onToggleTheme={onToggleTheme}>
    <div className="docs-hero">
      <h1 className="docs-title">About Workspace</h1>
      <p className="docs-lead">
        A fast, block-based, Notion-style workspace with a simple promise:
        <b> your notes are yours</b> — as plain, readable files, with no account
        and no backend between you and your own words.
      </p>
    </div>

    <h2 className="docs-h2">Why it exists</h2>
    <p className="docs-p">
      Modern note apps are wonderful to write in but keep your work inside their
      own databases, behind their own accounts. If the app changes, breaks, or
      shuts down, your notes go with it. Workspace keeps the writing experience —
      blocks, slash commands, nested pages, databases with views — but stores
      everything as ordinary folders and Markdown files that outlive any app.
    </p>

    <h2 className="docs-h2">The principles</h2>
    <ul className="docs-list">
      <li><b>Files over databases.</b> Every page is a plain <code>.md</code> file with a
        little YAML frontmatter; folders mirror the page hierarchy. No JSON, no
        proprietary formats.</li>
      <li><b>No accounts.</b> There is nothing to sign up for. Your workspace lives in a
        folder on your computer, or — if you choose — a real, browsable folder in your
        own Google Drive.</li>
      <li><b>No lock-in.</b> Stop using the app any day and your notes remain a tidy
        folder of Markdown, readable in any editor, importable anywhere.</li>
      <li><b>Local-first.</b> Installable as an app; local workspaces work fully
        offline. The network is only used for Google Drive, if you connect it.</li>
    </ul>

    <h2 className="docs-h2">What's inside</h2>
    <p className="docs-p">
      A block editor (text, headings, to-dos, lists, toggles, quotes, callouts, code,
      images, files), infinite nested pages, multi-view databases (table, board,
      gallery, list, calendar), instant search, favorites, templates, trash &amp;
      archive, dark mode, and <code>.docx</code> import. See the{' '}
      <button type="button" className="home-demo-link" onClick={onDocs}>full documentation</button>.
    </p>

    <h2 className="docs-h2">Open source &amp; self-hostable</h2>
    <p className="docs-p">
      Workspace is a static site — a Vite + React app with no server of its own. The
      source is on <a href="https://github.com/MohanViswagnaMR/Workspace" target="_blank"
      rel="noopener noreferrer">GitHub</a>, and you can{' '}
      <button type="button" className="home-demo-link" onClick={onSelfHost}>host it yourself</button>{' '}
      on any static host.
    </p>

    <h2 className="docs-h2">Tech</h2>
    <table className="docs-table"><tbody>
      <tr><td>Build tool</td><td>Vite 6</td></tr>
      <tr><td>UI</td><td>React 18</td></tr>
      <tr><td>Storage</td><td>File System Access API · Google Drive API</td></tr>
      <tr><td>Frontmatter</td><td>js-yaml</td></tr>
      <tr><td>Icons</td><td>lucide-react</td></tr>
      <tr><td>Import</td><td>mammoth (<code>.docx</code> → blocks)</td></tr>
    </tbody></table>
  </SitePage>;
}

export function SelfHostPage({onBack,theme,onToggleTheme}){
  return <SitePage tag="Self-hosting" onBack={onBack} theme={theme} onToggleTheme={onToggleTheme}>
    <div className="docs-hero">
      <h1 className="docs-title">Self-hosting Workspace</h1>
      <p className="docs-lead">
        Workspace has no backend — the production build is a folder of static files.
        If you can serve HTML, you can host it: Vercel, Netlify, GitHub Pages, an
        nginx box, a Raspberry Pi.
      </p>
    </div>

    <h2 className="docs-h2">1 · Build</h2>
    <pre className="docs-code"><code>{`git clone https://github.com/MohanViswagnaMR/Workspace.git
cd Workspace
npm install
npm run build     # → static site in dist/`}</code></pre>
    <p className="docs-p">
      That's the whole build. <code>npm run preview</code> serves <code>dist/</code> locally
      so you can check it (including the PWA service worker) before deploying.
    </p>

    <h2 className="docs-h2">2 · Deploy the <code>dist/</code> folder</h2>
    <ul className="docs-list">
      <li><b>Vercel / Netlify</b> — point it at the repo; build command <code>npm run build</code>,
        output directory <code>dist</code>. Nothing else to configure.</li>
      <li><b>GitHub Pages</b> — publish the <code>dist/</code> folder (e.g. with an Actions
        workflow). Prefer a custom domain or user site served from the root — see the
        sub-path note below.</li>
      <li><b>Your own server</b> — copy <code>dist/</code> behind nginx/Apache/Caddy. It's
        static files; no Node process is needed in production. Serve over <b>HTTPS</b> —
        the File System Access API, service worker, and Google sign-in all require a
        secure origin (plain <code>http://localhost</code> is fine for testing).</li>
    </ul>
    <p className="docs-note">
      Local-folder workspaces and the offline PWA work out of the box on any HTTPS
      host — no configuration at all. Google Drive is the only feature that needs setup.
    </p>

    <h2 className="docs-h2">3 · (Optional) Google Drive on your domain</h2>
    <p className="docs-p">
      Drive workspaces use Google's browser OAuth flow with a client ID that is public
      by design (there is no secret). To run it on your own domain:
    </p>
    <ul className="docs-list">
      <li>In <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google
        Cloud Console</a>, create a project and enable the <b>Google Drive API</b>.</li>
      <li>Create an <b>OAuth client ID</b> of type <i>Web application</i> and add your
        site's origin (e.g. <code>https://notes.example.com</code>) as an
        <b> Authorised JavaScript origin</b>.</li>
      <li>Put your client ID in <code>src/cloudstorage.js</code> (the
        <code> GDRIVE_CLIENT_ID</code> constant at the top) and rebuild.</li>
    </ul>
    <p className="docs-p">
      Skip all of this if you only want local-folder workspaces — the Drive option
      simply won't authenticate.
    </p>

    <h2 className="docs-h2">Deploying under a sub-path</h2>
    <p className="docs-p">
      The manifest and service worker assume the site is served from the origin root
      (<code>/</code>). If you deploy under a sub-path (e.g.
      <code> example.com/workspace/</code>), set Vite's <code>base</code> in
      <code> vite.config.js</code> and adjust the paths in
      <code> public/manifest.webmanifest</code>, <code>public/sw.js</code>, and the
      service-worker registration in <code>src/main.jsx</code> to match.
    </p>

    <h2 className="docs-h2">Updating</h2>
    <p className="docs-p">
      Pull the new version, <code>npm run build</code>, redeploy <code>dist/</code>.
      The service worker uses the classic lifecycle: a new version activates once all
      tabs are closed — no forced reloads, and your notes are never touched (they live
      in your folders, not on the site).
    </p>
  </SitePage>;
}
