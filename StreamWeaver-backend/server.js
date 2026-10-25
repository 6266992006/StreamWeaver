require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const applySecurityMiddleware = require("./middleware/security");
const { generalLimiter } = require("./middleware/rateLimiter");
const authRoutes = require("./routes/authRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const parseRoutes = require("./routes/parseRoutes");
const mappingRoutes = require("./routes/mappingRoutes");
const jobRoutes = require("./routes/jobRoutes");
const transformRoutes = require("./routes/transformRoutes");
const exportRoutes = require("./routes/exportRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const { getUploadHistory } = require("./controllers/historyController");
const { attachProgressSocket, WS_PATH } = require("./sockets/progressSocket");

const app = express();

// --- Core + security middleware (helmet, CORS, no x-powered-by) ---
applySecurityMiddleware(app);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Rate limiting (auth routes get their own, stricter limiter in authRoutes.js) ---
app.use("/api/", generalLimiter);

// --- Health check ---
// `routes` lists what THIS running process actually serves. If the frontend
// says "Route not found", open http://localhost:5000/ — a missing route
// here means an older copy of the backend is still running and needs a restart.
const ROUTES = [
  "/api/auth",
  "/api/upload",
  "/api/parse",
  "/api/mapping",
  "/api/jobs",
  "/api/sandbox",
  "/api/export",
  WS_PATH,
];
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
app.use("/api/auth", authRoutes);         // signup, login, forgot/reset password, /me (roles)
app.use("/api/upload", uploadRoutes);     // raw chunked file upload + GET /history
app.get("/api/history", authMiddleware, getUploadHistory); // alias for the raw-upload history
app.get("/api/uploads", authMiddleware, getUploadHistory); // alias for the raw-upload history
app.use("/api/parse", parseRoutes);       // CSV line-split + CSV->JSON preview
app.use("/api/mapping", mappingRoutes);   // column-mapping config
app.use("/api/jobs", jobRoutes);          // imports: create + stream file, history, failed rows
app.use("/api/sandbox", transformRoutes); // isolated-vm sandbox: run, transform-row, config, ...
app.use("/api/export", exportRoutes);     // export data + error reports

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

// Live job progress over WebSocket. Shares the HTTP server; clients connect to
// ws://host:PORT/ws/progress?token=<JWT>.
const progressHub = attachProgressSocket(server);

connectDB();

// Close WebSocket connections first, then stop accepting HTTP connections, so
// a restart / Ctrl+C doesn't leave browsers with a silently hanging socket.
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
