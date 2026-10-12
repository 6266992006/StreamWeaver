const { Transform } = require("stream");

/**
 * NdjsonStringifyStream — Week 3 Day 5. Last link in the pipeline before
 * the file gets written to disk: takes the JS objects coming out of
 * FieldTransformStream (Day 4) and turns each one into one line of
 * NDJSON (newline-delimited JSON) text, so the writable fs stream below
 * it can just write bytes — no array, no JSON.stringify-the-whole-thing,
 * row count can go into the millions without ever holding more than one
 * row in memory at a time.
 */
class NdjsonStringifyStream extends Transform {
  constructor(options = {}) {
    super({ ...options, readableObjectMode: false, writableObjectMode: true });
  }

  _transform(row, encoding, callback) {
    try {
      this.push(JSON.stringify(row) + "\n");
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = NdjsonStringifyStream;
