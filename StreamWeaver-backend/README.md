# Week 2 — Day 2 — CSV Row -> JSON Transform Stream

**Kaam:** Ek aur `stream.Transform` class jo Day 1 ke `CsvLineStream` ke baad
chalti hai — har CSV line ko JSON object me convert karti hai (pehli line ko
header maan kar). Quoted-comma fields (jaise `"Doe, John"`) bhi sahi handle
hote hain.

## Naya kya add hua
- `streams/csvRowToJsonStream.js` — `CsvRowToJsonStream` class
- `controllers/parseController.js` — `previewJson()` handler add kiya
- `routes/parseRoutes.js` — `POST /api/parse/json-preview` add kiya

## Run
```bash
npm install
cp .env.example .env
npm start
```

## Test
```bash
curl -X POST http://localhost:5000/api/parse/json-preview \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/data.csv"
```
Expected response:
```json
{
  "success": true,
  "headers": ["id", "name", "value"],
  "totalRows": 50000,
  "preview": [{"id":"0","name":"row0","value":"0"}, ...]
}
```

**Verified:**
- Quoted comma field (`"Doe, John",25`) -> 1 field, sahi parse hua
- 50,000-row CSV -> totalRows: 50000, first 5 rows preview me sahi aaye
