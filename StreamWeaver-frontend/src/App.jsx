import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import UploadPage from './pages/UploadPage'
import Dashboard from './pages/Dashboard'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import './App.css'

// TEMP preview nav — just so every page can be clicked into and tested
// now. Full route/page integration (final nav, protected routes) is a
// Week 4 task.
function PreviewNav() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <nav className="preview-nav">
      <Link to="/">Home</Link>
      <Link to="/upload">Upload</Link>
      <Link to="/dashboard">Dashboard</Link>
      <span className="nav-spacer" />
      {token ? (
        <>
          <span className="nav-user">Hi, {user?.name || 'there'}</span>
          <button type="button" onClick={handleLogout} className="nav-logout">
            Logout
          </button>
        </>
      ) : (
        <>
          <Link to="/signin">Sign In</Link>
          <Link to="/signup">Sign Up</Link>
        </>
      )}
    </nav>
  )
}

function Home() {
  return (
    <section className="home-page">
      <h1>StreamWeaver</h1>
      <p>High-throughput, no-code ETL pipeline.</p>
      <div className="home-links">
        <Link to="/upload" className="home-cta">Upload a file</Link>
        <Link to="/dashboard" className="home-cta home-cta-secondary">View history</Link>
      </div>
    </section>
  )
}

function App() {
  return (
    <BrowserRouter>
      <PreviewNav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
