import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Logged-in users ki matrame access ivvadaniki Wrapper
const ProtectedRoute = ({ children }) => {
  const { token } = useAuth();

  // Token lekapothe direct ga Sign In page ki redirect avthundi
  if (!token) {
    return <Navigate to="/signin" replace />;
  }

  return children;
};

export default ProtectedRoute;