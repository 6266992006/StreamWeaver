const { Transform } = require("stream");

/**
 * MappingTransformStream — the final piece of the Week 2 ETL pipeline.
 * Takes JSON objects (from CsvRowToJsonStream, keyed by the CSV's own
 * header names) and renames each key according to a column-mapping
 * config saved via POST /api/mapping (Day 3), e.g.
 *
 *   mapping:  { "Full Name": "name", "Email Address": "email" }
 *   input:    { "Full Name": "John Doe", "Email Address": "j@x.com", "Age": "30" }
 *   output:   { "name": "John Doe", "email": "j@x.com" }
 *
 * Source columns with no entry in the mapping are dropped — the mapping
 * is the contract for exactly which destination fields get produced.
 */
class MappingTransformStream extends Transform {
  constructor(mapping, options = {}) {
    super({ ...options, readableObjectMode: true, writableObjectMode: true });
    this._mapping = mapping || {};
    this._rowCount = 0;
  }

  _transform(row, encoding, callback) {
    const mapped = {};
    for (const [sourceCol, destField] of Object.entries(this._mapping)) {
      mapped[destField] = Object.prototype.hasOwnProperty.call(row, sourceCol) ? row[sourceCol] : null;
    }
    this._rowCount++;
    this.push(mapped);
    callback();
  }

  get rowCount() {
    return this._rowCount;
  }
}

module.exports = MappingTransformStream;
