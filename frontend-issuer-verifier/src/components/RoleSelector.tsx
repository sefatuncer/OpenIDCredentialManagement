import { UserRole } from '../services/storage';

interface RoleSelectorProps {
  selectedRole: UserRole | null;
  onSelect: (role: UserRole) => void;
}

export function RoleSelector({ selectedRole, onSelect }: RoleSelectorProps) {
  return (
    <div className="role-selector">
      <div
        className={`role-card issuer ${selectedRole === 'issuer' ? 'selected' : ''}`}
        onClick={() => onSelect('issuer')}
      >
        <div className="role-card-title">🎫 Issuer</div>
        <div className="role-card-desc">
          Issue, revoke and manage credentials. Create agent identity, delegation and capability credentials.
        </div>
      </div>

      <div
        className={`role-card verifier ${selectedRole === 'verifier' ? 'selected' : ''}`}
        onClick={() => onSelect('verifier')}
      >
        <div className="role-card-title">🔍 Verifier</div>
        <div className="role-card-desc">
          Create credential verification requests, view results and manage trusted issuers.
        </div>
      </div>
    </div>
  );
}
