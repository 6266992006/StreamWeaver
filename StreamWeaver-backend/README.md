# Week 2 — Day 1 — CSV Line-Splitting Transform Stream

**Kaam:** Node.js `stream.Transform` class jo uploaded file ke raw chunks ko
CSV lines me split karta hai — chunk boundaries ke across bhi line kabhi
corrupt nahi hoti (partial line ko buffer me rakhta hai jab tak poori na ho jaye).

Yeh poora Week 1 (auth + raw upload) ke upar hi bana hai, isliye login/signup/
upload sab already isme kaam karte hain.

## Naya kya add hua
- `streams/csvLineStream.js` — `CsvLineStream` class (extends `Transform`)
- `controllers/parseController.js` — `previewLines()` handler
- `routes/parseRoutes.js` — `POST /api/parse/lines`

## Run
```bash
npm install
cp .env.example .env
npm start
```

## Test
```bash
# token chahiye — login se lo (Week 1), ya test ke liye khud sign karo
curl -X POST http://localhost:5000/api/parse/lines \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/data.csv"
```
Expected response:
```json
{
  "success": true,
  "totalLines": <total rows incl. header>,
  "preview": ["header,row1,...", "..."]
}
```

**Verified:** 50,000-row CSV -> totalLines: 50001 (header + rows), chunk-boundary
split kabhi galat nahi aaya.
