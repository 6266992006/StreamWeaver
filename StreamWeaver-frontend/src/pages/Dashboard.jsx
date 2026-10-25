import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getJobHistory, getJobErrors } from '../api/jobApi';
import { API_BASE } from '../api/config';
import { downloadErrorReport } from '../api/exportApi';
import DownloadButton from '../components/DownloadButton';
import RoleBasedView from '../components/RoleBasedView';
import HistoryTable from '../components/HistoryTable';
import ErrorTable from '../components/ErrorTable';
import { describeErrorsError } from '../utils/errorUtils';
import {
  FILTER_GROUPS,
  countByGroup,
  describeHistoryError,
  filterJobs,
  formatCount,
  hasActiveJobs,
  paginate,
  sortJobs,
  summarizeJobs,
} from '../utils/historyUtils';
import './Pages.css';

const PAGE_SIZE = 10;
const POLL_MS = 10000; // only while a job is running (see below)

const DEFAULT_SORT = { key: 'uploadedAt', dir: 'desc' };

const Stat = ({ label, value, tone }) => (
  <div className="stat">
    <span className={`stat-value ${tone ? `stat-${tone}` : ''}`}>{formatCount(value)}</span>
    <span className="stat-label">{label}</span>
  </div>
);

const Dashboard = () => {
  const { token, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // Admins can switch to everyone's imports; analysts only ever see their own.
  const [scope, setScope] = useState('mine');

  const [jobs, setJobs] = useState([]);
  // loading | ready | error   (error = the very first load failed)
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(1);

  // logout() changes identity every render; keep it out of the fetch effect's deps.
  const logoutRef = useRef(logout);
  useEffect(() => {
    logoutRef.current = logout;
  });

  // Fetch on mount and whenever reloadTick changes (manual refresh / polling).
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    getJobHistory(token, { scope })
      .then((data) => {
        if (cancelled) return;
        setJobs(data.jobs || []);
        setStatus('ready');
        setErrorMsg('');
        setUpdatedAt(new Date());
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) logoutRef.current();
        setErrorMsg(describeHistoryError(err, API_BASE));
        // A failed refresh keeps the data already on screen; only the first load errors out.
        setStatus((prev) => (prev === 'loading' ? 'error' : prev));
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, reloadTick, scope]);

  // --- Failed rows for one file (opened from the "N failed" badge) ---
  // Arriving from /dashboard?errors=<jobId> (the "see why they failed" link on
  // the import screen) opens that import's failed rows as soon as it's listed.
  const [errorsJobId, setErrorsJobId] = useState(() => searchParams.get('errors') || null);
  // loading | ready | error
  const [errorsState, setErrorsState] = useState({ status: 'loading', errors: [], message: '' });
  const [errorsTick, setErrorsTick] = useState(0); // bumped by "Try again"

  const errorsJob = useMemo(() => jobs.find((j) => j.jobId === errorsJobId) || null, [jobs, errorsJobId]);
  // Re-fetch when the file changes, and again whenever a running job's failed
  // count moves (the history poll above updates it) so rows appear as they fail.
  const errorsFailedCount = errorsJob?.rowsFailed ?? 0;
  const errorsJobStatus = errorsJob?.status;

  useEffect(() => {
    if (!token || !errorsJobId) return undefined;
    let cancelled = false;

    getJobErrors(errorsJobId, token)
      .then((data) => {
        if (cancelled) return;
        setErrorsState({ status: 'ready', errors: data.errors || [], message: '' });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) logoutRef.current();
        const message = describeErrorsError(err, API_BASE);
        // A failed refresh keeps the rows already on screen.
        setErrorsState((prev) =>
          prev.status === 'ready' ? { ...prev, message } : { status: 'error', errors: [], message }
        );
      });

    return () => {
      cancelled = true;
    };
  }, [token, errorsJobId, errorsFailedCount, errorsJobStatus, errorsTick]);

  const handleRetryErrors = () => {
    setErrorsState({ status: 'loading', errors: [], message: '' });
    setErrorsTick((n) => n + 1);
  };

  // The id is now in state, so the address bar can go back to plain /dashboard.
  useEffect(() => {
    if (searchParams.get('errors')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleScope = (next) => {
    if (next === scope) return;
    setScope(next);
    setStatus('loading');
    setErrorsJobId(null);
    setPage(1);
  };

  const handleViewErrors = (job) => {
    if (job.jobId === errorsJobId) {
      setErrorsJobId(null); // clicking the open badge again closes it
      return;
    }
    setErrorsState({ status: 'loading', errors: [], message: '' });
    setErrorsJobId(job.jobId);
  };

  // Auto-refresh only while something is queued or running; a settled history
  // is static, so polling it would just burn through the API rate limit.
  const active = hasActiveJobs(jobs);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setReloadTick((t) => t + 1), POLL_MS);
    return () => clearInterval(id);
  }, [active]);

  const summary = useMemo(() => summarizeJobs(jobs), [jobs]);
  const groupCounts = useMemo(() => countByGroup(jobs), [jobs]);
  const filtered = useMemo(() => filterJobs(jobs, { query, group }), [jobs, query, group]);
  const sorted = useMemo(() => sortJobs(filtered, sort), [filtered, sort]);
  const paged = paginate(sorted, page, PAGE_SIZE);
  const isFiltered = query.trim() !== '' || group !== 'all';

  const handleRefresh = () => {
    setRefreshing(true);
    setReloadTick((t) => t + 1);
  };

  const handleRetry = () => {
    setStatus('loading');
    setErrorMsg('');
    setReloadTick((t) => t + 1);
  };

  const handleSort = (key) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'fileName' ? 'asc' : 'desc' }
    );
    setPage(1);
  };

  if (!token) {
    return (
      <div className="page">
        <h1>Import history</h1>
        <p className="auth-required">
          Sign in to view your uploads. <Link to="/signin">Sign in</Link> or{' '}
          <Link to="/signup">create an account</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <div>
          <h1>Import history</h1>
          <p className="page-sub">
            {scope === 'all' ? "Every import by every user, and where it stands." : "Every file you've imported, and where it stands."}
          </p>
        </div>
        <div className="page-actions">
          <RoleBasedView allow={['admin']}>
            <div className="segmented" role="group" aria-label="Whose imports to show">
              <button type="button" className={scope === 'mine' ? 'seg-active' : ''} aria-pressed={scope === 'mine'} onClick={() => handleScope('mine')}>
                Mine
              </button>
              <button type="button" className={scope === 'all' ? 'seg-active' : ''} aria-pressed={scope === 'all'} onClick={() => handleScope('all')}>
                Everyone
              </button>
            </div>
          </RoleBasedView>
          {updatedAt && status === 'ready' && (
            <span className="updated-at">Updated {updatedAt.toLocaleTimeString()}</span>
          )}
          <button type="button" className="btn btn-ghost" onClick={handleRefresh} disabled={refreshing || status === 'loading'}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {status === 'loading' && (
        <div className="skeleton" aria-busy="true" aria-label="Loading upload history">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="error-panel" role="alert">
          <p>{errorMsg}</p>
          <button type="button" className="btn btn-ghost" onClick={handleRetry}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <div className="stats">
            <Stat label="Files" value={summary.files} />
            <Stat label="Rows uploaded" value={summary.rows} />
            <Stat label="Rows loaded" value={summary.processed} />
            <Stat label="Rows failed" value={summary.failed} tone={summary.failed > 0 ? 'danger' : undefined} />
          </div>

          {errorMsg && (
            <p className="error-msg" role="alert">
              Couldn&apos;t refresh: {errorMsg}
            </p>
          )}

          {jobs.length > 0 && (
            <div className="toolbar">
              <input
                type="search"
                className="search"
                placeholder="Search by file name"
                aria-label="Search by file name"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
              <div className="chips" role="group" aria-label="Filter by status">
                {FILTER_GROUPS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`chip ${group === g.id ? 'chip-active' : ''}`}
                    aria-pressed={group === g.id}
                    onClick={() => {
                      setGroup(g.id);
                      setPage(1);
                    }}
                  >
                    {g.label}
                    <span className="chip-count">{groupCounts[g.id]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {errorsJob && (
            <section className="err-panel" aria-label={`Failed rows in ${errorsJob.fileName}`}>
              <div className="err-panel-header">
                <div>
                  <h2>Failed rows</h2>
                  <p className="err-panel-sub">
                    {errorsJob.fileName} — {formatCount(errorsJob.rowsFailed)} of {formatCount(errorsJob.totalRows)} rows
                    {errorsJob.status === 'processing' ? ' (still processing — updates as rows fail)' : ''}
                  </p>
                </div>
                <div className="err-panel-actions">
                  <DownloadButton label="Report CSV" title="Download every failed row with its reason" fetcher={() => downloadErrorReport(errorsJob.jobId, 'csv', token)} />
                  <DownloadButton label="Report JSON" fetcher={() => downloadErrorReport(errorsJob.jobId, 'json', token)} />
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setErrorsJobId(null)}>
                    Close
                  </button>
                </div>
              </div>

              {errorsState.status === 'loading' && (
                <div className="skeleton" aria-busy="true" aria-label="Loading failed rows">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton-row" />
                  ))}
                </div>
              )}

              {errorsState.status === 'error' && (
                <div className="error-panel" role="alert">
                  <p>{errorsState.message}</p>
                  <button type="button" className="btn btn-ghost" onClick={handleRetryErrors}>
                    Try again
                  </button>
                </div>
              )}

              {errorsState.status === 'ready' && (
                <>
                  {errorsState.message && (
                    <p className="error-msg" role="alert">
                      Couldn&apos;t refresh: {errorsState.message}
                    </p>
                  )}
                  <ErrorTable errors={errorsState.errors} totalFailed={errorsJob.rowsFailed} />
                </>
              )}
            </section>
          )}

          <HistoryTable
            jobs={paged.items}
            sort={sort}
            onSort={handleSort}
            filtered={isFiltered}
            onViewErrors={handleViewErrors}
            selectedJobId={errorsJobId}
            token={token}
            showOwner={scope === 'all'}
          />

          {paged.total > PAGE_SIZE && (
            <div className="pagination">
              <span className="pagination-range">
                Showing {paged.from}–{paged.to} of {paged.total}
              </span>
              <div className="pagination-buttons">
                <button type="button" className="btn btn-ghost" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>
                  Previous
                </button>
                <button type="button" className="btn btn-ghost" disabled={paged.page >= paged.pageCount} onClick={() => setPage(paged.page + 1)}>
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
