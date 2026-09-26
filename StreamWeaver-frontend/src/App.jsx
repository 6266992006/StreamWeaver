import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import UploadPage from './pages/UploadPage'
import Dashboard from './pages/Dashboard'
import './App.css'

// TEMP preview nav — just so Upload/Dashboard can be clicked into and
// tested now. Full route/page integration (login-gated, final nav) is
// a Week 4 task.
function PreviewNav() {
  return (
    <nav className="preview-nav">
      <Link to="/">Home</Link>
      <Link to="/upload">Upload</Link>
      <Link to="/dashboard">Dashboard</Link>
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
      </Routes>
    </BrowserRouter>
  )
}

export default App
