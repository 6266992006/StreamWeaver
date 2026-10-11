const busboy = require("busboy");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Week 1 — raw chunked upload (streams straight to disk, never buffers
// the whole file in memory).
exports.uploadFile = (req, res) => {
  const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });
  const uploadDir = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  let fileTooBig = false;
  let receivedAFile = false;
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
    if (!res.headersSent) res.status(500).json({ success: false, message: "Upload failed" });
  });

  req.pipe(bb);
};
