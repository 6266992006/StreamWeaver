const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { uploadFile } = require("../controllers/uploadController");

// Protected: only logged-in users can upload
router.post("/", authMiddleware, uploadFile);

module.exports = router;
