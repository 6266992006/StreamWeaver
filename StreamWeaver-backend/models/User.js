const mongoose = require("mongoose");

// Merged: Week 1 (role + email index) + Day 3 auth branch (password reset fields)
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"], // bcrypt hash, never plain text
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["admin", "analyst"],
      default: "analyst",
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Fast + unique lookup on email — used on every login/signup call.
userSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model("User", userSchema);
