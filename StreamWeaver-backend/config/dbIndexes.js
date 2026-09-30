/**
 * Week 3 (Day 1): index creation/optimization script.
 *
 * Mongoose builds indexes automatically in development (each model calls
 * createIndex in the background the first time it's used), but that's
 * exactly what you DON'T want against a large production collection — an
 * index build can lock/slow writes, and you don't want it to fire silently
 * the first time someone hits the app. This script makes that step explicit
 * and controllable, and reports on indexes so drift is visible.
 *
 * Usage (from StreamWeaver-backend/):
 *   npm run db:indexes            # build/sync every model's indexes
 *   npm run db:indexes -- --check # report only, changes nothing
 *
 * "Sync" means: create any index declared in a schema that's missing, and
 * drop any index that exists in MongoDB but is no longer declared in the
 * schema (stale indexes silently cost write throughput and disk space).
 */
require("dotenv").config();

const MODELS = [
  { name: "User", path: "../models/User" },
  { name: "Dataset", path: "../models/Dataset" },
  { name: "TransformJob", path: "../models/TransformJob" },
  { name: "DatasetRow", path: "../models/DatasetRow" },
];

function loadModels(paths = MODELS) {
  return paths.map(({ name, path }) => ({ name, model: require(path) }));
}

/**
 * Reports what syncIndexes would do for one model without changing anything:
 * every index the schema declares that MongoDB doesn't have yet ("to create"),
 * and every index MongoDB has that the schema no longer declares ("to drop").
 * `_id` is never reported — MongoDB manages it and it can't be dropped.
 */
async function diffIndexes(model) {
  const declared = model.schema.indexes().map(([keys]) => keys);
  const existing = await model.collection.getIndexes().catch(() => ({}));
  const existingKeys = Object.entries(existing)
    .filter(([name]) => name !== "_id_")
    .map(([, keys]) => keys);

  const sameKeys = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const toCreate = declared.filter((d) => !existingKeys.some((e) => sameKeys(e, d)));
  const toDrop = existingKeys.filter((e) => !declared.some((d) => sameKeys(d, e)));

  return { toCreate, toDrop, existingCount: existingKeys.length };
}

async function reportModel(model, { check }) {
  if (check) {
    const { toCreate, toDrop, existingCount } = await diffIndexes(model);
    return { existingCount, created: toCreate, dropped: toDrop, changed: toCreate.length + toDrop.length > 0 };
  }

  // syncIndexes() only returns the names of what it dropped, so pull the
  // actual key-shape of what it created from the "after" snapshot — a log
  // line like "created: idx_1" tells you nothing; "created: {email:1}" does.
  const before = await model.collection.getIndexes().catch(() => ({}));
  const dropped = await model.syncIndexes();
  const after = await model.collection.getIndexes();
  const created = Object.keys(after)
    .filter((n) => !before[n])
    .map((n) => after[n]);

  return { existingCount: Object.keys(after).length - 1, created, dropped, changed: created.length + dropped.length > 0 };
}

async function run({ check = false, models = MODELS, connect = null, log = console.log } = {}) {
  if (connect) await connect();

  const results = [];
  for (const { name, model } of loadModels(models)) {
    const result = await reportModel(model, { check });
    results.push({ name, ...result });

    log(`${name}: ${result.existingCount} index(es)${check ? " (current)" : ""}`);
    for (const idx of result.created) log(`  ${check ? "would create" : "created"}: ${JSON.stringify(idx)}`);
    for (const idx of result.dropped) log(`  ${check ? "would drop" : "dropped"}: ${JSON.stringify(idx)}`);
  }

  const anyChanges = results.some((r) => r.changed);
  log(anyChanges ? (check ? "\nIndexes are out of sync with the schema." : "\nDone — indexes now match the schema.") : "\nAll indexes already match the schema — nothing to do.");

  return results;
}

if (require.main === module) {
  const mongoose = require("mongoose");
  const check = process.argv.includes("--check");

  run({
    check,
    connect: () => mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 }),
  })
    .then(async (results) => {
      await mongoose.disconnect();
      process.exit(check && results.some((r) => r.changed) ? 1 : 0); // non-zero: useful in CI to catch drift
    })
    .catch((err) => {
      console.error("Index sync failed:", err.message);
      process.exit(1);
    });
}

module.exports = { run, diffIndexes, MODELS };
