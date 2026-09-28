const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { previewLines } = require("../controllers/parseController");

// Protected: only logged-in users can parse files
router.post("/lines", authMiddleware, previewLines);

module.exports = router;
