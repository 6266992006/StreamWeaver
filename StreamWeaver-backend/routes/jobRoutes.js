const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { getHistory } = require("../controllers/historyController");

// Protected: only the logged-in user's own uploads are returned
router.get("/", authMiddleware, getHistory);

module.exports = router;
