# Swing Score UI

Vite + React + TypeScript front end for the Swing Score competition app (Tailwind, TanStack Query, React Router).

| | |
|--|--|
| **This repo** | [github.com/MehmetFiratKomurcu/swing-score-ui](https://github.com/MehmetFiratKomurcu/swing-score-ui) |
| **Backend (Go API)** | [github.com/MehmetFiratKomurcu/swing-score-api](https://github.com/MehmetFiratKomurcu/swing-score-api) |

Clone and run the API separately, then point this app at it with `VITE_API_URL` (build time for production).

## Prerequisites

- Node.js 18+ (see `package.json` for local toolchain)

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

- **`VITE_API_URL`** — API origin with no trailing slash, e.g. `http://localhost:8080` when the API runs locally. Leave empty only if the app is served from the same host and path as the API (uncommon in dev).
- **`VITE_ADMIN_TOKEN`** — Only if your deployment still uses a matching server-side admin token (optional / legacy); default JWT auth uses login + `Authorization: Bearer` from the API.

## Development

```bash
npm run dev
```

App: `http://localhost:5173`. With **`VITE_API_URL` empty**, requests go to `/api/...` on the dev server and Vite proxies them to `http://localhost:8080` (`vite.config.ts`). With **`VITE_API_URL=http://localhost:8080`**, the browser talks to the API directly.

## Build

```bash
npm run build
```

Production build: set `VITE_API_URL` (and any other `VITE_*` vars) **at build time** — they are baked into the bundle.

```bash
npm run preview   # optional local preview of dist/
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production bundle |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
