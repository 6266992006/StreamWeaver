const busboy = require("busboy");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pipeline, Transform } = require("stream");

const CsvLineStream = require("../streams/csvLineStream");
const CsvRowToJsonStream = require("../streams/csvRowToJsonStream");

// @route  POST /api/upload/parse  (protected)
// The full Week 2 ETL pipeline: uploaded file -> CsvLineStream ->
// CsvRowToJsonStream -> written to disk as newline-delimited JSON
// (NDJSON, one JSON object per line). Nothing is buffered in memory —
// `pipeline()` streams the whole thing chunk by chunk, so this scales
// to multi-GB files the same way the Week 1 raw upload does.
exports.parseAndSave = (req, res) => {
  const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

  const parsedDir = path.join(__dirname, "..", "parsed");
  if (!fs.existsSync(parsedDir)) fs.mkdirSync(parsedDir, { recursive: true });

  let fileReceived = false;
  let responded = false;

  const sendOnce = (status, body) => {
    if (responded) return;
    responded = true;
    res.status(status).json(body);
  };

  bb.on("file", (fieldname, fileStream, info) => {
    fileReceived = true;

    const lineStream = new CsvLineStream();
    const jsonStream = new CsvRowToJsonStream();

    // Converts each JSON object into an NDJSON line before it hits disk.
    const toNdjson = new Transform({
      writableObjectMode: true,
      transform(obj, enc, cb) {
        cb(null, JSON.stringify(obj) + "\n");
      },
    });

    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${path.parse(info.filename).name}.ndjson`;
    const outPath = path.join(parsedDir, safeName);
    const writeStream = fs.createWriteStream(outPath);

    pipeline(fileStream, lineStream, jsonStream, toNdjson, writeStream, (err) => {
      if (err) {
        console.error("ETL pipeline error:", err.message);
        return sendOnce(500, { success: false, message: "Failed to parse and save file" });
      }
      return sendOnce(201, {
        success: true,
        message: "File streamed, parsed to JSON, and saved successfully",
        originalName: info.filename,
        savedAs: safeName,
        headers: jsonStream.headers,
        rowCount: jsonStream.rowCount,
        path: outPath,
      });
    });
  });

  bb.on("close", () => {
    if (!fileReceived) sendOnce(400, { success: false, message: "No file received" });
  });

  bb.on("error", (err) => {
    console.error("Upload stream error:", err.message);
    sendOnce(500, { success: false, message: "Upload failed" });
  });

  req.pipe(bb);
};
