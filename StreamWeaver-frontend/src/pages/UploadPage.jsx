import { useEffect, useRef, useState } from 'react';
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
  const { token, logout } = useAuth();
  const fileInputRef = useRef(null);
  // logout() changes identity every render; read it through a ref.
  const logoutRef = useRef(logout);
  useEffect(() => {
    logoutRef.current = logout;
  });

  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [progress, setProgress] = useState(0);
  // idle | previewing | uploading | done | error
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [dragActive, setDragActive] = useState(false);

  if (!token) {
    return (
      <div className="page">
        <h1>Upload a file</h1>
        <p className="auth-required">
          Sign in to upload files. <Link to="/signin">Sign in</Link> or{' '}
          <Link to="/signup">create an account</Link>.
        </p>
      </div>
    );
  }

  const readFile = async (selected) => {
    // The file picker filters to .csv, but drag-and-drop doesn't.
    if (!/\.csv$/i.test(selected.name)) {
      setFile(null);
      setRows([]);
      setColumns([]);
      setStatus('error');
      setErrorMsg('Only .csv files are supported.');
      return;
    }
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

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (selected) readFile(selected);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) readFile(dropped);
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
      if (err.response?.status === 401) {
        setErrorMsg('Your session has expired. Please sign in again.');
        logoutRef.current();
      } else if (!err.response) {
        setErrorMsg("Can't reach the backend. Is it running?");
      } else {
        setErrorMsg(err.response.data?.message || 'Upload failed. Please try again.');
      }
    }
  };

  const handleReset = () => {
    setFile(null);
    setRows([]);
    setColumns([]);
    setProgress(0);
    setStatus('idle');
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="page">
      <h1>Upload a file</h1>
      <p className="page-sub">CSV files up to 5GB. Rows are validated before anything is saved.</p>

      <button
        type="button"
        className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          hidden
        />
        {file ? (
          <span className="dropzone-file">
            <strong>{file.name}</strong>
            <code>{(file.size / (1024 * 1024)).toFixed(2)} MB</code>
          </span>
        ) : (
          <span>Drop a CSV here, or click to browse</span>
        )}
      </button>

      {status === 'previewing' && <p className="status-line">Reading preview…</p>}

      {rows.length > 0 && (
        <>
          <h2>Preview — first {rows.length.toLocaleString()} rows</h2>
          <VirtualGrid columns={columns} rows={rows} />
        </>
      )}

      {status !== 'done' && (
        <div className="upload-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={!file || status === 'uploading'}
          >
            {status === 'uploading' ? `Uploading… ${progress}%` : 'Upload'}
          </button>
        </div>
      )}

      {status === 'uploading' && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {status === 'done' && (
        <div className="upload-success" role="status">
          <p>
            <strong>{file?.name}</strong> uploaded.
          </p>
          <div className="upload-success-actions">
            <Link to="/dashboard" className="btn btn-primary">View history</Link>
            <button type="button" className="btn btn-ghost" onClick={handleReset}>Upload another</button>
          </div>
        </div>
      )}
      {status === 'error' && <p className="error-msg">{errorMsg}</p>}
    </div>
  );
};

export default UploadPage;
