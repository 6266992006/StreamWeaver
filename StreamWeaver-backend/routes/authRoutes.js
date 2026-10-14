const express = require("express");
const router = express.Router();
const { signup, login, forgotPassword, me } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimiter");

// signup/login get the strict authLimiter (Week 4 Day 1) on top of the
// general one in server.js — these are the brute-force/credential-
// stuffing targets, so they get their own tighter budget.
router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);
router.post("/forgot-password", authLimiter, forgotPassword);
router.get("/me", authMiddleware, me);

module.exports = router;
