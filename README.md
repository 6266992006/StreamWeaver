# StreamWeaver

High-throughput, no-code ETL pipeline. Upload a CSV, map its columns,
and StreamWeaver validates and loads every row — streamed end to end so
multi-GB files never sit fully in memory on either the client or the
server.

**Stack:** React 19 + Vite (frontend) · Node.js + Express + MongoDB (backend) · WebSocket for live progress

## Quick start

# Backend
cd StreamWeaver-backend
npm install
cp .env.example .env   # fill in MONGO_URI, JWT_SECRET
npm run db:indexes     # one-time: create MongoDB indexes
npm run dev            # http://localhost:5000

# Frontend (separate terminal)
cd StreamWeaver-frontend
npm install
npm run dev             # http://localhost:5173

Sign up in the app, then upload a `.csv` file from the Upload page.

## Running the tests

cd StreamWeaver-backend && npm test    # 80 tests
cd StreamWeaver-frontend && npm test   # 12 tests

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

### Coming up (Week 4)
- Export processed/cleaned data (CSV/JSON) + downloadable error reports
- Role-based access (Admin vs Analyst), rate limiting polish, dark mode

---

## API routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/auth/signup`, `/login` | — | Account creation / login |
| `POST /api/upload` | ✅ | Stream a file to disk, record a `Dataset` |
| `POST /api/upload/parse` | ✅ | Upload → CSV parsed to NDJSON on disk |
| `GET /api/parse/lines` | ✅ | Quick CSV line-count/preview |
| `POST/GET /api/mapping` | ✅ | Save / fetch a user's column-mapping config |
| `GET /api/jobs` | ✅ | Upload history (Dataset + latest TransformJob) |
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
├── streams/       # bulkInsert, importPipeline, CSV parsing
├── sockets/       # live progress WebSocket
├── utils/         # validators, job tracking
├── scripts/       # one-off maintenance (backfillDatasets)
└── tests/

StreamWeaver-frontend/
└── src/
    ├── pages/       # Upload, Dashboard, SignIn/SignUp
    ├── components/  # VirtualGrid, HistoryTable, ...
    ├── api/         # backend API calls
    └── utils/       # history filtering/sorting/formatting
```
