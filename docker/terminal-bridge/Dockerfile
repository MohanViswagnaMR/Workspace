# Workspace terminal bridge — a local WebSocket→PTY server the app's
# code-layout terminal connects to. Build & run:
#
#   docker build -t workspace-terminal docker/terminal-bridge
#   docker run --rm -p 127.0.0.1:4517:4517 -v "$PWD:/workspace" workspace-terminal
#
# Publish on 127.0.0.1 ONLY (as above) — anyone who can reach the port gets
# a shell inside this container, including whatever you mounted.
FROM node:20-slim

# node-pty is a native module — it needs a toolchain to build
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
      git curl nano less procps ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /bridge
RUN npm install --omit=dev ws@8 node-pty@1 \
 && apt-get purge -y python3 make g++ 2>/dev/null; true
COPY server.js .

RUN mkdir -p /workspace
WORKDIR /workspace

EXPOSE 4517
CMD ["node", "/bridge/server.js"]
