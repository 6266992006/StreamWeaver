import { categorizeReason, categoryLabel } from '../utils/errorUtils';
import { formatCount } from '../utils/historyUtils';

// Small inline error indicator. Two uses:
//
//   <ErrorBadge reason="email must be a valid email" />
//       -> a coloured pill for ONE failure reason (used inside ErrorTable).
//
//   <ErrorBadge count={42} onClick={...} active={false} />
//       -> a clickable "42 failed" pill (used in the history table; opens
//          the failed-row list for that file).
const ErrorBadge = ({ reason, count, onClick, active = false }) => {
  if (count !== undefined) {
    const label = `${formatCount(count)} failed`;
    if (!onClick) return <span className="err-badge err-badge-count">{label}</span>;
    return (
      <button
        type="button"
        className={`err-badge err-badge-count err-badge-button ${active ? 'err-badge-active' : ''}`}
        onClick={onClick}
        aria-pressed={active}
        title="View the rows that failed validation"
      >
        {label}
        <span aria-hidden="true">›</span>
      </button>
    );
  }

  const category = categorizeReason(reason);
  return (
    <span className={`err-badge err-badge-${category}`} title={`${categoryLabel(category)}: ${reason}`}>
      {reason}
    </span>
  );
};

export default ErrorBadge;
