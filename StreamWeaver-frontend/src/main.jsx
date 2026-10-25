import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ImportProvider } from './context/ImportContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <ImportProvider>
        <App />
      </ImportProvider>
    </AuthProvider>
  </StrictMode>,
)
