const mappingStore = require("../models/mappingStore");

// @route  POST /api/mapping  (protected)
// Body: { "mapping": { "sourceColumnName": "destinationFieldName", ... } }
// e.g. { "mapping": { "Full Name": "name", "Email Address": "email" } }
exports.saveMapping = (req, res) => {
  const { mapping } = req.body;

  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return res.status(400).json({
      success: false,
      message: "mapping is required and must be an object of { sourceColumn: destinationField }",
    });
  }

  const entries = Object.entries(mapping);
  if (entries.length === 0) {
    return res.status(400).json({ success: false, message: "mapping cannot be empty" });
  }
  for (const [source, dest] of entries) {
    if (typeof dest !== "string" || dest.trim() === "") {
      return res.status(400).json({
        success: false,
        message: `Invalid destination field for source column "${source}"`,
      });
    }
  }

  mappingStore.setMapping(req.userId, mapping);

  return res.status(200).json({
    success: true,
    message: "Column mapping saved",
    mapping,
  });
};

// @route  GET /api/mapping  (protected)
exports.getMapping = (req, res) => {
  const saved = mappingStore.getMapping(req.userId);

  if (!saved) {
    return res.status(404).json({ success: false, message: "No mapping configured yet" });
  }

  return res.status(200).json({ success: true, ...saved });
};
