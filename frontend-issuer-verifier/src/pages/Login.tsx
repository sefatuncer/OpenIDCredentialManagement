import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RoleSelector } from '../components/RoleSelector';
import { auth } from '../services/auth';
import { UserRole } from '../services/storage';
import { issuerApi, verifierApi } from '../services/api';
import { toast } from '../hooks/useToast';

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_expired') {
      toast.warning('Session expired. Please login again.');
    } else if (reason === 'token_expired') {
      toast.warning('Token expired. Please login again.');
    } else if (reason === 'unauthorized') {
      toast.error('Unauthorized access. Please login.');
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedRole) {
      toast.error('Please select a role');
      return;
    }

    if (!apiKey.trim()) {
      toast.error('API Key is required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      auth.login(apiKey, selectedRole, '');

      const didResponse = selectedRole === 'issuer'
        ? await issuerApi.getDID()
        : await verifierApi.getDID();

      if (!didResponse.success || !didResponse.data) {
        auth.logout();
        setError(didResponse.error || 'Failed to get DID. API Key may be invalid.');
        return;
      }

      auth.login(apiKey, selectedRole, didResponse.data.did);
      toast.success('Login successful!');
      navigate(`/${selectedRole}`);
    } catch (err) {
      setError('Connection error occurred');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-logo">
          <h1>🔐 SSI Dashboard</h1>
          <p>Issuer / Verifier Management Panel</p>
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Select Role</label>
            <RoleSelector
              selectedRole={selectedRole}
              onSelect={setSelectedRole}
            />
          </div>

          <div className="form-group">
            <label className="form-label">API Key</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="form-helper">
              Contact your administrator for API credentials
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={isLoading || !selectedRole}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          >
            {isLoading ? 'Logging in...' : '🚀 Login'}
          </button>

        </form>
      </div>
    </div>
  );
}
