const { Transform } = require("stream");

/**
 * CsvLineStream — a Node.js stream.Transform class that takes raw file
 * chunks (Buffers, e.g. straight from an upload) and emits one complete
 * CSV line (string) at a time.
 *
 * Why this needs its own class instead of just splitting on "\n":
 * a big file arrives in many small chunks, and a line can be split
 * across two chunks (e.g. chunk A ends with "...John" and chunk B
 * starts with " Doe,25\n"). This class buffers the leftover partial
 * line between chunks so no row is ever corrupted or dropped.
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
    // Last element may be an incomplete line (chunk cut off mid-line) —
    // keep it in the buffer instead of emitting it.
    this._buffer = lines.pop();

    for (const line of lines) {
      if (line.length === 0) continue; // skip blank lines
      this._lineCount++;
      this.push(line);
    }

    callback();
  }

  _flush(callback) {
    // End of stream — whatever is left in the buffer is the final line
    // (files don't always end with a trailing newline).
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
