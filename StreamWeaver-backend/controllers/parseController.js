const busboy = require("busboy");
const CsvLineStream = require("../streams/csvLineStream");
const CsvRowToJsonStream = require("../streams/csvRowToJsonStream");

// @route  POST /api/parse/lines  (protected) — Day 1, kept for reference
exports.previewLines = (req, res) => {
  const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });
  let fileReceived = false;
  let responded = false;
  const previewLines = [];

  const sendOnce = (status, body) => {
    if (responded) return;
    responded = true;
    res.status(status).json(body);
  };

  bb.on("file", (fieldname, fileStream, info) => {
    fileReceived = true;
    const lineStream = new CsvLineStream();
    fileStream.pipe(lineStream);

    lineStream.on("data", (line) => {
      if (previewLines.length < 5) previewLines.push(line);
    });
    lineStream.on("end", () => {
      sendOnce(200, {
        success: true,
        fileName: info.filename,
        totalLines: lineStream.lineCount,
        preview: previewLines,
      });
    });
    lineStream.on("error", (err) => {
      console.error("CsvLineStream error:", err.message);
      sendOnce(500, { success: false, message: "Failed to parse file into lines" });
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

// @route  POST /api/parse/json-preview  (protected)
// Chains CsvLineStream -> CsvRowToJsonStream so the uploaded CSV is
// streamed straight into JSON objects. Only the first few objects are
// kept for the response preview; the full file is still streamed
// end-to-end (proving it scales), just not held in memory.
exports.previewJson = (req, res) => {
  const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });
  let fileReceived = false;
  let responded = false;
  const PREVIEW_SIZE = 5;
  const previewRows = [];

  const sendOnce = (status, body) => {
    if (responded) return;
    responded = true;
    res.status(status).json(body);
  };

  bb.on("file", (fieldname, fileStream, info) => {
    fileReceived = true;
    const lineStream = new CsvLineStream();
    const jsonStream = new CsvRowToJsonStream();

    fileStream.pipe(lineStream).pipe(jsonStream);

    jsonStream.on("data", (obj) => {
      if (previewRows.length < PREVIEW_SIZE) previewRows.push(obj);
    });

    jsonStream.on("end", () => {
      sendOnce(200, {
        success: true,
        message: "File streamed and converted CSV rows to JSON successfully",
        fileName: info.filename,
        headers: jsonStream.headers,
        totalRows: jsonStream.rowCount,
        preview: previewRows,
      });
    });

    jsonStream.on("error", (err) => {
      console.error("CsvRowToJsonStream error:", err.message);
      sendOnce(500, { success: false, message: "Failed to convert CSV rows to JSON" });
    });

    lineStream.on("error", (err) => {
      console.error("CsvLineStream error:", err.message);
      sendOnce(500, { success: false, message: "Failed to parse file into lines" });
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
