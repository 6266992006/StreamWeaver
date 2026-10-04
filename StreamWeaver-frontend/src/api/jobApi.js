import axios from 'axios';
import { API_BASE } from './config';

// Fetches the logged-in user's upload history for the Dashboard.
// Backend: GET /api/jobs (protected) -> { success, jobs: [...] }
// Each job: { id, fileName, uploadedAt, sizeBytes, status, totalRows,
//             rowsProcessed, rowsFailed, rowsPerSec, errorMessage }
export const getJobHistory = async (token) => {
  const response = await axios.get(`${API_BASE}/api/jobs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// Fetches the per-row failures for one import run (for the ErrorTable).
// Backend: GET /api/jobs/:jobId/errors (protected)
//   -> { success, jobId, status, rowsFailed, errors: [{ row, reason }], truncated }
// `row` is the 1-based data-row number (row 1 = first row after the header).
// The server caps the list, so errors.length can be less than rowsFailed.
export const getJobErrors = async (jobId, token) => {
  const response = await axios.get(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/errors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};
