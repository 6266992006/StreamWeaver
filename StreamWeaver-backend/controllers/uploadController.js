const busboy = require("busboy");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Dataset = require("../models/Dataset");

const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024; // 5GB ceiling

// Streams large uploads (multi-GB CSVs) straight to disk without ever
// buffering the whole file in memory, then records the upload in MongoDB
// so it shows up in the Upload History dashboard.
exports.uploadFile = (req, res) => {
  const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_BYTES } });

  const uploadDir = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  let fileTooBig = false;
  let receivedAFile = false;
  // Resolves once the file is fully flushed to disk — busboy can finish
  // parsing before fs finishes writing, so we must wait for this.
  let writePromise = Promise.resolve(null);
  // Files still being written; if the request dies mid-upload we delete them
  // so half-uploaded files don't pile up in /uploads.
  const inProgress = new Set();

  const removePartialFiles = () => {
    for (const p of inProgress) fs.unlink(p, () => {});
    inProgress.clear();
  };

  bb.on("file", (fieldname, fileStream, info) => {
    receivedAFile = true;
    const { filename, mimeType } = info;
    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${path.basename(filename)}`;
    const savePath = path.join(uploadDir, safeName);
    inProgress.add(savePath);

    const writeStream = fs.createWriteStream(savePath);

    // Count bytes + newlines as the file streams past, so an approximate
    // row count is recorded without a second pass over the file.
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
        if (fileTooBig) {
          removePartialFiles();
          return resolve(null);
        }
        inProgress.delete(savePath);
        resolve({
          fieldname,
          originalName: filename,
          mimeType,
          savedAs: safeName,
          path: savePath,
          sizeBytes: byteCount,
          // Assumes a header row and a trailing newline (the common case);
          // exact counts come from the real CSV parse during import.
          approxRowCount: Math.max(newlineCount - 1, 0),
        });
      });
      writeStream.on("error", () => {
        removePartialFiles();
        resolve(null);
      });
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
      // Don't leave an orphan file behind: it isn't recorded anywhere and
      // the user will simply retry the upload.
      console.error("Failed to save dataset record:", err.message);
      fs.unlink(savedFile.path, () => {});
      return res.status(500).json({
        success: false,
        message: "The file arrived but couldn't be recorded. Please try uploading again.",
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
    removePartialFiles(); // e.g. the browser tab was closed mid-upload
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Upload failed" });
    }
  });

  req.on("aborted", removePartialFiles);

  req.pipe(bb);
};
