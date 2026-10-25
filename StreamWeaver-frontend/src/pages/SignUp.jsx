import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerUser } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import { describeApiError } from '../utils/apiError';
import PasswordField from '../components/PasswordField';
import './Pages.css';

const MIN_PASSWORD = 6; // matches the backend rule

const SignUp = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  // idle | loading | error
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const passwordOk = form.password.length >= MIN_PASSWORD;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!passwordOk) return;
    setStatus('loading');
    setErrorMsg('');

    try {
      const data = await registerUser({ ...form, name: form.name.trim(), email: form.email.trim() });
      login(data);
      navigate('/upload', { replace: true });
    } catch (err) {
      setStatus('error');
      setErrorMsg(describeApiError(err, 'Sign up failed. Please try again.'));
    }
  };

  return (
    <div className="page page-narrow">
      <div className="auth-card">
        <h1>Create your account</h1>
        <p className="page-sub">Every upload, mapping and import you run is tied to your account.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label htmlFor="signup-name">Name</label>
            <input
              id="signup-name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
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
            autoComplete="new-password"
            value={form.password}
            onChange={handleChange}
            hint={
              <span className={passwordOk || form.password === '' ? '' : 'field-hint-bad'}>
                At least {MIN_PASSWORD} characters
              </span>
            }
            required
          />

          <button type="submit" className="btn btn-primary" disabled={status === 'loading' || !passwordOk}>
            {status === 'loading' ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        {status === 'error' && (
          <p className="error-msg" role="alert">
            {errorMsg}
          </p>
        )}

        <p className="auth-switch">
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default SignUp;
