import { useMemo, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import ErrorBadge from './ErrorBadge';
import {
  ERROR_CATEGORIES,
  countByCategory,
  filterErrors,
  hiddenErrorCount,
  splitReasons,
} from '../utils/errorUtils';
import { formatCount } from '../utils/historyUtils';

// Failed-row list: which rows failed validation and why. Virtualized (like
// VirtualGrid) so a full 1,000-entry error log costs about the same to
// render as 8 rows.
const ROW_HEIGHT = 44;
const MAX_VISIBLE_ROWS = 8;

const Row = ({ index, style, data }) => {
  const error = data[index];
  return (
    <div className="err-row" style={style} role="row">
      <div className="err-cell err-cell-row" role="cell">
        {formatCount(error.row)}
      </div>
      <div className="err-cell err-cell-reasons" role="cell">
        {splitReasons(error.reason).map((reason) => (
          <ErrorBadge key={reason} reason={reason} />
        ))}
      </div>
    </div>
  );
};

// errors: [{ row, reason }]   totalFailed: the job's true failed-row count
const ErrorTable = ({ errors = [], totalFailed = 0 }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const counts = useMemo(() => countByCategory(errors), [errors]);
  const visible = useMemo(() => filterErrors(errors, { query, category }), [errors, query, category]);
  const hidden = hiddenErrorCount(errors, totalFailed);

  if (errors.length === 0) {
    return <p className="err-empty">No failed rows were recorded for this file.</p>;
  }

  const height = Math.min(visible.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT;

  return (
    <div className="err-table">
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Search by row number or reason"
          aria-label="Search failed rows"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips" role="group" aria-label="Filter by error type">
          {ERROR_CATEGORIES.filter((c) => c.id === 'all' || counts[c.id] > 0).map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip ${category === c.id ? 'chip-active' : ''}`}
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
              <span className="chip-count">{counts[c.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="err-grid" role="table" aria-label="Rows that failed validation">
        <div className="err-header" role="row">
          <div className="err-cell err-cell-row" role="columnheader">Row</div>
          <div className="err-cell" role="columnheader">Why it failed</div>
        </div>

        {visible.length === 0 ? (
          <p className="err-empty err-empty-inline">No failed rows match your search or filter.</p>
        ) : (
          <List height={height} itemCount={visible.length} itemSize={ROW_HEIGHT} itemData={visible} width="100%">
            {Row}
          </List>
        )}
      </div>

      <p className="err-footnote">
        Row numbers count from the first row after the header, as in your spreadsheet.
        {hidden > 0 &&
          ` Showing the first ${formatCount(errors.length)} of ${formatCount(totalFailed)} failed rows — fix these and re-upload to see the rest.`}
      </p>
    </div>
  );
};

export default ErrorTable;
