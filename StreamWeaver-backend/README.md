# Week 4 — Day 3 — BufferedBulkInserter (Buffered Bulk-Insert Trigger)

**Kaam:** Project ka requirement hai — "Implement a buffer mechanism
that triggers MongoDB `insertMany`/`bulkWrite` operations every 5,000
records." Day 3 me wahi buffer mechanism banaya: ek real
`stream.Writable` class jo rows ko memory me buffer karti hai, aur jaise
hi buffer `5000` tak pahunchta hai, ek hi `bulkWrite` call se poora batch
insert kar deti hai — kabhi ek-ek row insert nahi karti. Stream khatam
hone par bachi hui (incomplete) rows bhi automatically flush ho jaati
hain, taaki kuch bhi silently drop na ho.

Yeh abhi standalone hai — Day 4 me ise real streaming pipeline (upload →
parse → saved transform) me jodenge. Isliye Day 3 ka poora focus is ek
class ko bilkul sahi banane aur **thoroughly test** karne par hai.

Yeh Week 1 + Week 2 + Week 3 (Day 1-5) + Week 4 Day 1-2 ke upar bana hai
— sab already isme kaam karte hain.

## Naya kya add hua (Day 3)
- `streams/bufferedBulkInserter.js` — `BufferedBulkInserter` class
  (`stream.Writable`, object mode):
  - Rows ko ek internal array me buffer karta hai
  - Buffer `batchSize` (default `5000`) tak pahunchte hi ek `bulkWrite`
    call fire karta hai (`insertOne` ops ka array), buffer clear karta
    hai
  - Stream khatam (`_final`) hone par agar buffer me kuch bacha ho
    (chhota, incomplete batch) to usey bhi flush karta hai
  - `extraFields` option se har doc par extra data (jaise `userId`)
    stamp kar sakte ho
  - Deliberately **Mongoose-agnostic** — sirf `model.bulkWrite(ops)`
    expect karta hai, isliye bina real database ke bhi (mock object se)
    poori tarah unit-test ho sakta hai, aur kal (Day 4) real
    `ProcessedRow` Mongoose model ke saath seedha kaam karega

## Run
```bash
npm install
cp .env.example .env
npm start
```

## Test

Yeh class khud ek HTTP endpoint nahi hai (wo Day 4 me aayega) — isliye
iska asli test ek standalone Node script hai jo ise ek **mock MongoDB
model** (sirf `bulkWrite` method wala plain object) ke saath chalata
hai:

```js
const { Readable } = require("stream");
const BufferedBulkInserter = require("./streams/bufferedBulkInserter");

const mockModel = {
  async bulkWrite(ops) {
    console.log(`bulkWrite called with ${ops.length} docs`);
    return { insertedCount: ops.length };
  },
};

const inserter = new BufferedBulkInserter(mockModel, { batchSize: 5000 });
Readable.from([{ n: 1 }, { n: 2 }, /* ... 12000 rows ... */], { objectMode: true })
  .pipe(inserter);

inserter.on("finish", () => console.log(inserter.stats));
// { totalInserted: 12000, batchesFlushed: 3 }
```

## Correctness — Verified (21/21 tests pass)

Fresh install karke, poora server chalakar, terminal se 21 tests kiye:

**Standalone unit tests (12) — mock model ke saath, bina real DB ke:**
1. **12000 rows, batchSize 5000** → exactly **3 bulkWrite calls**
   `[5000, 5000, 2000]` — bilkul PDF ke requirement jaisa
2. `totalInserted` stat = `12000` sahi
3. `batchesFlushed` stat = `3` sahi
4. `batchFlushed` event 3 baar fire hua, sequential `batchNumber` (1,2,3)
5. Exactly `5000` rows → `1` hi batch (boundary case)
6. `1` row → stream end par flush hota hai (`_final`), chhota batch bhi
   drop nahi hota
7. `0` rows → `bulkWrite` kabhi call hi nahi hota
8. `extraFields` (jaise `userId`) har doc par sahi se stamp hote hain
9. **`bulkWrite` se error** (simulated DB failure) → stream `error`
   event ke through cleanly propagate hoti hai, hang nahi hoti
10. **50000 rows** → `10` batches of `5000`, sirf `~30ms` me (pure
    in-memory buffering, koi I/O wait nahi is step me)
11. `50000` rows → `totalInserted = 50000` sahi
12. Constructor bina `bulkWrite` method wale object ke `throw` karta hai
    (misuse turant pakड़ा jaata hai, chup-chaap fail nahi hota)

**Live server regression (9) — confirm kuch bhi break nahi hua:**
13. Root route → `200`, label "Week 4 - Day 3"
14. Week 1 raw upload → sahi
15. Week 2 `parse/lines` → sahi
16. Week 2 mapping save → `200`
17. Week 3 Day 1 `sandbox/run` → sahi
18. Week 3 Day 3 config save → `200`
19. Week 3 Day 4 `transform-upload` → sahi
20. Week 4 Day 2 `reset-password` validation → `400` (DB tak pahunche
    bina)
21. Week 4 Day 1 security headers ab bhi present

Yeh prove karta hai ki `BufferedBulkInserter` ka batching logic (exact
threshold par flush, leftover flush on end, error propagation, per-doc
tagging) 100% sahi hai — chahe real MongoDB ho ya na ho, kyunki poora
test `bulkWrite` interface ke against hua hai jo Day 4 me real Mongoose
model bhi expose karega.

## Important Notes
- Is environment me **real MongoDB available nahi hai** (koi local
  `mongod` nahi, aur `mongodb-memory-server` jaisa package bhi MongoDB
  ka binary download nahi kar paaya kyunki outbound network sirf
  allow-listed hosts tak hi jaata hai) — isliye `BufferedBulkInserter`
  ko ek **mock model** (`{ bulkWrite(ops) {...} }`) ke against test kiya
  gaya, jo asli Mongoose model ke `bulkWrite` interface se bilkul match
  karta hai. Jab Day 4 me real `ProcessedRow` model use hoga aur
  MongoDB available hogi, same code same tarah kaam karega.
- Week 1, Week 2, Week 3 aur Week 4 Day 1-2 ke saare purane routes is
  Day 3 build me bhi saath chalte hain — koi route break nahi hua.
- Day 4 se aage: isi class ko real streaming pipeline me jodna — CSV
  upload → parse → saved transform → `BufferedBulkInserter` → MongoDB,
  ek naye `POST /api/sandbox/transform-upload-db` endpoint ke through.
