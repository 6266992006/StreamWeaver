import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getMe } from '../api/authApi';
import { normalizeUser } from '../utils/userUtils';

const AuthContext = createContext(null);

const TOKEN_KEY = 'token';
const USER_KEY = 'sw-user';

const readJson = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  // Cached copy so the nav shows your name instantly; /me confirms it below.
  const [user, setUser] = useState(() => normalizeUser(readJson(USER_KEY)));
  // false while a saved token is being checked against the server
  const [ready, setReady] = useState(() => !localStorage.getItem(TOKEN_KEY));

  // Keep localStorage in step with state.
  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token]);
  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  }, [user]);

  const login = useCallback((data) => {
    setUser(normalizeUser(data.user));
    setToken(data.token);
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken('');
    setReady(true);
  }, []);

  // On load (and whenever the token changes): confirm the saved token and
  // refresh the user + role. An expired/invalid token signs you out here
  // instead of leaving you on a page that fails on every click.
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    getMe(token)
      .then((data) => {
        if (cancelled) return;
        setUser(normalizeUser(data.user));
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401 || err.response?.status === 404) logout();
        else setReady(true); // backend unreachable: keep the cached user, pages show their own errors
      });
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  // Any API call that comes back 401 while signed in means the session is
  // over (expired token) — sign out once, centrally. Sign-in/up failures are
  // ordinary "wrong password" 401s and are left alone.
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const url = error.config?.url || '';
        const isCredentialCheck = /\/api\/auth\/(login|signup|forgot-password|reset-password)/.test(url);
        if (error.response?.status === 401 && token && !isCredentialCheck) logout();
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, [token, logout]);

  const value = useMemo(
    () => ({ user, token, ready, role: user?.role || null, isAdmin: user?.role === 'admin', login, logout }),
    [user, token, ready, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
