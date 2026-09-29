const { Transform } = require("stream");

/**
 * Splits a single CSV line into fields, respecting double-quoted fields
 * that may contain commas (e.g. `"Doe, John",25`) and escaped quotes
 * (`""` inside a quoted field means a literal `"`).
 */
function splitCsvLine(line) {
  const fields = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (insideQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'; // escaped quote
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
 * CsvRowToJsonStream — a stream.Transform class that sits after
 * CsvLineStream. Input: raw CSV line strings (object mode). Output:
 * plain JS objects, using the FIRST line it receives as the header row
 * and every line after that as a record, e.g.
 *   header: "id,name,value"
 *   row:    "1,John,100"
 *   -> { id: "1", name: "John", value: "100" }
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
        return callback(); // header row consumed, not emitted as data
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
