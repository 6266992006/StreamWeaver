import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getJobHistory } from '../api/jobApi';
import { API_BASE } from '../api/config';
import HistoryTable from '../components/HistoryTable';
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

    getJobHistory(token)
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
  }, [token, reloadTick]);

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
        <h1>Upload history</h1>
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
          <h1>Upload history</h1>
          <p className="page-sub">Every file you&apos;ve uploaded, and where it stands.</p>
        </div>
        <div className="page-actions">
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

          <HistoryTable jobs={paged.items} sort={sort} onSort={handleSort} filtered={isFiltered} />

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
