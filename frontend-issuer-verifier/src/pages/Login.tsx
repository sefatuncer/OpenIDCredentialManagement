import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RoleSelector } from '../components/RoleSelector';
import { auth } from '../services/auth';
import { UserRole } from '../services/storage';
import { issuerApi, verifierApi } from '../services/api';
import { toast } from '../hooks/useToast';
import {
  getKeycloakConfig,
  startKeycloakLogin,
  handleKeycloakCallback,
  setKeycloakAuth,
} from '../services/keycloak';

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  useEffect(() => {
    // Check if Keycloak SSO is available
    getKeycloakConfig().then((cfg) => setSsoEnabled(cfg.enabled));

    const reason = searchParams.get('reason');
    if (reason === 'session_expired') {
      toast.warning('Session expired. Please login again.');
    } else if (reason === 'token_expired') {
      toast.warning('Token expired. Please login again.');
    } else if (reason === 'unauthorized') {
      toast.error('Unauthorized access. Please login.');
    }

    // Handle Keycloak callback (authorization code in URL)
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (code && state) {
      handleSSOCallback(code, state);
    }
  }, [searchParams]);

  const handleSSOCallback = async (code: string, state: string) => {
    setIsLoading(true);
    setError('');

    try {
      const result = await handleKeycloakCallback(code, state);
      if (!result) {
        setError('SSO login failed. Please try again.');
        // Clear URL params
        window.history.replaceState({}, '', '/login');
        return;
      }

      const role = (result.role === 'issuer' ? 'issuer' : 'verifier') as UserRole;
      auth.login(result.accessToken, role, result.sub, 3600 * 1000);
      setKeycloakAuth(true);

      toast.success(`SSO login successful! Welcome ${result.username || result.sub}`);
      navigate(`/${role}`);
    } catch {
      setError('SSO callback error');
      window.history.replaceState({}, '', '/login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSSOLogin = async () => {
    setSsoLoading(true);
    try {
      await startKeycloakLogin();
    } catch {
      setError('Failed to initiate SSO login');
      setSsoLoading(false);
    }
  };

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
      setKeycloakAuth(false);

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
          <h1>SSI Dashboard</h1>
          <p>Issuer / Verifier Management Panel</p>
        </div>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        {ssoEnabled && (
          <>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={ssoLoading || isLoading}
              onClick={handleSSOLogin}
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              {ssoLoading ? 'Redirecting...' : 'Login with SSO (Keycloak)'}
            </button>
            <div style={{
              textAlign: 'center',
              margin: '1rem 0',
              color: 'var(--text-secondary, #666)',
              fontSize: '0.875rem',
            }}>
              or login with API Key
            </div>
          </>
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
            {isLoading ? 'Logging in...' : 'Login with API Key'}
          </button>

        </form>
      </div>
    </div>
  );
}
