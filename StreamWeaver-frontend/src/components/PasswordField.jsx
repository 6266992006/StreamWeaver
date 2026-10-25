import { useId, useState } from 'react';

// Labelled password input with a show/hide button.
const PasswordField = ({ label = 'Password', hint, ...inputProps }) => {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field-password">
        <input id={id} type={visible ? 'text' : 'password'} {...inputProps} />
        <button
          type="button"
          className="field-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
};

export default PasswordField;
