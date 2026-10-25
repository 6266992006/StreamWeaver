import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useImport } from '../context/ImportContext';
import VirtualGrid from '../components/VirtualGrid';
import Stepper from '../components/Stepper';
import { PREVIEW_BYTES, estimateRows, headerIssues, parsePreview } from '../utils/csvPreview';
import { formatBytes, formatCount } from '../utils/historyUtils';
import './Pages.css';

const UploadPage = () => {
  const { token } = useAuth();
  const { draft, startDraft } = useImport();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Coming back from the mapping screen keeps your file and preview.
  const [file, setFile] = useState(draft?.file || null);
  const [columns, setColumns] = useState(draft?.columns || []);
  const [rows, setRows] = useState(draft?.rows || []);
  const [estimatedRows, setEstimatedRows] = useState(draft?.estimatedRows || 0);
  const [issues, setIssues] = useState(draft?.issues || []);
  // idle | previewing | error
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [dragActive, setDragActive] = useState(false);

  if (!token) {
    return (
      <div className="page">
        <h1>Upload a file</h1>
        <p className="auth-required">
          Sign in to upload files. <Link to="/signin">Sign in</Link> or <Link to="/signup">create an account</Link>.
        </p>
      </div>
    );
  }

  const fail = (message) => {
    setFile(null);
    setRows([]);
    setColumns([]);
    setIssues([]);
    setEstimatedRows(0);
    setStatus('error');
    setErrorMsg(message);
  };

  const readFile = async (selected) => {
    // The file picker filters to .csv, but drag-and-drop doesn't.
    if (!/\.csv$/i.test(selected.name)) return fail('Only .csv files are supported.');
    if (selected.size === 0) return fail('That file is empty.');

    setFile(selected);
    setStatus('previewing');
    setErrorMsg('');
    setRows([]);
    setColumns([]);
    setIssues([]);

    try {
      // Only the first slice is read, so even a multi-GB file previews instantly
      // and never has to fit in browser memory.
      const isWholeFile = selected.size <= PREVIEW_BYTES;
      const text = await selected.slice(0, PREVIEW_BYTES).text();
      const parsed = parsePreview(text, { isWholeFile });
      if (parsed.columns.length === 0) return fail("Couldn't find a header row in this file.");

      setColumns(parsed.columns);
      setRows(parsed.rows);
      setIssues(headerIssues(parsed.columns));
      setEstimatedRows(
        estimateRows({
          fileSize: selected.size,
          bytesParsed: parsed.bytesParsed,
          rowsParsed: parsed.rowsParsed,
          rowsInSlice: parsed.rowsInSlice,
          isWholeFile,
        })
      );
      setStatus('idle');
    } catch {
      fail('Could not read this file for preview.');
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

  const handleReset = () => {
    setFile(null);
    setRows([]);
    setColumns([]);
    setIssues([]);
    setEstimatedRows(0);
    setStatus('idle');
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleContinue = () => {
    startDraft({ file, columns, rows, estimatedRows, issues });
    navigate('/mapping');
  };

  const ready = file && columns.length > 0 && status === 'idle';

  return (
    <div className="page page-flow">
      <Stepper current={0} />
      <h1>Upload a CSV</h1>
      <p className="page-sub">
        Files up to 5GB. Nothing is saved yet — next you&apos;ll choose how the columns map and clean up the data.
      </p>

      <button
        type="button"
        className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} hidden />
        {file ? (
          <span className="dropzone-file">
            <strong>{file.name}</strong>
            <code>{formatBytes(file.size)}</code>
          </span>
        ) : (
          <span className="dropzone-empty">
            <strong>Drop a CSV here</strong>
            <span>or click to browse</span>
          </span>
        )}
      </button>

      {status === 'previewing' && <p className="status-line">Reading preview…</p>}
      {status === 'error' && (
        <p className="error-msg" role="alert">
          {errorMsg}
        </p>
      )}

      {issues.length > 0 && (
        <ul className="notice notice-warn" role="alert">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <>
          <div className="preview-head">
            <h2>Preview — first {formatCount(rows.length)} rows</h2>
            <span className="preview-meta">
              {columns.length} columns · about {formatCount(estimatedRows)} rows in total
            </span>
          </div>
          <VirtualGrid columns={columns} rows={rows} />
        </>
      )}

      {file && (
        <div className="upload-actions">
          <button type="button" className="btn btn-primary" onClick={handleContinue} disabled={!ready}>
            Continue to mapping →
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReset}>
            Choose a different file
          </button>
        </div>
      )}
    </div>
  );
};

export default UploadPage;
