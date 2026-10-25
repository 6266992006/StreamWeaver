import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useImport } from '../context/ImportContext';
import { createImportJob, previewTransforms } from '../api/mappingApi';
import MappingForm from '../components/MappingForm';
import Stepper from '../components/Stepper';
import { describeApiError } from '../utils/apiError';
import { formatBytes, formatCount } from '../utils/historyUtils';
import {
  activeTransforms,
  buildImportPayload,
  buildInitialRows,
  checkValue,
  summarizeSampleChecks,
  validateRows,
} from '../utils/mappingUtils';
import './Pages.css';

const PREVIEW_ROWS = 5; // rows run through the sandbox for the live preview
const CHECK_ROWS = 200; // rows checked locally when there's nothing to transform

const MappingPage = () => {
  const { token } = useAuth();
  const { draft, setRun } = useImport();
  const navigate = useNavigate();

  const [rows, setRows] = useState(() => (draft ? buildInitialRows(draft.columns, draft.rows) : []));
  const [showErrors, setShowErrors] = useState(false);
  // idle | starting | error
  const [submit, setSubmit] = useState({ status: 'idle', message: '' });
  // The sample rows after the user's transforms ran in the backend sandbox.
  // `key` records which set of transforms these rows belong to, so "still running"
  // can be worked out by comparison instead of by setting state inside the effect.
  const [result, setResult] = useState({ key: '{}', status: 'ready', rows: [], rowErrors: [], message: '' });

  const sample = useMemo(() => (draft ? draft.rows.slice(0, PREVIEW_ROWS) : []), [draft]);
  const transformsKey = JSON.stringify(activeTransforms(rows));

  // Re-run the live preview shortly after the transforms stop changing.
  useEffect(() => {
    if (!draft) return undefined;
    const transforms = JSON.parse(transformsKey);
    if (Object.keys(transforms).length === 0) return undefined;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await previewTransforms(sample, transforms, token);
        if (cancelled) return;
        setResult({
          key: transformsKey,
          status: 'ready',
          rows: results.map((r, i) => (r.ok ? r.row : sample[i])),
          rowErrors: results.map((r) => (r.ok ? null : r.error)),
          message: '',
        });
      } catch (err) {
        if (cancelled) return;
        setResult({ key: transformsKey, status: 'error', rows: sample, rowErrors: [], message: describeApiError(err) });
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [transformsKey, sample, token, draft]);

  const hasTransforms = transformsKey !== '{}';
  // Without transforms the preview is just the raw sample; with them it's the
  // sandbox's answer — and "loading" until that answer matches the current transforms.
  const preview = !hasTransforms
    ? { status: 'idle', rows: sample, rowErrors: [], message: '' }
    : result.key === transformsKey
      ? result
      : { status: 'loading', rows: result.rows.length ? result.rows : sample, rowErrors: [], message: '' };

  const { errors, problem } = useMemo(() => validateRows(rows), [rows]);
  const included = rows.filter((r) => r.include);

  // Which sample rows/cells would fail the type / required checks.
  const checks = useMemo(() => {
    if (!draft) return { perColumn: {}, failingRowCount: 0, sampleSize: 0 };
    return hasTransforms
      ? summarizeSampleChecks(rows, preview.rows, preview.rows)
      : summarizeSampleChecks(rows, draft.rows.slice(0, CHECK_ROWS));
  }, [rows, draft, hasTransforms, preview.rows]);

  const samples = useMemo(() => {
    const first = draft?.rows[0] || {};
    return Object.fromEntries(Object.entries(first));
  }, [draft]);

  // First transform error text per source column, for the row's note.
  const transformErrors = useMemo(() => {
    const out = {};
    const firstError = preview.rowErrors.find(Boolean);
    if (firstError) {
      const match = /field "([^"]+)"/.exec(firstError);
      if (match) out[match[1]] = firstError.replace(/^Transform failed on field "[^"]+":\s*/, '');
    }
    return out;
  }, [preview.rowErrors]);

  if (!draft) return <Navigate to="/upload" replace />;

  const handleStart = async () => {
    setShowErrors(true);
    if (problem || Object.keys(errors).length > 0) return;

    setSubmit({ status: 'starting', message: '' });
    try {
      const { mapping, fieldTransforms } = buildImportPayload(rows);
      const data = await createImportJob(
        {
          fileName: draft.file.name,
          sizeBytes: draft.file.size,
          columns: draft.columns,
          estimatedRows: draft.estimatedRows,
          mapping,
          fieldTransforms,
        },
        token
      );
      setRun({ jobId: data.jobId, datasetId: data.datasetId });
      navigate('/import');
    } catch (err) {
      setSubmit({ status: 'error', message: describeApiError(err, 'Could not start the import.') });
    }
  };

  const allOn = rows.every((r) => r.include);
  const setAll = (include) => setRows(rows.map((r) => ({ ...r, include })));
  const reset = () => setRows(buildInitialRows(draft.columns, draft.rows));

  return (
    <div className="page page-flow page-flow-wide">
      <Stepper current={1} />
      <div className="page-header">
        <div>
          <h1>Map &amp; clean</h1>
          <p className="page-sub">
            <strong>{draft.file.name}</strong> · {formatBytes(draft.file.size)} · about {formatCount(draft.estimatedRows)}{' '}
            rows. Choose what to import and how each column should look.
          </p>
        </div>
        <Link to="/upload" className="btn btn-ghost">
          ← Back
        </Link>
      </div>

      <div className="mapping-tools">
        <span>
          {included.length} of {rows.length} columns selected
        </span>
        <div>
          <button type="button" className="link-btn" onClick={() => setAll(!allOn)}>
            {allOn ? 'Select none' : 'Select all'}
          </button>
          <button type="button" className="link-btn" onClick={reset}>
            Reset
          </button>
        </div>
      </div>

      <MappingForm
        rows={rows}
        onChange={setRows}
        errors={showErrors || Object.keys(errors).length ? errors : {}}
        samples={samples}
        failCounts={checks.perColumn}
        transformErrors={transformErrors}
      />

      {showErrors && problem && (
        <p className="error-msg" role="alert">
          {problem}
        </p>
      )}

      {/* ----- live preview ----- */}
      <section className="map-preview" aria-label="Preview of the result">
        <div className="preview-head">
          <h2>What will be saved</h2>
          <span className="preview-meta">
            {preview.status === 'loading'
              ? 'Running your cleanup…'
              : `First ${preview.rows.length} rows${hasTransforms ? ', after your cleanup' : ''}`}
          </span>
        </div>

        {preview.status === 'error' && (
          <p className="error-msg" role="alert">
            Couldn&apos;t preview the cleanup: {preview.message}
          </p>
        )}

        {included.length > 0 && (
          <div className="map-preview-scroll">
            <table className="preview-table">
              <thead>
                <tr>
                  {included.map((r) => (
                    <th key={r.id}>
                      {r.dest || '…'}
                      <span className="preview-type">{r.type === 'string' ? 'text' : r.type}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className={preview.rowErrors[i] ? 'preview-row-bad' : ''}>
                    {included.map((r) => {
                      const value = row?.[r.source];
                      const reason = checkValue(value, { type: r.type, required: r.required }, r.dest || r.source);
                      return (
                        <td key={r.id} className={reason ? 'cell-bad' : ''} title={reason || String(value ?? '')}>
                          {value === undefined || value === '' ? <span className="cell-empty">empty</span> : String(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {preview.rowErrors.find(Boolean) && (
          <p className="notice notice-warn">
            Your cleanup failed on a sample row: {preview.rowErrors.find(Boolean)}. Rows like this are skipped and
            listed as failed after the import.
          </p>
        )}

        {checks.failingRowCount > 0 && (
          <p className="notice notice-warn">
            {checks.failingRowCount} of the {checks.sampleSize} sample rows would fail a check (red cells). Failed rows
            are not saved, but they&apos;re listed with the reason and you can download the list.
          </p>
        )}
        {checks.failingRowCount === 0 && checks.sampleSize > 0 && included.length > 0 && (
          <p className="notice notice-ok">The sample rows all pass.</p>
        )}
      </section>

      <div className="upload-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleStart}
          disabled={submit.status === 'starting' || (showErrors && (Boolean(problem) || Object.keys(errors).length > 0))}
        >
          {submit.status === 'starting' ? 'Starting…' : 'Start import →'}
        </button>
        <span className="upload-hint">Rows are checked as they stream in — nothing waits for the whole file.</span>
      </div>
      {submit.status === 'error' && (
        <p className="error-msg" role="alert">
          {submit.message}
        </p>
      )}
    </div>
  );
};

export default MappingPage;
