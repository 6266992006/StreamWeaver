import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import UploadPage from './pages/UploadPage'
import Dashboard from './pages/Dashboard'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import './App.css'

// Small mark reused from the hero graphic: three strands merging into
// one — the whole product in one glyph.
function Mark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M1 4 L9 10 L1 16" stroke="var(--text)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M1 10 L9 10" stroke="var(--thread)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M9 10 L19 10" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

// TEMP preview nav — every page can be clicked into and tested now.
// Full route/page integration (final nav, protected routes) is a
// Week 4 task.
function PreviewNav() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <nav className="nav">
      <Link to="/" className="nav-brand">
        <Mark />
        StreamWeaver
      </Link>

      <div className="nav-links">
        <Link to="/upload">Upload</Link>
        <Link to="/dashboard">History</Link>
      </div>

      <div className="nav-auth">
        {token ? (
          <>
            <span className="nav-user">{user?.name || 'Account'}</span>
            <button type="button" onClick={handleLogout} className="nav-logout">
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/signin">Sign in</Link>
            <Link to="/signup" className="nav-cta">Sign up</Link>
          </>
        )}
      </div>
    </nav>
  )
}

// The hero graphic makes the product concrete: several raw files
// (thin, mismatched strands) enter the pipeline and merge into one
// clean, validated stream that passes through each real stage.
function PipelineGraphic() {
  const stages = [
    { x: 150, label: 'Upload' },
    { x: 340, label: 'Validate' },
    { x: 530, label: 'Transform' },
    { x: 720, label: 'Load' },
  ]

  return (
    <svg
      className="pipeline-graphic"
      viewBox="0 0 760 150"
      fill="none"
      role="img"
      aria-label="Three mismatched data streams merge at Upload, then flow through Validate, Transform, and Load as one clean stream"
    >
      <path d="M0 20 C 60 20, 100 70, 150 70" stroke="var(--text)" strokeOpacity="0.55" strokeWidth="1.6" fill="none" />
      <path d="M0 70 C 60 70, 100 70, 150 70" stroke="var(--thread)" strokeWidth="1.6" fill="none" />
      <path d="M0 120 C 60 120, 100 70, 150 70" stroke="var(--accent)" strokeOpacity="0.7" strokeWidth="1.6" fill="none" />

      <path
        className="pipeline-main"
        d="M150 70 L720 70"
        stroke="var(--accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />

      {stages.map((s) => (
        <g key={s.label}>
          <circle cx={s.x} cy={70} r={5} fill="var(--bg)" stroke="var(--accent)" strokeWidth="2" />
          <text x={s.x} y={104} textAnchor="middle" className="pipeline-label">
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

function Home() {
  return (
    <section className="home">
      <h1>Weave scattered CSVs into one clean stream.</h1>
      <p className="home-sub">
        Upload messy files, map their columns, and StreamWeaver validates and loads every row —
        no pipeline code required.
      </p>

      <PipelineGraphic />

      <div className="home-actions">
        <Link to="/upload" className="btn btn-primary">Upload a file</Link>
        <Link to="/dashboard" className="btn btn-ghost">View history</Link>
      </div>
    </section>
  )
}

function App() {
  return (
    <BrowserRouter>
      <PreviewNav />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

export default App
