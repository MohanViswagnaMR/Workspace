# Workspace terminal bridge

The Workspace app has no backend, so its code-layout **terminal** can't reach
your machine's shell by itself. This tiny Docker image is the opt-in bridge:
it runs a WebSocket → PTY server on `127.0.0.1:4517`; when it's running, the
app's terminal is a real shell — when it isn't, the app shows
**"No terminal connected."**

## Run it

```bash
# from the repository root, once:
docker build -t workspace-terminal docker/terminal-bridge

# every time you want a terminal (run it FROM your workspace folder):
docker run --rm -p 127.0.0.1:4517:4517 -v "$PWD:/workspace" workspace-terminal
```

The shell runs **inside the container**, starting in `/workspace` — which is
whatever folder you mounted with `-v`. Mount your Workspace data folder to
work on your real notes; mount nothing and you get a clean sandbox.

## Using it with a deployed site

Your hosted app (say `https://workspace.example.com`) connects to the bridge
on **the machine whose browser is open** — each user runs their own bridge;
nobody reaches anyone else's. Allow your site's origin when starting it:

```bash
docker run --rm -p 127.0.0.1:4517:4517 -v "$PWD:/workspace" \
  -e BRIDGE_ORIGINS="https://workspace.example.com" workspace-terminal
```

Works in Chrome, Edge and Firefox (loopback is exempt from mixed-content
blocking). Safari blocks `ws://localhost` from HTTPS pages.

## Security notes

- The bridge only accepts WebSocket connections from allowed **origins**
  (local dev by default + whatever you pass in `BRIDGE_ORIGINS`) — so a
  random website you have open in another tab can't grab a shell.

- Always publish with `-p 127.0.0.1:4517:4517` (not `-p 4517:4517`): whoever
  can reach the port gets a shell in the container, including everything you
  mounted.
- Any local website could try to connect to the port while the bridge runs —
  only run it while you're using the terminal, and mount only what you need.
- HTTPS-hosted deployments: Chrome allows a secure page to reach
  `ws://127.0.0.1`; Firefox blocks it (use localhost/Chrome, or put the
  bridge behind TLS).

## Options

| Env / flag | Meaning | Default |
| --- | --- | --- |
| `-e PORT=…` + matching `-p` | bridge port | `4517` |
| `-e BRIDGE_SHELL=zsh` | shell to spawn (must exist in image) | `bash` |
| `-v <dir>:/workspace` | folder the shell starts in | empty dir |
