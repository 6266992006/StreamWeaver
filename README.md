# User Model + Sign Up API

 Mongoose User schema, bcrypt password hashing, Sign Up API with JWT token response.

## Run

npm install
cp .env.example .env   # set MONGO_URI + JWT_SECRET
npm start

MongoDB chalna chahiye is din ke liye (signup DB me likhta hai).

## Test

curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Mohan","email":"mohan@test.com","password":"secret123"}'
gir
Expected: `token` aur `user` object response me.
