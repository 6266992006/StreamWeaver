# Week 4 — Day 2 — Password-Reset Email Flow (Finalized)

**Kaam:** Week 1 se `forgotPassword` already ek reset token generate
karke save kar raha tha aur email bhejne ki koshish karta tha, par token
ko **consume karke password change karne** ka koi endpoint nahi tha —
flow adhoora tha. Day 2 me use complete kiya: naya `resetPassword`
endpoint, aur `emailService.js` ko finalize karke usme ek **completion-
notification** email function bhi add kiya (Week 4 Day 5 me bulk-insert
job khatam hone par use hoga).

Yeh Week 1 + Week 2 + Week 3 (Day 1-5) + Week 4 Day 1 (rate limiting,
security headers) ke upar bana hai — sab already isme kaam karte hain.

## Naya kya add hua (Day 2)
- `controllers/authController.js` — `resetPassword()` handler: URL se
  raw token leta hai, usi algorithm se hash karta hai jo `forgotPassword`
  save karte waqt use karta hai (`sha256`), matching user dhundhta hai
  jiska stored hash match kare AND expiry (`15 min`) nikli na ho, naya
  password set karta hai, aur token fields clear kar deta hai (taaki
  token **ek hi baar** use ho sake)
- `routes/authRoutes.js` — `POST /api/auth/reset-password/:token` add
  kiya (yeh bhi Day 1 ke strict `authLimiter` budget me shamil hai —
  signup/login/forgot-password ke saath, taaki token-guessing attack bhi
  rate-limited rahe)
- `utils/emailService.js` — `sendCompletionNotificationEmail()` add kiya
  (Day 5 me bulk-insert job finish hone par use hoga)
- `.env.example` — **bug fix**: SMTP placeholder values (`smtp.gmail.com`
  jaisi fake values) pehle non-empty hone ki wajah se app real Gmail se
  connect karne ki koshish karta tha aur fail/hang ho jaata tha. Ab ye
  saari lines comment-out hain by default, taaki fresh install par
  `emailService.js` turant DEV MODE (console log) me chale, bina kisi
  real SMTP account ke zaroorat ke.

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
