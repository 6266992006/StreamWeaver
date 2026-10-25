import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/authApi';
import { describeApiError } from '../utils/apiError';
import './Pages.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  // idle | loading | sent | error
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      await forgotPassword(email.trim());
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(describeApiError(err, 'Could not send the reset link. Please try again.'));
    }
  };

  return (
    <div className="page page-narrow">
      <div className="auth-card">
        <h1>Reset your password</h1>

        {status === 'sent' ? (
          <>
            <p className="success-msg" role="status">
              If an account exists for <strong>{email.trim()}</strong>, a reset link is on its way. It works for
              15 minutes.
            </p>
            <p className="page-sub">Nothing arrived? Check spam, or try again in a minute.</p>
            <button type="button" className="btn btn-ghost auth-again" onClick={() => setStatus('idle')}>
              Use a different email
            </button>
          </>
        ) : (
          <>
            <p className="page-sub">Enter your email and we&apos;ll send you a link to choose a new password.</p>
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="field">
                <label htmlFor="forgot-email">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={status === 'loading'}>
                {status === 'loading' ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            {status === 'error' && (
              <p className="error-msg" role="alert">
                {errorMsg}
              </p>
            )}
          </>
        )}

        <p className="auth-switch">
          <Link to="/signin">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
