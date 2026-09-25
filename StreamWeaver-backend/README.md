# Day 5 — Chunked File Upload (busboy) + Full Week 1

**Kaam:** busboy se file ko stream karke disk par likhna (poora file kabhi RAM me load nahi hota), protected upload route, poore Week 1 ka final integration (signup → login → upload).

Yeh Week 1 ka **complete, final version** hai — isme Day 1-4 ka sab kuch already included hai.

## Run
```bash
npm install
cp .env.example .env
npm start
```

## Test — full flow
```bash
# 1. Signup
curl -X POST http://localhost:5000/api/auth/signup -H "Content-Type: application/json" \
  -d '{"name":"Mohan","email":"mohan@test.com","password":"secret123"}'
# copy the "token" from the response

# 2. Upload a file with that token
curl -X POST http://localhost:5000/api/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/any/file.csv"
```
Expected: `201`, file `uploads/` folder me save ho jaati hai, response me file details milte hain.

Without token → `401`. Bina file bheje → `400`.

## Note — `uploads/` folder shuru me khali kyu hai
`uploads/` folder me sirf `.gitkeep` (0 bytes placeholder) hota hai — yeh **normal hai**,
bug nahi. Yeh folder tab tak khali rahega jab tak aap koi file upload na karo. Upload
karte hi wahi file `uploads/` folder ke andar save ho jayegi (upar wale test se dekh
sakte ho). Code khud bhi check karta hai ki agar `uploads/` folder missing ho to usse
apne aap bana leta hai — isliye yeh delete ho jaye to bhi koi dikkat nahi.
