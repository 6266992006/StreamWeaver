const { Transform } = require("stream");

/**
 * CsvLineStream — splits raw file chunks into complete CSV lines, safe
 * across chunk boundaries (a line split across two chunks is buffered
 * until complete).
 */
class CsvLineStream extends Transform {
  constructor(options = {}) {
    super({ ...options, readableObjectMode: true });
    this._buffer = "";
    this._lineCount = 0;
  }

  _transform(chunk, encoding, callback) {
    this._buffer += chunk.toString("utf8");
    const lines = this._buffer.split(/\r\n|\n/);
    this._buffer = lines.pop();

    for (const line of lines) {
      if (line.length === 0) continue;
      this._lineCount++;
      this.push(line);
    }
    callback();
  }

  _flush(callback) {
    if (this._buffer && this._buffer.trim().length > 0) {
      this._lineCount++;
      this.push(this._buffer);
    }
    callback();
  }

  get lineCount() {
    return this._lineCount;
  }
}

module.exports = CsvLineStream;
