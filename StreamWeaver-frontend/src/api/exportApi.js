import axios from 'axios';
import { API_BASE } from './config';
import { filenameFromDisposition } from '../utils/download';

// Export endpoints need the Authorization header, so files are fetched as
// blobs and saved by the browser (see utils/download.js saveBlob).

// A failed blob request carries its JSON error body as a Blob; read it so the
// normal error helpers can show the server's message.
async function unwrapBlobError(err) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      err.response.data = JSON.parse(await data.text());
    } catch {
      err.response.data = {};
    }
  }
  return err;
}

async function fetchFile(url, token, params, fallbackName) {
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob',
      params,
    });
    return {
      blob: response.data,
      filename: filenameFromDisposition(response.headers['content-disposition'], fallbackName),
      // The error report says when it lists fewer rows than actually failed.
      totalFailed: Number(response.headers['x-total-failed']) || null,
      truncated: response.headers['x-errors-truncated'] === 'true',
    };
  } catch (err) {
    throw await unwrapBlobError(err);
  }
}

// The cleaned data of one import, as CSV or JSON.
//   GET /api/export/:datasetId?format=csv|json[&force=true]
// `force` downloads what's there even while the import is still running.
export const downloadDataset = (datasetId, format, token, { force = false } = {}) =>
  fetchFile(
    `${API_BASE}/api/export/${encodeURIComponent(datasetId)}`,
    token,
    { format, ...(force ? { force: 'true' } : {}) },
    `export.${format}`
  );

// The rows that failed validation, with reasons.
//   GET /api/export/job/:jobId/errors?format=csv|json
export const downloadErrorReport = (jobId, format, token) =>
  fetchFile(
    `${API_BASE}/api/export/job/${encodeURIComponent(jobId)}/errors`,
    token,
    { format },
    `errors.${format}`
  );
