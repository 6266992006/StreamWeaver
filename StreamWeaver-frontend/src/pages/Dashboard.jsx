import { useEffect, useState } from 'react';
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
