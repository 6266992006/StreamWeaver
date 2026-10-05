const mongoose = require("mongoose");

/**
 * Week 3 (Day 4): tuned for large-dataset imports — a big upload fires
 * hundreds of 1,000-row bulkWrite batches back to back, often alongside
 * WebSocket progress polls on the same process.
 *
 *  - compressors: large batches of row data compress well over the wire;
 *    the driver negotiates this with the server automatically.
 *  - minPoolSize: keeps a couple of connections warm so the first batch
 *    of an import doesn't pay a fresh-connection delay right after an
 *    idle period (maxPoolSize is left at the driver default — raising it
 *    without a specific ceiling from the deployment, e.g. an Atlas tier's
 *    connection limit, would just be a guess).
 */
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // fail fast instead of hanging for 30s
      minPoolSize: 2,
      compressors: ["zlib"],
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    console.error("   Server will still run, but DB-dependent routes (signup/login) will fail until MongoDB is reachable.");
    return;
  }

  // A large import losing its connection mid-flight should be visible in
  // the logs, not silently swallowed — these fire after the initial
  // connect succeeds, for drops/recoveries that happen later.
  mongoose.connection.on("disconnected", () => console.error("⚠️  MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => console.log("✅ MongoDB reconnected"));
};

module.exports = connectDB;
