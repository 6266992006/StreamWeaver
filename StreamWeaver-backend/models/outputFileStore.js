/**
 * In-memory store for generated output files (NDJSON results of a
 * transform-upload-and-save), keyed by a random fileId. Mirrors the
 * same in-memory-Map pattern as mappingStore.js / transformStore.js.
 *
 * Each entry also records which userId generated it, so the download
 * route can check ownership before serving the file — one user must
 * never be able to download another user's output just by guessing or
 * incrementing an id (that's why fileId is a long random hex token, not
 * a sequential number).
 */
const store = new Map();

exports.registerFile = (fileId, { userId, filePath, fileName, rowCount }) => {
  store.set(fileId, {
    userId,
    filePath,
    fileName,
    rowCount,
    createdAt: new Date().toISOString(),
  });
};

exports.getFile = (fileId) => {
  return store.get(fileId) || null;
};
