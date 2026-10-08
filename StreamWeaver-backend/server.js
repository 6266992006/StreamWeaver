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
<<<<<<< HEAD
=======
const jobRoutes = require("./routes/jobRoutes");
const exportRoutes = require("./routes/exportRoutes");
const { attachProgressSocket, WS_PATH } = require("./sockets/progressSocket");
>>>>>>> krishna

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
<<<<<<< HEAD
=======
// `routes` lists what THIS running process actually serves. If the frontend
// says "Route not found", open http://localhost:5000/ — a missing route
// here means an older copy of the backend is still running and needs a restart.
const ROUTES = ["/api/auth", "/api/upload", "/api/parse", "/api/mapping", "/api/jobs", "/api/export", WS_PATH];
>>>>>>> krishna
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
<<<<<<< HEAD
app.use("/api/upload", uploadRoutes);   // chunked file upload (Week 1)
app.use("/api/parse", parseRoutes);     // Week 2 — CSV line-split (Day 1) + CSV->JSON (Day 2)
app.use("/api/mapping", mappingRoutes); // Week 2 Day 3 — column-mapping config
=======
app.use("/api/upload", uploadRoutes);   // chunked file upload + CSV->NDJSON parse (Week 1/2, Mohan)
app.use("/api/parse", parseRoutes);     // Week 2 — CSV line-split + CSV->JSON preview (Mohan)
app.use("/api/mapping", mappingRoutes); // Week 2 Day 3 — column-mapping config (Mohan)
app.use("/api/jobs", jobRoutes);        // Week 2 — upload history for the Dashboard (Krishna)
app.use("/api/export", exportRoutes);   // Week 4 — download processed data as CSV/JSON (Krishna)
>>>>>>> krishna

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
