# Week 2 — Day 3 — Column-Mapping Config API

**Kaam:** API jo frontend se column-mapping config (source CSV column ->
destination field name) accept karke save karta hai. Har user ka apna mapping
alag store hota hai (JWT token se pehchana jata hai).

## Naya kya add hua
- `models/mappingStore.js` — in-memory store (userId -> mapping)
- `controllers/mappingController.js` — `saveMapping()`, `getMapping()`
- `routes/mappingRoutes.js` — `POST /api/mapping`, `GET /api/mapping`

## Run
```bash
npm install
cp .env.example .env
npm start
```

## Test
```bash
# Save mapping
curl -X POST http://localhost:5000/api/mapping \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"mapping":{"Full Name":"name","Email Address":"email"}}'

# Get saved mapping
curl http://localhost:5000/api/mapping -H "Authorization: Bearer <token>"
```

**Verified:**
- Bina mapping save kiye GET karo -> `404`
- Valid mapping POST -> `200`, wapas GET karne pe same mapping milta hai
- Empty mapping `{}` POST -> `400` (validation)
- Bina token -> `401`

## Note
Yeh mapping server memory me store hoti hai (restart hone pe reset ho jayegi) —
Week 2 ke liye jaanbujh kar simple rakha hai. Baad me MongoDB collection me
badalna ho to sirf `mappingStore.js` change karna padega, baaki code same rahega.
