# Week 3 — Day 4 — Large-Dataset Optimizations (Krishna)

**Kaam:** Week 3 ka "DB indexes/optimizations for large datasets" wala
hissa poora karna — connection tuning + proof ki pipeline sach me scale
karti hai, sirf dावा nahi.

## Naya kya add hua
- `config/db.js` — MongoDB connection tune ki: `compressors: ["zlib"]`
  (bade batches wire pe compress hote hain), `minPoolSize: 2` (import
  shuru hote hi connection-delay nahi), aur `disconnected`/`reconnected`
  event logging (connection beech me gir jaye to pata chale, chup na rahe)
- `tests/largeDataset.test.js` — **100,000 rows** stream karke prove kiya:
  sahi totals, flat memory (~20MB heap growth), backpressure (DB slow ho
  to source 5,000 rows se zyada aage nahi bhaagta)
- `tests/db.test.js` — connection config + event-listener wiring ke tests
- Root `README.md` — poora project status (Week 1-3) ke saath update kiya

## Pichle 3 din ka kaam bhi isi backend me hai
- Day 1: `config/dbIndexes.js` — index sync/report script
- Day 2: `sockets/progressSocket.js` — live WebSocket progress (details: `sockets/README.md`)
- Day 3: Graceful shutdown + real end-to-end WebSocket verification
- Day 4: DB connection tuning + 100k-row memory proof (`tests/largeDataset.test.js`)
- Day 5: Final DB review (neeche)

## Run
```bash
npm install
cp .env.example .env
npm run db:indexes   # ek baar: indexes banao/verify karo
npm run dev
```

## Test
```bash
npm test                              # poora suite — 86 tests
node --test tests/largeDataset.test.js  # sirf large-dataset proof
```

**Verified:** 100,000-row import `streams/importPipeline.js` se 675ms me
complete, heap sirf ~21MB badha (poori file memory me nahi aati — ye hi
is project ka core promise hai, aur ab test se proven hai).

## Week 3 — Day 5 — Final DB review (Krishna)

**Index audit** — har real query ko index se match kiya, naya index nahi chahiye:

| Query | Kahan | Index |
|---|---|---|
| Dataset list (user ke) `find({ownerId}).sort(createdAt:-1)` | historyController | `Dataset {ownerId:1, createdAt:-1}` |
| Jobs of datasets `find({datasetId:{$in}}).sort(createdAt:-1)` | historyController | `TransformJob {datasetId:1, createdAt:-1}` |
| Job by id + owner (`findOne({_id, ownerId})`) | errors endpoint, progressSocket | `_id` index (ownerId sirf filter) |
| Progress poll `find({_id:{$in}})` | progressSocket | `_id` index |
| Row lookup / bulk insert order | DatasetRow | `{datasetId:1, rowNumber:1}` unique |
| Login/signup `findOne({email})` | authController | `User.email` unique |

**Fix:** `npm run db:indexes -- --check` pehle sirf index ki keys compare karta tha.
Ab `unique` flag bhi compare hota hai — agar DB me index non-unique hai aur schema
unique maangta hai, to ye drift ab report hota hai (+2 tests).

**Week 3 checklist**
- [x] DB indexes/optimizations (`config/dbIndexes.js`, `config/db.js`)
- [x] `rowsProcessed` / `rowsPerSec` fields (`models/TransformJob.js`)
- [x] WebSocket progress data from DB counters (`sockets/progressSocket.js`)
- [x] Tests: 86/86 pass

**Handoff to Akshaya** (`useWebSocket.js`, `ProgressBar.jsx`): connect
`ws://localhost:5000/ws/progress?token=<JWT>`, subscribe with a `jobId`, protocol in
`sockets/README.md`.

**Deploy se pehle:** real MongoDB par ek baar `npm run db:indexes -- --check` chalao.
