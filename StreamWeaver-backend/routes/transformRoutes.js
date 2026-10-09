const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { runSnippet } = require("../controllers/transformController");

router.post("/run", authMiddleware, runSnippet);

module.exports = router;
