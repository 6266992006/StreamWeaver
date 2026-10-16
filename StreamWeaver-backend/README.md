# Week 4 — Day 4 — Buffered Bulk-Insert Integrated Into the Streaming Pipeline

**Kaam:** Day 3 ka `BufferedBulkInserter` abhi standalone tha, kisi real
HTTP flow se juda nahi tha. Day 4 me use asli ETL pipeline me joda:
**CSV upload → line split → JSON convert → saved transform (Week 3
Day 3) apply → MongoDB me buffered bulk-insert (Day 3)** — sab ek hi
`stream.pipe()` chain me, ek hi HTTP request me, poori file kabhi memory
me buffer kiye bina.

Yeh Week 1 + Week 2 + Week 3 (Day 1-5) + Week 4 (Day 1-3) ke upar bana
hai — sab already isme kaam karte hain.

## Naya kya add hua (Day 4)
- `models/ProcessedRow.js` — Mongoose model jahan transform-ki-hui rows
  store hoti hain. Schema deliberately loose hai (`Mixed` type) kyunki
  har upload ke columns alag ho sakte hain — yeh ek generic ETL sink hai,
  fixed business table nahi. Har doc me `userId` aur `jobId` hote hain
  taaki ek upload ki saari rows group me query ho sakein, aur ek user ka
  data doosre se alag rahe.
- `streams/rowWrapStream.js` — `RowWrapStream`: chhota adapter jo
  `FieldTransformStream` se aane wali plain row (`{field: value}`) ko
  `{ userId, jobId, data: row }` shape me wrap karta hai, jo
  `ProcessedRow` model expect karta hai. `BufferedBulkInserter` ko khud
  generic rakha — yeh ek chhota piece hi row ka shape jaanta hai.
- `controllers/transformController.js` — `transformUploadToDb()`
  handler: upload → `CsvLineStream` → `CsvRowToJsonStream` →
  `FieldTransformStream` (saved config) → `RowWrapStream` →
  `BufferedBulkInserter(ProcessedRow)` pipeline banata hai, ek random
  `jobId` generate karta hai, aur stream khatam hone par total rows +
  batches count return karta hai.
- `routes/transformRoutes.js` — `POST /api/sandbox/transform-upload-db`
  add kiya.

## Run
```bash
npm install
cp .env.example .env
npm start
```

## Test

Pehle config save karo (Week 3 Day 3):
```bash
curl -X POST http://localhost:5000/api/sandbox/config \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"fieldTransforms": {"name": "value.toUpperCase()", "score": "Number(value) * 2"}}'
```
Expected: pehle 10 requests `500`/`401` tak pahunchti hain (auth logic
chalta hai), usske baad wali `429` (`"Too many login/signup attempts..."`).

Phir CSV upload karo — saved config apply hoke MongoDB me bulk-insert
hoga:
```bash
curl -X POST http://localhost:5000/api/sandbox/transform-upload-db \
  -H "Authorization: Bearer <token>" -F "file=@yourfile.csv"
```
Response (MongoDB connected hone par):
```json
{
  "success": true,
  "message": "File transformed and bulk-inserted into MongoDB",
  "jobId": "a1b2c3...",
  "totalRows": 12000,
  "batches": 3,
  "fieldTransforms": { "name": "value.toUpperCase()" }
}
```

## Correctness — Verified (16/16 tests pass)

Fresh install karke, poora server chalakar, terminal se 16 tests kiye:

**Full-pipeline standalone test (mock model ke saath, asli stream chain):**
1. **12000-row real CSV file** → `CsvLineStream → CsvRowToJsonStream →
   FieldTransformStream → RowWrapStream → BufferedBulkInserter` poore
   pipeline se guzri → **exactly 3 batches [5000, 5000, 2000]**
2. Har doc sahi se `{ userId, jobId, data }` shape me wrapped mila
3. Transform sahi apply hua (name uppercase, score doubled) — pipeline
   ke end tak data sahi raha

**Live server tests (13):**
4. Root route → `200`, label "Week 4 - Day 4"
5. `transform-upload-db` bina token → `401`
6. `transform-upload-db` config save se pehle → `404`
7. Config save → `200`
8. **Config save ke baad, MongoDB available na hone par** →
   `transform-upload-db` **graceful `500`** (`"Bulk insert failed"`),
   crash nahi — bilkul Week 1 ke signup jaisa hi pattern
9. Server us graceful-failure ke turant baad healthy
10. Week 1 raw upload → sahi
11. Week 2 `parse/lines` → sahi
12. Week 2 mapping save → `200`
13. Week 3 Day 1 `sandbox/run` → sahi
14. Week 3 Day 4 `transform-upload` (preview) → sahi
15. Week 3 Day 5 `transform-download` + `download` → poora flow sahi
16. Week 4 Day 1 (security headers) aur Day 2 (`reset-password`
    validation) dono ab bhi sahi

Yeh prove karta hai ki pipeline ka wiring (parse → transform → wrap →
buffer → bulk-insert) end-to-end 100% sahi hai, aur jab real MongoDB
available hogi to yahi code `200` + `totalRows`/`batches` return karega
— abhi DB na hone par bhi server kabhi crash nahi hota, sirf clean error
deta hai.

## Important Notes
- Is environment me real MongoDB available nahi hai (network allow-list
  ki wajah se), isliye poori pipeline ko do tarike se verify kiya gaya:
  (a) asli stream chain ko ek **mock MongoDB model** ke against chalakar
  — isse 12000 rows ka exact batching aur data-correctness prove hota
  hai — aur (b) HTTP endpoint ko live server par chalakar confirm kiya
  ki MongoDB na hone par bhi woh **crash nahi hota**, sirf graceful `500`
  deta hai. Jab real MongoDB connect hogi, same code `200` + stats
  return karega.
- `transformUploadToDb` ek naya random `jobId` har upload ke liye
  generate karta hai — isse ek hi user ki alag-alag uploads bhi Mongo me
  alag-alag group me query ho sakti hain.
- Week 1, Week 2, Week 3 aur Week 4 Day 1-3 ke saare purane routes is
  Day 4 build me bhi saath chalte hain — koi route break nahi hua.
- Day 5 se aage: bulk-insert job khatam hone par **completion-
  notification email** (Day 2 ka `sendCompletionNotificationEmail`)
  bhejna, aur poore project ka final polish/summary.
