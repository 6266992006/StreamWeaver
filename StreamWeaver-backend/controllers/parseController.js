const busboy = require("busboy");
const CsvLineStream = require("../streams/csvLineStream");

// @route  POST /api/parse/lines  (protected)
// Streams an uploaded CSV straight through CsvLineStream — never buffers
// the whole file in memory. Only keeps the first few lines to return as
// a preview, but counts every line so this scales to huge files.
exports.previewLines = (req, res) => {
  const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

  let fileReceived = false;
  let responded = false;
  const PREVIEW_SIZE = 5;
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
      if (previewLines.length < PREVIEW_SIZE) previewLines.push(line);
    });

    lineStream.on("end", () => {
      sendOnce(200, {
        success: true,
        message: "File streamed and split into lines successfully",
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
    if (!fileReceived) {
      sendOnce(400, { success: false, message: "No file received" });
    }
  });

  bb.on("error", (err) => {
    console.error("Upload stream error:", err.message);
    sendOnce(500, { success: false, message: "Upload failed" });
  });

  req.pipe(bb);
};
