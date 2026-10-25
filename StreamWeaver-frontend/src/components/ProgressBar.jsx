import { displayPercent, etaSeconds, formatDuration, formatRate } from '../utils/progressUtils';
import { formatCount } from '../utils/historyUtils';

const TITLES = {
  waiting: 'Getting ready…',
  uploading: 'Importing',
  processing: 'Importing',
  done: 'All rows processed',
  failed: 'Import failed',
};

const CONNECTION_NOTE = {
  connecting: { text: 'Connecting…', tone: 'wait' },
  open: { text: 'Live', tone: 'live' },
  reconnecting: { text: 'Reconnecting…', tone: 'wait' },
  failed: { text: 'Live updates unavailable — showing upload progress', tone: 'bad' },
};

// Live import progress: a bar, plus rows processed / failed, speed (rows/sec)
// and time left. `frame` is the latest WebSocket progress frame; until the
// first one arrives (or if the socket can't connect) the bar falls back to the
// browser's upload progress so it never just sits at zero.
const ProgressBar = ({ frame, uploadPercent = null, connection = 'idle', totalHint = 0 }) => {
  const status = frame?.status || (uploadPercent != null ? 'uploading' : 'waiting');
  const finished = status === 'done' || status === 'failed';

  let percent = frame ? displayPercent(frame) : uploadPercent != null ? Math.min(99, uploadPercent) : 0;
  if (status === 'done') percent = 100;

  const totalRows = frame?.totalRows || totalHint || 0;
  const eta = etaSeconds({
    totalRows,
    rowsProcessed: frame?.rowsProcessed,
    rowsFailed: frame?.rowsFailed,
    rowsPerSec: frame?.rowsPerSec,
  });
  const note = CONNECTION_NOTE[connection];
  const working = !finished && status !== 'waiting';

  return (
    <div className={`progress progress-${status}`} aria-live="polite">
      <div className="progress-head">
        <h2 className="progress-title">
          {TITLES[status]}
          {working && <span className="progress-percent"> {Math.round(percent)}%</span>}
        </h2>
        {note && !finished && (
          <span className={`live-chip live-${note.tone}`}>
            <span className="live-dot" aria-hidden="true" />
            {note.text}
          </span>
        )}
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label="Import progress"
      >
        <div className={`progress-meter ${working ? 'progress-meter-active' : ''}`} style={{ width: `${percent}%` }} />
      </div>

      <dl className="progress-stats">
        <div>
          <dt>Rows loaded</dt>
          <dd>{formatCount(frame?.rowsProcessed ?? 0)}</dd>
        </div>
        <div>
          <dt>Rows failed</dt>
          <dd className={frame?.rowsFailed > 0 ? 'stat-danger' : ''}>{formatCount(frame?.rowsFailed ?? 0)}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{finished ? '—' : formatRate(frame?.rowsPerSec)}</dd>
        </div>
        <div>
          <dt>{finished ? 'Total rows' : 'Time left'}</dt>
          <dd>
            {finished
              ? formatCount(frame?.totalRows ?? 0)
              : eta == null
                ? '—'
                : formatDuration(eta)}
          </dd>
        </div>
      </dl>

      {status === 'failed' && frame?.errorMessage && (
        <p className="error-msg" role="alert">
          {frame.errorMessage}
        </p>
      )}
    </div>
  );
};

export default ProgressBar;
