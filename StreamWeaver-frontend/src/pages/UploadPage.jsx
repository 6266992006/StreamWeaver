import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { uploadFile } from '../api/uploadApi';
import VirtualGrid from '../components/VirtualGrid';
import './Pages.css';

const PREVIEW_ROW_LIMIT = 1000;
const PREVIEW_BYTES = 2 * 1024 * 1024; // 2MB is comfortably more than 1,000 CSV rows

// Parses just the first slice of the file client-side, so a multi-GB
// upload never has to be read fully into browser memory just to show
// a preview.
const parsePreview = (text) => {
  const lines = text.split(/\r\n|\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };

  const columns = lines[0].split(',').map((c) => c.trim());
  const rows = lines.slice(1, PREVIEW_ROW_LIMIT + 1).map((line) => {
    const values = line.split(',');
    return columns.reduce((acc, col, i) => {
      acc[col] = (values[i] ?? '').trim();
      return acc;
    }, {});
  });

  return { columns, rows };
};

const UploadPage = () => {
  const { token } = useAuth();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [progress, setProgress] = useState(0);
  // idle | previewing | uploading | done | error
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!token) {
    return (
      <div className="upload-page">
        <h1>Upload a CSV file</h1>
        <p>
          You need to be signed in to upload files.{' '}
          <Link to="/signin">Sign in</Link> or <Link to="/signup">create an account</Link>.
        </p>
      </div>
    );
  }


  const handleFileSelect = async (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setStatus('previewing');
    setErrorMsg('');
    setRows([]);
    setColumns([]);

    try {
      const previewSlice = selected.slice(0, PREVIEW_BYTES);
      const text = await previewSlice.text();
      const parsed = parsePreview(text);
      setColumns(parsed.columns);
      setRows(parsed.rows);
      setStatus('idle');
    } catch {
      setStatus('error');
      setErrorMsg('Could not read this file for preview.');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus('uploading');
    setProgress(0);
    setErrorMsg('');

    try {
      await uploadFile(file, token, setProgress);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.response?.data?.message || 'Upload failed. Please try again.');
    }
  };

  return (
    <div className="upload-page">
      <h1>Upload a CSV file</h1>

      <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} />

      {file && (
        <p className="file-meta">
          {file.name} — {(file.size / (1024 * 1024)).toFixed(2)} MB
        </p>
      )}

      {status === 'previewing' && <p>Reading preview…</p>}

      {rows.length > 0 && (
        <>
          <h2>Preview (first {rows.length.toLocaleString()} rows)</h2>
          <VirtualGrid columns={columns} rows={rows} />
        </>
      )}

      <button type="button" onClick={handleUpload} disabled={!file || status === 'uploading'}>
        {status === 'uploading' ? `Uploading… ${progress}%` : 'Upload'}
      </button>

      {status === 'uploading' && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {status === 'done' && <p className="success-msg">Upload complete ✅</p>}
      {status === 'error' && <p className="error-msg">{errorMsg}</p>}
    </div>
  );
};

export default UploadPage;
