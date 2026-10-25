import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/authApi';
import { describeApiError } from '../utils/apiError';
import PasswordField from '../components/PasswordField';
import './Pages.css';

const MIN_PASSWORD = 6;

// Opened from the link in the reset email:  /reset-password?token=...
const ResetPassword = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // idle | loading | error
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= MIN_PASSWORD && confirm === password;

  if (!token) {
    return (
      <div className="page page-narrow">
        <div className="auth-card">
          <h1>Link not valid</h1>
          <p className="page-sub">This reset link is missing its token. Request a new one.</p>
          <Link to="/forgot-password" className="btn btn-primary auth-again">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      await resetPassword(token, password);
      navigate('/signin', { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setStatus('error');
      setErrorMsg(describeApiError(err, 'Could not reset the password. The link may have expired.'));
    }
  };

  return (
    <div className="page page-narrow">
      <div className="auth-card">
        <h1>Choose a new password</h1>
        <form onSubmit={handleSubmit} className="auth-form">
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={<span className={tooShort ? 'field-hint-bad' : ''}>At least {MIN_PASSWORD} characters</span>}
            required
          />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            hint={mismatch ? <span className="field-hint-bad">Passwords don&apos;t match</span> : null}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={!canSubmit || status === 'loading'}>
            {status === 'loading' ? 'Saving…' : 'Update password'}
          </button>
        </form>
        {status === 'error' && (
          <p className="error-msg" role="alert">
            {errorMsg}{' '}
            <Link to="/forgot-password">Request a new link</Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
