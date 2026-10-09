const { Transform } = require("stream");

function splitCsvLine(line) {
  const fields = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (insideQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/**
 * CsvRowToJsonStream — turns CSV line strings into JSON objects, using
 * the first line as the header row. Handles quoted fields with commas.
 */
class CsvRowToJsonStream extends Transform {
  constructor(options = {}) {
    super({ ...options, readableObjectMode: true, writableObjectMode: true });
    this._headers = null;
    this._rowCount = 0;
  }

  _transform(line, encoding, callback) {
    try {
      const fields = splitCsvLine(line);
      if (!this._headers) {
        this._headers = fields;
        return callback();
      }
      const obj = {};
      this._headers.forEach((header, idx) => {
        obj[header] = fields[idx] !== undefined ? fields[idx] : "";
      });
      this._rowCount++;
      this.push(obj);
      callback();
    } catch (err) {
      callback(err);
    }
  }

  get headers() {
    return this._headers;
  }

  get rowCount() {
    return this._rowCount;
  }
}

module.exports = CsvRowToJsonStream;
