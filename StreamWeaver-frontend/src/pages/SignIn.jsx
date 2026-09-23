import { useState } from 'react';
import { loginUser } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

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
    <div style={{ padding: '2rem', maxWidth: '400px', margin: '2rem auto', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>Sign In</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <input 
            type="email" 
            placeholder="Email" 
            value={formData.email} 
            onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
            required 
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <input 
            type="password" 
            placeholder="Password" 
            value={formData.password} 
            onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
            required 
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box' }}
          />
        </div>
        <button type="submit" style={{ width: '100%', padding: '0.5rem', cursor: 'pointer' }}>Login</button>
      </form>
      <p style={{ marginTop: '1rem' }}>Don't have an account? <Link to="/signup">Sign Up</Link></p>
    </div>
  );
};

export default SignIn;
