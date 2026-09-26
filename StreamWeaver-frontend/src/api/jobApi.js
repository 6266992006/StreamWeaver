import axios from 'axios';

// Backend base API URL
// NOTE: this route is a Week 3 backend deliverable (Mohan) — the
// frontend is built against the agreed contract ahead of time so both
// sides wire together as soon as it's live.
const API_URL = 'http://localhost:5000/api/jobs';

// Fetches the logged-in user's upload/job history for the Dashboard.
export const getJobHistory = async (token) => {
  const response = await axios.get(API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data; // expected shape: { success, jobs: [...] }
};
