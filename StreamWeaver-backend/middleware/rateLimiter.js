const rateLimit = require("express-rate-limit");

/**
 * Week 4 Day 1 — rate limiting, finalized into its own file.
 *
 * Two tiers:
 *   - generalLimiter: applied to all /api/ routes, a loose cap just to
 *     stop obvious abuse/scripted hammering of the whole API.
 *   - authLimiter: applied ONLY to signup/login, much stricter — these
 *     are the routes a brute-force or credential-stuffing attack would
 *     target, so they get their own tighter budget independent of
 *     everything else the user does with the API.
 */

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // only 10 signup/login attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login/signup attempts, please try again after 15 minutes",
  },
});

module.exports = { generalLimiter, authLimiter };
