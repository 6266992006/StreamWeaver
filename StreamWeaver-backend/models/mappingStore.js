/**
 * In-memory store for column-mapping configs, keyed by userId.
 *
 * Scope note: this is intentionally simple for Week 2 (just "expose an
 * API to receive column-mapping config"). It lives in server memory, so
 * it resets on restart and won't work across multiple server instances.
 * Swapping this for a Mongo collection later is a drop-in change — only
 * this file would need to change, not the controller/routes that use it.
 */
const store = new Map();

exports.setMapping = (userId, mapping) => {
  store.set(userId, { mapping, updatedAt: new Date().toISOString() });
};

exports.getMapping = (userId) => {
  return store.get(userId) || null;
};
