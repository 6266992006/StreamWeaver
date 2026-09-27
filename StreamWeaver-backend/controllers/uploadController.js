const busboy = require("busboy");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Dataset = require("../models/Dataset");

// Handles large file uploads (e.g. multi-GB CSVs) as a stream, never
// buffering the whole file in memory. This is the "chunked upload"
// piece from Week 1 — Week 2 (csvParser.js) will pipe from here into
// stream.Transform to turn CSV chunks into JSON.
//
// Fix: uploading a file used to only write it to disk — nothing was
// ever recorded in MongoDB, so the Upload History dashboard had no
// data to show. Now every successful upload creates a Dataset record.
exports.uploadFile = (req, res) => {
  const bb = busboy({
    headers: req.headers,
    limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB ceiling
  });

  const uploadDir = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  let fileTooBig = false;
  let receivedAFile = false;
  // Tracks the write-to-disk promise so bb's "close" (all fields parsed)
  // never resolves the HTTP response before the file is actually flushed
  // to disk — fixes a race where busboy finishes before fs finishes writing.
  let writePromise = Promise.resolve(null);

  bb.on("file", (fieldname, fileStream, info) => {
    receivedAFile = true;
    const { filename, mimeType } = info;
    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${filename}`;
    const savePath = path.join(uploadDir, safeName);

    const writeStream = fs.createWriteStream(savePath);

    // Count bytes + newlines as the file streams through, so we can
    // record an approximate row count without a second pass over the
    // file (real header-aware parsing is Week 2's csvParser.js).
    let byteCount = 0;
    let newlineCount = 0;
    fileStream.on("data", (chunk) => {
      byteCount += chunk.length;
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 10) newlineCount++; // '\n'
      }
    });

    fileStream.pipe(writeStream);

    fileStream.on("limit", () => {
      fileTooBig = true;
      fileStream.unpipe(writeStream);
      writeStream.destroy();
    });

    writePromise = new Promise((resolve) => {
      writeStream.on("close", () => {
        if (fileTooBig) return resolve(null);
        resolve({
          fieldname,
          originalName: filename,
          mimeType,
          savedAs: safeName,
          path: savePath,
          sizeBytes: byteCount,
          // Assumes a header row + a trailing newline, which covers the
          // common case; exact counts land once real CSV parsing (Week 2)
          // reads the file properly.
          approxRowCount: Math.max(newlineCount - 1, 0),
        });
      });
      writeStream.on("error", () => resolve(null));
    });
  });

  bb.on("close", async () => {
    const savedFile = await writePromise;

    if (fileTooBig) {
      return res.status(413).json({ success: false, message: "File exceeds 5GB limit" });
    }
    if (!receivedAFile || !savedFile) {
      return res.status(400).json({ success: false, message: "No file received" });
    }

    let dataset;
    try {
      dataset = await Dataset.create({
        ownerId: req.userId,
        originalFileName: savedFile.originalName,
        storedFileName: savedFile.savedAs,
        fileSizeBytes: savedFile.sizeBytes,
        mimeType: savedFile.mimeType,
        rowCount: savedFile.approxRowCount,
        status: "uploaded",
      });
    } catch (err) {
      // The file is safely on disk even if this write fails — say so
      // plainly instead of reporting success when the DB record is missing.
      console.error("Failed to save dataset record:", err.message);
      return res.status(500).json({
        success: false,
        message: "File was saved, but couldn't be recorded. Please try uploading again.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      file: savedFile,
      dataset,
    });
  });

  bb.on("error", (err) => {
    console.error("Upload stream error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Upload failed" });
    }
  });

  req.pipe(bb);
};
