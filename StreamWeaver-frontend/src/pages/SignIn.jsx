import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { loginUser } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import './Pages.css';

const SignIn = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  // idle | loading | error
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    try {
      const data = await loginUser(form);
      login(data); // stores token + user in AuthContext (localStorage)
      navigate('/upload');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.response?.data?.message || 'Sign in failed. Please check your credentials.');
    }
  };

  return (
    <div className="auth-page">
      <h1>Sign In</h1>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          name="email"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          required
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          required
        />
        <button type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      {status === 'error' && <p className="error-msg">{errorMsg}</p>}

      <p className="auth-switch">
        Don&apos;t have an account? <Link to="/signup">Sign Up</Link>
      </p>
    </div>
  );
};

export default SignIn;
