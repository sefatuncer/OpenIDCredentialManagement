import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { IssuerDashboard } from './pages/IssuerDashboard';
import { VerifierDashboard } from './pages/VerifierDashboard';
import { IssueCredential } from './pages/IssueCredential';
import { Revocation } from './pages/Revocation';
import { VerifyRequest } from './pages/VerifyRequest';
import { VerifyResults } from './pages/VerifyResults';
import { TrustManagement } from './pages/TrustManagement';
import { AuditLogs } from './pages/AuditLogs';
import { ToastContainer } from './components/Toast';
import { auth } from './services/auth';
import './styles/main.css';

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: 'issuer' | 'verifier' }) {
  const { isAuthenticated, role } = auth.getState();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && role !== requiredRole) {
    return <Navigate to={`/${role}`} replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />

        {/* Issuer routes */}
        <Route
          path="/issuer"
          element={
            <ProtectedRoute requiredRole="issuer">
              <IssuerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/issuer/issue"
          element={
            <ProtectedRoute requiredRole="issuer">
              <IssueCredential />
            </ProtectedRoute>
          }
        />
        <Route
          path="/issuer/revocation"
          element={
            <ProtectedRoute requiredRole="issuer">
              <Revocation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/issuer/audit"
          element={
            <ProtectedRoute requiredRole="issuer">
              <AuditLogs role="issuer" />
            </ProtectedRoute>
          }
        />

        {/* Verifier routes */}
        <Route
          path="/verifier"
          element={
            <ProtectedRoute requiredRole="verifier">
              <VerifierDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/verifier/request"
          element={
            <ProtectedRoute requiredRole="verifier">
              <VerifyRequest />
            </ProtectedRoute>
          }
        />
        <Route
          path="/verifier/results"
          element={
            <ProtectedRoute requiredRole="verifier">
              <VerifyResults />
            </ProtectedRoute>
          }
        />
        <Route
          path="/verifier/trust"
          element={
            <ProtectedRoute requiredRole="verifier">
              <TrustManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/verifier/audit"
          element={
            <ProtectedRoute requiredRole="verifier">
              <AuditLogs role="verifier" />
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
