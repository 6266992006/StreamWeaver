const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { getHistory, getJobErrors } = require("../controllers/historyController");
const { createImportJob, uploadImportFile } = require("../controllers/importController");

// Protected: only the logged-in user's own uploads are returned
router.get("/", authMiddleware, getHistory);

// Start an import: create the job (Week 4), then stream the CSV into it.
router.post("/", authMiddleware, createImportJob);
router.post("/:jobId/file", authMiddleware, uploadImportFile);

// Protected: failed rows of one of the logged-in user's own import runs
router.get("/:jobId/errors", authMiddleware, getJobErrors);

module.exports = router;
