 Project Setup & Server Skeleton
 Node.js + Express server setup, MongoDB connection config, health-check route.

## Run

npm install
cp .env.example .env
npm start

## Test

curl http://localhost:5000/api/health

Expected: `{"success":true,"status":"ok","day":1,...}`
