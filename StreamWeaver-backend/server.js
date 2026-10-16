require("dotenv").config();
const express = require("express");

const connectDB = require("./config/db");
const applySecurityMiddleware = require("./middleware/security");
const { generalLimiter } = require("./middleware/rateLimiter");
const authRoutes = require("./routes/authRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const parseRoutes = require("./routes/parseRoutes");
const mappingRoutes = require("./routes/mappingRoutes");
const transformRoutes = require("./routes/transformRoutes");

const app = express();

// --- Core + security middleware (Week 4 Day 1 — finalized into its own file) ---
applySecurityMiddleware(app);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Rate limiting (Week 4 Day 1 — finalized into its own file; auth
// routes get their own, stricter limiter, applied in authRoutes.js) ---
app.use("/api/", generalLimiter);

// --- Health check ---
app.get("/", (req, res) => {
  res.json({ success: true, message: "StreamWeaver backend is running 🚀 (Week 4 - Day 4)" });
});
app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok", week: 4, day: 4, timestamp: new Date().toISOString() });
});

// --- Routes ---
app.use("/api/auth", authRoutes);         // signup, login, forgot-password (Week 1)
app.use("/api/upload", uploadRoutes);     // chunked file upload (Week 1)
app.use("/api/parse", parseRoutes);       // Week 2 — CSV line-split + CSV->JSON
app.use("/api/mapping", mappingRoutes);   // Week 2 — column-mapping config
app.use("/api/sandbox", transformRoutes); // Week 3 Day 1 (run) + Day 2 (transform-row) + Day 3 (config) + Day 4 (transform-upload) + Day 5 (transform-download + download) + Week 4 Day 4 (transform-upload-db)

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
