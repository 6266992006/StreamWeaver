import { useAuth } from '../context/AuthContext';

// Shows its children only to the listed roles ("admin" and/or "analyst").
//
//   <RoleBasedView allow={['admin']}>…admin-only controls…</RoleBasedView>
//   <RoleBasedView allow={['admin']} fallback={<p>Admins only</p>}>…</RoleBasedView>
//
// This only decides what the screen SHOWS. The backend enforces the real
// permissions (an analyst calling an admin endpoint gets a 403 regardless).
const RoleBasedView = ({ allow = [], fallback = null, children }) => {
  const { role } = useAuth();
  return allow.includes(role) ? children : fallback;
};

export default RoleBasedView;
