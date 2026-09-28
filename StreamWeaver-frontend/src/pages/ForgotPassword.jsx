import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/authApi';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    setMessage('');
    setError('');

    try {
      const data = await forgotPassword(email);
      setMessage(data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    }
  };

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '400px',
        margin: '2rem auto',
        border: '1px solid #ccc',
        borderRadius: '8px',
      }}
    >
      <h2>Forgot Password</h2>

      <p>Enter your email address to reset your password.</p>

      {message && <p style={{ color: 'green' }}>{message}</p>}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.5rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          style={{
            width: '100%',
            padding: '0.5rem',
            cursor: 'pointer',
          }}
        >
          Send Reset Link
        </button>
      </form>

      <p style={{ marginTop: '1rem' }}>
        <Link to="/signin">Back to Sign In</Link>
      </p>
    </div>
  );
};

export default ForgotPassword;

