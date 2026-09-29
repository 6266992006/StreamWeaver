const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { previewLines, previewJson } = require("../controllers/parseController");

// Protected: only logged-in users can parse files
router.post("/lines", authMiddleware, previewLines);           // Day 1
router.post("/json-preview", authMiddleware, previewJson);     // Day 2

module.exports = router;
