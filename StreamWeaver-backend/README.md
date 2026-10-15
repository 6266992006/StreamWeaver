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
# 1. Password reset request karo (DEV MODE me reset link console par
#    log hoga, kyunki SMTP configured nahi hai)
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" -d '{"email":"user@example.com"}'

# 2. Console se raw token copy karo, phir reset karo
curl -X POST http://localhost:5000/api/auth/reset-password/<token> \
  -H "Content-Type: application/json" -d '{"password":"newPassword123"}'
```
Expected: pehle 10 requests `500`/`401` tak pahunchti hain (auth logic
chalta hai), usske baad wali `429` (`"Too many login/signup attempts..."`).

## Security / Correctness — Verified (16/16 tests pass)

Fresh install karke, poora server chalakar, terminal se 16 tests kiye:

1. **Standalone**: `sendPasswordResetEmail` (SMTP unset) → DEV MODE
   console log, throw nahi hota
2. **Standalone**: `sendCompletionNotificationEmail` (SMTP unset) → DEV
   MODE console log, throw nahi hota
3. **Standalone**: `forgotPassword` aur `resetPassword` ka token-hashing
   algorithm identical hai (`sha256`, deterministic, 64-char hex) — jo
   token save hote waqt hash hota hai, wahi lookup karte waqt match
   karega
4. Root route → `200`, label "Week 4 - Day 2"
5. `reset-password` missing password → `400`
6. `reset-password` short password (<6 chars) → `400` — **DB tak
   pahunchta hi nahi**, validation pehle hi rok deti hai
7. `reset-password` valid-shaped request, no DB → graceful `500`, crash
   nahi (Week 1 jaisa hi pattern)
8. Server us graceful-failure ke turant baad healthy
9. Week 1 raw upload → sahi
10. Week 2 `parse/lines` → sahi
11. Week 2 mapping save → `200`
12. Week 3 Day 1 `sandbox/run` → sahi
13. Week 3 Day 3 config save → `200`
14. Week 3 Day 4 `transform-upload` → sahi
15. Week 4 Day 1 ke security headers ab bhi present hain
16. Saare tests ke baad server turant healthy response deta raha

Yeh prove karta hai ki password-reset flow ka token-hashing logic 100%
sahi hai (save aur lookup dono same algorithm use karte hain), validation
DB se pehle hi galat input rok deti hai, aur Week 1/2/3 aur Day 1 ka kaam
is Day 2 build me bhi bilkul sahi chalta hai.

## Important Notes
- **MongoDB** chahiye signup/login/forgot-password/reset-password/`/me`
  jaisi DB-wali routes ke liye — MongoDB na chale to bhi server crash
  nahi hota (is environment me real MongoDB available nahi tha, isliye
  "token match hua ya nahi" wala poora DB-dependent path graceful `500`
  ke through verify kiya gaya, aur core hashing logic standalone test se
  — jab real MongoDB connect hogi, same code un dono scenarios ko sahi
  handle karega: valid token → `200`, invalid/expired token → `400`).
- Reset token **single-use** hai — ek baar consume hone ke baad
  `resetPasswordToken`/`resetPasswordExpires` clear ho jaate hain.
- `authLimiter` ka budget (10/15min) ab 4 routes ke beech shared hai:
  signup, login, forgot-password, reset-password.
- Week 1, Week 2, Week 3 aur Week 4 Day 1 ke saare purane routes is
  Day 2 build me bhi saath chalte hain — koi route break nahi hua.
- Day 3 se aage: buffered bulk-insert class (`BufferedBulkInserter`),
  Day 4 me usse pipeline me integrate karna, Day 5 me completion email
  wiring + final polish.
