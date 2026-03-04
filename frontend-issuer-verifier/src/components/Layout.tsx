import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../services/auth';
import { UserRole } from '../services/storage';

interface LayoutProps {
  children: ReactNode;
  role: UserRole;
}

const issuerNavItems = [
  { path: '/issuer', label: 'Dashboard', icon: '📊' },
  { path: '/issuer/issue', label: 'Issue Credential', icon: '🎫' },
  { path: '/issuer/revocation', label: 'Revocation', icon: '🚫' },
  { path: '/issuer/audit', label: 'Audit Logs', icon: '📋' },
];

const verifierNavItems = [
  { path: '/verifier', label: 'Dashboard', icon: '📊' },
  { path: '/verifier/request', label: 'Verify Request', icon: '🔍' },
  { path: '/verifier/results', label: 'Results', icon: '✅' },
  { path: '/verifier/trust', label: 'Trust Management', icon: '🤝' },
  { path: '/verifier/audit', label: 'Audit Logs', icon: '📋' },
];

export function Layout({ children, role }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const did = auth.getDID();

  const navItems = role === 'issuer' ? issuerNavItems : verifierNavItems;

  const handleLogout = () => {
    auth.logout();
    navigate('/login');
  };

  const handleSwitchRole = () => {
    const newRole = role === 'issuer' ? 'verifier' : 'issuer';
    auth.switchRole(newRole);
    navigate(`/${newRole}`);
  };

  const truncateDID = (did: string) => {
    if (did.length <= 30) return did;
    return `${did.slice(0, 15)}...${did.slice(-10)}`;
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            🔐 SSI Dashboard
          </div>
          <span className={`sidebar-role ${role}`}>
            {role === 'issuer' ? 'Issuer' : 'Verifier'}
          </span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Menu</div>
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          {did && (
            <div className="did-display" style={{ marginBottom: '0.5rem' }}>
              <span className="did-text" title={did}>
                {truncateDID(did)}
              </span>
            </div>
          )}
          <button
            className="btn btn-secondary"
            onClick={handleSwitchRole}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          >
            {role === 'issuer' ? '🔍 Switch to Verifier' : '🎫 Switch to Issuer'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleLogout}
            style={{ width: '100%' }}
          >
            🚪 Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
