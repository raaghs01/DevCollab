# DevCollab — Product Requirements Document

**Version:** 1.0  
**Date:** June 17, 2026  
**Status:** Draft  
**Team:** Group Project (4 contributors)

---

## 1. Executive Summary

DevCollab is a browser-based collaborative IDE that lets multiple developers write, execute, and debug code together in real-time — with no local setup required. It combines a VS Code-quality editor (Monaco), in-browser code execution (WebContainers), AI-powered inline completions, and real-time collaborative editing (Yjs CRDT) into a single platform.

The core differentiator against the dozens of existing open-source collaborative editors is the **full-stack integration of all three layers**: editor sync (collaborative cursors and edits), runtime sync (shared terminal output and live preview), and AI awareness (completions that understand the collaborative context). Most existing projects handle only one or two of these.

**Target users:** Developers doing pair programming, technical interviewers conducting live coding rounds, educators running coding workshops, and hackathon teams prototyping together.

---

## 2. Problem Statement

Remote pair programming today forces developers into one of two bad choices:

1. **Screen sharing** (Zoom/Meet) — one person drives, the other watches passively. No concurrent editing. High latency. The viewer can't jump in and fix something.
2. **Cloud IDEs** (Replit, CodeSandbox) — expensive at scale, proprietary, and the collaboration features are either limited (Replit caps at 4 users) or locked behind enterprise tiers.

Open-source alternatives on GitHub are fragmented — they either sync the editor without running the code, or run the code without real-time collab. None integrate AI completions into the collaborative flow. DevCollab solves this by combining all three in a single open-source platform that runs entirely in the browser.

---

## 3. Goals and Non-Goals

### 3.1 Goals

- **G1:** Two or more users can simultaneously edit the same codebase in a shared playground, seeing each other's cursors and edits in real-time with sub-100ms sync latency.
- **G2:** Code written in the editor executes in the browser via WebContainers — no backend server required for running user code. `npm install`, dev servers, and terminal output all work inside the browser tab.
- **G3:** AI inline suggestions appear as users type (after `.`, `{`, `=`, `(`, newline), and can be accepted with Tab or dismissed with Escape — functioning like a lightweight Copilot.
- **G4:** Users can create playgrounds from templates (React, Next.js, Express, Vue, Hono, Angular) or import an existing GitHub repository.
- **G5:** The collaborative file tree supports multi-file projects — users can create, rename, and delete files collaboratively without conflicts.
- **G6:** Terminal output and live preview iframe are shared across all collaborators in a room.

### 3.2 Non-Goals (v1)

- **NG1:** Video/audio chat — out of scope; users will use their own communication tool alongside DevCollab.
- **NG2:** Git integration within the IDE — no commit/push/pull from the editor. Users export code manually or via the GitHub import feature.
- **NG3:** Supporting languages that don't run on Node.js (Python, Java, C++) — WebContainers only support JavaScript/TypeScript runtimes. Adding Docker-based execution is a v2 consideration.
- **NG4:** Mobile-responsive editor — Monaco doesn't work well on mobile. Desktop browsers only.
- **NG5:** Persistent long-running servers — WebContainers are ephemeral. When all users leave a room, the runtime state is lost (code is persisted in MongoDB, but the running process is not).
- **NG6:** End-to-end encryption of code — code is transmitted in plaintext over WebSocket. Security hardening is a v2 concern.

---

## 4. User Personas

### 4.1 Pair Programmers — Arjun & Priya

Two developers at a startup working on a React feature. Arjun is in Delhi, Priya is in Bangalore. They want to work on the same component simultaneously — Arjun writing the logic, Priya writing the styles — and see the live preview update in real-time for both of them.

**Needs:** Low-latency sync, shared preview, file-level ownership visibility.

### 4.2 Technical Interviewer — Sneha

A hiring manager who wants candidates to write code in a real environment (not a whiteboard). She creates a playground from a React template, shares the link with the candidate, and watches them build a component live. She can jump in and type hints or fix syntax.

**Needs:** One-click room creation, shareable link, no signup required for guests.

### 4.3 Workshop Instructor — Vikram

A bootcamp instructor teaching 20 students. He sets up a playground with starter code, shares the room, and students can follow along by viewing his edits in real-time. Advanced students can fork the playground into their own sandbox.

**Needs:** Read-only spectator mode, fork-to-own-sandbox, template-based setup.

---

## 5. Technical Architecture

### 5.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                     │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Monaco Editor │  │ WebContainer │  │  Yjs CRDT Doc │  │
│  │  + AI Inline  │  │  (Node.js)   │  │  + Awareness  │  │
│  │  Completions  │  │  + Terminal  │  │  + y-monaco   │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                  │                  │          │
│         └──────────────────┼──────────────────┘          │
│                            │                             │
│                     ┌──────┴──────┐                      │
│                     │  Sync Layer │                      │
│                     └──────┬──────┘                      │
└────────────────────────────┼─────────────────────────────┘
                             │ WebSocket
                             │
┌────────────────────────────┼─────────────────────────────┐
│                      SERVER (Node.js)                     │
│                                                           │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  y-websocket   │  │  Socket.io   │  │   Next.js    │  │
│  │  (CRDT Sync)   │  │ (Room Mgmt,  │  │   API Routes │  │
│  │                │  │  Terminal,   │  │              │  │
│  │                │  │  Preview)    │  │              │  │
│  └────────────────┘  └──────────────┘  └──────┬───────┘  │
│                                               │          │
│                                        ┌──────┴───────┐  │
│                                        │   Prisma +   │  │
│                                        │   MongoDB    │  │
│                                        └──────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### 5.2 Technology Stack

| Layer | Technology | Justification |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR, API routes, file-based routing in one codebase |
| Language | TypeScript | Type safety across client and server |
| Editor | Monaco Editor (`@monaco-editor/react`) | VS Code engine; inline completion provider API |
| Code Execution | `@webcontainer/api` | In-browser Node.js; no backend execution server needed |
| Real-time Sync (Editor) | Yjs + y-monaco + y-websocket | CRDT-based conflict-free merging; proven Monaco binding |
| Real-time Sync (Room/Meta) | Socket.io | Room management, terminal broadcast, presence beyond Yjs awareness |
| AI Completions | `/api/code-completion` route → LLM API | Custom inline suggestion provider for Monaco |
| Database | MongoDB + Prisma ORM | Flexible schema for playground file trees stored as JSON |
| Auth | NextAuth.js (GitHub OAuth) | One-click login; GitHub identity for repo imports |
| Styling | Tailwind CSS | Utility-first, fast iteration |
| Deployment | Vercel (frontend) + Railway/Fly.io (WebSocket server) | Vercel doesn't support persistent WebSocket; WS server deployed separately |

### 5.3 Data Model (Prisma Schema)

```prisma
model User {
  id          String       @id @default(auto()) @map("_id") @db.ObjectId
  name        String
  email       String       @unique
  avatarUrl   String?
  githubId    String       @unique
  playgrounds Playground[]
  createdAt   DateTime     @default(now())
}

model Playground {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  title       String
  template    String   // "react" | "nextjs" | "express" | "vue" | "hono" | "angular"
  files       Json     // { "src/App.tsx": { content: "...", language: "typescript" }, ... }
  owner       User     @relation(fields: [ownerId], references: [id])
  ownerId     String   @db.ObjectId
  roomId      String   @unique @default(uuid())  // shareable room identifier
  isPublic    Boolean  @default(false)
  lastSavedAt DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Room {
  id             String   @id @default(auto()) @map("_id") @db.ObjectId
  roomId         String   @unique  // matches Playground.roomId
  activeUsers    Json     // [{ userId, name, color, cursorPosition }]
  yjsState       Bytes?   // persisted Yjs document state for reconnection
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

### 5.4 System Communication Flow

**User A creates a playground and shares the room link:**

1. User A hits "New Playground" → selects React template → `POST /api/playgrounds` creates the record with starter files in MongoDB.
2. Frontend boots WebContainer, mounts the file tree from `playground.files`, runs `npm install`, starts dev server.
3. Yjs document is initialized with the file contents. `y-websocket` provider connects to the WebSocket server with `roomId`.
4. User A copies the room URL (`/playground/{roomId}`) and sends it to User B.

**User B joins the room:**

5. User B opens the link → frontend fetches playground metadata via `GET /api/playgrounds/{roomId}`.
6. Yjs provider connects to the same `roomId` on the WebSocket server. The Yjs CRDT state syncs automatically — User B's Monaco editor shows the current document state.
7. Socket.io connection joins the same room for terminal output and preview URL broadcasting.
8. User B's WebContainer boots independently and mounts the synced file tree.

**Both users edit simultaneously:**

9. User A types in `App.tsx`. The Yjs `y-monaco` binding captures the edit as a CRDT operation and broadcasts it via `y-websocket`.
10. User B's editor receives the operation and applies it — the text appears at User A's cursor position. User A's cursor is visible to User B via Yjs Awareness protocol.
11. Both users' WebContainers detect the file change (via a sync watcher) and hot-reload the dev server. Both preview iframes update.
12. AI completion triggers fire independently per user — each user gets their own inline suggestions based on their cursor context.

---

## 6. Feature Specifications

### 6.1 F1 — Playground Management (CRUD)

**Description:** Users can create, open, rename, duplicate, and delete playgrounds from a dashboard.

**Requirements:**

- F1.1: Dashboard lists all playgrounds owned by the authenticated user, sorted by `updatedAt` descending.
- F1.2: "New Playground" modal presents template options (React, Next.js, Express, Vue, Hono, Angular) with preview thumbnails.
- F1.3: Each template defines a starter file tree (e.g., React template includes `package.json`, `src/App.tsx`, `src/index.tsx`, `public/index.html`).
- F1.4: Playground titles are editable inline from the editor header.
- F1.5: Deleting a playground requires confirmation and is a soft delete (marked as deleted, purged after 30 days).

**Acceptance criteria:** A user can go from zero to a running React app in the browser in under 10 seconds (excluding WebContainer boot time).

---

### 6.2 F2 — Monaco Editor Integration

**Description:** The code editor provides a VS Code-quality editing experience with syntax highlighting, IntelliSense, multi-file tabs, and keyboard shortcuts.

**Requirements:**

- F2.1: Monaco editor instance with `vs-dark` theme as default, switchable to light theme.
- F2.2: Language detection from file extension (`.tsx` → TypeScript React, `.css` → CSS, `.json` → JSON, etc.).
- F2.3: Multi-file tab bar — users click file names in the sidebar tree to open them as tabs. Tabs are closable and reorderable.
- F2.4: Standard keyboard shortcuts work: `Cmd/Ctrl+S` (save to MongoDB), `Cmd/Ctrl+P` (quick file open), `Cmd/Ctrl+Shift+F` (global search).
- F2.5: The editor state (scroll position, cursor, open tabs) is preserved per-user and per-session — if a user refreshes, they return to the same view.

**Edge cases:**

- Opening a binary file (image, font) shows a preview or "binary file" placeholder, not garbled text.
- Files larger than 1MB show a warning before opening in Monaco (performance concern).

---

### 6.3 F3 — WebContainer Runtime

**Description:** Code executes in the browser via `@webcontainer/api`. The user sees a terminal and a live preview iframe.

**Requirements:**

- F3.1: On playground load, WebContainer boots and mounts the file tree from the playground data.
- F3.2: `npm install` runs automatically on first boot. Terminal shows the install output in real-time.
- F3.3: The dev server starts after install completes. The preview iframe loads the dev server URL (WebContainer provides a local URL).
- F3.4: File changes in the editor are written to the WebContainer filesystem via `webcontainerInstance.fs.writeFile()`. Hot module replacement (HMR) picks up changes automatically for supported frameworks.
- F3.5: Terminal panel supports user input (typing commands like `npm run build`, `node script.js`).
- F3.6: Terminal is resizable (drag handle) and togglable (keyboard shortcut `Cmd/Ctrl+``).

**Constraints:**

- WebContainers only run in Chromium-based browsers (Chrome, Edge, Brave). Firefox and Safari are not supported. Display a browser compatibility banner on unsupported browsers.
- Only one WebContainer instance can run per browser tab. Opening two playgrounds requires two tabs.

---

### 6.4 F4 — Real-Time Collaborative Editing (Core Differentiator)

**Description:** Multiple users edit the same playground simultaneously with conflict-free merging, live cursors, and presence awareness.

**Requirements:**

- F4.1: **Yjs CRDT document** — each open file in the playground is represented as a `Y.Text` type within a shared `Y.Map` keyed by file path. Edits from any user merge automatically without conflicts.
- F4.2: **y-monaco binding** — the `MonacoBinding` connects the Yjs `Y.Text` to the Monaco editor model. Edits in Monaco propagate to Yjs, and incoming Yjs updates render in Monaco.
- F4.3: **y-websocket provider** — the WebSocket transport syncs Yjs updates between all clients in the same room. The server persists the latest Yjs state to MongoDB on a debounced interval (every 5 seconds of inactivity).
- F4.4: **Awareness protocol** — each user's cursor position, selection range, display name, and assigned color are broadcast via Yjs Awareness. Other users see labeled cursors in the editor.
- F4.5: **Presence sidebar** — a panel showing all active users in the room with their name, avatar, assigned color, and which file they're currently editing.
- F4.6: **Follow mode** — clicking a user's avatar in the presence sidebar scrolls your editor to their cursor position and follows their navigation (opening the same files they open). Click again to unfollow.
- F4.7: **Collaborative file tree** — file creation, renaming, and deletion are synced via a shared `Y.Map` representing the file tree structure. When User A creates `utils/helpers.ts`, it appears in User B's sidebar immediately.
- F4.8: **Late joiner sync** — when a new user joins a room, the Yjs provider sends the full document state. The new user sees the current content, not the last-saved MongoDB snapshot (which may be stale by seconds).
- F4.9: **Offline resilience** — if a user's WebSocket disconnects temporarily, edits queue locally in the Yjs document. On reconnection, Yjs automatically merges the divergent states.

**Latency target:** Edits should appear on other users' screens within 100ms on the same continent.

**Conflict resolution guarantees:** Yjs CRDT provides eventual consistency — all users converge to the same document state regardless of edit ordering. No manual conflict resolution is ever required.

---

### 6.5 F5 — Shared Terminal and Preview

**Description:** Terminal output and the live preview URL are synchronized across all users in a room.

**Requirements:**

- F5.1: The room owner's WebContainer is the "source of truth" for the running process. Terminal output (stdout/stderr) is broadcast via Socket.io to all room members.
- F5.2: All users see the same terminal output stream. Non-owner users see the terminal in read-only mode by default.
- F5.3: The preview iframe URL is shared — when the dev server starts and provides a URL, it's broadcast to all users. Each user's preview iframe points to the same URL.
- F5.4: **Execution delegation** — since WebContainers run per-browser-tab, only the owner's instance executes code. Other users' file changes are synced to the owner's WebContainer via Yjs, which triggers HMR on the owner's instance, and the shared preview updates for everyone.

**Alternative architecture (considered and deferred):** Each user runs their own WebContainer independently. This avoids the single-point-of-failure on the owner but creates divergence in `node_modules` versions and build state. Deferred to v2 for complexity reasons.

**Fallback:** If the owner disconnects, the system promotes the next-longest-connected user to owner. Their WebContainer becomes the new execution source of truth.

---

### 6.6 F6 — AI Inline Code Completion

**Description:** As users type, AI-powered code suggestions appear inline in the editor, similar to GitHub Copilot.

**Requirements:**

- F6.1: Completions trigger after significant keystrokes: `.` (member access), `{` (block open), `=` (assignment), `(` (function call), and newline.
- F6.2: A debounced request (300ms) is sent to `POST /api/code-completion` with the current file content, cursor position, file language, and the names of other open files (for context).
- F6.3: The AI response is registered as a Monaco `InlineCompletionsProvider`. The suggestion appears as ghost text after the cursor.
- F6.4: `Tab` accepts the suggestion (inserts the text). `Escape` dismisses it. Any other keystroke dismisses and continues normal typing.
- F6.5: Only one completion request is in-flight at a time. If the user types again before the response arrives, the pending request is aborted (`AbortController`) and a new one is sent.
- F6.6: Completions are per-user — each user gets suggestions based on their own cursor context, not their collaborator's.
- F6.7: A toggle in the toolbar lets users disable AI completions entirely.

**API endpoint spec:**

```
POST /api/code-completion
Content-Type: application/json

{
  "fileContent": "import React from 'react';\n\nconst App = () => {\n  return (\n    <div>",
  "cursorLine": 4,
  "cursorColumn": 10,
  "language": "typescriptreact",
  "fileName": "App.tsx",
  "otherFiles": ["index.tsx", "styles.css"]
}

Response:
{
  "suggestion": "\n      <h1>Hello World</h1>\n    </div>\n  );\n};",
  "confidence": 0.85
}
```

**Known bug to fix (from course code):** The `acceptSuggestion` callback in `useAISuggestion.tsx` wraps an inner function that is never invoked — the arrow function `(editor, monaco) => { ... }` is defined inside the `useCallback` but never called. Fix: restructure to use the editor and monaco refs directly in the outer callback.

---

### 6.7 F7 — GitHub Repository Import

**Description:** Users can import an existing GitHub repo into a DevCollab playground.

**Requirements:**

- F7.1: User pastes a GitHub repo URL (e.g., `https://github.com/user/repo`) into an import dialog.
- F7.2: The system fetches the repo contents via the GitHub API (public repos only; private repos require the user's GitHub OAuth token).
- F7.3: The repo file tree is converted to the playground `files` JSON format and stored in MongoDB.
- F7.4: WebContainer mounts the imported file tree and runs `npm install` if a `package.json` is present.
- F7.5: Repos larger than 50MB or with more than 500 files show a warning — performance may degrade in WebContainers.

---

### 6.8 F8 — Authentication and Room Access

**Description:** Users authenticate via GitHub OAuth. Playgrounds can be private or shared via room links.

**Requirements:**

- F8.1: Login via GitHub OAuth (NextAuth.js). No email/password auth.
- F8.2: Authenticated users can create and manage playgrounds.
- F8.3: Guest access: unauthenticated users can join a shared room via the room link and edit collaboratively. Their edits are attributed to "Guest" with a random color. They cannot save or create new playgrounds.
- F8.4: Room links are in the format `/playground/{roomId}`. The `roomId` is a UUID, not guessable.
- F8.5: The playground owner can toggle a room between "private" (only the owner can access) and "shared" (anyone with the link can join).
- F8.6: The owner can kick a user from the room via the presence sidebar.

---

## 7. Work Distribution (4-Person Team)

### Member A — Editor and AI Layer

**Owns:** Monaco integration, AI completions, editor UX.

**Deliverables:**
- `playground-editor.tsx` — Monaco setup, theme, language detection, tab management
- `useAISuggestions.tsx` — completion trigger logic, InlineCompletionsProvider registration, abort handling
- `/api/code-completion` — API route calling the LLM, prompt construction, response parsing
- Editor toolbar (theme toggle, AI toggle, language indicator)
- Keyboard shortcut overrides (`Cmd+S`, `Cmd+P`, etc.)

**Key integration points:** Must expose the Monaco editor instance and model to Member C for Yjs binding.

---

### Member B — WebContainers and Runtime

**Owns:** In-browser code execution, terminal, preview.

**Deliverables:**
- `useWebContainer.tsx` — WebContainer boot, file system mounting, process management
- Terminal component (xterm.js) — stdout/stderr rendering, user input
- Preview iframe — dev server URL detection, hot reload
- File sync watcher — when Yjs updates a file, write it to WebContainer FS
- Template starter file trees (React, Next.js, Express, Vue, Hono, Angular)

**Key integration points:** Must receive file change events from Member C's Yjs layer and write them to the WebContainer FS. Must emit terminal output to Member C's Socket.io layer for broadcasting.

---

### Member C — Real-Time Collaboration (Core Differentiator)

**Owns:** Yjs CRDT, y-monaco binding, y-websocket server, Socket.io room management, presence.

**Deliverables:**
- Yjs document structure — `Y.Map` of file paths to `Y.Text` content
- `y-monaco` binding setup — connecting Yjs to Monaco
- `y-websocket` server — Node.js WebSocket server for CRDT sync
- Awareness provider — cursor positions, user colors, active file tracking
- Presence sidebar component — active users list, follow mode
- Collaborative file tree — shared `Y.Map` for file structure operations
- Socket.io server — room join/leave, terminal output broadcast, preview URL broadcast
- Yjs state persistence — debounced save to MongoDB
- Owner failover logic — promote next user on owner disconnect

**Key integration points:** This member is the integration hub — connects Member A's editor to Member B's runtime via the sync layer.

---

### Member D — Platform, Auth, and Infrastructure

**Owns:** Next.js app shell, database, authentication, deployment, GitHub import.

**Deliverables:**
- Next.js App Router layout — dashboard, playground page, landing page
- Prisma schema and MongoDB setup — User, Playground, Room models
- NextAuth.js — GitHub OAuth flow
- Dashboard page — playground list, create/delete/rename
- `add-repo.tsx` — GitHub repo import via GitHub API
- API routes — `POST /api/playgrounds`, `GET /api/playgrounds/:id`, `PATCH`, `DELETE`
- Guest access logic — unauthenticated users can join rooms but not create playgrounds
- Deployment pipeline — Vercel for Next.js app, Railway/Fly.io for WebSocket server
- Environment variable management, CORS configuration

**Key integration points:** Must define the Prisma schema that Members B and C depend on for playground file trees and room state.

---

## 8. Integration Milestones

The four work streams converge at specific points. These integration milestones are blocking — downstream work cannot proceed until they're resolved.

| Week | Milestone | Members Involved | Deliverable |
|---|---|---|---|
| 1 | Shared Prisma schema finalized | All | `schema.prisma` reviewed and merged |
| 1 | Monaco editor instance exposed as ref | A + C | `editorRef` and `monacoRef` accessible for Yjs binding |
| 2 | Yjs ↔ Monaco binding working in single-user mode | A + C | Typing in Monaco updates `Y.Text`; `Y.Text` changes render in Monaco |
| 2 | WebContainer mounts file tree from DB | B + D | `playground.files` JSON → WebContainer FS mount → dev server running |
| 3 | Yjs ↔ WebContainer file sync | B + C | Yjs file change → `writeFile()` on WebContainer → HMR triggers |
| 3 | Terminal output broadcast via Socket.io | B + C | Owner's terminal output visible to all room members |
| 4 | Full integration test — two users, same room | All | End-to-end: create room, join, edit, see cursors, see preview |

---

## 9. API Specification

### 9.1 REST Endpoints (Next.js API Routes)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/playgrounds` | Required | Create a new playground from a template |
| `GET` | `/api/playgrounds` | Required | List authenticated user's playgrounds |
| `GET` | `/api/playgrounds/:roomId` | Optional | Get playground metadata (guests can view shared rooms) |
| `PATCH` | `/api/playgrounds/:id` | Owner only | Update title, files, isPublic |
| `DELETE` | `/api/playgrounds/:id` | Owner only | Soft-delete a playground |
| `POST` | `/api/code-completion` | Required | Get AI inline completion |
| `POST` | `/api/import-repo` | Required | Import a GitHub repo into a new playground |

### 9.2 WebSocket Events (Socket.io)

**Client → Server:**

| Event | Payload | Description |
|---|---|---|
| `room:join` | `{ roomId, user }` | Join a collaboration room |
| `room:leave` | `{ roomId }` | Leave the room |
| `terminal:input` | `{ roomId, data }` | Send terminal input (owner only) |
| `user:kick` | `{ roomId, targetUserId }` | Owner kicks a user |

**Server → Client:**

| Event | Payload | Description |
|---|---|---|
| `room:users` | `{ users: [...] }` | Updated list of active users in room |
| `room:owner-changed` | `{ newOwnerId }` | New owner promoted after disconnect |
| `terminal:output` | `{ data }` | Terminal stdout/stderr from owner's WebContainer |
| `preview:url` | `{ url }` | Dev server URL for iframe preview |

### 9.3 Yjs Protocol (y-websocket)

The Yjs sync happens over a separate WebSocket connection (not Socket.io) on a dedicated port/path (`/yjs`). The `y-websocket` server handles:

- Document sync (Yjs sync protocol v1)
- Awareness updates (cursor positions, user metadata)
- State persistence (debounced writes of Yjs binary state to MongoDB)

Room identification: the Yjs document name matches the `playground.roomId`.

---

## 10. UI Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: [Logo] [Playground Title (editable)] [Share] [Users ●●]│
├────────────┬─────────────────────────────────────┬───────────────┤
│            │  Tab Bar: [App.tsx] [index.tsx] [+]  │               │
│  File Tree │─────────────────────────────────────│   Preview     │
│            │                                     │   (iframe)    │
│  src/      │                                     │               │
│   App.tsx  │        Monaco Editor                │               │
│   index.tsx│        (with cursors)                │               │
│  package.  │                                     │               │
│  json      │                                     │               │
│            │─────────────────────────────────────│               │
│  [+] New   │  Terminal (xterm.js)                │               │
│            │  $ npm start                        │               │
│            │  > ready on port 3000               │               │
├────────────┴─────────────────────────────────────┴───────────────┤
│  Status Bar: [Language: TSX] [AI: On] [Users: 2] [Ln 42, Col 8] │
└──────────────────────────────────────────────────────────────────┘
```

**Panel resizing:** All three vertical panels (file tree, editor, preview) are resizable via drag handles. The terminal panel is resizable vertically within the editor column.

**Presence cursors:** Each remote user's cursor is rendered as a colored vertical line with their name label floating above it. Selections are highlighted in the user's assigned color with 20% opacity.

---

## 11. Non-Functional Requirements

| Requirement | Target | Measurement |
|---|---|---|
| Editor sync latency | < 100ms (same continent) | Measure round-trip from keystroke to remote render |
| WebContainer boot time | < 5 seconds | Time from "Open Playground" to terminal showing prompt |
| `npm install` time (React template) | < 15 seconds | First cold boot with empty cache |
| AI completion response time | < 1 second | Time from trigger to ghost text appearing |
| Max concurrent users per room | 8 | Test with 8 simultaneous editors typing |
| Max file size in editor | 1MB | Warn above this; Monaco performance degrades |
| Max files per playground | 500 | MongoDB document size constraint |
| Browser support | Chrome 90+, Edge 90+, Brave | WebContainer requirement |
| Uptime target | 99% (WebSocket server) | Basic health check monitoring |

---

## 12. Security Considerations

| Risk | Mitigation |
|---|---|
| Malicious code execution | WebContainers sandbox code in the browser — no server-side execution. A user's malicious code can only affect their own browser tab. |
| Room ID guessing | UUIDs are 128-bit random — brute-forcing is infeasible. |
| Guest abuse (spam edits) | Owner can kick guests. Rate-limiting on Yjs updates (max 100 operations/second per user). |
| AI prompt injection | The code completion API sends only the file content and cursor context — no system prompt is exposed to the user. |
| XSS via preview iframe | The preview iframe loads from a WebContainer origin (different from the app origin), providing natural origin isolation. |
| MongoDB injection | Prisma ORM parameterizes all queries. No raw string concatenation. |
| GitHub token exposure | OAuth tokens stored server-side in encrypted session cookies (NextAuth.js). Never sent to the client. |

---

## 13. Success Metrics

| Metric | Target (3 months post-launch) |
|---|---|
| Playgrounds created | 500+ |
| Average collab session duration | > 15 minutes |
| Rooms with 2+ users | 30% of all sessions |
| AI completion acceptance rate | > 25% (Tab presses / suggestions shown) |
| WebContainer boot success rate | > 95% |
| GitHub stars (if open-sourced) | 100+ |

---

## 14. Open Questions

1. **Yjs persistence strategy:** Should the Yjs state be persisted to MongoDB on every update (expensive) or only on room close / debounced interval? Current design says debounced (every 5 seconds of inactivity), but this means up to 5 seconds of edits could be lost if the server crashes.

2. **WebContainer execution model:** Should only the owner run the WebContainer (simpler, current design) or should every user run their own (more resilient but harder to keep in sync)? The owner model creates a single point of failure for the preview.

3. **AI completion model choice:** Which LLM backend should the `/api/code-completion` route call? Options include the Anthropic API (Claude), OpenAI API (GPT), or a locally-hosted model via Ollama. Cost, latency, and code quality trade-offs need evaluation.

4. **Rate limiting:** How aggressively should AI completion requests be rate-limited? At 300ms debounce, a fast typist could generate 3-4 requests per second. At $0.01/request, a 1-hour session could cost $36-$144 in API calls.

5. **File tree collaboration granularity:** Should file renames and moves be tracked as atomic operations in Yjs, or decomposed into delete + create? Atomic operations are more correct but require custom Yjs types beyond `Y.Map`.

---

## 15. Future Roadmap (v2+)

| Feature | Complexity | Value |
|---|---|---|
| Docker-based execution for Python/Java/C++ | High | Expands beyond JavaScript ecosystem |
| Voice/video chat integration (WebRTC) | Medium | Eliminates need for separate communication tool |
| Version history (time-travel through edits) | Medium | Yjs already stores the operation log; UI needed |
| Playground forking (like GitHub fork) | Low | One-click clone for workshops |
| Read-only spectator mode | Low | Viewer count without edit access |
| Persistent environments (save WebContainer state) | High | Resume running servers across sessions |
| VS Code extension (connect local VS Code to room) | High | Eclipse OCT-style cross-platform collab |
| End-to-end encryption | Medium | Required for enterprise adoption |
