// Matches the status enums from the backend's Dataset and TransformJob
// schemas (models/Dataset.js, models/TransformJob.js).
const STATUS_STYLES = {
  uploaded: { label: 'Uploaded', className: 'badge badge-pending' },
  pending: { label: 'Pending', className: 'badge badge-pending' },
  processing: { label: 'Processing', className: 'badge badge-processing' },
  done: { label: 'Done', className: 'badge badge-done' },
  processed: { label: 'Done', className: 'badge badge-done' },
  failed: { label: 'Failed', className: 'badge badge-failed' },
};

const StatusBadge = ({ status }) => {
  const style = STATUS_STYLES[status] || { label: status || 'Unknown', className: 'badge' };
  return <span className={style.className}>{style.label}</span>;
};

const HistoryTable = ({ jobs = [] }) => {
  if (jobs.length === 0) {
    return <p className="history-empty">No uploads yet.</p>;
  }

  return (
    <table className="history-table">
      <thead>
        <tr>
          <th>File</th>
          <th>Uploaded</th>
          <th>Rows</th>
          <th>Failed</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr key={job._id || job.id}>
            <td>{job.fileName || job.originalFileName || '—'}</td>
            <td>{job.uploadedAt || job.createdAt ? new Date(job.uploadedAt || job.createdAt).toLocaleString() : '—'}</td>
            <td>{job.totalRows ?? job.rowCount ?? 0}</td>
            <td>{job.rowsFailed ?? 0}</td>
            <td>
              <StatusBadge status={job.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default HistoryTable;
