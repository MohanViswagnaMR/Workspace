/* =========================================================================
   welcome.jsx — the public landing for first-time visitors
   -------------------------------------------------------------------------
   Shown when there is no workspace data in this browser yet. Centered hero
   with a CSS-drawn product shot below it (the 2025 dev-tool landing page
   pattern: bold headline → supporting visual → focused feature grid), then
   the plugins/themes spotlight and the "your data is just files" section.
   "Get Started" leads to the start page (pages/start.jsx). Shares the site
   navbar/footer chrome with the start page via components/Navbar.jsx.
   ========================================================================= */
import React from 'react';
import { Ic } from '../views/smart.jsx';
import { SiteNavbar, SiteFooter } from '../components/Navbar.jsx';

const FEATURES=[
  ['🧱','Block editor','Headings, to-dos, toggles, callouts, quotes, code, images and files — type / for everything.'],
  ['📊','Smart tables','Multi-view databases — table, board, gallery, list and calendar — where every row is a page.'],
  ['🗂️','Nested pages & folders','Infinite hierarchy, mirrored as real nested folders on disk. Favorites, search, trash & archive.'],
  ['📄','Any file is a page','Drop in .py, .csv, .html… — each opens as a full page with a handler you choose per file type.'],
  ['🧩','Plugins','VS Code-style extensions: custom page types, file handlers and themes today — layouts, icons & more planned.'],
  ['🎨','Themes','Seven accent colors, Google Fonts by name, dark mode — plus CSS theme plugins like the built-in Sepia.'],
  ['⌨️','Code layout','Developer mode adds a VS Code-style layout: file explorer, tabs and a real terminal via a local bridge.'],
  ['⚡','Installable & offline','A PWA you can install on desktop or phone; local workspaces work fully offline.'],
];
const CHIPS=['Guided setup','Templates','GitHub template repos','Offline spell-check',
  'Instant search','.docx import','Word counts','Keyboard shortcuts'];

export default function WelcomePage({onGetStarted,onDemo,onDocs,onAbout,onSelfHost,onPlugins,theme,onToggleTheme,accent,onAccent}){
  return <div className="home-screen welcome-page has-fixed-foot">
    <div className="home-aurora" aria-hidden="true">
      <span className="orb o1"/><span className="orb o2"/><span className="orb o3"/><span className="orb o4"/>
      <span className="home-grid"/>
    </div>
    <SiteNavbar links={[
      {label:'About',onClick:onAbout},
      {label:'Self-hosting',onClick:onSelfHost},
      {label:'Docs',onClick:onDocs},
      {label:'Plugins',onClick:onPlugins},
    ]}/>
    <div className="welcome-inner">
      <section className="wl-hero">
        <div className="wl-badge home-rise" style={{animationDelay:'30ms'}}>
          <span className="wl-badge-dot"/> New in v3 — plugins, themes &amp; the Code layout
        </div>
        <h1 className="wl-title home-rise" style={{animationDelay:'60ms'}}>
          Notes, docs &amp; databases.<br/>
          Saved as plain <span className="grad">Markdown files</span>.
        </h1>
        <p className="wl-sub home-rise" style={{animationDelay:'120ms'}}>
          A free, open-source, Notion-style workspace with no accounts and no backend.
          Everything lives in ordinary folders and <code>.md</code> files — on your computer
          or in your own Google Drive — readable forever, even without this app.
        </p>
        <div className="wl-actions home-rise" style={{animationDelay:'170ms'}}>
          <button type="button" className="btn-demo" onClick={onGetStarted}>
            Get Started <Ic n="fwd" style={{width:16,height:16}}/>
          </button>
          <button type="button" className="btn-demo-ghost" onClick={onDemo}>
            <Ic n="play" style={{width:15,height:15}}/> Try the demo
          </button>
        </div>
        <div className="wl-hint home-rise" style={{animationDelay:'200ms'}}>
          The demo runs right here in your browser — no sign-up, nothing saved until you keep it.
        </div>
      </section>

      {/* CSS product shot — a stylized app window, no image assets */}
      <section className="wl-mock home-rise" style={{animationDelay:'240ms'}} aria-hidden="true">
        <div className="wl-mock-bar">
          <span className="wl-dot r"/><span className="wl-dot y"/><span className="wl-dot g"/>
          <span className="wl-mock-title">◧ My Workspace</span>
        </div>
        <div className="wl-mock-body">
          <div className="wl-mock-side">
            <div className="wl-mock-nav"><span>＋</span> New page</div>
            {[['📓','Getting Started',1],['✅','Tasks',0],['📊','Roadmap',0],['🗂️','Projects',0],['🐍','hello.py',0]]
              .map(([ic,t,on])=><div key={t} className={'wl-mock-item'+(on?' on':'')}>
                <span>{ic}</span>{t}</div>)}
          </div>
          <div className="wl-mock-main">
            <div className="wl-mock-h1">📓 Getting Started</div>
            <div className="wl-mock-callout">💡 Type <b>/</b> to insert any block</div>
            <div className="wl-mock-todo"><span className="wl-mock-check">✓</span> Create your first page</div>
            <div className="wl-mock-todo"><span className="wl-mock-check off"/> Enable the Sepia theme</div>
            <div className="wl-mock-lines"><i style={{width:'82%'}}/><i style={{width:'64%'}}/><i style={{width:'71%'}}/></div>
          </div>
        </div>
      </section>

      <section className="home-feats wl-feats home-rise" style={{animationDelay:'280ms'}}>
        {FEATURES.map(([ic,t,s])=><div className="home-feat" key={t}>
          <span className="home-feat-ic">{ic}</span>
          <span className="home-feat-t">{t}</span>
          <span className="home-feat-s">{s}</span>
        </div>)}
      </section>
      <div className="wl-chips home-rise" style={{animationDelay:'300ms'}}>
        {CHIPS.map(c=><span className="wl-chip" key={c}>{c}</span>)}
      </div>

      {/* plugins & themes spotlight */}
      <section className="wl-plug home-rise" style={{animationDelay:'320ms'}}>
        <div className="wl-files-copy">
          <h2 className="wl-h2">Extend it like an editor.</h2>
          <p className="wl-p">
            Plugins are plain folders inside your workspace — a <code>manifest.json</code> and
            a bit of JSX or CSS. A <b>page</b> plugin adds a custom page type or opens a file
            format; a <b>theme</b> plugin re-skins the whole app. Install from any public
            GitHub repo, and nothing runs until you review and enable it.
          </p>
          <p className="wl-p">
            <span className="cb-type-badge">page</span>{' '}
            <span className="cb-type-badge">theme</span>{' '}
            <span className="wl-plug-planned">layouts · icons · syntax · components — planned</span>
          </p>
        </div>
        <pre className="wl-tree"><code>{`plugins/kanban/
├── manifest.json     { "type": "page", … }
└── page.jsx          your React component

plugins/sepia/
├── manifest.json     { "type": "theme", … }
└── theme.css         restyles the whole app`}</code></pre>
      </section>

      <section className="wl-files home-rise" style={{animationDelay:'340ms'}}>
        <div className="wl-files-copy">
          <h2 className="wl-h2">Your data is just files.</h2>
          <p className="wl-p">
            Each workspace is a self-describing folder tree: pages with children become
            folders, leaf pages are single <code>.md</code> files, and metadata lives in a
            little YAML frontmatter. There is <b>no JSON</b> anywhere in your data — open
            it in any editor, sync it with any tool, keep it forever.
          </p>
          <p className="wl-p">
            Curious how it works? Read the <button type="button" className="home-demo-link"
              onClick={onDocs}>documentation</button> or learn about{' '}
            <button type="button" className="home-demo-link" onClick={onSelfHost}>hosting it yourself</button>.
          </p>
        </div>
        <pre className="wl-tree"><code>{`My Workspace/
├── Upload/            images & attachments
├── plugins/           your plugins (optional)
└── Space/             all top-level pages
    ├── Meeting Notes.md
    ├── hello.py
    └── Homework/
        ├── master page.md
        ├── Essay.md
        └── Math/
            └── Problem set 1.md`}</code></pre>
      </section>

    </div>
    <SiteFooter theme={theme} onToggleTheme={onToggleTheme}
      accent={accent} onAccent={onAccent} delay="360ms"/>
  </div>;
}
