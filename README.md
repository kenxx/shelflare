# shelflare

A shell script hosting platform built on Cloudflare Workers. Store scripts in KV and execute them anywhere with a single `curl` command.

```bash
curl https://your-worker.workers.dev/install | sh
```

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kenxx/shelflare)

## Features

- **One-liner execution** — scripts are served as plain text, pipe directly into `sh` or `bash`
- **Querystring parameter injection** — pass variables at runtime without modifying scripts
- **AI assistant** — write, edit, and create scripts through a chat interface powered by DeepSeek
- **Diff review** — AI edits are saved as drafts; review the diff before accepting changes
- **Web dashboard** — manage all scripts from a browser at `/_dash`

## Deploy

### 1. Prerequisites

- [Node.js](https://nodejs.org) + [pnpm](https://pnpm.io)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm i -g wrangler`)
- A Cloudflare account

### 2. Clone and install

```bash
git clone https://github.com/kenxx/shelflare
cd shelflare
pnpm install
cd frontend && pnpm install && cd ..
```

### 3. Create a KV namespace

```bash
wrangler kv namespace create SCRIPTS
# copy the returned id into wrangler.jsonc → kv_namespaces[0].id

wrangler kv namespace create SCRIPTS --preview
# copy the returned id into wrangler.jsonc → kv_namespaces[0].preview_id
```

### 4. Set secrets

```bash
wrangler secret put ADMIN_PASSWORD    # dashboard login password
wrangler secret put DEEPSEEK_API_KEY  # from platform.deepseek.com
```

`ADMIN_USERNAME` defaults to `admin` and can be overridden in `wrangler.jsonc` under `vars`.

### 5. Deploy

```bash
pnpm deploy
```

This builds the frontend and deploys everything to Cloudflare Workers in one step.

## Development

```bash
# start the Worker (backend)
pnpm dev

# start the frontend (in a separate terminal)
pnpm dev:frontend
```

The frontend dev server proxies `/_api` to `http://localhost:8787`.

## Usage

### Running a script

```bash
curl https://your-worker.workers.dev/<key> | sh
```

### Passing parameters

Variables can be injected via querystring. The Worker inserts them as `export VAR='value'` statements right after the shebang line.

```bash
curl "https://your-worker.workers.dev/install?VERSION=2.1.0&ENV=staging" | sh
```

Inside the script, use `${VAR:-default}` to provide fallbacks:

```bash
#!/usr/bin/env bash
# Parameters:
#   VERSION  - version to install (default: latest)
#   ENV      - target environment (default: production)
set -euo pipefail

VERSION="${VERSION:-latest}"
ENV="${ENV:-production}"

echo "Installing version $VERSION for $ENV..."
```

Variable names must be valid shell identifiers (letters/underscore first, then letters/numbers/underscore).

### Dashboard

Visit `/_dash` in a browser to manage scripts. Log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

**Script list (left panel)**
- Click a script to select and preview it
- Click the pencil icon or the script name in the middle panel to edit inline
- Click `+` to create a new script
- Hover a script to reveal delete (with confirmation)

**Script panel (middle)**
- Selected script shown in read-only CodeMirror editor
- When editing: full editable editor, Save / Cancel at the top
- When AI modifies a script: side-by-side diff view with Accept / Reject

**AI chat (right panel)**
- Chat freely — no script selection required
- Ask the AI to create scripts from scratch or modify the currently selected one
- AI edits on an existing script are saved as a draft (`unsaved:<key>`) until accepted

## Project structure

```
src/
  index.ts          # Hono app entry, mounts routes
  routes/
    api.ts          # REST API: auth, scripts CRUD, unsaved drafts
    chat.ts         # AI chat: streaming + tool calling (DeepSeek)
    serve.ts        # Script serving with querystring injection
    proxy.ts        # URL proxy (/_proxy/:url)
  lib/
    kv.ts           # KV helpers with index tracking
    jwt.ts          # HS256 JWT sign/verify
  middleware.ts     # requireAuth middleware
  types.ts          # Cloudflare bindings type

frontend/           # React + Vite + Tailwind + shadcn/ui
  src/
    pages/
      Dashboard.tsx # Three-column main UI
      Login.tsx
      Home.tsx
    components/
      ScriptPanel.tsx   # CodeMirror editor + MergeView diff
    lib/
      api.ts            # Typed fetch wrapper
      chatRuntime.ts    # assistant-ui adapter (SSE streaming)
```

## API reference

All endpoints under `/_api/` require `Authorization: Bearer <token>` except `/login`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/_api/login` | Get JWT token |
| `POST` | `/_api/logout` | Invalidate session (client-side) |
| `GET` | `/_api/me` | Check auth status |
| `GET` | `/_api/scripts` | List all script keys |
| `GET` | `/_api/scripts/:key` | Get script content |
| `POST` | `/_api/scripts` | Create new script |
| `PUT` | `/_api/scripts/:key` | Update script content |
| `DELETE` | `/_api/scripts/:key` | Delete script |
| `GET` | `/_api/unsaved/:key` | Get AI draft (pending review) |
| `DELETE` | `/_api/unsaved/:key` | Discard AI draft |
| `POST` | `/_api/chat` | AI chat (SSE stream) |

### `POST /_api/chat`

```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "context": { "key": "install", "content": "#!/bin/bash..." }
}
```

`context` is optional. When provided and the AI modifies that script, the change is saved as a draft instead of overwriting the original.

## License

MIT
