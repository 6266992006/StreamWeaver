const express = require("express");
const router = express.Router();

const { signup, login, me,  forgotPassword, } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", authMiddleware, me);
router.post("/forgot-password", forgotPassword);
module.exports = router;