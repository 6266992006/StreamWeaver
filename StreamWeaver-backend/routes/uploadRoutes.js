const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { uploadFile } = require("../controllers/uploadController");

// Protected: only logged-in users can upload
router.post("/", authMiddleware, uploadFile); // Week 1 — raw file upload

module.exports = router;
