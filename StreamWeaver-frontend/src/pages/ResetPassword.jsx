import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();

    setMessage('');
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    console.log('Reset token:', token);
    console.log('New password:', password);

    setMessage('Password reset request submitted.');
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
      <h2>Reset Password</h2>

      <p>Enter your new password.</p>

      {message && <p style={{ color: 'green' }}>{message}</p>}

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="password"
            placeholder="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.5rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <input
            type="password"
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          Reset Password
        </button>
      </form>

      <p style={{ marginTop: '1rem' }}>
        <Link to="/signin">Back to Sign In</Link>
      </p>
    </div>
  );
};

export default ResetPassword;
