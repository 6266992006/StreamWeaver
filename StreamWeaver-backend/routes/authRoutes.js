const express = require("express");
const router = express.Router();
const { signup, login, forgotPassword, me } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/signup", signup);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.get("/me", authMiddleware, me);

module.exports = router;
