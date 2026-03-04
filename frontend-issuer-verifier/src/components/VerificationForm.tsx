import { useState } from 'react';

type VerificationType = 'agent-identity' | 'delegation' | 'combined';

interface VerificationFormProps {
  onSubmit: (type: VerificationType, data: Record<string, unknown>) => Promise<void>;
  isLoading?: boolean;
}

export function VerificationForm({ onSubmit, isLoading }: VerificationFormProps) {
  const [verificationType, setVerificationType] = useState<VerificationType>('agent-identity');
  const [challenge, setChallenge] = useState('');
  const [delegatorDid, setDelegatorDid] = useState('');
  const [requiredCredentials, setRequiredCredentials] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let data: Record<string, unknown> = {};

    switch (verificationType) {
      case 'agent-identity':
        data = { challenge: challenge || undefined };
        break;
      case 'delegation':
        data = { delegatorDid: delegatorDid || undefined };
        break;
      case 'combined':
        data = {
          requiredCredentials: requiredCredentials
            ? requiredCredentials.split(',').map(s => s.trim())
            : undefined,
        };
        break;
    }

    await onSubmit(verificationType, data);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Verification Type</label>
        <select
          className="form-select"
          value={verificationType}
          onChange={(e) => setVerificationType(e.target.value as VerificationType)}
        >
          <option value="agent-identity">Agent Identity</option>
          <option value="delegation">Delegation</option>
          <option value="combined">Combined (Multiple)</option>
        </select>
        <div className="form-helper">
          {verificationType === 'agent-identity' && 'Verify agent identity credential'}
          {verificationType === 'delegation' && 'Verify delegation credential'}
          {verificationType === 'combined' && 'Verify multiple credential types'}
        </div>
      </div>

      {verificationType === 'agent-identity' && (
        <div className="form-group">
          <label className="form-label">Challenge (Optional)</label>
          <input
            type="text"
            className="form-input"
            placeholder="Custom challenge text"
            value={challenge}
            onChange={(e) => setChallenge(e.target.value)}
          />
          <div className="form-helper">Leave empty for auto-generated challenge</div>
        </div>
      )}

      {verificationType === 'delegation' && (
        <div className="form-group">
          <label className="form-label">Delegator DID (Optional)</label>
          <input
            type="text"
            className="form-input"
            placeholder="did:key:z..."
            value={delegatorDid}
            onChange={(e) => setDelegatorDid(e.target.value)}
          />
          <div className="form-helper">Verify delegation from specific delegator</div>
        </div>
      )}

      {verificationType === 'combined' && (
        <div className="form-group">
          <label className="form-label">Required Credential Types</label>
          <input
            type="text"
            className="form-input"
            placeholder="AgentIdentity, Delegation (comma separated)"
            value={requiredCredentials}
            onChange={(e) => setRequiredCredentials(e.target.value)}
          />
          <div className="form-helper">Credential types required from holder</div>
        </div>
      )}

      <button
        type="submit"
        className="btn btn-verifier btn-lg"
        disabled={isLoading}
        style={{ width: '100%', marginTop: '1rem' }}
      >
        {isLoading ? 'Creating...' : '🔍 Create Verification Request'}
      </button>
    </form>
  );
}
