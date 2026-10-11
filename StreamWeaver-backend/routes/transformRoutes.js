const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { runSnippet, transformRow, saveConfig, getConfig } = require("../controllers/transformController");

router.post("/run", authMiddleware, runSnippet);             // Week 3 Day 1
router.post("/transform-row", authMiddleware, transformRow); // Week 3 Day 2
router.post("/config", authMiddleware, saveConfig);          // Week 3 Day 3
router.get("/config", authMiddleware, getConfig);            // Week 3 Day 3

module.exports = router;
