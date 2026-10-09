const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { runSnippet, transformRow } = require("../controllers/transformController");

router.post("/run", authMiddleware, runSnippet);             // Week 3 Day 1
router.post("/transform-row", authMiddleware, transformRow); // Week 3 Day 2

module.exports = router;
