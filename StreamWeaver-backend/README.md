# Week 2 — Day 5 — Mapping Applied in Pipeline (Full Week 2 Complete)

**Kaam:** Day 3 ka saved mapping ab Day 4 ke ETL pipeline ke andar apply hota
hai — final output NDJSON me columns **renamed** hoke aate hain jaise user ne
mapping me specify kiya tha. Yeh Week 2 ka complete, final version hai.

## Naya kya add hua
- `streams/mappingTransformStream.js` — `MappingTransformStream` class
  (JSON object ke keys ko mapping ke hisab se rename karta hai)
- `controllers/etlController.js` — `parseTransformAndSave()` add kiya
  (pipeline: `fileStream -> CsvLineStream -> CsvRowToJsonStream ->
  MappingTransformStream -> NDJSON -> disk`)
- `routes/uploadRoutes.js` — `POST /api/upload/transform` add kiya

## Run
```bash
npm install
cp .env.example .env
npm run db:indexes   # ek baar: indexes banao/verify karo
npm run dev
```

## Test — full flow
```bash
# 1. Mapping save karo (source column -> destination field)
curl -X POST http://localhost:5000/api/mapping \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"mapping":{"id":"userId","name":"fullName","value":"score"}}'

# 2. Ab transform-upload karo
curl -X POST http://localhost:5000/api/upload/transform \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/data.csv"
```
`parsed/*.mapped.ndjson` file check karo — keys renamed milengi
(`id` -> `userId`, `name` -> `fullName`, `value` -> `score`).

Bina mapping save kiye `/api/upload/transform` call karo -> `400` error,
"POST /api/mapping first" ka message milega.

**Verified (end-to-end):**
- Mapping save -> transform-upload -> 50,000 rows, sabhi keys correctly renamed
- Bina mapping ke transform call -> proper `400`, crash nahi hua
- Week 1 (auth, raw upload) aur Week 2 Day 1-4 (parse/lines, json-preview,
  upload/parse) sab isi Day 5 build me saath saath kaam karte hain — koi
  route break nahi hua
