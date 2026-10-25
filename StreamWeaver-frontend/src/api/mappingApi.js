import axios from 'axios';
import { API_BASE } from './config';

const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// Step 1 of an import: send the column mapping + transforms. The backend
// validates them (including compiling every JavaScript transform), creates the
// dataset + job and hands back the ids.
//   mapping         { destField: { source, type?, required? } }
//   fieldTransforms { sourceColumn: "jsExpression using `value`" }
//   -> { success, jobId, datasetId }
export const createImportJob = async (payload, token) => {
  const response = await axios.post(`${API_BASE}/api/jobs`, payload, auth(token));
  return response.data;
};

// Runs the user's transforms on a few sample rows inside the backend's
// isolated-vm sandbox, so the mapping screen shows the REAL result before
// anything is imported.   -> array of transformed rows (same order as `rows`)
export const previewTransforms = async (rows, fieldTransforms, token) => {
  const results = await Promise.all(
    rows.map((row) =>
      axios
        .post(`${API_BASE}/api/sandbox/transform-row`, { row, fieldTransforms }, auth(token))
        .then((res) => ({ ok: true, row: res.data.transformed }))
        .catch((err) => ({
          ok: false,
          error: err.response?.data?.error || err.response?.data?.message || err.message,
          // Backend unreachable / session problems should surface as real errors.
          fatal: !err.response || err.response.status === 401,
          err,
        }))
    )
  );
  const fatal = results.find((r) => !r.ok && r.fatal);
  if (fatal) throw fatal.err;
  return results;
};
