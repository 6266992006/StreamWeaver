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

**Kaam:** Ab tak (Day 1, Day 2) user har request ke saath apna JS
transform code bhejta tha. Day 3 me user apna transform config **ek baar
save** kar sakta hai (`POST /api/sandbox/config`), aur baad me usko
**fetch** kar sakta hai (`GET /api/sandbox/config`) — bilkul Week 2 Day 3
ke `/api/mapping` jaisa pattern, bas isme JS expressions store hote hain.

Yeh Week 1 + Week 2 ke upar bana hai, isliye auth, raw upload, CSV parsing
aur mapping sab already isme kaam karte hain (Day 1 ka `sandbox/run` aur
Day 2 ka `sandbox/transform-row` bhi saath hai).

## Naya kya add hua (Day 3)
- `models/transformStore.js` — in-memory Map, per-user (`userId` se
  keyed) transform config store (Week 2 ke `mappingStore.js` jaisa hi
  pattern)
- `controllers/transformController.js` — `saveConfig()` aur `getConfig()`
  handlers add kiye, plus ek private `validateFieldTransforms()` helper
  jo save karne se pehle har field ka script **compile karke** syntax
  error turant pakad leta hai (ek throwaway isolate use karke, run nahi
  karta — sirf compile)
- `routes/transformRoutes.js` — `POST /api/sandbox/config` aur
  `GET /api/sandbox/config` add kiye

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

Save karo:
```bash
curl -X POST http://localhost:5000/api/sandbox/config \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{
    "fieldTransforms": {
      "name": "value.toUpperCase()",
      "score": "Number(value) * 2"
    }
  }'
```
Expected:
```json
{
  "success": true,
  "message": "Transform config saved",
  "fieldTransforms": { "name": "value.toUpperCase()", "score": "Number(value) * 2" }
}
```

Fetch karo:
```bash
curl http://localhost:5000/api/sandbox/config -H "Authorization: Bearer <token>"
```
Expected (save karne ke baad):
```json
{
  "success": true,
  "fieldTransforms": { "name": "value.toUpperCase()", "score": "Number(value) * 2" },
  "updatedAt": "2026-10-09T..."
}
```
Bina save kiye `GET` karoge to `404` — `"No transform config set yet"`.

## Security / Correctness — Verified (21/21 tests pass)

Fresh install karke, poora server chalakar, terminal se 21 tests kiye:

1. Health check → `200`
2. Root route → `200`
3. Week 1 signup bina MongoDB ke → graceful `500`, crash nahi
4. Week 1 raw upload (multipart) → `201`-equivalent `success:true`
5. Week 2 `parse/lines` → sahi line count
6. Week 2 `parse/json-preview` → sahi JSON conversion
7. Week 2 mapping save → `200`
8. Bina token `/api/sandbox/run` → `401`
9. Day 1 `value.toUpperCase()` → `"HELLO WORLD"` sahi
10. Day 2 multi-field `transform-row` → `name` uppercase + `score`
    doubled, ek saath sahi
11. `GET /api/sandbox/config` bina kisi save ke → `404`
12. `GET /api/sandbox/config` bina token → `401`
13. `POST /api/sandbox/config` bina token → `401`
14. `POST /api/sandbox/config` bina `fieldTransforms` ke → `400`
15. `POST /api/sandbox/config` empty object (`{}`) ke saath → `400`
    (`"fieldTransforms cannot be empty"`)
16. `POST /api/sandbox/config` array bheja (invalid type) → `400`
17. **Syntax-error wala script** (`value.toUpperCase(`) → `400` save time
    par hi pakda gaya (`validateFieldTransforms`), pipeline tak pahuncha
    hi nahi
18. `POST /api/sandbox/config` valid config → `200`, config saved
19. `GET /api/sandbox/config` save ke baad → `200`, sahi `fieldTransforms`
    + `updatedAt`
20. **Per-user isolation**: doosre user (alag token/`userId`) ne `GET`
    kiya to usko apna `404` mila — pehle user ka config leak nahi hua
21. Saare tests ke baad bhi server turant healthy response deta raha

Yeh prove karta hai ki config store har user ke liye alag-alag hai, galat
ya incomplete config save hi nahi hone diya jata, aur koi bhi test server
ko crash nahi kar saka.

## Important Notes
- **MongoDB** chahiye signup/login/forgot-password/`/me` jaisi DB-wali
  routes ke liye — MongoDB na chale to bhi server crash nahi hota.
- Week 1 (auth, raw upload) aur Week 2 (CSV line-split, JSON preview,
  column mapping) ke saare purane routes is Day 3 build me bhi saath
  chalte hain — koi route break nahi hua.
- Config abhi **in-memory** store hoti hai (server restart par reset ho
  jayegi) — ye Week 2 ke mapping store jaisa hi design hai, baad me
  MongoDB collection se swap kiya ja sakta hai bina baaki code chhede.
- Day 4 se aage: ye saved config ko real streaming upload pipeline me
  integrate karna (CSV ke har row par automatically apply hona), phir
  Day 5 me end-to-end poora flow (agle messages me isi tarah test karke
  diya jayega).
