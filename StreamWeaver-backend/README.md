<<<<<<< HEAD
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
=======
# Week 3 — Day 5 — End-to-End: Transform, Save, Download (Week 3 Complete)
>>>>>>> d7fdc0f (Update data transformation and output handling)

**Kaam:** Day 4 me saved transform config CSV upload ke stream me live
apply hoti thi, par sirf ek **preview** (pehli 5 rows) wapas aata tha.
Day 5 me poora pipeline **end-to-end** complete hua: upload → parse →
transform → **poori output file NDJSON format me disk par save** →
alag `download` endpoint se wo file **fetch** kar sakte ho. Isi ke saath
**Week 3 complete** ho jaata hai.

Yeh Week 1 + Week 2 + Week 3 Day 1-4 ke upar bana hai — auth, raw upload,
CSV parsing, column mapping, sandbox/run, transform-row, config
save/get, aur live-preview transform-upload, sab already isme kaam karte
hain.

## Naya kya add hua (Day 5)
- `streams/ndjsonStringifyStream.js` — `NdjsonStringifyStream`:
  `stream.Transform` jo har JS object row ko ek NDJSON line
  (`JSON.stringify(row) + "\n"`) me convert karta hai, taaki seedha disk
  par likha ja sake — kabhi bhi poori file memory me nahi aati, chahe
  lakhon rows ho
- `models/outputFileStore.js` — generated output files ka in-memory
  record (`fileId → { userId, filePath, fileName, rowCount }`), taaki
  download endpoint pata laga sake ki file kis user ki hai
- `controllers/transformController.js` —
  - `transformUploadToFile()` — Day 4 jaisa hi pipeline, bas aakhir me
    `NdjsonStringifyStream` → `fs.createWriteStream()` se seedha disk
    par likhta hai; ek random 64-char hex `fileId` generate karke response
    me `downloadUrl` ke saath return karta hai
  - `downloadOutput()` — `fileId` ko strict hex pattern se validate
    karta hai, sirf wahi user download kar sakta hai jisne file banayi
    thi (warna `404` — kabhi `403` nahi, taaki koi doosre users ke
    fileIds exist karte hai ya nahi ye bhi na pata chale)
- `routes/transformRoutes.js` — `POST /api/sandbox/transform-download`
  aur `GET /api/sandbox/download/:fileId` add kiye

## Run
```bash
npm install
cp .env.example .env
npm start
```

**Note:** `isolated-vm` ek native addon hai (C++ compile hoti hai install
ke waqt) — `npm install` thoda zyada time le sakta hai (10 second) pehli
baar, normal hai.

## Test

Pehle config save karo (Day 3):
```bash
curl -X POST http://localhost:5000/api/sandbox/config \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"fieldTransforms": {"name": "value.toUpperCase()", "score": "Number(value) * 2"}}'
```

CSV upload karo aur save-to-file karo:
```bash
curl -X POST http://localhost:5000/api/sandbox/transform-download \
  -H "Authorization: Bearer <token>" -F "file=@yourfile.csv"
```
Response:
```json
{
  "success": true,
  "fileId": "a1b2c3...64-char-hex",
  "fileName": "yourfile.ndjson",
  "totalRows": 2000,
  "downloadUrl": "/api/sandbox/download/a1b2c3...64-char-hex"
}
```

Phir download karo:
```bash
curl http://localhost:5000/api/sandbox/download/<fileId> \
  -H "Authorization: Bearer <token>" -o output.ndjson
```

## Security / Correctness — Verified (30/30 tests pass)

Fresh install karke, poora server chalakar, terminal se 30 tests kiye:

1. Health check → `200`
2. Root route → `200`
3. Week 1 signup bina MongoDB ke → graceful `500`, crash nahi
4. Week 1 raw upload → `success:true`
5. Week 2 `parse/lines` → sahi
6. Week 2 `parse/json-preview` → sahi
7. Week 2 mapping save → `200`
8. Day 1 `sandbox/run` → sahi
9. Day 2 `transform-row` → sahi
10. Day 3 config save → `200`
11. Day 3 config get → `200`
12. Day 4 `transform-upload` (preview) → sahi
13. `transform-download` bina token → `401`
14. `transform-download` → file save hui, `fileId` + `downloadUrl` mila
15. `download` bina token → `401`
16. `download` sahi token ke saath → **exact transformed NDJSON content**
    mila (`{"name":"JOHN","score":42,"city":"pune"}`)
17. Path-traversal attempt (`../../etc/passwd` as fileId) → route hi
    match nahi hoti, filesystem tak pahuchta hi nahi
18. Valid-format par non-existent `fileId` → `404`
19. **Per-user isolation**: doosre user ne pehle user ka `fileId` use
    karke download try kiya → `404` (file exist karti hai ye bhi pata
    nahi chalta)
20. **5000-row file** → sirf `~2.3s` me transform + save hui
21. Downloaded file ki line count (`5000`) exactly `totalRows` se match
    hui, first/last row ka data sahi
22. **Runtime error** (`value.nonExistentMethod()`) → clean `400`,
    **partial output file disk se automatically delete ho gayi** (orphan
    file nahi chhuti)
23. Server us error ke turant baad healthy
24. **Infinite loop** ek field par → **~223ms me cleanly timeout**
    (per-field 200ms cap), partial file yahan bhi clean ho gayi
25. Server us timeout ke turant baad healthy
26. `require("fs")` escape attempt → blocked
27. No-file-received edge case → `400`
28. Server final health check → `200`
29. Pehle se saved (successful) files ab bhi download ho rahi hain —
    baad ke failed attempts ne unhe touch nahi kiya
30. Saare 29 steps ke baad server ek bhi baar crash nahi hua

Yeh prove karta hai ki Week 3 ka poora goal — **safe, isolated, sandboxed
JS transforms, live stream ke andar, bina memory buffer kiye, end-to-end
file download tak** — achieve ho gaya hai, aur har possible failure mode
(bad script, infinite loop, require/process escape, cross-user access,
path traversal) cleanly handle hota hai bina server ko kabhi nuksan
pahunchaye.

## Important Notes
- **MongoDB** chahiye signup/login/forgot-password/`/me` jaisi DB-wali
  routes ke liye — MongoDB na chale to bhi server crash nahi hota.
- Week 1, Week 2 aur Week 3 Day 1-4 ke saare purane routes is Day 5
  build me bhi saath chalte hain — koi route break nahi hua.
- Output files abhi **local disk** (`outputs/` folder) par save hote
  hain aur record in-memory hai (server restart par record reset hoga,
  par files disk par rahengi) — production me isse S3/cloud storage +
  DB record se replace kiya ja sakta hai bina baaki pipeline chhede.
- **Week 3 yahi complete hota hai**: Day 1 (sandboxed single snippet) →
  Day 2 (multi-field row transform) → Day 3 (saved config) → Day 4 (live
  streaming apply) → Day 5 (end-to-end save + download).
