import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

const Dashboard = () => {
const { token, logout } = useAuth();
const navigate = useNavigate();

const [user, setUser] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await getMe(token);
        setUser(data.user);
      } catch (err) {
        setError(
          err.response?.data?.message || 'Failed to load user details'
        );
      }
      finally {
    setLoading(false);
  }
    };

    if (token) {
      fetchUser();
    }
  }, [token]);
if (loading) {
  return (
    <div className="dashboard-loading">
      Loading dashboard...
    </div>
  );
}
  return (
    <div className="dashboard-page">

      {/* Sidebar */}
      <aside className="dashboard-sidebar">

        <div className="dashboard-logo">
          <div className="logo-box">S</div>
          <h2>StreamWeaver</h2>
        </div>

        <nav className="dashboard-nav">
          <div className="nav-item active">
            <span>⌂</span>
            Dashboard
          </div>

          <div
  className="nav-item"
  onClick={() => navigate('/streams')}
>
  <span>▶</span>
  Streams
</div>

          <div className="nav-item">
            <span>▣</span>
            Analytics
          </div>

          <div className="nav-item">
            <span>⚠</span>
            Alerts
          </div>

          <div className="nav-item">
            <span>⚙</span>
            Settings
          </div>
        </nav>

        <div className="sidebar-bottom">

          <div className="help-box">
            <div className="help-icon">?</div>

            <div>
              <strong>Need help?</strong>
              <p>Check documentation</p>
            </div>
          </div>

          <button
            className="logout-button"
            onClick={logout}
          >
            ⇥ &nbsp; Logout
          </button>

        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-main">

        {/* Header */}
        <header className="dashboard-header">

          <div>
            <p className="breadcrumb">
              Workspace / Dashboard
            </p>

            <h1 className="dashboard-title">
              Dashboard
            </h1>
          </div>

          <div className="profile">

            <div className="avatar">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>

            <div>
              <strong>{user?.name || 'User'}</strong>

              <p className="profile-email">
                {user?.email || ''}
              </p>
            </div>

          </div>

        </header>

        {/* Error */}
        {error && (
          <div className="dashboard-error">
            {error}
          </div>
        )}

        {/* Welcome Card */}
        <section className="welcome-card">

          <div>

            <p className="welcome-small">
              Welcome back 👋
            </p>

            <h2 className="welcome-title">
              {user ? `Hello, ${user.name}!` : 'Hello!'}
            </h2>

            <p className="welcome-text">
              Monitor your streams, track activity and manage
              your data from one place.
            </p>

            <button className="primary-button">
              + Create New Stream
            </button>

          </div>

          <div className="welcome-graphic">
            <div className="graph-circle">
              ↗
            </div>
          </div>

        </section>

        {/* Overview */}
        <section>

          <div className="section-header">

            <div>
              <h2 className="section-title">
                Overview
              </h2>

              <p className="section-text">
                Your streaming activity at a glance
              </p>
            </div>

            <button className="period-button">
              Last 30 days ▾
            </button>

          </div>

          {/* Statistics Cards */}
          <div className="stats-cards">

            <div className="stat-card">

              <div className="card-top">
                <div className="card-icon">
                  ◉
                </div>

                <span className="green-badge">
                  +12%
                </span>
              </div>

              <p className="card-label">
                Total Streams
              </p>

              <h3 className="card-number">
                24
              </h3>

              <p className="card-bottom">
                Compared to last month
              </p>

            </div>

            <div className="stat-card">

              <div className="card-top">
                <div className="card-icon">
                  ▶
                </div>

                <span className="green-badge">
                  +8%
                </span>
              </div>

              <p className="card-label">
                Active Streams
              </p>

              <h3 className="card-number">
                12
              </h3>

              <p className="card-bottom">
                Currently running
              </p>

            </div>

            <div className="stat-card">

              <div className="card-top">
                <div className="card-icon">
                  ⚡
                </div>

                <span className="green-badge">
                  +18%
                </span>
              </div>

              <p className="card-label">
                Data Processed
              </p>

              <h3 className="card-number">
                8.4K
              </h3>

              <p className="card-bottom">
                Events processed
              </p>

            </div>

            <div className="stat-card">

              <div className="card-top">
                <div className="card-icon">
                  ⚠
                </div>

                <span className="red-badge">
                  3
                </span>
              </div>

              <p className="card-label">
                Active Alerts
              </p>

              <h3 className="card-number">
                3
              </h3>

              <p className="card-bottom">
                Requires attention
              </p>

            </div>

          </div>

        </section>

        {/* Bottom Section */}
        <section className="bottom-grid">

          {/* Recent Activity */}
          <div className="activity-card">

            <div className="section-header">

              <div>
                <h2 className="section-title">
                  Recent Activity
                </h2>

                <p className="section-text">
                  Latest updates from your streams
                </p>
              </div>

              <button className="view-button">
                View all
              </button>

            </div>

            <div className="activity">

              <div className="activity-dot"></div>

              <div>
                <strong>Stream connected</strong>

                <p>
                  Production Stream is now active
                </p>
              </div>

              <span className="activity-time">
                2 min ago
              </span>

            </div>

            <div className="activity">

              <div className="activity-dot"></div>

              <div>
                <strong>Data processed</strong>

                <p>
                  1,250 events processed successfully
                </p>
              </div>

              <span className="activity-time">
                18 min ago
              </span>

            </div>

            <div className="activity">

              <div className="warning-dot"></div>

              <div>
                <strong>Alert detected</strong>

                <p>
                  High latency detected in stream
                </p>
              </div>

              <span className="activity-time">
                1 hr ago
              </span>

            </div>

          </div>

          {/* Quick Actions */}
          <div className="quick-card">

            <h2 className="section-title">
              Quick Actions
            </h2>

            <p className="section-text">
              Get started with StreamWeaver
            </p>

            <button className="action-button">
              <span>＋</span>
              Create Stream
            </button>

            <button className="action-button">
              <span>↗</span>
              View Analytics
            </button>

            <button className="action-button">
              <span>⚙</span>
              Manage Settings
            </button>

          </div>

        </section>

      </main>

    </div>
  );
};

export default Dashboard;