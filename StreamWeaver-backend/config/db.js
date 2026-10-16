const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      minPoolSize: 2,
      compressors: ["zlib"],
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    console.error("   Server will still run, but DB-dependent routes (signup/login) will fail until MongoDB is reachable.");
    return;
  }

  mongoose.connection.on("disconnected", () => console.error("⚠️  MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => console.log("✅ MongoDB reconnected"));
};

module.exports = connectDB;
