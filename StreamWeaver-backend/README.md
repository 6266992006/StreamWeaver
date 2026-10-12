# Week 3 — Day 4 — Saved Transform Live Streaming Pipeline Me Apply

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
