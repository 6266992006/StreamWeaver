# StreamWeaver — Frontend

React 19 + Vite. Upload a CSV, map and clean its columns, watch it import live, and
download the clean data and any error report.

## Run it

```bash
npm install
cp .env.example .env     # only needed if the backend is NOT at http://localhost:5000
npm run dev              # http://localhost:5173
```

The backend (and MongoDB) must be running — see the root `README.md`.

| Command | What it does |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve the production build locally |
| `npm test` | unit tests (no backend needed) |
| `npm run test:e2e` | end-to-end test against a RUNNING backend + MongoDB |
| `npm run lint` | oxlint |

Requires **Node 22 or newer** (for `node --test` globs and the built-in WebSocket used by the e2e test).

## Screens

| Route | Page | Who |
|---|---|---|
| `/` | Home | everyone |
| `/signin`, `/signup`, `/forgot-password`, `/reset-password?token=…` | Auth | everyone |
| `/upload` | 1 · Upload — drop a CSV, preview the first 1,000 rows (virtualized) | signed in |
| `/mapping` | 2 · Map & clean — name / type / required per column, one-click or custom JavaScript cleanup, live preview from the backend sandbox | signed in |
| `/import` | 3 · Import — live progress (rows loaded / failed, rows per second, time left), then downloads | signed in |
| `/dashboard` | Import history, failed-rows panel, CSV/JSON export, error report. Admins can switch to **Everyone** | signed in |

## How it's organised

```
src/
  api/          one file per backend area (auth, upload, mapping, jobs, export) + config.js
  components/   ProgressBar, MappingForm, VirtualGrid, ErrorTable, ErrorBadge, Stepper,
                DarkModeToggle, RoleBasedView, ProtectedRoute, DownloadButton, …
  context/      AuthContext (token, user, role) · ImportContext (the chosen file between steps)
  hooks/        useWebSocket — live job progress with automatic reconnect
  pages/        one file per screen
  styles/       theme.js (light/dark logic) · components.css (shared component styles)
  utils/        pure, unit-tested logic: csvPreview, mappingUtils, progressUtils, errorUtils, …
tests/e2e/      uploadFlow.test.js — drives the real API in the same order the UI does
```

Light and dark themes are CSS variables in `src/index.css`; `src/styles/theme.js` picks one
(saved choice → OS setting) and `index.html` applies it before first paint, so there's no flash.

## Deploying

1. Build with the backend's public address baked in:
   ```bash
   VITE_API_URL=https://api.your-domain.com npm run build
   ```
2. Serve `dist/` from any static host (Netlify, Vercel, S3 + CloudFront, nginx …).
   It's a single-page app, so **every path must fall back to `index.html`**
   (nginx: `try_files $uri /index.html;` — Netlify: a `/* /index.html 200` redirect).
3. On the backend set `FRONTEND_URL` to the site's address (used in password-reset emails),
   and put the site behind HTTPS — the live-progress WebSocket then automatically uses `wss://`.
4. The backend currently allows any origin (CORS). For production, restrict it to your site in
   `StreamWeaver-backend/middleware/security.js`.

## Troubleshooting

- **"Can't reach the backend at …"** — the backend isn't running, or `VITE_API_URL` points elsewhere.
  Open the address in a browser: it should show `StreamWeaver backend is running`.
- **Progress shows "Reconnecting…"** — the WebSocket can't connect (backend restarting, or a proxy
  that blocks WebSockets). The bar falls back to upload progress and the import still completes.
- **"Route not found" after updating** — an old backend process is still running. Stop it and start again.
- **Mapping: "Another column already uses this name"** — two columns would be saved under the same field name.
