import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import IssueCredential from './pages/IssueCredential'
import Credentials from './pages/Credentials'
import VerifyCredential from './pages/VerifyCredential'
import AgentDashboard from './pages/AgentDashboard'
import AgentControl from './pages/AgentControl'
import Delegations from './pages/Delegations'
import TrustManagement from './pages/TrustManagement'
import Simulation from './pages/Simulation'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="header">
          <h1>
            <span className="logo-icon">🤖</span>
            <span className="logo-text">AI Agent Web Wallet</span>
          </h1>
          <nav className="nav">
            <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
              Agent
            </NavLink>
            <NavLink to="/control" className={({ isActive }) => isActive ? 'active' : ''}>
              Control
            </NavLink>
            <NavLink to="/simulation" className={({ isActive }) => isActive ? 'active' : ''}>
              Simulation
            </NavLink>
            <NavLink to="/delegations" className={({ isActive }) => isActive ? 'active' : ''}>
              Delegations
            </NavLink>
            <NavLink to="/trust" className={({ isActive }) => isActive ? 'active' : ''}>
              Trust
            </NavLink>
            <NavLink to="/credentials" className={({ isActive }) => isActive ? 'active' : ''}>
              Credentials
            </NavLink>
            <NavLink to="/issue" className={({ isActive }) => isActive ? 'active' : ''}>
              Issue
            </NavLink>
            <NavLink to="/verify" className={({ isActive }) => isActive ? 'active' : ''}>
              Verify
            </NavLink>
          </nav>
        </header>

        <main className="container">
          <Routes>
            <Route path="/" element={<AgentDashboard />} />
            <Route path="/control" element={<AgentControl />} />
            <Route path="/simulation" element={<Simulation />} />
            <Route path="/delegations" element={<Delegations />} />
            <Route path="/trust" element={<TrustManagement />} />
            <Route path="/credentials" element={<Credentials />} />
            <Route path="/issue" element={<IssueCredential />} />
            <Route path="/verify" element={<VerifyCredential />} />
            <Route path="/legacy" element={<Dashboard />} />
          </Routes>
        </main>

        <footer className="footer">
          <p>AI Agent Identity System - Fame SSI Framework</p>
          <p className="version">v1.0.0</p>
        </footer>
      </div>
    </BrowserRouter>
  )
}

export default App
