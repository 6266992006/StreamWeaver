const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
  runSnippet,
  transformRow,
  saveConfig,
  getConfig,
  transformUpload,
  transformUploadToFile,
  downloadOutput,
  transformUploadToDb,
} = require("../controllers/transformController");

router.post("/run", authMiddleware, runSnippet);                             // Week 3 Day 1
router.post("/transform-row", authMiddleware, transformRow);                 // Week 3 Day 2
router.post("/config", authMiddleware, saveConfig);                          // Week 3 Day 3
router.get("/config", authMiddleware, getConfig);                            // Week 3 Day 3
router.post("/transform-upload", authMiddleware, transformUpload);           // Week 3 Day 4
router.post("/transform-download", authMiddleware, transformUploadToFile);   // Week 3 Day 5
router.get("/download/:fileId", authMiddleware, downloadOutput);             // Week 3 Day 5
router.post("/transform-upload-db", authMiddleware, transformUploadToDb);    // Week 4 Day 4

module.exports = router;
