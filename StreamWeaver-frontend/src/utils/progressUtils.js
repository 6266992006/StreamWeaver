// Small helpers for the live progress display.

export const clampPercent = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

// While rows are still arriving, never show 100% — the total is only an
// estimate until the import actually finishes.
export function displayPercent(frame) {
  if (!frame) return 0;
  if (frame.status === 'done') return 100;
  if (frame.percent == null) return 0;
  return Math.min(99, clampPercent(frame.percent));
}

// Seconds left, or null when it can't be told yet.
export function etaSeconds({ totalRows, rowsProcessed = 0, rowsFailed = 0, rowsPerSec }) {
  if (!totalRows || !rowsPerSec || rowsPerSec <= 0) return null;
  const left = totalRows - rowsProcessed - rowsFailed;
  if (left <= 0) return 0;
  return Math.ceil(left / rowsPerSec);
}

export function formatDuration(totalSeconds) {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return '—';
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export const formatRate = (rowsPerSec) =>
  Number.isFinite(rowsPerSec) && rowsPerSec > 0 ? `${Math.round(rowsPerSec).toLocaleString()} rows/s` : '—';
