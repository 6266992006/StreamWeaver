# Week 3 — Day 2 — Row-Level Sandboxed Transform (RowSandbox)

**Kaam:** Day 1 ke `SandboxRunner` ko extend karke ek real use-case ke
liye banaya — ek poori row (JSON object) ke multiple fields par alag-alag
user-defined JS expressions apply karna, bina har field/row ke liye naya
isolate banaye (ek hi isolate reuse hota hai — performance ke liye).

Yeh Week 1 + Week 2 ke upar bana hai, isliye auth, raw upload, CSV parsing
aur mapping sab already isme kaam karte hain (Day 1 ka `sandbox/run`
endpoint bhi saath hai).

## Naya kya add hua (Day 2)
- `sandbox/rowSandbox.js` — `RowSandbox` class: ek isolate banata hai,
  saare field-scripts ek baar compile karta hai, phir unhe baar-baar
  (row-by-row) reuse karta hai
- `controllers/transformController.js` — `transformRow()` handler add kiya
- `routes/transformRoutes.js` — `POST /api/sandbox/transform-row` add kiya

## Run
```bash
npm install
cp .env.example .env
npm run db:indexes   # ek baar: indexes banao/verify karo
npm run dev
```

**Note:** `isolated-vm` ek native addon hai (C++ compile hoti hai install
ke waqt) — `npm install` thoda zyada time le sakta hai (10 second) pehli
baar, normal hai.

## Test
```bash
curl -X POST http://localhost:5000/api/sandbox/transform-row \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{
    "row": {"name":"john doe","score":"21","city":"pune"},
    "fieldTransforms": {"name":"value.toUpperCase()","score":"Number(value) * 2"}
  }'
```
Expected:
```json
{
  "success": true,
  "transformed": {"name":"JOHN DOE","score":42,"city":"pune"}
}
```
Dhyan do: `city` field untouched rehta hai kyunki wo `fieldTransforms` me
nahi tha — sirf specify kiye gaye fields transform hote hain.

## Security — Verified (yeh sabse zaroori test hai)

Fresh install karke, poora server chalakar, terminal se 18 tests kiye:

1. Health check → `200`
2. Root route → `200`
3. Week 1 signup bina MongoDB ke → graceful `500`, crash nahi
4. Week 1 raw upload → `201`
5. Week 2 `parse/lines` → sahi line count
6. Week 2 `parse/json-preview` → sahi JSON conversion
7. Week 2 mapping save → `200`
8. Bina token `/api/sandbox/run` → `401`
9. `value.toUpperCase()` (Day 1) → `"HELLO WORLD"` sahi
10. **Multi-field transform-row** (Day 2 core) → `name` uppercase +
    `score` doubled, ek saath sahi
11. Untouched field (`city`) pass-through confirm
12. Galat script (`value.nonExistentMethod()`) → clean `400` error, crash
    nahi
13. Missing body fields → `400`
14. **Infinite loop** (`while(true){}`) ek field par → **217ms me
    cleanly timeout** (per-field 200ms cap), server hang nahi hua
15. `require("fs")` escape attempt → blocked
16. `process.exit()` escape attempt → blocked
17. 5 sequential `transform-row` calls → sab `200`, isolate properly
    dispose hua har baar, koi leak/hang nahi
18. Saare attacks ke baad server turant healthy response deta raha

Yeh prove karta hai ki reusable isolate pattern (RowSandbox) bhi utna hi
secure hai jitna Day 1 ka per-call isolate — har row ka transform apne
aap tak limited rehta hai, server ya baaki data ko kabhi nuksan nahi
pahuncha sakta.

## Important Notes
- **MongoDB** chahiye signup/login/forgot-password/`/me` jaisi DB-wali
  routes ke liye — MongoDB na chale to bhi server crash nahi hota.
- Week 1 (auth, raw upload) aur Week 2 (CSV line-split, JSON preview,
  column mapping) ke saare purane routes is Day 2 build me bhi saath
  chalte hain — koi route break nahi hua.
- Day 3 se aage: transform-config save/get API, phir ise real streaming
  upload pipeline me integrate karna (agle messages me isi tarah test
  karke diya jayega).
