const busboy = require("busboy");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Handles large file uploads (e.g. multi-GB CSVs) as a stream, never
// buffering the whole file in memory. This is the "chunked upload"
// piece from Week 1 — Week 2 (csvParser.js) will pipe from here into
// stream.Transform to turn CSV chunks into JSON.
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
    fileStream.pipe(writeStream);

    fileStream.on("limit", () => {
      fileTooBig = true;
      fileStream.unpipe(writeStream);
      writeStream.destroy();
    });

    writePromise = new Promise((resolve) => {
      writeStream.on("close", () => {
        if (fileTooBig) return resolve(null);
        resolve({ fieldname, originalName: filename, mimeType, savedAs: safeName, path: savePath });
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
    return res.status(201).json({
      success: true,
      message: "File uploaded and streamed to disk successfully",
      file: savedFile,
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
