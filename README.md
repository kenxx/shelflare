# shelflare

A shell script hosting platform built on Cloudflare Workers. Store script metadata and chat history in D1, script bodies in R2, and execute scripts anywhere with a single `curl` command.

```bash
curl https://your-worker.workers.dev/install | sh
```

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kenxx/shelflare)

> **Workers Builds setup** — when prompted for build settings, use:
> - **Build command**: `pnpm install && pnpm build`
> - **Deploy command**: `npx wrangler deploy --minify`

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
```

### 3. Create D1 and R2 storage

```bash
wrangler d1 create shelflare-db
# optional: copy the returned database_id into wrangler.jsonc → d1_databases[0].database_id

wrangler r2 bucket create shelflare-scripts

pnpm db:migrate:remote
```

### 4. Set secrets

```bash
wrangler secret put JWT_SECRET        # random JWT signing secret
wrangler secret put DEEPSEEK_API_KEY  # from platform.deepseek.com
```

When the users table is empty, the first successful dashboard login creates the first admin user with the submitted username and password. Further users are managed from the dashboard.

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

Visit `/_dash` in a browser to manage scripts. On an empty database, the first login creates the first admin user.

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
- AI edits on an existing script are saved as a D1 draft until accepted
- Chat threads and messages are persisted in D1

## Project structure

```
src/
  db/
    schema.ts       # Drizzle schema for D1
  index.ts          # Hono app entry, mounts routes
  routes/
    api.ts          # REST API: auth, scripts CRUD, drafts
    chat.ts         # AI chat: AI SDK streaming + tool calling
    threads.ts      # Chat thread APIs
    users.ts        # Admin user management APIs
    serve.ts        # Script serving with querystring injection
    proxy.ts        # URL proxy (/_proxy/:url)
  lib/
    jwt.ts          # HS256 JWT sign/verify
    password.ts     # PBKDF2 password hashing
    scripts-store.ts # D1 metadata + R2 script content helper
    chat-store.ts   # D1 chat persistence helper
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
```

## API reference

All endpoints under `/_api/` require `Authorization: Bearer <token>` except `/login`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/_api/login` | Get JWT token |
| `POST` | `/_api/logout` | Invalidate session (client-side) |
| `GET` | `/_api/me` | Check auth status |
| `GET` | `/_api/users` | List users (admin only) |
| `POST` | `/_api/users` | Create user (admin only) |
| `PUT` | `/_api/users/:id` | Update user (admin only) |
| `GET` | `/_api/scripts` | List all script keys |
| `GET` | `/_api/scripts/:key` | Get script content |
| `POST` | `/_api/scripts` | Create new script |
| `PUT` | `/_api/scripts/:key` | Update script content |
| `DELETE` | `/_api/scripts/:key` | Delete script |
| `GET` | `/_api/unsaved/:key` | Get AI draft (pending review) |
| `DELETE` | `/_api/unsaved/:key` | Discard AI draft |
| `GET` | `/_api/threads` | List chat threads |
| `POST` | `/_api/threads` | Create chat thread |
| `GET` | `/_api/threads/:id/messages` | Get thread messages |
| `PUT` | `/_api/threads/:id` | Update thread metadata |
| `DELETE` | `/_api/threads/:id` | Archive thread |
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
