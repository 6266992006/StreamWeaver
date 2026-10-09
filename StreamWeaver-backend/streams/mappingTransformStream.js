const { Transform } = require("stream");

/**
 * MappingTransformStream — renames JSON object keys per a saved
 * column-mapping config (Week 2 Day 3). Source columns with no entry
 * in the mapping are dropped.
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
