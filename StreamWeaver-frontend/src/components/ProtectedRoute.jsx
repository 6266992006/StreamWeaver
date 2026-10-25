import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Wraps pages that need a signed-in user. Not signed in -> Sign In, and
// after signing in you come back to the page you were trying to open.
// `roles` (optional) limits a page to certain roles, e.g. roles={['admin']}.
const ProtectedRoute = ({ children, roles }) => {
  const { token, ready, role } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!ready) {
    return (
      <div className="page" role="status">
        <p className="status-line">Checking your session…</p>
      </div>
    );
  }
  if (roles && !roles.includes(role)) {
    return (
      <div className="page">
        <h1>No access</h1>
        <p className="page-sub">Your account doesn&apos;t have permission to view this page.</p>
      </div>
    );
  }
  return children;
};

export default ProtectedRoute;
