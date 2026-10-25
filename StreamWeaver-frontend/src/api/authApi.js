import axios from 'axios';
import { API_BASE } from './config';

const API_URL = `${API_BASE}/api/auth`;

// Register (Sign Up)
export const registerUser = async (userData) => {
  const response = await axios.post(`${API_URL}/signup`, userData);
  return response.data;
};

// Login (Sign In)
export const loginUser = async (userData) => {
  const response = await axios.post(`${API_URL}/login`, userData);
  return response.data;
};

// Forgot Password: asks the backend to email a reset link.
export const forgotPassword = async (email) => {
  const response = await axios.post(`${API_URL}/forgot-password`, { email });
  return response.data;
};

// Reset Password: the token comes from the link in the email.
export const resetPassword = async (token, password) => {
  const response = await axios.post(`${API_URL}/reset-password/${encodeURIComponent(token)}`, { password });
  return response.data;
};

// Who am I? Used on page load to restore the signed-in user (and role)
// from the saved token.  -> { success, user: { id, name, email, role } }
export const getMe = async (token) => {
  const response = await axios.get(`${API_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};
