require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const connectDB = require("./config/db");

// Register models with Mongoose on boot (Week 1: User, Dataset, TransformJob)
require("./models/User");
require("./models/Dataset");
require("./models/TransformJob");

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Week 1 deliverable: server boots, DB connects, schemas load ---
app.get("/", (req, res) => {
  res.json({ success: true, message: "StreamWeaver backend is running 🚀 (Week 1 complete)" });
});
app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok", week: 1, timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
connectDB();
