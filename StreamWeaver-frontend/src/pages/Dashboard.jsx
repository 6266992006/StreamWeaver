import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getJobHistory } from '../api/jobApi';
import HistoryTable from '../components/HistoryTable';
import './Pages.css';

const Dashboard = () => {
  const { token } = useAuth();

  const [jobs, setJobs] = useState([]);
  // loading | ready | error
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setStatus('loading');
    try {
      const data = await getJobHistory(token);
      setJobs(data.jobs || []);
      setStatus('ready');
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Could not load upload history.');
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (!token) {
    return (
      <div className="page">
        <h1>Upload history</h1>
        <p className="auth-required">
          Sign in to view your uploads. <Link to="/signin">Sign in</Link> or{' '}
          <Link to="/signup">create an account</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Upload history</h1>
          <p className="page-sub">Every file you&apos;ve uploaded, and where it stands.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={loadHistory} disabled={status === 'loading'}>
          Refresh
        </button>
      </div>

      {status === 'loading' && <p className="status-line">Loading…</p>}
      {status === 'error' && <p className="error-msg">{errorMsg}</p>}
      {status === 'ready' && <HistoryTable jobs={jobs} />}
    </div>
  );
};

export default Dashboard;
