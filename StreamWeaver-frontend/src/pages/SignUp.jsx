import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerUser } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import './Pages.css';

const SignUp = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '' });
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
      const data = await registerUser(form);
      login(data); // stores token + user in AuthContext (localStorage)
      navigate('/upload');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.response?.data?.message || 'Sign up failed. Please try again.');
    }
  };

  return (
    <div className="page page-narrow">
      <h1>Sign Up</h1>
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          name="name"
          placeholder="Full name"
          value={form.name}
          onChange={handleChange}
          required
        />
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
          placeholder="Password (min 6 characters)"
          value={form.password}
          onChange={handleChange}
          required
          minLength={6}
        />
        <button type="submit" className="btn btn-primary" disabled={status === 'loading'}>
          {status === 'loading' ? 'Signing up…' : 'Sign Up'}
        </button>
      </form>

      {status === 'error' && <p className="error-msg">{errorMsg}</p>}

      <p className="auth-switch">
        Already have an account? <Link to="/signin">Sign In</Link>
      </p>
    </div>
  );
};

export default SignUp;
