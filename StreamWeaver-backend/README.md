# Week 4 — Day 1 — Rate Limiting + Security Headers (Finalized)

**Kaam:** Week 1 se ek basic rate limiter aur `helmet()` inline server.js
me lage hue the ("Week 4 task, wired early" comment ke saath). Day 1 me
inhe **finalize** kiya — apni dedicated files me nikala, aur auth routes
(signup/login/forgot-password/reset-password) ko ek **alag, zyada strict
rate limiter** diya taaki brute-force / credential-stuffing attack ka
apna tight budget ho, baaki API se alag.

Yeh Week 1 + Week 2 + Week 3 (Day 1-5) ke upar bana hai — auth, raw
upload, CSV parsing, column mapping, sandboxed transforms (single
snippet, row, saved config, live streaming apply, end-to-end
save+download) sab already isme kaam karte hain.

## Naya kya add hua (Day 1)
- `middleware/rateLimiter.js` — do limiters export karta hai:
  - `generalLimiter` — saare `/api/` routes par, 200 requests / 15 min
    per IP (pehle se tha, bas apni file me nikala)
  - `authLimiter` — **sirf** signup/login/forgot-password/reset-password
    par, sirf **10 attempts / 15 min per IP** (naya, strict) — agar koi
    password guess karne ki koshish kare to sirf 10 hi chance milenge
- `middleware/security.js` — `helmet()` ka explicit config (CSP,
  `object-src: none`, HSTS 180 din, `cross-origin-resource-policy`),
  CORS, aur `x-powered-by` header disable — pehle sab defaults par chal
  raha tha, ab explicit aur ek hi jagah hai
- `server.js` aur `routes/authRoutes.js` dono in naye files ko use karte
  hain ab

## Run
```bash
npm install
cp .env.example .env
npm start
```

## Test
```bash
# Security headers check karo
curl -I http://localhost:5000/api/health

# Auth rate limiter test karo (11 parallel login attempts bhejo)
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" -d '{"email":"x@x.com","password":"wrong"}' &
done
wait
```
Expected: pehle 10 requests `500`/`401` tak pahunchti hain (auth logic
chalta hai), usske baad wali `429` (`"Too many login/signup attempts..."`).

## Security / Correctness — Verified (13/13 tests pass)

Fresh install karke, poora server chalakar, terminal se 13 tests kiye:

1. Root route → `200`, label "Week 4 - Day 1"
2. Week 1 signup bina MongoDB ke → graceful `500`, crash nahi
3. **Security headers present**: `X-Frame-Options`, `X-Content-Type-
   Options`, `Strict-Transport-Security`, `Cross-Origin-Resource-Policy`
4. **`X-Powered-By` header absent** (Express fingerprint hide hua)
5. Week 1 raw upload → `success:true`
6. Week 2 `parse/lines` → sahi
7. Week 2 mapping save → `200`
8. Week 3 Day 1 `sandbox/run` → sahi
9. Week 3 Day 3 config save → `200`
10. Week 3 Day 4 `transform-upload` (live preview) → sahi
11. Week 3 Day 5 `transform-download` + `download` → poora flow sahi,
    exact transformed content mila
12. **Auth rate limiter**: 11 parallel login attempts me se sirf pehle
    10 hi handler tak pahunche, 11th (ya usse aage) `429` mila — exact
    budget enforce hua
13. Saare tests ke baad server turant healthy response deta raha

Yeh prove karta hai ki Week 1, Week 2, aur Week 3 ka poora kaam is Day 1
build me bhi 100% sahi chalta hai, aur naya rate-limiting + security
layer kisi purane route ko break nahi karta — sirf extra protection add
karta hai.

## Important Notes
- **MongoDB** chahiye signup/login/forgot-password/`/me` jaisi DB-wali
  routes ke liye — MongoDB na chale to bhi server crash nahi hota.
- `authLimiter` ek hi budget share karta hai signup + login +
  forgot-password + reset-password (Day 2) ke beech — matlab agar koi
  inn charo routes ko mila kar 10 baar try kare 15 minute me, 11th
  request kisi bhi ek par ho, block ho jayegi.
- Week 1, Week 2 aur Week 3 (Day 1-5) ke saare purane routes is Day 1
  build me bhi saath chalte hain — koi route break nahi hua.
- Day 2 se aage: password-reset email flow finalize hoga (abhi tak
  token generate hota hai par consume karne ka endpoint nahi tha).
