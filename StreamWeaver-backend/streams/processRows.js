const { BulkInserter } = require("./bulkInsert");
const { validateRows } = require("../utils/dbValidators");

/**
 * Processes an array of rows, validating them and inserting the valid ones in batches.
 * @param {object[]} rows - parsed row objects (source column -> value)
 * @param {object} opts
 * @param {object} opts.mappingConfig - see utils/dbValidators.js
 * @param {import("mongoose").Model} opts.model - target collection (e.g. a Dataset's row collection)
 * @param {number} [opts.batchSize=1000]
 */
async function processRows(rows, { mappingConfig, model, batchSize } = {}) {
  const { validRows, invalidRows } = validateRows(rows, mappingConfig);

  const inserter = new BulkInserter(model, { batchSize });
  await inserter.addMany(validRows);
  const insertStats = await inserter.finish();

  // insertStats.failed covers rows that passed validation but MongoDB
  // itself rejected (duplicate key, schema cast error, etc).
  const insertFailures = (insertStats.writeErrors || []).map((e, i) => ({
    row: e.index ?? i,
    reason: e.errmsg || "Insert failed",
  }));

  return {
    totalRows: rows.length,
    rowsProcessed: insertStats.inserted,
    rowsFailed: invalidRows.length + insertFailures.length,
    errorLog: [...invalidRows, ...insertFailures],
  };
}

module.exports = { processRows };
