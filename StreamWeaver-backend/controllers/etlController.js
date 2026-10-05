const busboy = require("busboy");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pipeline, Transform } = require("stream");

const CsvLineStream = require("../streams/csvLineStream");
const CsvRowToJsonStream = require("../streams/csvRowToJsonStream");
const MappingTransformStream = require("../streams/mappingTransformStream");
const mappingStore = require("../models/mappingStore");

// @route  POST /api/upload/parse  (protected) — Day 4, kept for reference/backward-compat
// Same as Day 4: CSV -> NDJSON, no mapping applied.
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
        message: "File streamed, parsed to JSON, and saved successfully (no mapping applied)",
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

// @route  POST /api/upload/transform  (protected)  — Day 5, final Week 2 deliverable
// Full pipeline: uploaded CSV -> CsvLineStream -> CsvRowToJsonStream ->
// MappingTransformStream (using the caller's saved mapping from
// POST /api/mapping) -> NDJSON written to disk. Requires a mapping to
// already be saved for this user (Day 3's API) — that's the whole point
// of Week 2: parse AND reshape according to a user-supplied config.
exports.parseTransformAndSave = (req, res) => {
  const saved = mappingStore.getMapping(req.userId);
  if (!saved) {
    return res.status(400).json({
      success: false,
      message: "No column mapping configured yet. POST /api/mapping first, then retry this upload.",
    });
  }

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
    const mappingStream = new MappingTransformStream(saved.mapping);
    const toNdjson = new Transform({
      writableObjectMode: true,
      transform(obj, enc, cb) {
        cb(null, JSON.stringify(obj) + "\n");
      },
    });

    const safeName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${path.parse(info.filename).name}.mapped.ndjson`;
    const outPath = path.join(parsedDir, safeName);
    const writeStream = fs.createWriteStream(outPath);

    pipeline(fileStream, lineStream, jsonStream, mappingStream, toNdjson, writeStream, (err) => {
      if (err) {
        console.error("ETL transform pipeline error:", err.message);
        return sendOnce(500, { success: false, message: "Failed to parse, map and save file" });
      }
      return sendOnce(201, {
        success: true,
        message: "File streamed, parsed, mapped and saved successfully",
        originalName: info.filename,
        savedAs: safeName,
        sourceHeaders: jsonStream.headers,
        mappingUsed: saved.mapping,
        rowCount: mappingStream.rowCount,
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
