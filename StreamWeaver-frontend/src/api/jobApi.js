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
