import axios from 'axios';
import { API_BASE } from './config';

const API_URL = `${API_BASE}/api/upload`;

// Streams a file to the backend as multipart/form-data. The backend
// (busboy) pipes it straight to disk, so even multi-GB CSVs never sit
// fully in memory on either side. onProgress(percent) fires as the
// browser reports upload progress, chunk by chunk.
export const uploadFile = async (file, token, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post(API_URL, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      Authorization: `Bearer ${token}`,
    },
    onUploadProgress: (event) => {
      if (!onProgress || !event.total) return;
      const percent = Math.round((event.loaded * 100) / event.total);
      onProgress(percent);
    },
  });

  return response.data;
};

// Step 2 of an import: stream the CSV into the job created by createImportJob.
// The backend parses, transforms, validates and bulk-inserts WHILE the bytes
// arrive, so this single request is the whole import. It answers when the last
// row is stored:
//   -> { success, jobId, datasetId, status, totalRows, rowsProcessed, rowsFailed, durationMs }
// onProgress({ loaded, total, percent }) reports bytes sent (browser side);
// live ROW progress arrives separately over the WebSocket (useWebSocket).
// Pass an AbortSignal to cancel.
export const uploadImportFile = async (jobId, file, token, { onProgress, signal } = {}) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}/file`, formData, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
    // A multi-GB import can legitimately take a long time; never time it out.
    timeout: 0,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    onUploadProgress: (event) => {
      if (!onProgress || !event.total) return;
      onProgress({
        loaded: event.loaded,
        total: event.total,
        percent: Math.round((event.loaded * 100) / event.total),
      });
    },
  });
  return response.data;
};
