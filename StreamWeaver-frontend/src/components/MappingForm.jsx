import { CUSTOM_EXAMPLE, TRANSFORM_PRESETS, TYPE_OPTIONS } from '../utils/mappingUtils';

// The visual mapping table: for every CSV column choose whether to import it,
// what to call it in the database, its type, whether it's required, and an
// optional cleanup (a preset or your own JavaScript, run in a sandbox).
const MappingForm = ({ rows, errors = {}, samples = {}, failCounts = {}, transformErrors = {}, onChange }) => {
  const update = (id, patch) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="mapping" role="table" aria-label="Column mapping">
      <div className="mapping-head" role="row">
        <span role="columnheader">Import</span>
        <span role="columnheader">CSV column</span>
        <span role="columnheader">Save as</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Required</span>
        <span role="columnheader">Clean up</span>
      </div>

      {rows.map((row) => {
        const fail = failCounts[row.id];
        return (
          <div key={row.id} className={`mapping-row ${row.include ? '' : 'mapping-row-off'}`} role="row">
            <label className="map-cell map-include" data-label="Import">
              <input
                type="checkbox"
                checked={row.include}
                onChange={(e) => update(row.id, { include: e.target.checked })}
                aria-label={`Import column ${row.source}`}
              />
            </label>

            <div className="map-cell map-source" data-label="CSV column">
              <strong title={row.source}>{row.source}</strong>
              {samples[row.source] !== undefined && samples[row.source] !== '' && (
                <code title="First value">{samples[row.source]}</code>
              )}
            </div>

            <div className="map-cell" data-label="Save as">
              <input
                type="text"
                className={errors[row.id] && !row.preset.startsWith('custom') ? 'input-bad' : ''}
                value={row.dest}
                disabled={!row.include}
                onChange={(e) => update(row.id, { dest: e.target.value })}
                aria-label={`Field name for ${row.source}`}
                aria-invalid={Boolean(errors[row.id])}
                spellCheck={false}
              />
            </div>

            <div className="map-cell" data-label="Type">
              <select
                value={row.type}
                disabled={!row.include}
                onChange={(e) => update(row.id, { type: e.target.value })}
                aria-label={`Type of ${row.source}`}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="map-cell map-required" data-label="Required">
              <input
                type="checkbox"
                checked={row.required}
                disabled={!row.include}
                onChange={(e) => update(row.id, { required: e.target.checked })}
                aria-label={`${row.source} is required`}
              />
            </label>

            <div className="map-cell" data-label="Clean up">
              <select
                value={row.preset}
                disabled={!row.include}
                onChange={(e) => update(row.id, { preset: e.target.value })}
                aria-label={`Clean up for ${row.source}`}
              >
                {TRANSFORM_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {row.include && row.preset === 'custom' && (
              <div className="map-custom">
                <label htmlFor={`custom-${row.id}`}>
                  JavaScript for <strong>{row.source}</strong> — the cell is <code>value</code>; the last expression is
                  the result.
                </label>
                <textarea
                  id={`custom-${row.id}`}
                  rows={2}
                  spellCheck={false}
                  placeholder={CUSTOM_EXAMPLE}
                  value={row.custom}
                  onChange={(e) => update(row.id, { custom: e.target.value })}
                />
                <span className="field-hint">Runs in an isolated sandbox with a time limit — it can&apos;t touch the server.</span>
              </div>
            )}

            {row.include && (errors[row.id] || transformErrors[row.source] || fail > 0) && (
              <div className="map-notes">
                {errors[row.id] && <span className="map-note map-note-bad">{errors[row.id]}</span>}
                {transformErrors[row.source] && (
                  <span className="map-note map-note-bad">Transform problem: {transformErrors[row.source]}</span>
                )}
                {fail > 0 && !errors[row.id] && (
                  <span className="map-note map-note-warn">
                    {fail} sample row{fail === 1 ? '' : 's'} would fail this check
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MappingForm;
