# Week 3 — Day 2 — WebSocket Job Progress (`sockets/progressSocket.js`)

**Kaam:** Import chalte waqt `TransformJob` ke counters (`rowsProcessed`,
`rowsFailed`, `rowsPerSec`, `status`) ko WebSocket se browser tak push karna,
taaki Akshaya ka progress bar + "rows/sec" bina REST polling ke live update ho.

## Naya kya add hua
- `sockets/progressSocket.js` — `ProgressHub` + `attachProgressSocket(server)`
- `server.js` — hub HTTP server pe attach (same port, path `/ws/progress`)
- `tests/progressSocket.test.js` — 21 tests (auth, ownership, push-on-change, cap, DB error recovery)
- `package.json` — `ws` dependency add hui (`npm install`)

## Connect
```
ws://localhost:5000/ws/progress?token=<JWT>
```
Browser WebSocket me Authorization header nahi laga sakte, isliye wahi JWT
query string me jata hai. Token galat/missing -> HTTP 401, socket khulta hi nahi.

## Messages (JSON)
| Direction | Message |
|---|---|
| client -> server | `{ "type": "subscribe", "jobId": "<id>" }` |
| client -> server | `{ "type": "unsubscribe", "jobId": "<id>" }` / `{ "type": "ping" }` |
| server -> client | `{ "type": "ready" }` (connect hone ke baad ek baar) |
| server -> client | `{ "type": "progress", jobId, status, totalRows, rowsProcessed, rowsFailed, rowsPerSec, percent, startedAt, finishedAt, errorMessage }` |
| server -> client | `{ "type": "error", jobId?, message }` / `{ "type": "pong" }` |

- `percent` = 0–100, `totalRows` unknown ho to `null`; job `done` hone pe `100`.
- Subscribe karte hi turant ek snapshot aata hai, uske baad **sirf change hone pe** frame.
- Job `done`/`failed` hone pe final frame bhej ke subscription apne aap hat jaata hai.

## Akshaya ke liye (`useWebSocket.js` me kaise use karna hai)
```js
const ws = new WebSocket(`ws://localhost:5000/ws/progress?token=${token}`);
ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", jobId }));
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "progress") setProgress(msg); // msg.percent, msg.rowsPerSec ...
};
```

## Design decisions
- **Ek tick = ek batched query** (`$in` sab watched jobs pe), chahe 50 clients ho. DB pe load nahi badhta.
- DB poll karte hain (JobTracker se direct call nahi) — isse import dusre process me chale ya server scale ho, tab bhi kaam karta hai.
- `errorLog` kabhi select nahi hota — progress frames chhote rehte hain.
- User sirf **apne** jobs dekh sakta hai (`ownerId` filter); dusre ka job "Job not found" jaisa dikhta hai.
- Per-socket max 20 subscriptions, client message max 4KB, slow client ke liye frame skip (memory safe), 30s heartbeat se dead connection hat jaate hain.
- Poll timer tabhi chalta hai jab koi subscription ho.

## Test
```bash
npm test                                   # poora suite (75 tests)
node --test tests/progressSocket.test.js   # sirf is din ke 21 tests
```
