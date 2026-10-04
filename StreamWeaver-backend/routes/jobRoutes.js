const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { getHistory, getJobErrors } = require("../controllers/historyController");

// Protected: only the logged-in user's own uploads are returned
router.get("/", authMiddleware, getHistory);

// Protected: failed rows of one of the logged-in user's own import runs
router.get("/:jobId/errors", authMiddleware, getJobErrors);

module.exports = router;
