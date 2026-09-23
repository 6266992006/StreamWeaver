# Forgot Password Flow

**Reset token generate + hash + save, email service (SMTP configured nahi hai to console me link print hota hai taaki testing block na ho).

## Run

npm install
cp .env.example .env
npm start

## Test

curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"mohan@test.com"}'

Expected: `{"success":true,"message":"If that email is registered..."}` aur terminal console me reset link print hoga (agar SMTP set nahi hai).
