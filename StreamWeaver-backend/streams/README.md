# DB Layer — Krishna (Database Developer)

Covers Week 1 (schemas + connection) and Week 2 (batched insert +
validation) of StreamWeaver's backend. Everything here is unit-tested —
run `npm test` from `StreamWeaver-backend/`.

## Schemas (`models/`)

| Model | Purpose | Key indexes |
|---|---|---|
| `User` | Account + role (admin/analyst) | unique `email` |
| `Dataset` | Metadata for an uploaded file | `ownerId` |
| `TransformJob` | One run of a dataset through mapping/transform | `ownerId + status`, `datasetId` |

## Pipeline (`streams/`, `utils/`)

```
raw rows  ─▶  validateRows()  ─▶  valid rows ─▶ BulkInserter ─▶ MongoDB
 (from CSV)   (utils/dbValidators)             (streams/bulkInsert,
                    │                            batches of 1,000)
                    ▼
              invalid rows ─▶ errorLog [{ row, reason }]
```

`streams/processRows.js` wires the two steps together in one call:

```js
const { processRows } = require("./streams/processRows");

const result = await processRows(rows, {
  mappingConfig: {
    name:  { source: "Full Name", required: true },
    email: { source: "Email", type: "email", required: true },
    age:   { source: "Age", type: "number" },
  },
  model: SomeMongooseModel,
  batchSize: 1000, // optional, defaults to 1000
});

// result = { totalRows, rowsProcessed, rowsFailed, errorLog }
// -> spread this straight onto a TransformJob document
```

Supported `type` values in `mappingConfig`: `number`, `email`, `date`,
`boolean`. Add `required: true` to reject blank/missing values.

## Error handling contract

- **Per-row validation failure** → row is skipped, added to `errorLog`, rest of the batch still inserts.
- **Per-row MongoDB write failure** (e.g. duplicate key) → same: only that row is skipped.
- **Whole-batch failure** (e.g. DB connection drops mid-insert) → the whole batch counts as failed (`stats.failed`), logged in `stats.batchErrors`, and is **not** silently counted as inserted. (Fixed in Week 2 Day 5 — this was previously a bug.)

## Running the tests

```bash
cd StreamWeaver-backend
npm install
npm test
```

10 tests covering: batching, empty-buffer no-op, partial write failures,
total batch failure, invalid `batchSize`, field validators, row
splitting, ObjectId checks, and the full `processRows` pipeline.
