# Day 4 — Forgot Password Flow

 Login API (bcrypt.compare + JWT), JWT verification middleware, protected `/api/auth/me` route to prove it works.

## Run

npm install
cp .env.example .env
npm start

## Test

```bash
# 1. Signup (or use an existing user)
curl -X POST http://localhost:5000/api/auth/signup -H "Content-Type: application/json" \
  -d '{"name":"Mohan","email":"mohan@test.com","password":"secret123"}'

# 2. Login -> copy the token from response
curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"mohan@test.com","password":"secret123"}'

# 3. Call protected route with the token

curl http://localhost:5000/api/auth/me -H "Authorization: Bearer <token>"
```

Expected: without token → 401. With valid token → your user details.
