import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import UploadPage from './pages/UploadPage'
import Dashboard from './pages/Dashboard'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import MappingPage from './pages/MappingPage'
import ImportRunPage from './pages/ImportRunPage'
import ProtectedRoute from './components/ProtectedRoute'
import RoleBasedView from './components/RoleBasedView'
import DarkModeToggle from './components/DarkModeToggle'
import './App.css'
import './styles/components.css'

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

// Top navigation: links, theme switch, who you are (and your role), log out.
function Nav() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }
  const linkClass = ({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')

  return (
    <nav className="nav" aria-label="Main">
      <Link to="/" className="nav-brand">
        <Mark />
        StreamWeaver
      </Link>

      <div className="nav-links">
        {token && (
          <>
            <NavLink to="/upload" className={linkClass}>
              Import
            </NavLink>
            <NavLink to="/dashboard" className={linkClass}>
              History
            </NavLink>
          </>
        )}
      </div>

      <div className="nav-auth">
        <DarkModeToggle />
        {token ? (
          <>
            <span className="nav-user" title={user?.email}>
              {user?.name || 'Account'}
              <RoleBasedView allow={['admin']}>
                <span className="role-badge">Admin</span>
              </RoleBasedView>
            </span>
            <button type="button" onClick={handleLogout} className="nav-logout">
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/signin" className="nav-link">
              Sign in
            </Link>
            <Link to="/signup" className="nav-cta">
              Get started
            </Link>
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

const STEPS = [
  { n: '1', title: 'Upload', text: 'Drop in a CSV of any size. The first 1,000 rows preview instantly — the file is never loaded into memory.' },
  { n: '2', title: 'Map & clean', text: 'Pick the columns, name and type them, and tidy values with one-click fixes or your own JavaScript.' },
  { n: '3', title: 'Import', text: 'Watch rows stream in live. Failures are listed with reasons; the clean data downloads as CSV or JSON.' },
]

const FEATURES = [
  { title: 'Built for big files', text: 'Streams from your browser straight into MongoDB in batches, so a 5GB file uses the same memory as a small one.' },
  { title: 'Safe custom code', text: 'Your transformations run inside an isolated sandbox with time and memory limits — never on the server itself.' },
  { title: 'Know what failed', text: 'Every rejected row is kept with its row number and reason, ready to review or download as a report.' },
  { title: 'Live progress', text: 'A real-time bar with rows per second and time remaining, over a WebSocket — no refreshing.' },
]

function Home() {
  const { token } = useAuth()
  return (
    <>
      <section className="home">
        <h1>Weave scattered CSVs into one clean stream.</h1>
        <p className="home-sub">
          Upload messy files, map their columns, and StreamWeaver validates and loads every row —
          no pipeline code required.
        </p>

        <PipelineGraphic />

        <div className="home-actions">
          {token ? (
            <>
              <Link to="/upload" className="btn btn-primary">Import a file</Link>
              <Link to="/dashboard" className="btn btn-ghost">View history</Link>
            </>
          ) : (
            <>
              <Link to="/signup" className="btn btn-primary">Get started — it&apos;s free</Link>
              <Link to="/signin" className="btn btn-ghost">Sign in</Link>
            </>
          )}
        </div>
      </section>

      <section className="home-section" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol className="how-steps">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="how-num">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-section" aria-label="Features">
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

function NotFound() {
  return (
    <div className="page page-narrow">
      <h1>Page not found</h1>
      <p className="page-sub">That address doesn&apos;t lead anywhere.</p>
      <Link to="/" className="btn btn-primary upload-actions">Back home</Link>
    </div>
  )
}

const TITLES = {
  '/': 'StreamWeaver',
  '/upload': 'Import · StreamWeaver',
  '/mapping': 'Map & clean · StreamWeaver',
  '/import': 'Importing · StreamWeaver',
  '/dashboard': 'History · StreamWeaver',
  '/signin': 'Sign in · StreamWeaver',
  '/signup': 'Sign up · StreamWeaver',
  '/forgot-password': 'Reset password · StreamWeaver',
  '/reset-password': 'New password · StreamWeaver',
}

// Each page change: back to the top, and a title that says where you are.
function RouteEffects() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = TITLES[pathname] || 'StreamWeaver'
  }, [pathname])
  return null
}

function App() {
  return (
    <BrowserRouter>
      <RouteEffects />
      <a href="#main" className="skip-link">Skip to content</a>
      <Nav />
      <main className="main" id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          <Route path="/mapping" element={<ProtectedRoute><MappingPage /></ProtectedRoute>} />
          <Route path="/import" element={<ProtectedRoute><ImportRunPage /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

export default App
