# DB Layer — Krishna (Database Developer)

Covers Week 1 (schemas + connection) and Week 2 (batched import
pipeline + job tracking) of StreamWeaver's backend. Everything here is
unit-tested — run `npm test` from `StreamWeaver-backend/`.

## Schemas (`models/`)

| Model | Purpose | Key indexes |
|---|---|---|
| `User` | Account + role (admin/analyst) | unique `email` |
| `Dataset` | Metadata for an uploaded file | `ownerId` |
| `TransformJob` | One run of a dataset through validate/map/insert | `ownerId + status`, `datasetId + createdAt` |
| `DatasetRow` | Destination for imported rows (one shared collection) | unique `datasetId + rowNumber` |

## Pipeline (`streams/`, `utils/`)

```
source rows --> validate + map --> BulkInserter --> MongoDB
 (any async      (utils/dbValidators)  (streams/bulkInsert,
  iterable)           |                 batches of 1,000,
                      v                 real backpressure)
                 bad rows                    |
                      |                       v
                      +----------> JobTracker --> TransformJob
                                (utils/jobTracker: throttled progress
                                 writes, capped errorLog, rowsPerSec)
```

`streams/importPipeline.js` wires all of it into one streaming call —
memory stays flat no matter how large the file is, and a slow database
slows the source down instead of buffering it:

```js
const { runImportPipeline } = require("./streams/importPipeline");
const { JobTracker } = require("./utils/jobTracker");
const DatasetRow = require("./models/DatasetRow");

const tracker = await JobTracker.create({ datasetId, ownerId });

const result = await runImportPipeline({
  source: csvRowStream, // any object-mode Readable / async iterable of row objects
  mappingConfig: {
    name:  { source: "Full Name", required: true },
    email: { source: "Email", type: "email", required: true },
    age:   { source: "Age", type: "number" },
  },
  model: DatasetRow,
  buildDocument: DatasetRow.toDocument(datasetId, tracker.jobId),
  tracker, // optional — omit for a one-off import with no job to update
});

// result = { status, totalRows, rowsProcessed, rowsFailed, errorLog, errorsTruncated, batches, durationMs }
```

For rows already in an array (small files, tests), `streams/processRows.js`
is the same pipeline without the streaming/tracker parts:

```js
const { processRows } = require("./streams/processRows");
const result = await processRows(rows, { mappingConfig, model: SomeModel });
// -> { totalRows, rowsProcessed, rowsFailed, errorLog }
```

Supported `type` values in `mappingConfig`: `number`, `email`, `date`,
`boolean`. Add `required: true` to reject blank/missing values. Mapped
values are cast to their real type (`mapRow`) before being stored.

## Error handling contract

- **Row fails validation** -> dropped before it ever reaches MongoDB, recorded as `{ row, reason }` (1-based, matching the row number in the user's file).
- **MongoDB rejects one row** (duplicate key, cast error, ...) -> only that row counts as failed; the row number comes from the document itself if it carries one, so the report stays correct even though earlier bad rows were never sent.
- **MongoDB rejects a whole batch** (connection drop, ...) -> every row in it counts as failed and is logged in `stats.batchErrors` — never silently counted as inserted (this was a real bug, fixed and covered by a test).
- **The whole import fails** (every batch rejected, or the source itself throws) -> the job is marked `failed` with `errorMessage`, not `done`.
- `errorLog` is capped (`MAX_ERROR_LOG`, default 1000) so a file full of bad data can't grow a job past MongoDB's 16MB document limit — `rowsFailed` always holds the true total, and `errorsTruncated` says whether the log was cut off.

## Upload history

`controllers/historyController.js` (`GET /api/jobs`) joins each
`Dataset` with its most recent `TransformJob` (if any) so the dashboard
shows live status/progress once an import is running, and falls back to
the plain upload status before that.

`scripts/backfillDatasets.js` registers files already sitting in
`/uploads` that predate this fix and were never recorded in MongoDB:

```bash
npm run backfill -- you@example.com --dry-run   # preview
npm run backfill -- you@example.com             # actually add them
```

## Indexes (Week 3)

`config/dbIndexes.js` builds every model's declared indexes explicitly,
instead of relying on Mongoose's automatic (and, in production, risky)
background index creation the first time a model is used:

```bash
npm run db:indexes            # create missing indexes, drop stale ones
npm run db:indexes -- --check # report drift only, changes nothing (exit
                               # code 1 if out of sync — usable in CI)
```

`Dataset` now indexes `{ ownerId: 1, createdAt: -1 }` instead of just
`{ ownerId: 1 }` — the Upload History query filters by owner *and* sorts
by upload time, so the compound index lets MongoDB satisfy both without
an in-memory sort once a user has thousands of uploads.

## Export (Week 4 Day 1)

`controllers/exportController.js` (`GET /api/export/:datasetId?format=csv|json`)
streams a dataset's processed rows straight to the response via a MongoDB
cursor — never loaded fully into memory, so a multi-million-row export
behaves the same as a 10-row one. CSV column headers come from the first
row's keys; values are RFC 4180-escaped (`utils/csvFormat.js`). Only the
dataset's own owner can export it (checked the same way as `/api/jobs`).

## Running the tests

```bash
cd StreamWeaver-backend
npm install
npm test
```

48 tests across `tests/`: batching and backpressure, partial vs. total
batch failures, job lifecycle and progress throttling, the full
streaming pipeline (25,000 rows in one test), the history endpoint, and
the backfill script's file-name parsing.
