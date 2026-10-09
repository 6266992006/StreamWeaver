# Week 3 — Day 1 — isolated-vm Sandbox Core (SandboxRunner)

**Kaam:** `isolated-vm` package integrate karna — user-supplied JavaScript
ko ek alag V8 isolate me, memory-limit aur timeout ke saath, safely run
karna. Yeh poori Week 3 ka foundation hai: baki saare din isi engine ko
reuse/extend karte hain.

Yeh Week 1 + Week 2 ke upar bana hai, isliye auth, raw upload, CSV parsing
aur mapping sab already isme kaam karte hain.

## Naya kya add hua
- `sandbox/sandboxRunner.js` — `SandboxRunner` class: har call par naya
  isolate banata hai, JS snippet run karta hai, result deta hai, phir
  isolate dispose kar deta hai
- `controllers/transformController.js` — `runSnippet()` handler
- `routes/transformRoutes.js` — `POST /api/sandbox/run`

## Run
```bash
npm install
cp .env.example .env
npm start
```

## Test
```bash
curl -X POST http://localhost:5000/api/sandbox/run \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"code":"value.toUpperCase()","value":"hello world"}'
```
Expected: `{"success":true,"result":"HELLO WORLD"}`

## Security — Verified (yeh sabse zaroori test hai)
- Normal transform (`value.toUpperCase()`, `value * 2`) → sahi result
- `while(true){}` (infinite loop) → **exactly 1 second me timeout**, server
  hang nahi hua
- `require("fs").readFileSync(...)` → `"require is not defined"` — Node
  ke APIs isolate ke andar bilkul accessible nahi hain
- `process.exit(1)` → `"process is not defined"` — process bhi accessible
  nahi
- In saare attacks ke baad bhi server zinda tha aur health-check normal
  respond kar raha tha

Yeh prove karta hai ki `isolated-vm` sach me isolate karta hai — koi bhi
user script sirf apne aap ko nuksan pahuncha sakta hai, server ko nahi.
