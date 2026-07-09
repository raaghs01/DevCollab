# Deployment

DevCollab is two services, deployed separately:

- **Next.js app** (repo root) → Vercel. Serverless, can't hold a persistent WebSocket open.
- **Realtime server** (`server/`) → Railway or Fly.io. A long-lived Node process — it owns the y-websocket (Yjs CRDT sync) and Socket.io (presence, terminal broadcast) connections.

They talk to each other over HTTP (the realtime server calls back into the Next.js app's `/api/internal/rooms/[roomId]` route to persist Yjs state) and the browser talks to both directly. Deploy order: realtime server first, then the Next.js app (so you have its URL to hand to Vercel), then circle back and update the realtime server's `CORS_ORIGIN` once you know the Vercel domain.

## 1. Realtime server → Railway or Fly.io

Both use the `Dockerfile` in `server/` as the source of truth for the build — pick one, you don't need both.

### Railway

1. New project → **Deploy from GitHub repo** → select this repo.
2. In the service's Settings, set **Root Directory** to `server`. Railway will pick up `server/railway.json` and `server/Dockerfile` automatically.
3. Set the environment variables below in the service's **Variables** tab.
4. Deploy. Railway gives you a public URL like `https://your-service.up.railway.app`.

### Fly.io

```bash
cd server
fly launch --no-deploy   # first time only — pick/confirm a unique app name, edit fly.toml's `app` field to match
fly secrets set NEXT_INTERNAL_API_URL=https://your-vercel-domain.vercel.app \
  REALTIME_SERVER_INTERNAL_SECRET=<same value you'll set on Vercel> \
  CORS_ORIGIN=https://your-vercel-domain.vercel.app
fly deploy
```

Fly gives you `https://<app>.fly.dev`.

### Environment variables (realtime server)

| Variable | Value |
|---|---|
| `PORT` | `4000` (already set in `fly.toml`; Railway sets its own `PORT` automatically — the app reads whatever's provided) |
| `NEXT_INTERNAL_API_URL` | Your Vercel deployment's URL, e.g. `https://devcollab.vercel.app` |
| `REALTIME_SERVER_INTERNAL_SECRET` | A random secret string — **must match** the same-named variable on Vercel exactly |
| `CORS_ORIGIN` | Your Vercel deployment's URL — restricts who can open Socket.io connections |

## 2. Next.js app → Vercel

1. Import the repo in Vercel. It auto-detects Next.js — no custom build command needed (`npm run build` already runs `prisma generate && next build`).
2. Set the environment variables below in **Project Settings → Environment Variables**.
3. Deploy.

### Environment variables (Next.js app)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your MongoDB connection string, including a database name (`mongodb+srv://user:pass@cluster.mongodb.net/devcollab`) |
| `AUTH_SECRET` | A random secret — generate with `openssl rand -base64 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | From a GitHub OAuth App — callback URL must be `https://your-domain/api/auth/callback/github` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | From a Google OAuth Client — authorized redirect URI must be `https://your-domain/api/auth/callback/google` |
| `NEXTAUTH_URL` | Your production Vercel URL, e.g. `https://devcollab.vercel.app` |
| `NEXT_PUBLIC_WS_URL` | `wss://<realtime-server-domain>/yjs` (note **wss**, not ws, and no trailing room segment) |
| `NEXT_PUBLIC_SOCKET_URL` | `https://<realtime-server-domain>` |
| `REALTIME_SERVER_INTERNAL_SECRET` | Same random secret as set on the realtime server |

**Local dev uses different values for the last three** (`ws://localhost:4000/yjs`, `http://localhost:4000`, `dev-only-shared-secret`) — see `.env.example`. Don't reuse the production secret locally or vice versa.

## 3. After both are live

- Update the GitHub OAuth App's and Google OAuth Client's callback URLs to the real Vercel domain (they can only point at one place at a time for GitHub; Google supports multiple redirect URIs if you want local + prod configured simultaneously).
- Circle back to the realtime server's `CORS_ORIGIN` and confirm it's the exact Vercel domain (not `*`) — it gates who can open a Socket.io connection.
- Smoke test: open the deployed app in a Chromium browser (Chrome/Edge/Brave — WebContainers don't run in Firefox/Safari, see the in-app compatibility banner), sign in, create a playground, and confirm the sidebar shows you as connected. Then open the same room in a second browser/incognito window and confirm edits sync both ways.

## Notes

- The realtime server has **no built-in horizontal scaling** — Yjs room state and Socket.io presence both live in that single process's memory. Running multiple instances behind a load balancer would split rooms across instances inconsistently. One instance is fine for the target scale (PRD: max 8 concurrent users per room); revisit if you need more capacity.
- `server/.dockerignore` excludes `.env` from the image — the container only ever sees variables injected by the platform (Railway/Fly secrets), never a committed file.
