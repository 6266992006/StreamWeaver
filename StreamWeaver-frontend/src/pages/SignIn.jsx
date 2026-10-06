import { useState } from 'react';
import { loginUser } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './SignIn.css';

const SignIn = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = await loginUser(formData);
      login(data);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials');
    }
  };
return (
  <div className="signin-page">

    <div className="signin-left">
      <div className="signin-brand">
        <div className="brand-icon">S</div>
        <span>StreamWeaver</span>
      </div>

      <div className="signin-intro">
        <p className="signin-label">WELCOME BACK</p>

        <h1>
          Build better
          <br />
          <span>data workflows.</span>
        </h1>

        <p className="signin-description">
          Connect, monitor and manage your data streams
          from one powerful platform.
        </p>

        <div className="signin-features">
          <p>✓ Real-time stream monitoring</p>
          <p>✓ Powerful analytics and insights</p>
          <p>✓ Secure data management</p>
        </div>
      </div>

      <p className="signin-copyright">
        © 2026 StreamWeaver. All rights reserved.
      </p>
    </div>

    <div className="signin-right">
      <div className="signin-card">

        <div className="card-header">
          <h2>Welcome back</h2>
          <p>Sign in to continue to your dashboard</p>
        </div>

        {error && (
          <div className="signin-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          <div className="form-group">
            <label>Email address</label>

            <input
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  email: e.target.value
                })
              }
              required
            />
          </div>

          <div className="form-group">

            <div className="password-header">
              <label>Password</label>

              <Link to="/forgot-password">
                Forgot Password?
              </Link>
            </div>

            <input
              type="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  password: e.target.value
                })
              }
              required
            />
          </div>

          <button type="submit" className="signin-button">
            Sign In <span>→</span>
          </button>

        </form>

        <p className="signup-link">
          Don't have an account?{" "}
          <Link to="/signup">Sign Up</Link>
        </p>

      </div>
    </div>

  </div>
);
     
};

export default SignIn;
