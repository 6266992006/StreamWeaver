# Week 2 — Day 4 — Full ETL Pipeline (CSV -> NDJSON on disk)

**Kaam:** Day 1 + Day 2 ke streams ko ek real upload endpoint me jodna —
uploaded CSV file seedha disk par NDJSON (newline-delimited JSON) format me
save hoti hai, bina kabhi poori file RAM me load kiye.

## Naya kya add hua
- `controllers/etlController.js` — `parseAndSave()` — poori pipeline
  (`fileStream -> CsvLineStream -> CsvRowToJsonStream -> NDJSON -> disk`)
  Node.js ke `pipeline()` helper se jodi gayi (proper error handling +
  backpressure ke saath)
- `routes/uploadRoutes.js` — `POST /api/upload/parse` add kiya
- `parsed/` folder — output NDJSON files yahan save hoti hain

## Run
```bash
npm install
cp .env.example .env
npm start
```

## Test
```bash
curl -X POST http://localhost:5000/api/upload/parse \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/data.csv"
```
Response me `savedAs` filename milega — `parsed/` folder me check karo.

**Verified:** 50,000-row CSV upload -> `parsed/*.ndjson` file me exactly 50,000
lines, har line valid JSON hai, first aur last object manually verify kiye.
