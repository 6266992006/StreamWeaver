const express = require("express");
const router = express.Router();
const { signup, login, forgotPassword, resetPassword, me } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimiter");

// signup/login/forgot-password/reset-password all get the strict
// authLimiter (Week 4 Day 1) on top of the general one in server.js —
// these are the brute-force/credential-stuffing/token-guessing targets,
// so they share one tighter budget.
router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password/:token", authLimiter, resetPassword); // Week 4 Day 2
router.get("/me", authMiddleware, me);

module.exports = router;
