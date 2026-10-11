/**
 * In-memory store for per-user custom transform configs, keyed by userId.
 * Mirrors Week 2's mappingStore.js pattern exactly — same scope notes
 * apply (resets on restart, single-instance only; swapping for a Mongo
 * collection later only touches this file).
 */
const store = new Map();

exports.setTransformConfig = (userId, fieldTransforms) => {
  store.set(userId, { fieldTransforms, updatedAt: new Date().toISOString() });
};

exports.getTransformConfig = (userId) => {
  return store.get(userId) || null;
};
