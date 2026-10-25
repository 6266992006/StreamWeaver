import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { loginUser } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import { describeApiError } from '../utils/apiError';
import PasswordField from '../components/PasswordField';
import './Pages.css';

const SignIn = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // ProtectedRoute remembers where you were going; go back there after signing in.
  const from = location.state?.from || '/upload';
  const justReset = location.state?.passwordReset;

  const [form, setForm] = useState({ email: '', password: '' });
  // idle | loading | error
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    try {
      const data = await loginUser({ ...form, email: form.email.trim() });
      login(data); // stores token + user (with role) in AuthContext
      navigate(from, { replace: true });
    } catch (err) {
      setStatus('error');
      setErrorMsg(describeApiError(err, 'Sign in failed. Please check your credentials.'));
    }
  };

  return (
    <div className="page page-narrow">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p className="page-sub">Sign in to upload, map and track your imports.</p>

        {justReset && (
          <p className="success-msg" role="status">
            Password updated. Sign in with your new password.
          </p>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label htmlFor="signin-email">Email</label>
            <input
              id="signin-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            value={form.password}
            onChange={handleChange}
            required
          />

          <Link to="/forgot-password" className="auth-forgot">
            Forgot password?
          </Link>

          <button type="submit" className="btn btn-primary" disabled={status === 'loading'}>
            {status === 'loading' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {status === 'error' && (
          <p className="error-msg" role="alert">
            {errorMsg}
          </p>
        )}

        <p className="auth-switch">
          New to StreamWeaver? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  );
};

export default SignIn;
