const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { uploadFile } = require("../controllers/uploadController");
const { parseAndSave } = require("../controllers/etlController");

// Protected: only logged-in users can upload
router.post("/", authMiddleware, uploadFile);            // Week 1 — raw file upload
router.post("/parse", authMiddleware, parseAndSave);      // Week 2 Day 4 — CSV -> NDJSON ETL

module.exports = router;
