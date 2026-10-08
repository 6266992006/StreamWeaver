const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { exportDataset } = require("../controllers/exportController");

// Protected: only the dataset's own owner can export it (checked inside
// the controller, same pattern as historyController).
router.get("/:datasetId", authMiddleware, exportDataset);

module.exports = router;
