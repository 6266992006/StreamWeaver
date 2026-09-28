import axios from 'axios';

// Backend base API URL
const API_URL = 'http://localhost:5000/api/upload';

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
