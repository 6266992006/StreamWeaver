const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { saveMapping, getMapping } = require("../controllers/mappingController");

router.post("/", authMiddleware, saveMapping);
router.get("/", authMiddleware, getMapping);

module.exports = router;
