# Week 4 — Day 3 + Day 4 — Export hardening & final DB performance pass (Krishna)

**Kaam:** Export ko production-grade banana (memory-safe, slow client / disconnect
handle kare) aur final DB performance audit.

## Audit me jo problems mili aur fix hui

| Problem | Asar | Fix |
|---|---|---|
| Export `res.write()` ka return value ignore karta tha (no backpressure) | Slow client pe poora export server RAM me jama hota (100k rows = ~6 MB queued, 5M rows = ~300 MB) | `drain` ka wait; ab queued memory ~64 KB pe flat |
| Client disconnect hone pe bhi cursor chalta rehta | DB + CPU waste | `close` event pe loop ruk jata hai, cursor close hota hai |
| Har row ka alag `res.write` | Bahut zyada syscalls | ~64 KB chunks me write |
| Cursor har row ke saath `_id`, `datasetId`, `jobId` bhi laata | Faltu network/DB bandwidth | Projection `{ data, rowNumber }`, `batchSize: 2000` |
| Import chalte waqt export = chupchaap adhoora file | Galat data download | `409` jab tak import chal raha hai (`?force=true` se override; 2 min se purana "stuck" job ignore hota hai) |

Index audit (naya index nahi chahiye): export sort `{datasetId, rowNumber}` unique index se serve hota hai
(in-memory sort nahi); `hasActiveImport` `{datasetId, createdAt}` ka prefix use karta hai.
`TransformJob {ownerId, status}` abhi kisi query me use nahi hota (harmless, future role-based
admin views ke liye rakha).

## Naya / badla
- `controllers/exportController.js` — `createSink` (backpressure + abort + chunking), 409 guard
- `tests/exportBackpressure.test.js` — real `Writable` stream se 4 tests (slow client, JSON validity, disconnect, chunking)
- `tests/export.test.js` — +2 tests (409 / `?force=true`)
- `scripts/benchExport.js` — `npm run bench:export [rows]`

## Numbers (`npm run bench:export -- 2000000`, bina DB ke — sirf streaming layer)
```
fast client  2,000,000 rows  3.26s  612,902 rows/s  109.4MB out  peak queued 64KB  RSS growth 0.0MB
slow client  2,000,000 rows  3.56s  561,032 rows/s  109.4MB out  peak queued 64KB  RSS growth 1.1MB
```
Real HTTP check: slow client beech me chhod de to server 3M me se ~334k rows pull karke ruk gaya
aur cursor close hua. **Real MongoDB ki read speed alag hai** (deployment pe depend karti hai),
deploy se pehle ek baar asli data par export try karo.

## Merge ke baad phir se toota tha (dobara fix kiya)
Mohan ki branch ka merge phir `server.js` (jobs/export/WebSocket wiring), `package.json`
(`ws`, scripts), `config/db.js` aur `routes/uploadRoutes.js` (`/parse`, `/transform`) purane
version par le gaya. Wapas theek kiya, Mohan ka Day 3 kaam (`/api/sandbox/transform-row`,
`/api/sandbox/config`) rakha.

**Aage ke liye:** Mohan ko bolo ki merge se pehle `git pull origin main` karke conflicts
**dono taraf ka code rakhte hue** resolve kare (poori file "theirs/ours" na le). Warna har merge
ye wapas tod dega. `npm test` (121+ tests) merge ke baad chalao: ye turant pakad leta hai.

---

# Week 4 — Day 2 — Downloadable Error Report (Krishna)

**Kaam:** Import ke dauran jo rows validation me fail hue, unki report
CSV/JSON file ke roop me download karna.

## Naya kya add hua
- `utils/errorReportGenerator.js` — report banata hai (`buildErrorReport`,
  `reportToCsv`, `reportFileName`)
- `controllers/exportController.js` — naya `exportJobErrors` handler
- `routes/exportRoutes.js` — `GET /api/export/job/:jobId/errors?format=csv|json`
- `tests/errorReport.test.js` — 11 tests

## Endpoint
```
GET /api/export/job/:jobId/errors?format=csv     (default)
GET /api/export/job/:jobId/errors?format=json
Authorization: Bearer <JWT>
```
- CSV columns: `row,type,reason` (`type` = Missing value / Wrong format / Database / Other,
  frontend ke filter chips jaisa). Row number header ke baad se gina jata hai.
- Sirf job ka apna owner download kar sakta hai (doosre ka job = 404).
- Server error log ko 1000 entries pe cap karta hai, `rowsFailed` asli total hai. Report me
  `truncated` batata hai ki list adhuri hai: JSON me field, CSV me headers
  `X-Total-Failed`, `X-Errors-Included`, `X-Errors-Truncated`.
- CSV injection se bachav: `=`, `+`, `-`, `@` se shuru hone wale reason ke aage `'` lagta hai.
- Download file ka naam ASCII-safe banta hai (quote/newline header me ghus nahi sakte).
  Ye fix dataset export (`/api/export/:datasetId`) pe bhi laga.

## Merge ke baad jo toota tha aur theek kiya
- `server.js` me `<<<<<<< HEAD` conflict markers the (server start hi nahi hota). Saaf kiya,
  `/api/jobs`, WebSocket progress, `/api/sandbox`, `/api/export` sab wapas wired.
- `package.json` se `ws` dependency aur `test` / `db:indexes` / `backfill` scripts gayab the
  ("Cannot find module 'ws'"). Wapas daale, `isolated-vm` rakha.
- `config/db.js` purane version pe revert tha (Day 4 ki tuning gayab). Restore kiya.
- `routes/uploadRoutes.js` se `/parse` aur `/transform` hat gaye the. Wapas lagaye.

## Test
```bash
npm install
npm test        # 127 tests
```

---

# Week 3 — Day 3 — Transform-Config Save/Get API

**Kaam:** Day 3 me user apna transform config save kar sakta tha, par wo
kahi use nahi ho raha tha. Day 4 me wahi saved config **real CSV upload
ke stream ke andar hi, row-by-row, live apply** hota hai — ek hi
HTTP call me: file upload → line split → JSON convert → **saved
transform apply** → response. Poori file kabhi memory me buffer nahi
hoti.

Yeh Week 1 + Week 2 + Week 3 Day 1-3 ke upar bana hai — auth, raw upload,
CSV parsing, column mapping, sandbox/run, transform-row, config
save/get, sab already isme kaam karte hain.

## Naya kya add hua (Day 4)
- `streams/fieldTransformStream.js` — `FieldTransformStream` class:
  `stream.Transform` jo `RowSandbox` (Day 2) ko wrap karta hai. Ek hi
  isolate banta hai (static `create()` factory se), phir har row jo
  stream se guzarti hai usi isolate ko reuse karke transform hoti hai —
  bilkul `MappingTransformStream` (Week 2) jaisa shape, bas JS sandbox ke
  saath.
- `controllers/transformController.js` — `transformUpload()` handler:
  `CsvLineStream → CsvRowToJsonStream → FieldTransformStream` pipeline
  banata hai, user ka Day 3 wala saved config load karke sandbox init
  karta hai, aur stream khatam hone par total rows + headers + preview
  (pehli 5 rows) return karta hai.
- `routes/transformRoutes.js` — `POST /api/sandbox/transform-upload` add
  kiya.

## Run
```bash
npm install
cp .env.example .env
npm start
```

## Test

Pehle config save karo (Day 3):
```bash
curl -X POST http://localhost:5000/api/sandbox/config \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"fieldTransforms": {"name": "value.toUpperCase()", "score": "Number(value) * 2"}}'
```

Phir CSV upload karo — saved config apne aap stream ke andar apply hogi:
```bash
curl -X POST http://localhost:5000/api/sandbox/transform-upload \
  -H "Authorization: Bearer <token>" -F "file=@yourfile.csv"
```
Response:
```json
{
  "success": true,
  "fileName": "yourfile.csv",
  "headers": ["name", "score", "city"],
  "totalRows": 2000,
  "fieldTransforms": { "name": "value.toUpperCase()", "score": "Number(value) * 2" },
  "preview": [ { "name": "USER1", "score": 2, "city": "city1" }, ... ]
}
```
Config na saved ho to `404` — `"No transform config set yet — POST /api/sandbox/config first"`.

## Security / Correctness — Verified (24/24 tests pass)

Fresh install karke, poora server chalakar, terminal se 24 tests kiye:

1. Health check → `200`
2. Root route → `200`
3. Week 1 signup bina MongoDB ke → graceful `500`, crash nahi
4. Week 1 raw upload → `success:true`
5. Week 2 `parse/lines` → sahi line count
6. Week 2 `parse/json-preview` → sahi JSON conversion
7. Week 2 mapping save → `200`
8. Day 1 `sandbox/run` → sahi
9. Day 2 `transform-row` → sahi
10. `transform-upload` config save se PEHLE → `404`
11. `transform-upload` bina token → `401`
12. Config save karne ke baad `transform-upload` → **live streamed
    transform sahi** (`name` uppercase + `score` doubled, `city`
    untouched) — poori file ek hi call me transform hoke aayi
13. **Runtime error** (`value.nonExistentMethod()`) ek field par →
    clean `400`, crash nahi
14. Broken-script ke turant baad server healthy
15. **2000-row file** streamed + transformed, `totalRows: 2000` sahi,
    sirf `482ms` me (poori file memory me buffer nahi hui)
16. **Infinite loop** ek field par → **217ms me cleanly timeout**
    (per-field 200ms cap), server hang nahi hua
17. Infinite-loop ke turant baad server healthy
18. `require("fs")` escape attempt (runtime par) → blocked, clean error
19. No-file-received edge case → `400`
20. Saare attacks ke baad bhi server turant healthy response deta raha

Yeh prove karta hai ki saved transform real data par **production-scale
streaming** me bhi utni hi safe aur fast hai jitni Day 2 ke single-row
calls me thi — bina poori file memory me laaye, bina kisi ek bure
script ya row ke poore server ko nuksan pahuchaye.

## Important Notes
- **MongoDB** chahiye signup/login/forgot-password/`/me` jaisi DB-wali
  routes ke liye — MongoDB na chale to bhi server crash nahi hota.
- Week 1, Week 2 aur Week 3 Day 1-3 ke saare purane routes is Day 4
  build me bhi saath chalte hain — koi route break nahi hua.
- `transform-upload` abhi response me preview + totalRows return karta
  hai (file disk par save nahi karta) — Day 5 me isse end-to-end poora
  flow (transformed output file save/download) complete kiya jayega.
