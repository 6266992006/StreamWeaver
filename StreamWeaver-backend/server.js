require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const parseRoutes = require("./routes/parseRoutes");
const mappingRoutes = require("./routes/mappingRoutes");
const jobRoutes = require("./routes/jobRoutes");
const exportRoutes = require("./routes/exportRoutes");
const { attachProgressSocket, WS_PATH } = require("./sockets/progressSocket");

const app = express();

// --- Core middleware ---
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Rate limiting (Week 4 task, wired early so it's active from day 1) ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, message: "Too many requests, please try again later" },
});
app.use("/api/", limiter);

// --- Health check ---
// `routes` lists what THIS running process actually serves. If the frontend
// says "Route not found", open http://localhost:5000/ — a missing route
// here means an older copy of the backend is still running and needs a restart.
const ROUTES = ["/api/auth", "/api/upload", "/api/parse", "/api/mapping", "/api/jobs", "/api/export", WS_PATH];
app.get("/", (req, res) => {
  res.json({ success: true, message: "StreamWeaver backend is running 🚀", routes: ROUTES });
});
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    routes: ROUTES,
    timestamp: new Date().toISOString(),
  });
});

// --- Routes ---
app.use("/api/auth", authRoutes);       // signup, login, forgot-password (Week 1)
app.use("/api/upload", uploadRoutes);   // chunked file upload + CSV->NDJSON parse (Week 1/2, Mohan)
app.use("/api/parse", parseRoutes);     // Week 2 — CSV line-split + CSV->JSON preview (Mohan)
app.use("/api/mapping", mappingRoutes); // Week 2 Day 3 — column-mapping config (Mohan)
app.use("/api/jobs", jobRoutes);        // Week 2 — upload history for the Dashboard (Krishna)
app.use("/api/export", exportRoutes);   // Week 4 — download processed data as CSV/JSON (Krishna)

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// --- Global error handler ---
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ success: false, message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;

// Start the HTTP server immediately so health checks work even before/without
// MongoDB being reachable. DB connects in parallel, not blocking startup.
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

// The classic "my changes don't show up" trap: an older copy of the server
// is still holding the port, so the new one can't start and the browser keeps
// talking to the old code (which is how a new route ends up "not found").
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use — an older StreamWeaver backend is probably still running.`);
    console.error("   Close that terminal (or end the process), then start again.");
    console.error(`   Windows:  netstat -ano | findstr :${PORT}   then   taskkill /PID <pid> /F`);
    console.error(`   Mac/Linux: lsof -ti :${PORT} | xargs kill`);
    process.exit(1);
  }
  throw err;
});

// Week 3 — live job progress over WebSocket (Krishna). Shares the HTTP server;
// clients connect to ws://host:PORT/ws/progress?token=<JWT>.
const progressHub = attachProgressSocket(server);

connectDB();

// Without this, redeploying/restarting (or Ctrl+C) leaves open WebSocket
// connections dangling — the process either hangs waiting for them or gets
// force-killed, and connected browsers see a broken connection instead of a
// clean close. Close the socket hub first, then stop accepting new HTTP
// connections, so an in-progress request still gets to finish.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — shutting down...`);

  await progressHub.close();
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.close().catch(() => {});

  console.log("Shutdown complete.");
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
