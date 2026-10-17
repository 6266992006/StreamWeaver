const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { uploadFile } = require("../controllers/uploadController");
const { getHistory } = require("../controllers/historyController");

// Protected: only logged-in users can upload
router.post("/", authMiddleware, uploadFile); // Week 1 — raw file upload
router.get("/history", authMiddleware, getHistory); // Upload history for the frontend

module.exports = router;
