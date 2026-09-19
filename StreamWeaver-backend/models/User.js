const mongoose = require("mongoose");

// --- Week 1 (Day 2): User schema ---
// Stores account info. Password is expected to already be a bcrypt hash
// by the time it reaches here (hashing happens in Mohan's authController).
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true, // bcrypt hash, never plain text
    },
    role: {
      type: String,
      enum: ["admin", "analyst"],
      default: "analyst",
    },
  },
  { timestamps: true }
);

// Fast + unique lookup on email — used on every login/signup call.
userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model("User", userSchema);
