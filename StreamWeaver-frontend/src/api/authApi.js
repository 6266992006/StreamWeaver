import axios from 'axios';

// Backend base API URL
const API_URL = 'http://localhost:5000/api/auth';

// Register (Sign Up) API Call
export const registerUser = async (userData) => {
  const response = await axios.post(`${API_URL}/signup`, userData);
  return response.data;
};

// Login (Sign In) API Call
export const loginUser = async (userData) => {
  const response = await axios.post(`${API_URL}/login`, userData);
  return response.data;
};

// Forgot Password API Call
export const forgotPassword = async (email) => {
  const response = await axios.post(`${API_URL}/forgot-password`, { email });
  return response.data;
};

// Get logged-in user details
export const getMe = async (token) => {
  const response = await axios.get(`${API_URL}/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};