const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { previewLines, previewJson } = require("../controllers/parseController");

router.post("/lines", authMiddleware, previewLines);       // Week 2 Day 1
router.post("/json-preview", authMiddleware, previewJson); // Week 2 Day 2

module.exports = router;
