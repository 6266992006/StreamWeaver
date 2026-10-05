const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { uploadFile } = require("../controllers/uploadController");
const { parseAndSave, parseTransformAndSave } = require("../controllers/etlController");

// Protected: only logged-in users can upload
router.post("/", authMiddleware, uploadFile);                    // Week 1 — raw file upload
router.post("/parse", authMiddleware, parseAndSave);              // Week 2 Day 4 — CSV -> NDJSON
router.post("/transform", authMiddleware, parseTransformAndSave); // Week 2 Day 5 — CSV -> mapped NDJSON

module.exports = router;
