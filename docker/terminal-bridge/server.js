/* =========================================================================
   Workspace terminal bridge
   -------------------------------------------------------------------------
   A tiny WebSocket → PTY bridge the Workspace app's code-layout terminal
   connects to. Runs in a Docker container on the USER'S machine — the app
   itself has no backend and no shell access; without this bridge running,
   the app simply shows "No terminal connected".

   Protocol (JSON text frames from the client):
     { t: 'i', d: '<input>' }            keystrokes → the pty
     { t: 'r', cols: 120, rows: 30 }     terminal resize
   Server → client frames are raw UTF-8 pty output.

   The shell runs INSIDE the container. Mount the folder you want it to see:
     docker run --rm -p 127.0.0.1:4517:4517 -v "$PWD:/workspace" workspace-terminal
   ========================================================================= */
const { WebSocketServer } = require('ws');
const pty = require('node-pty');

const PORT = Number(process.env.PORT || 4517);
const SHELL = process.env.BRIDGE_SHELL || 'bash';
const CWD = '/workspace';

/* Browser pages send an Origin header on WebSocket connects — only the
   origins listed here get a shell. Defaults cover local development; add
   your deployed site with:
     -e BRIDGE_ORIGINS="https://workspace.example.com"
   (comma-separated; "*" disables the check — not recommended). */
const DEFAULT_ORIGINS = [
  'http://localhost:5173', 'http://127.0.0.1:5173',   // vite dev
  'http://localhost:4173', 'http://127.0.0.1:4173',   // vite preview
];
const ORIGINS = (process.env.BRIDGE_ORIGINS || '')
  .split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean)
  .concat(DEFAULT_ORIGINS);

const wss = new WebSocketServer({
  host: '0.0.0.0', port: PORT,
  verifyClient: ({ origin }, cb) => {
    const ok = ORIGINS.includes('*') || ORIGINS.includes((origin || '').replace(/\/+$/, ''));
    if (!ok) console.log(`[bridge] REJECTED origin: ${origin || '(none)'} — allow it with BRIDGE_ORIGINS`);
    cb(ok, 403, 'origin not allowed');
  },
});

wss.on('connection', (ws, req) => {
  console.log(`[bridge] session from ${req.socket.remoteAddress}`);
  const shell = pty.spawn(SHELL, [], {
    name: 'xterm-256color',
    cols: 80, rows: 24,
    cwd: CWD,
    env: { ...process.env, TERM: 'xterm-256color' },
  });
  shell.onData(d => { if (ws.readyState === 1) ws.send(d); });
  shell.onExit(({ exitCode }) => {
    if (ws.readyState === 1) { ws.send(`\r\n[shell exited: ${exitCode}]\r\n`); ws.close(); }
  });
  ws.on('message', m => {
    let j;
    try { j = JSON.parse(m.toString()); } catch (_) { return; }
    if (j.t === 'i' && typeof j.d === 'string') shell.write(j.d);
    else if (j.t === 'r' && j.cols > 0 && j.rows > 0) shell.resize(j.cols | 0, j.rows | 0);
  });
  ws.on('close', () => { console.log('[bridge] session closed'); shell.kill(); });
});

console.log(`[bridge] Workspace terminal bridge listening on :${PORT} (shell: ${SHELL}, cwd: ${CWD})`);
