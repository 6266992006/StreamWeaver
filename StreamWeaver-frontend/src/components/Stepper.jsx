const STEPS = ['Upload', 'Map & clean', 'Import'];

// "1 Upload → 2 Map & clean → 3 Import" — where you are in the import flow.
const Stepper = ({ current = 0 }) => (
  <ol className="stepper" aria-label="Import steps">
    {STEPS.map((label, i) => (
      <li
        key={label}
        className={`step ${i < current ? 'step-done' : ''} ${i === current ? 'step-current' : ''}`}
        aria-current={i === current ? 'step' : undefined}
      >
        <span className="step-num">{i < current ? '✓' : i + 1}</span>
        <span className="step-label">{label}</span>
      </li>
    ))}
  </ol>
);

export default Stepper;
