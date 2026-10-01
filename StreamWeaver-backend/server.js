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
  res.json({ success: true, message: "StreamWeaver backend is running 🚀 (Week 2 - Day 4)" });
});
app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok", week: 2, day: 4, timestamp: new Date().toISOString() });
});

// --- Routes ---
app.use("/api/auth", authRoutes);       // signup, login, forgot-password (Week 1)
app.use("/api/upload", uploadRoutes);   // chunked file upload (Week 1)
app.use("/api/parse", parseRoutes);     // Week 2 — CSV line-split (Day 1) + CSV->JSON (Day 2)
app.use("/api/mapping", mappingRoutes); // Week 2 Day 3 — column-mapping config

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
