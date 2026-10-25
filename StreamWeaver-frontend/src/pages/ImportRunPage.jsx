import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useImport } from '../context/ImportContext';
import { uploadImportFile } from '../api/uploadApi';
import { downloadDataset, downloadErrorReport } from '../api/exportApi';
import useWebSocket from '../hooks/useWebSocket';
import ProgressBar from '../components/ProgressBar';
import Stepper from '../components/Stepper';
import DownloadButton from '../components/DownloadButton';
import { describeApiError } from '../utils/apiError';
import { formatBytes, formatCount } from '../utils/historyUtils';
import { formatDuration } from '../utils/progressUtils';
import './Pages.css';

// Step 3: streams the CSV to the server and shows live progress. The same
// request does the whole import (parse -> clean -> validate -> save), and the
// WebSocket reports rows/sec as it goes.
const ImportRunPage = () => {
  const { token } = useAuth();
  const { draft, run, clear } = useImport();
  const navigate = useNavigate();

  const startedRef = useRef(false);
  const abortRef = useRef(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  // uploading | done | error | cancelled
  const [phase, setPhase] = useState('uploading');
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const jobId = run?.jobId;
  const { frame, connection } = useWebSocket({ jobId, token, enabled: Boolean(jobId) && phase !== 'cancelled' });

  // Start the upload exactly once (StrictMode runs effects twice in dev).
  useEffect(() => {
    if (!draft || !run || startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    uploadImportFile(run.jobId, draft.file, token, {
      signal: controller.signal,
      onProgress: ({ percent }) => setUploadPercent(percent),
    })
      .then((data) => {
        setResult(data);
        setPhase('done');
      })
      .catch((err) => {
        if (err.code === 'ERR_CANCELED') {
          setPhase('cancelled');
          return;
        }
        setErrorMsg(describeApiError(err, 'The import failed.'));
        setPhase('error');
      });
  }, [draft, run, token]);

  // Closing the tab mid-import would cut the upload off.
  useEffect(() => {
    if (phase !== 'uploading') return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase]);

  if (!draft || !run) {
    return (
      <div className="page page-flow">
        <h1>Nothing to import here</h1>
        <p className="page-sub">
          This screen needs a file you&apos;ve just chosen. If you refreshed the page, start again from Upload — or check{' '}
          <Link to="/dashboard">your history</Link> to see how an earlier import went.
        </p>
        <Link to="/upload" className="btn btn-primary upload-actions">
          Upload a file
        </Link>
      </div>
    );
  }
  if (!token) return <Navigate to="/signin" replace />;

  // Prefer the live frame; if the socket never delivered one, build it from the
  // final HTTP answer so the page still shows the outcome.
  const shownFrame =
    frame?.status === 'done' || frame?.status === 'failed'
      ? frame
      : phase === 'done' && result
        ? { ...result, status: 'done', percent: 100, rowsPerSec: 0 }
        : phase === 'error'
          ? { ...(frame || {}), status: 'failed', errorMessage: errorMsg }
          : frame;

  const failedRows = result?.rowsFailed ?? shownFrame?.rowsFailed ?? 0;

  const handleCancel = () => abortRef.current?.abort();
  const handleAnother = () => {
    clear();
    navigate('/upload');
  };

  return (
    <div className="page page-flow">
      <Stepper current={phase === 'done' ? 3 : 2} />
      <h1>{phase === 'done' ? 'Import complete' : phase === 'cancelled' ? 'Import cancelled' : 'Importing…'}</h1>
      <p className="page-sub">
        <strong>{draft.file.name}</strong> · {formatBytes(draft.file.size)}
      </p>

      {phase !== 'cancelled' && (
        <ProgressBar
          frame={shownFrame}
          uploadPercent={phase === 'uploading' ? uploadPercent : null}
          connection={connection}
          totalHint={draft.estimatedRows}
        />
      )}

      {phase === 'uploading' && (
        <div className="upload-actions">
          <button type="button" className="btn btn-ghost" onClick={handleCancel}>
            Cancel import
          </button>
          <span className="upload-hint">
            You can leave this page open in the background — the import keeps running while the file uploads.
          </span>
        </div>
      )}

      {phase === 'cancelled' && (
        <div className="notice notice-warn">
          <p>The import was cancelled. Rows that had already been saved stay in your history as a failed run.</p>
          <div className="upload-success-actions">
            <button type="button" className="btn btn-primary" onClick={handleAnother}>
              Start again
            </button>
            <Link to="/dashboard" className="btn btn-ghost">
              View history
            </Link>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="notice notice-bad" role="alert">
          <p>{errorMsg}</p>
          <div className="upload-success-actions">
            <Link to="/mapping" className="btn btn-primary">
              ← Back to mapping
            </Link>
            <Link to="/dashboard" className="btn btn-ghost">
              View history
            </Link>
          </div>
        </div>
      )}

      {phase === 'done' && result && (
        <section className="result" aria-label="Import result">
          <p className="result-line">
            <strong>{formatCount(result.rowsProcessed)}</strong> of {formatCount(result.totalRows)} rows saved in{' '}
            {formatDuration((result.durationMs || 0) / 1000)}
            {failedRows > 0 ? (
              <>
                {' '}
                · <span className="stat-danger">{formatCount(failedRows)} failed</span>
              </>
            ) : (
              ' · no failures'
            )}
            .
          </p>

          <div className="result-actions">
            <div className="result-group">
              <h3>Cleaned data</h3>
              <div className="result-buttons">
                <DownloadButton label="Download CSV" fetcher={() => downloadDataset(run.datasetId, 'csv', token)} />
                <DownloadButton label="Download JSON" fetcher={() => downloadDataset(run.datasetId, 'json', token)} />
              </div>
            </div>

            {failedRows > 0 && (
              <div className="result-group">
                <h3>Rows that failed</h3>
                <div className="result-buttons">
                  <Link to={`/dashboard?errors=${run.jobId}`} className="btn btn-ghost btn-small">
                    See why they failed
                  </Link>
                  <DownloadButton label="Error report (CSV)" fetcher={() => downloadErrorReport(run.jobId, 'csv', token)} />
                </div>
              </div>
            )}
          </div>

          <div className="upload-success-actions">
            <button type="button" className="btn btn-primary" onClick={handleAnother}>
              Import another file
            </button>
            <Link to="/dashboard" className="btn btn-ghost">
              View history
            </Link>
          </div>
        </section>
      )}
    </div>
  );
};

export default ImportRunPage;
