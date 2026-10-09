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
npm test        # 121 tests
```

---

# Week 3 — Day 1 — isolated-vm Sandbox Core (SandboxRunner)

**Kaam:** `isolated-vm` package integrate karna — user-supplied JavaScript
ko ek alag V8 isolate me, memory-limit aur timeout ke saath, safely run
karna. Yeh poori Week 3 ka foundation hai: baki saare din isi engine ko
reuse/extend karte hain.

Yeh Week 1 + Week 2 ke upar bana hai, isliye auth, raw upload, CSV parsing
aur mapping sab already isme kaam karte hain.

## Naya kya add hua
- `sandbox/sandboxRunner.js` — `SandboxRunner` class: har call par naya
  isolate banata hai, JS snippet run karta hai, result deta hai, phir
  isolate dispose kar deta hai
- `controllers/transformController.js` — `runSnippet()` handler
- `routes/transformRoutes.js` — `POST /api/sandbox/run`

## Run
```bash
npm install
cp .env.example .env
npm start
```

## Test
```bash
curl -X POST http://localhost:5000/api/sandbox/run \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"code":"value.toUpperCase()","value":"hello world"}'
```
Expected: `{"success":true,"result":"HELLO WORLD"}`

## Security — Verified (yeh sabse zaroori test hai)
- Normal transform (`value.toUpperCase()`, `value * 2`) → sahi result
- `while(true){}` (infinite loop) → **exactly 1 second me timeout**, server
  hang nahi hua
- `require("fs").readFileSync(...)` → `"require is not defined"` — Node
  ke APIs isolate ke andar bilkul accessible nahi hain
- `process.exit(1)` → `"process is not defined"` — process bhi accessible
  nahi
- In saare attacks ke baad bhi server zinda tha aur health-check normal
  respond kar raha tha

Yeh prove karta hai ki `isolated-vm` sach me isolate karta hai — koi bhi
user script sirf apne aap ko nuksan pahuncha sakta hai, server ko nahi.
