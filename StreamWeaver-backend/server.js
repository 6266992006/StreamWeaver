require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");

// Register models with Mongoose on boot (Week 1: User, Dataset, TransformJob)
require("./models/User");
require("./models/Dataset");
require("./models/TransformJob");

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Combined status: DB schemas (Week 1) + Auth routes (Day 3) both live ---
app.get("/", (req, res) => {
  res.json({ success: true, message: "StreamWeaver backend is running 🚀" });
});
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    week: 2,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes); // signup, login, protected /me

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ success: false, message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
connectDB();
