import { Link } from 'react-router-dom';
import {
  formatBytes,
  formatCount,
  progressPercent,
  statusMeta,
  timeAgo,
} from '../utils/historyUtils';

const StatusBadge = ({ status }) => {
  const { label, tone } = statusMeta(status);
  return <span className={`badge badge-${tone}`}>{label}</span>;
};

// A column header that sorts when clicked.
const SortHeader = ({ label, sortKey, sort, onSort, numeric = false }) => {
  const active = sort.key === sortKey;
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th aria-sort={ariaSort} className={numeric ? 'num' : undefined}>
      <button type="button" className={`th-sort ${active ? 'th-sort-active' : ''}`} onClick={() => onSort(sortKey)}>
        {label}
        <span className="sort-caret" aria-hidden="true">
          {active ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
        </span>
      </button>
    </th>
  );
};

const HistoryTable = ({ jobs = [], sort, onSort, filtered = false }) => {
  if (jobs.length === 0) {
    return filtered ? (
      <p className="history-empty">No files match your search or filter.</p>
    ) : (
      <p className="history-empty">
        No uploads yet. <Link to="/upload">Upload your first file</Link> to see it here.
      </p>
    );
  }

  return (
    <div className="table-wrap">
      <table className="history-table">
        <thead>
          <tr>
            <SortHeader label="File" sortKey="fileName" sort={sort} onSort={onSort} />
            <SortHeader label="Uploaded" sortKey="uploadedAt" sort={sort} onSort={onSort} />
            <SortHeader label="Rows" sortKey="totalRows" sort={sort} onSort={onSort} numeric />
            <SortHeader label="Failed" sortKey="rowsFailed" sort={sort} onSort={onSort} numeric />
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const percent = job.status === 'processing' ? progressPercent(job) : null;
            return (
              <tr key={job.id}>
                <td className="col-file">
                  <span className="file-name" title={job.fileName}>{job.fileName || '—'}</span>
                  <span className="file-size">{formatBytes(job.sizeBytes)}</span>
                </td>
                <td title={job.uploadedAt ? new Date(job.uploadedAt).toLocaleString() : ''}>
                  {timeAgo(job.uploadedAt)}
                </td>
                <td className="num">{formatCount(job.totalRows)}</td>
                <td className={`num ${job.rowsFailed > 0 ? 'num-failed' : ''}`}>
                  {job.rowsFailed > 0 ? formatCount(job.rowsFailed) : '—'}
                </td>
                <td className="col-status">
                  <StatusBadge status={job.status} />
                  {percent !== null && (
                    <div className="row-progress" title={`${formatCount(job.rowsProcessed)} of ${formatCount(job.totalRows)} rows`}>
                      <div className="row-progress-fill" style={{ width: `${percent}%` }} />
                    </div>
                  )}
                  {job.status === 'processing' && job.rowsPerSec > 0 && (
                    <span className="row-note">{formatCount(job.rowsPerSec)} rows/s</span>
                  )}
                  {job.status === 'failed' && job.errorMessage && (
                    <span className="row-note row-note-failed">{job.errorMessage}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default HistoryTable;
