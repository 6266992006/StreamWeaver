const { runImportPipeline } = require("./importPipeline");

/**
 * Convenience wrapper for when the rows are already in an array (small
 * files, tests). Same behaviour as runImportPipeline — validate, map,
 * insert in batches of 1,000 — so there is exactly one code path.
 *
 * @param {object[]} rows - parsed row objects (source column -> value)
 * @param {object} opts
 * @param {object} opts.mappingConfig - see utils/dbValidators.js
 * @param {import("mongoose").Model} opts.model - target collection
 * @param {number} [opts.batchSize=1000]
 * @param {(data: object, rowNumber: number) => object} [opts.buildDocument]
 * @returns {Promise<{ totalRows, rowsProcessed, rowsFailed, errorLog }>}
 *   errorLog rows are 1-based data-row numbers.
 */
async function processRows(rows, { mappingConfig, model, batchSize, buildDocument } = {}) {
  const result = await runImportPipeline({
    source: rows,
    mappingConfig,
    model,
    batchSize,
    buildDocument,
  });

  return {
    totalRows: result.totalRows,
    rowsProcessed: result.rowsProcessed,
    rowsFailed: result.rowsFailed,
    errorLog: result.errorLog,
  };
}

module.exports = { processRows };
