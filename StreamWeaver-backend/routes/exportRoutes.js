const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { exportDataset, exportJobErrors } = require("../controllers/exportController");

// Protected: only the dataset's own owner can export it (checked inside
// the controller, same pattern as historyController).
// Failed-rows report for one import run (Week 4 Day 2). Registered before
// "/:datasetId" so the more specific path is matched first.
router.get("/job/:jobId/errors", authMiddleware, exportJobErrors);

router.get("/:datasetId", authMiddleware, exportDataset);

module.exports = router;
