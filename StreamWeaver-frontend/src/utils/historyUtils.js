// Pure helpers for the Upload History dashboard (no React, so they can be
// unit-tested with `npm test`).

// How each backend status is shown, and which filter chip it belongs to.
const STATUS_META = {
  uploaded: { label: 'Uploaded', tone: 'pending', group: 'waiting' },
  pending: { label: 'Queued', tone: 'pending', group: 'waiting' },
  processing: { label: 'Processing', tone: 'processing', group: 'processing' },
  done: { label: 'Done', tone: 'done', group: 'done' },
  processed: { label: 'Done', tone: 'done', group: 'done' },
  failed: { label: 'Failed', tone: 'failed', group: 'failed' },
};

export const FILTER_GROUPS = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'processing', label: 'Processing' },
  { id: 'done', label: 'Done' },
  { id: 'failed', label: 'Failed' },
];

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || 'Unknown', tone: 'pending', group: 'waiting' };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${i === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatCount(n) {
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
}

// "just now", "5 min ago", "3 h ago", "2 d ago", then a short date.
export function timeAgo(value, now = Date.now()) {
  const time = new Date(value).getTime();
  if (!value || Number.isNaN(time)) return '—';

  const seconds = Math.round((now - time) / 1000);
  if (seconds < 45) return 'just now'; // also covers small clock skew (future times)
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;

  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

// 0-100 while a job is running, or null when the total isn't known.
export function progressPercent(job) {
  const total = job.totalRows ?? 0;
  if (total <= 0) return null;
  const handled = (job.rowsProcessed ?? 0) + (job.rowsFailed ?? 0);
  return Math.max(0, Math.min(100, Math.round((handled / total) * 100)));
}

export function filterJobs(jobs, { query = '', group = 'all' } = {}) {
  const q = query.trim().toLowerCase();
  return jobs.filter((job) => {
    if (group !== 'all' && statusMeta(job.status).group !== group) return false;
    if (q && !(job.fileName || '').toLowerCase().includes(q)) return false;
    return true;
  });
}

const SORT_VALUE = {
  uploadedAt: (j) => new Date(j.uploadedAt).getTime() || 0,
  fileName: (j) => (j.fileName || '').toLowerCase(),
  totalRows: (j) => j.totalRows ?? 0,
  rowsFailed: (j) => j.rowsFailed ?? 0,
};

export function sortJobs(jobs, { key = 'uploadedAt', dir = 'desc' } = {}) {
  const value = SORT_VALUE[key] || SORT_VALUE.uploadedAt;
  const sign = dir === 'asc' ? 1 : -1;
  return jobs
    .map((job, index) => ({ job, index }))
    .sort((a, b) => {
      const av = value(a.job);
      const bv = value(b.job);
      if (av < bv) return -1 * sign;
      if (av > bv) return 1 * sign;
      return a.index - b.index; // ties keep the server's order
    })
    .map(({ job }) => job);
}

export function summarizeJobs(jobs) {
  return jobs.reduce(
    (sum, job) => ({
      files: sum.files + 1,
      rows: sum.rows + (job.totalRows ?? 0),
      processed: sum.processed + (job.rowsProcessed ?? 0),
      failed: sum.failed + (job.rowsFailed ?? 0),
    }),
    { files: 0, rows: 0, processed: 0, failed: 0 }
  );
}

// How many files are in each filter chip.
export function countByGroup(jobs) {
  const counts = { all: jobs.length, waiting: 0, processing: 0, done: 0, failed: 0 };
  for (const job of jobs) counts[statusMeta(job.status).group] += 1;
  return counts;
}

// Worth polling for updates only while something is actually running.
export function hasActiveJobs(jobs) {
  return jobs.some((job) => job.status === 'processing' || job.status === 'pending');
}

export function paginate(items, page, pageSize) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: current,
    pageCount,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, items.length),
  };
}

// Turns a failed history request into something the user can act on.
export function describeHistoryError(err, apiBase = '') {
  const status = err?.response?.status;
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 404) {
    return 'The backend has no history endpoint. An older copy of it is probably still running — stop it and start it again with npm run dev.';
  }
  if (status === 429) return 'Too many requests. Wait a moment, then refresh.';
  if (!err?.response) return `Can't reach the backend${apiBase ? ` at ${apiBase}` : ''}. Is it running?`;
  return err.response?.data?.message || 'Could not load upload history.';
}
