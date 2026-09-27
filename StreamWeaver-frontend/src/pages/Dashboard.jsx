import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const loadHistory = async () => {
      try {
        const data = await getJobHistory(token);
        if (!cancelled) {
          setJobs(data.jobs || []);
          setStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err.response?.data?.message || 'Could not load upload history.');
          setStatus('error');
        }
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) {
    return (
      <div className="dashboard-page">
        <h1>Upload History</h1>
        <p>
          You need to be signed in to view this page.{' '}
          <Link to="/signin">Sign in</Link> or <Link to="/signup">create an account</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <h1>Upload History</h1>

      {status === 'loading' && <p>Loading…</p>}
      {status === 'error' && <p className="error-msg">{errorMsg}</p>}
      {status === 'ready' && <HistoryTable jobs={jobs} />}
    </div>
  );
};

export default Dashboard;
