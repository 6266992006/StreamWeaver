const mongoose = require("mongoose");


const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // fail fast instead of hanging
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    console.error("   Server will still run, but DB-dependent routes will fail until MongoDB is reachable.");
  }

  // A large import losing its connection mid-flight should be visible in
  // the logs, not silently swallowed — these fire after the initial
  // connect succeeds, for drops/recoveries that happen later.
  mongoose.connection.on("disconnected", () => console.error("⚠️  MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => console.log("✅ MongoDB reconnected"));
};

module.exports = connectDB;
