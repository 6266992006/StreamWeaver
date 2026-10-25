# StreamWeaver

High-throughput, no-code ETL pipeline. Upload a CSV, map its columns,
and StreamWeaver validates and loads every row — streamed end to end so
multi-GB files never sit fully in memory on either the client or the
server.

**Stack:** React 19 + Vite (frontend) · Node.js + Express + MongoDB (backend) · WebSocket for live progress

## Quick start

You need **Node 22+** and **MongoDB** (local, or a free Atlas cluster).

```bash
# 1. Backend
cd StreamWeaver-backend
npm install
cp .env.example .env       # then fill in MONGO_URI and JWT_SECRET (see the file for every option)
npm run db:indexes         # one-time: create MongoDB indexes
npm start                  # http://localhost:5000  (open it: "StreamWeaver backend is running")

# 2. Frontend (new terminal)
cd StreamWeaver-frontend
npm install
npm run dev                # http://localhost:5173
```

Sign up, then: **Import** → choose a CSV → map & clean → start. Watch it load live; download the
clean data or the list of failed rows from the result screen or the **History** page.

**Admins:** put your email in `ADMIN_EMAILS` in the backend `.env`, restart, and sign in again.
Admins get an **Everyone** switch on the History page and can download any import.

**Password-reset emails:** with `SMTP_*` empty the backend prints the email (and its reset link) in
its terminal. For real emails use Gmail with an app password — `SMTP_HOST` must be a host name such as
`smtp.gmail.com`, not an email address.

## How an import works

```
Browser                                   Backend
  │  POST /api/jobs  {mapping, transforms}   ──▶ validates + compiles the JavaScript, creates the job
  │  ◀── { jobId }
  │  WebSocket subscribe(jobId)               ──▶ live progress frames (rows, rows/sec, %)
  │  POST /api/jobs/:id/file  (CSV, streamed) ──▶ line split → CSV→JSON → sandboxed cleanup (isolated-vm)
  │                                               → validate + rename → buffered bulkWrite into MongoDB
  │  ◀── { rowsProcessed, rowsFailed, … }
  │  GET /api/export/:datasetId?format=csv|json         clean data
  │  GET /api/export/job/:jobId/errors?format=csv|json  failed rows + reasons
```

Nothing buffers the file: it flows through Node streams with backpressure. A row that fails
validation (or whose script throws) is skipped and recorded with its row number and reason; the
import carries on.

## Running the tests

```bash
cd StreamWeaver-backend  && npm test        # 135 tests, no database needed
cd StreamWeaver-frontend && npm test        # 37 unit tests
# End-to-end (needs MongoDB + the backend running):
cd StreamWeaver-frontend && npm run test:e2e
#   optional: E2E_API_URL=http://localhost:5000  E2E_ADMIN_EMAIL=<an ADMIN_EMAILS address>  E2E_ADMIN_PASSWORD=<its password, if the account exists>  E2E_ROWS=20000
```

## What's built so far

### Week 1 — Foundations
- Streaming file upload (Busboy), never buffers the full file in memory
- JWT auth: signup / login, protected routes
- MongoDB schemas: `User`, `Dataset`, `TransformJob`
- Frontend: virtualized CSV preview grid (first 1,000 rows), auth pages

### Week 2 — Ingest pipeline
- `streams/bulkInsert.js` — batched `bulkWrite` (1,000 rows/batch), with
  accurate accounting for partial *and* total batch failures
- `utils/dbValidators.js` — per-row validation + type casting against a
  column-mapping config
- `streams/importPipeline.js` — the full streaming pipeline: validate →
  map → batch-insert → job progress, backpressure-safe end to end
- CSV → NDJSON parsing (`streams/csvLineStream.js`, `csvRowToJsonStream.js`)
  and a column-mapping API (`/api/mapping`)
- Upload History dashboard: `GET /api/jobs` joins `Dataset` with its
  latest `TransformJob`; frontend has search, status filters, sorting,
  pagination

### Week 3 — Scale & live progress
- `config/dbIndexes.js` — explicit index sync/report script
  (`npm run db:indexes [-- --check]`), compound index on `Dataset` so
  Upload History stays fast as uploads grow into the thousands
- `sockets/progressSocket.js` — WebSocket server (`/ws/progress`) pushing
  live `rowsProcessed` / `rowsFailed` / `rowsPerSec` while a job runs;
  one batched DB query per tick no matter how many clients are watching;
  graceful shutdown on `SIGTERM`/`SIGINT`
- `config/db.js` — tuned for large imports (connection compression, a
  warm minimum pool, disconnect/reconnect logging)
- Verified at scale: 100,000-row streaming import in well under a
  second with ~20MB of heap growth (`tests/largeDataset.test.js`)

### Week 4 — Finish & polish
- **Import flow, end to end:** `POST /api/jobs` (mapping + sandboxed JavaScript, validated and
  compiled up front) then `POST /api/jobs/:id/file` streams the CSV through
  parse → clean (isolated-vm) → validate → bulk insert, while the WebSocket reports live progress
- A row whose script throws, or that fails validation, is skipped and recorded with its row number
  and reason — the import carries on
- **Export:** cleaned data as CSV/JSON (`/api/export/:datasetId`), failed rows as a report
  (`/api/export/job/:jobId/errors`); streamed with backpressure, so a slow download or a closed tab
  never piles rows up in server memory
- **Roles:** Admin vs Analyst (`ADMIN_EMAILS`); analysts only ever touch their own imports
- Security: helmet headers, rate limiting, password reset by email
- **Frontend:** the full flow (Upload → Map & clean → Import), forgot/reset password, live progress
  bar with rows/sec and time left, history with export + failed-rows panel, admin switch,
  light/dark theme, responsive layout

**Measured** (`npm run bench:export`, and a 2,000,000-row / 88MB import through the real API):
export streams ~600k rows/s with ~64KB queued; a full import runs ~19,500 rows/s (~7,900 rows/s with a
JavaScript cleanup on every row) and the server stays flat at ~160MB RSS from a 20MB file to an 88MB one.

## API routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/auth/signup`, `/login` | — | Account creation / login (returns the user's role) |
| `GET /api/auth/me` | ✅ | Who am I (restores the session after a page reload) |
| `POST /api/auth/forgot-password`, `/reset-password/:token` | — | Password reset by email |
| `POST /api/jobs` | ✅ | Start an import: validate mapping + transforms, create the job |
| `POST /api/jobs/:jobId/file` | ✅ | Stream the CSV into the job (does the whole import) |
| `GET /api/jobs[?scope=all]` | ✅ | Import history (`scope=all`: admins, everyone's) |
| `GET /api/jobs/:jobId/errors` | ✅ | Failed rows with reasons |
| `GET /api/export/:datasetId?format=csv\|json` | ✅ | Download the cleaned data |
| `GET /api/export/job/:jobId/errors?format=csv\|json` | ✅ | Download the failed-rows report |
| `POST /api/sandbox/transform-row` | ✅ | Run cleanup JavaScript on one sample row (mapping preview) |
| `POST /api/upload`, `/upload/parse`, `/upload/transform` | ✅ | Earlier raw-upload / CSV→NDJSON endpoints |
| `POST/GET /api/mapping` | ✅ | Saved column-mapping config |
| `ws://.../ws/progress?token=` | ✅ | Live job progress over WebSocket |

`GET /` lists every route the *running* backend actually serves — useful
for confirming you're not talking to a stale server after pulling changes.

## Project structure

```text
StreamWeaver-backend/
├── server.js
├── config/        # db connection + index management
├── controllers/    routes/        middleware/
├── models/        # User, Dataset, TransformJob, DatasetRow
├── streams/       # bulkInsert, importPipeline, CSV parsing, sandboxRowTransform
├── sandbox/       # isolated-vm runner for user JavaScript
├── sockets/       # live progress WebSocket
├── utils/         # validators, job tracking, roles, error report
├── scripts/       # one-off maintenance (backfillDatasets)
└── tests/

StreamWeaver-frontend/
└── src/
    ├── pages/       # Upload, Mapping, ImportRun, Dashboard, auth pages
    ├── components/  # ProgressBar, MappingForm, VirtualGrid, ErrorTable, ...
    ├── hooks/       # useWebSocket (live progress)
    ├── api/         # backend API calls
    └── utils/       # CSV preview, mapping rules, progress, history helpers
```

## If something breaks after a merge

Two people editing the same files can silently undo each other's work. After every merge:

```bash
cd StreamWeaver-backend  && npm install && npm test     # all green = nothing was lost
cd StreamWeaver-frontend && npm install && npm test && npm run build
```

Then open `http://localhost:5000/` — it lists every route the running backend serves
(`/api/jobs`, `/api/export`, `/ws/progress`, … must all be there). When resolving a conflict, keep
**both** sides' changes instead of accepting one whole file.
