require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const parseRoutes = require("./routes/parseRoutes");
const mappingRoutes = require("./routes/mappingRoutes");
const transformRoutes = require("./routes/transformRoutes");

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
app.get("/", (req, res) => {
  res.json({ success: true, message: "StreamWeaver backend is running 🚀 (Week 3 - Day 2)" });
});
app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok", week: 3, day: 2, timestamp: new Date().toISOString() });
});

// --- Routes ---
app.use("/api/auth", authRoutes);         // signup, login, forgot-password (Week 1)
app.use("/api/upload", uploadRoutes);     // chunked file upload (Week 1)
app.use("/api/parse", parseRoutes);       // Week 2 — CSV line-split + CSV->JSON
app.use("/api/mapping", mappingRoutes);   // Week 2 — column-mapping config
app.use("/api/sandbox", transformRoutes); // Week 3 Day 1 (run) + Day 2 (transform-row)

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
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
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
