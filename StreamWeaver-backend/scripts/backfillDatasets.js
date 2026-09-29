/**
 * One-off helper: register files that are already sitting in /uploads but
 * were never recorded in MongoDB (uploaded before the upload controller
 * started saving a Dataset record), so they appear in Upload History.
 *
 * Which user owns them can't be recovered from the files, so you say so:
 *
 *   npm run backfill -- you@example.com            # do it
 *   npm run backfill -- you@example.com --dry-run  # just show what would happen
 *
 * Safe to re-run: files that already have a record are skipped.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

// Stored names look like  <epoch-ms>-<8 hex chars>-<original name>
function parseStoredFileName(name) {
  const m = /^(\d{10,})-([0-9a-f]{8})-(.+)$/.exec(name);
  if (!m) return null;
  return { uploadedAt: new Date(Number(m[1])), originalName: m[3] };
}

// Same approximation the upload controller uses: newlines minus header row.
function countRows(filePath) {
  return new Promise((resolve, reject) => {
    let newlines = 0;
    fs.createReadStream(filePath)
      .on("data", (chunk) => {
        for (let i = 0; i < chunk.length; i++) if (chunk[i] === 10) newlines++;
      })
      .on("end", () => resolve(Math.max(newlines - 1, 0)))
      .on("error", reject);
  });
}

async function main() {
  const [email, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");

  if (!email || email.startsWith("--")) {
    console.error("Usage: npm run backfill -- <owner-email> [--dry-run]");
    process.exit(1);
  }

  const mongoose = require("mongoose");
  const User = require("../models/User");
  const Dataset = require("../models/Dataset");

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.error(`No user with email ${email}. Sign up in the app first.`);
      process.exitCode = 1;
      return;
    }

    const files = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : [];
    const known = new Set(await Dataset.distinct("storedFileName"));
    let added = 0;

    for (const file of files) {
      const parsed = parseStoredFileName(file);
      if (!parsed || known.has(file)) continue;

      const fullPath = path.join(UPLOAD_DIR, file);
      const rowCount = await countRows(fullPath);
      const size = fs.statSync(fullPath).size;

      console.log(`${dryRun ? "[dry run] would add" : "adding"}: ${parsed.originalName} (${size} bytes, ~${rowCount} rows)`);
      if (!dryRun) {
        await Dataset.create({
          ownerId: user._id,
          originalFileName: parsed.originalName,
          storedFileName: file,
          fileSizeBytes: size,
          rowCount,
          status: "uploaded",
          createdAt: parsed.uploadedAt,
        });
      }
      added += 1;
    }

    console.log(added === 0 ? "Nothing to add — every file already has a record." : `Done: ${added} file(s) ${dryRun ? "found" : "added"}.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Backfill failed:", err.message);
    process.exit(1);
  });
}

module.exports = { parseStoredFileName, countRows };
