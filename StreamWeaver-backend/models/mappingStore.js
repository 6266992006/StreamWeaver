/**
 * In-memory store for column-mapping configs, keyed by userId (Week 2).
 */
const store = new Map();

exports.setMapping = (userId, mapping) => {
  store.set(userId, { mapping, updatedAt: new Date().toISOString() });
};

exports.getMapping = (userId) => {
  return store.get(userId) || null;
};
