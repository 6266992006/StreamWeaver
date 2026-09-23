const express = require("express");
const router = express.Router();
const { signup, login, me } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", authMiddleware, me); // protected — tests JWT middleware

module.exports = router;
