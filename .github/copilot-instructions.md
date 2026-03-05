# Copilot Instructions

## Architecture Overview

Full-stack chat app: **React (Vite) frontend** on port 3000 + **Express/Socket.IO backend** on port 8000 + **MongoDB**.

```
/
├── frontend/     React 18 + Vite + react-router-dom v6 + socket.io-client
└── backend/      Express + Socket.IO v4 + Mongoose + JWT (httpOnly cookies)
```

**Two separate `package.json` projects.** Root `package.json` only has dev scripts (via `concurrently`). Always `cd` into the correct subdirectory before installing packages.

## Dev Workflow

```bash
# From repo root - starts both servers concurrently
npm run dev

# Individually
npm run dev:backend   # nodemon backend/index.js → :8000
npm run dev:frontend  # vite → :3000

# Production build (copies frontend/dist into backend/dist via xcopy)
npm run build && npm start

# Utility scripts (run from backend/)
npm run purge:users   # scripts/purgeUsers.js
npm run bench         # scripts/benchmark.js — Socket.IO RTT benchmark
```

Vite proxies `/api`, `/chat`, and `/uploads` to `:8000` in dev — so frontend fetches use `VITE_API_URL || ''` (empty string) in dev, a full URL in production.

Socket.IO connects to `VITE_SOCKET_URL || 'http://localhost:8000'` directly (not proxied).

## Auth Pattern

- Auth uses **JWT stored in `httpOnly` cookies** named `authToken`, never localStorage.
- REST routes use `authenticateToken` middleware (`backend/middleware/auth.js`) — reads `req.cookies.authToken`, sets `req.user.username`.
- Socket.IO auth middleware manually parses the `cookie` header on handshake and calls `verifyToken()`.
- **Both layers independently verify the token** — the socket stores `socket.authenticatedUser` and re-checks it on every `chat message` / `join room` event.
- `credentials: 'include'` is required on every `fetch()` call from the frontend.

## Socket.IO Event Contract

| Client emits | Server emits |
|---|---|
| `join room` `{ username, room }` | `join success`, `join error`, `prev` (last 50 msgs), `user joined` |
| `chat message` `{ username, room, message, clientSendTime }` | `chat message` (broadcast to room, adds `serverProcessingTime`) |
| `ping_bench` `data` | `pong_bench` `data` (RTT benchmark) |
| *(no emit)* | `message edited` `updatedMessage` — broadcast by REST edit route via `req.app.get('io')` |
| *(no emit)* | `message deleted` `messageId` — broadcast by REST delete route via `req.app.get('io')` |

**Hybrid pattern:** edit and delete operations go through REST POST routes (`/chat/editMessage`, `/chat/deleteMessage`) but broadcast results via Socket.IO using `req.app.get('io')`. This is intentional — auth is easier to enforce in REST middleware.

## API Routes

**Auth** (`backend/routes/static.js`):
- `POST /api/signup` / `POST /api/login` / `POST /api/logout` / `GET /api/me`

**Chat** (`backend/routes/chat.js`):
- `GET /chat?room=<name>` — validates access, adds user to `members` + `User.rooms`, returns room doc
- `GET /chat/rooms` — public rooms + private rooms where user is a member
- `GET /chat/room-info?room=<name>` — metadata only (no membership side-effects)
- `POST /chat/createRoom` — `{ roomName, isPrivate }` — creator becomes `owner` and first member
- `POST /chat/add-member` — `{ room, newMembers }` (comma-separated) — owner only; also unbans
- `POST /chat/ban` — `{ room, targetUser }` — owner only; **only valid for public rooms**
- `POST /chat/transfer-ownership` — `{ room, newOwner }` — new owner must already be a member
- `POST /chat/leaveRoom` — `{ room }` — if owner is last member, room + all messages are deleted; if owner with other members, must transfer first
- `POST /chat/editMessage` — `{ messageId, newText, room }` — sets `edited: true`, broadcasts `message edited`
- `POST /chat/deleteMessage` — `{ messageId, room }` — broadcasts `message deleted`
- `POST /chat/upload` — multipart `file` field (≤50MB server, ≤10MB client-side check); returns `{ fileUrl, fileType, fileName }`
- `/uploads/*` — static file serving

## Data Models

- **User**: `username` (unique), `password` (bcrypt via pre-save hook), `rooms: [String]`
- **Room**: `name` (unique), `isPrivate`, `owner: String`, `members: [String]`, `bannedMembers: [String]`
- **Message**: `username`, `message`, `room`, `createdAt`, `edited`, `fileUrl`, `fileType` (`'image'|'video'|'pdf'|null`), `fileName`

Room membership stored as **username string arrays** (not ObjectId refs) on both `Room.members` and `User.rooms`.

## Key Conventions

- All API responses use `{ success: true/false, ... }` shape.
- Use `$addToSet` (never `$push`) when adding to `members` or `rooms` arrays.
- Username: 3–20 chars, `[a-zA-Z0-9_]` only. Password: 8–100 chars, requires upper/lower/digit/special (`@$!%*?&`).
- JWT expires in `7d`. `JWT_SECRET` **must** be set in production — server throws on startup if missing.
- `NODE_ENV=production` tightens cookies: `secure: true`, `sameSite: 'none'`.
- CORS origins read from `CLIENT_URL` env var (comma-separated). Socket.IO shares the same `corsOptions`.
- `io` instance is shared with REST routes via `app.set('io', io)` / `req.app.get('io')`.

## File Uploads

`backend/services/uploadService.js` is a Multer wrapper class. Files land in `backend/uploads/` with timestamped names. Allowed: jpeg/jpg/png/gif/webp/mp4/mov/avi/webm/pdf. Upload creates a `Message` doc automatically and emits `chat message` via socket.

## Frontend State Flow

`App.jsx` owns `user` + `currentRoom` state. Auth check on mount via `GET /api/me`. Current room persisted to `localStorage` with 24-hour TTL (`currentRoom` + `currentRoomTimestamp`). Routes: `/login`, `/signup`, `/dashboard`, `/chat` — unauthenticated → redirect to `/login`.

`Message.jsx` enforces a **15-minute edit/delete window** (`canModify`) on the client side.

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `PORT` | backend | Server port (default `8000`) |
| `MONGODB_URI` | backend | MongoDB connection string (default local) |
| `JWT_SECRET` | backend | **Required in production** — thrown on startup if missing |
| `CLIENT_URL` | backend | Comma-separated allowed CORS origins |
| `NODE_ENV` | backend | `production` enables secure cookies + CORS logging |
| `VITE_API_URL` | frontend | Backend base URL (empty in dev, full URL in prod) |
| `VITE_SOCKET_URL` | frontend | Socket.IO server URL (default `http://localhost:8000`) |
| `BENCH_ROOM` | benchmark | Room to use for benchmark (default `general`) |
| `BENCH_USERNAME` | benchmark | Username for benchmark JWT (default `benchuser`) |

## Deployment

Frontend (`frontend/vercel.json`) deploys to Vercel with a catch-all rewrite to `/` for SPA routing. Backend deploys separately. Set `VITE_API_URL` and `VITE_SOCKET_URL` as Vercel env vars pointing to the backend URL.
