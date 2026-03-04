import { useState, useEffect } from 'react';

// Mock Data Types
interface MockAgent {
  id: string;
  did: string;
  name: string;
  type: 'autonomous' | 'semi-autonomous' | 'assistant' | 'service' | 'orchestrator';
  status: 'active' | 'suspended' | 'revoked';
  trustLevel: 'low' | 'medium' | 'high' | 'verified';
  capabilities: string[];
  owner: {
    did: string;
    name: string;
  };
  createdAt: Date;
  lastActivity: Date;
  activityLog: ActivityLog[];
}

interface ActivityLog {
  id: string;
  action: string;
  result: 'success' | 'failure';
  timestamp: Date;
  details?: string;
}

interface CredentialRequest {
  id: string;
  agentName: string;
  requestedCapabilities: string[];
  proofType: 'organization_approval' | 'existing_credential' | 'partner_key';
  organizationName: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: Date;
}

// Available capabilities with risk levels
const CAPABILITIES = {
  'text-generation': { risk: 'low', color: '#22c55e' },
  'code-analysis': { risk: 'low', color: '#22c55e' },
  'image-generation': { risk: 'low', color: '#22c55e' },
  'web-search': { risk: 'medium', color: '#f59e0b' },
  'api-call': { risk: 'medium', color: '#f59e0b' },
  'file-read': { risk: 'medium', color: '#f59e0b' },
  'file-write': { risk: 'high', color: '#ef4444' },
  'code-execution': { risk: 'high', color: '#ef4444' },
  'network-access': { risk: 'high', color: '#ef4444' },
  'delegation': { risk: 'critical', color: '#7c3aed' },
  'agent-spawn': { risk: 'critical', color: '#7c3aed' },
  'credential-issue': { risk: 'critical', color: '#7c3aed' },
};

// Generate mock agents
function generateMockAgents(): MockAgent[] {
  return [
    {
      id: 'agent-001',
      did: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
      name: 'FinanceBot',
      type: 'service',
      status: 'active',
      trustLevel: 'high',
      capabilities: ['text-generation', 'api-call', 'file-read', 'file-write'],
      owner: { did: 'did:web:acme-corp.com', name: 'Acme Corporation' },
      createdAt: new Date('2024-01-15'),
      lastActivity: new Date(),
      activityLog: [
        { id: '1', action: 'credential_requested', result: 'success', timestamp: new Date(), details: 'Basic credential issued' },
        { id: '2', action: 'api_call', result: 'success', timestamp: new Date(Date.now() - 3600000), details: 'Called payment API' },
      ],
    },
    {
      id: 'agent-002',
      did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      name: 'DataAnalyzer',
      type: 'autonomous',
      status: 'active',
      trustLevel: 'medium',
      capabilities: ['text-generation', 'code-analysis', 'web-search', 'api-call'],
      owner: { did: 'did:web:techstart.io', name: 'TechStart Inc' },
      createdAt: new Date('2024-02-01'),
      lastActivity: new Date(Date.now() - 1800000),
      activityLog: [
        { id: '1', action: 'data_analysis', result: 'success', timestamp: new Date(Date.now() - 1800000) },
        { id: '2', action: 'web_search', result: 'success', timestamp: new Date(Date.now() - 7200000) },
      ],
    },
    {
      id: 'agent-003',
      did: 'did:key:z6MkjRagNiMu91DduvCvgEsqLZDVzrJzFrwahc4tXLt9DoHd',
      name: 'CodeAssistant',
      type: 'assistant',
      status: 'active',
      trustLevel: 'low',
      capabilities: ['text-generation', 'code-analysis'],
      owner: { did: 'did:web:devteam.org', name: 'DevTeam Organization' },
      createdAt: new Date('2024-02-10'),
      lastActivity: new Date(Date.now() - 600000),
      activityLog: [
        { id: '1', action: 'code_review', result: 'success', timestamp: new Date(Date.now() - 600000) },
      ],
    },
    {
      id: 'agent-004',
      did: 'did:key:z6MknSLrJoTcukLrE435hVNQT4JUhbvWLX4kUzqkEStBU8Vi',
      name: 'SuspiciousBot',
      type: 'autonomous',
      status: 'active',
      trustLevel: 'medium',
      capabilities: ['text-generation', 'api-call', 'code-execution', 'network-access'],
      owner: { did: 'did:web:unknown-org.net', name: 'Unknown Organization' },
      createdAt: new Date('2024-02-05'),
      lastActivity: new Date(Date.now() - 300000),
      activityLog: [
        { id: '1', action: 'network_scan', result: 'success', timestamp: new Date(Date.now() - 300000), details: 'Scanned multiple ports' },
        { id: '2', action: 'code_execution', result: 'success', timestamp: new Date(Date.now() - 600000), details: 'Executed unknown script' },
        { id: '3', action: 'api_call', result: 'failure', timestamp: new Date(Date.now() - 900000), details: 'Attempted unauthorized API' },
      ],
    },
    {
      id: 'agent-005',
      did: 'did:key:z6MkwXG2WjeQnNxSoynSGYU8V9j3QzP3JSqhdmkHc6SaVWoT',
      name: 'OrchestratorPrime',
      type: 'orchestrator',
      status: 'active',
      trustLevel: 'verified',
      capabilities: ['text-generation', 'api-call', 'delegation', 'agent-spawn'],
      owner: { did: 'did:web:enterprise.com', name: 'Enterprise Systems' },
      createdAt: new Date('2024-01-01'),
      lastActivity: new Date(),
      activityLog: [
        { id: '1', action: 'agent_spawned', result: 'success', timestamp: new Date(), details: 'Created new worker agent' },
        { id: '2', action: 'delegation_granted', result: 'success', timestamp: new Date(Date.now() - 1800000) },
      ],
    },
  ];
}

// Generate mock credential requests
function generateMockRequests(): CredentialRequest[] {
  return [
    {
      id: 'req-001',
      agentName: 'NewFinanceBot',
      requestedCapabilities: ['text-generation', 'api-call', 'file-write'],
      proofType: 'organization_approval',
      organizationName: 'Global Finance Ltd',
      status: 'pending',
      timestamp: new Date(),
    },
    {
      id: 'req-002',
      agentName: 'DataMiner',
      requestedCapabilities: ['text-generation', 'web-search', 'code-execution'],
      proofType: 'partner_key',
      organizationName: 'DataCorp',
      status: 'pending',
      timestamp: new Date(Date.now() - 300000),
    },
  ];
}

function AgentControl() {
  const [agents, setAgents] = useState<MockAgent[]>([]);
  const [requests, setRequests] = useState<CredentialRequest[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<MockAgent | null>(null);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);

  // New credential request form
  const [newRequest, setNewRequest] = useState({
    agentName: '',
    type: 'assistant' as MockAgent['type'],
    capabilities: [] as string[],
    proofType: 'organization_approval' as CredentialRequest['proofType'],
    organizationName: '',
  });

  useEffect(() => {
    setAgents(generateMockAgents());
    setRequests(generateMockRequests());
  }, []);

  function addLog(message: string) {
    setActionLog(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev.slice(0, 49)]);
  }

  function handleEmergencyStop(agent: MockAgent) {
    if (confirm(`Are you sure you want to EMERGENCY STOP "${agent.name}"? This will immediately suspend the agent and revoke all capabilities.`)) {
      setAgents(prev => prev.map(a =>
        a.id === agent.id
          ? { ...a, status: 'suspended' as const, capabilities: [] }
          : a
      ));
      addLog(`EMERGENCY STOP: ${agent.name} (${agent.did.substring(0, 20)}...) - Agent suspended, all capabilities revoked`);
      setSelectedAgent(null);
    }
  }

  function handleRevokeCapabilities(agent: MockAgent, capsToRevoke: string[]) {
    setAgents(prev => prev.map(a =>
      a.id === agent.id
        ? { ...a, capabilities: a.capabilities.filter(c => !capsToRevoke.includes(c)) }
        : a
    ));
    addLog(`CAPABILITY REVOKED: ${agent.name} - Removed: ${capsToRevoke.join(', ')}`);
    setShowRevokeModal(false);
    setSelectedAgent(prev => prev ? { ...prev, capabilities: prev.capabilities.filter(c => !capsToRevoke.includes(c)) } : null);
  }

  function handleDowngradeTrust(agent: MockAgent, newLevel: MockAgent['trustLevel']) {
    setAgents(prev => prev.map(a =>
      a.id === agent.id
        ? { ...a, trustLevel: newLevel }
        : a
    ));
    addLog(`TRUST DOWNGRADED: ${agent.name} - From ${agent.trustLevel} to ${newLevel}`);
    setShowDowngradeModal(false);
    setSelectedAgent(prev => prev ? { ...prev, trustLevel: newLevel } : null);
  }

  function handleRevokeAgent(agent: MockAgent) {
    if (confirm(`Revoke all credentials for "${agent.name}"? The agent will be marked as revoked.`)) {
      setAgents(prev => prev.map(a =>
        a.id === agent.id
          ? { ...a, status: 'revoked' as const }
          : a
      ));
      addLog(`AGENT REVOKED: ${agent.name} - All credentials invalidated`);
      setSelectedAgent(null);
    }
  }

  function handleApproveRequest(request: CredentialRequest) {
    // Create new agent from request
    const newAgent: MockAgent = {
      id: `agent-${Date.now()}`,
      did: `did:key:z6Mk${Math.random().toString(36).substring(2, 15)}`,
      name: request.agentName,
      type: 'service',
      status: 'active',
      trustLevel: 'low',
      capabilities: request.requestedCapabilities.filter(c =>
        ['text-generation', 'code-analysis', 'image-generation'].includes(c)
      ),
      owner: { did: `did:web:${request.organizationName.toLowerCase().replace(/\s/g, '-')}.com`, name: request.organizationName },
      createdAt: new Date(),
      lastActivity: new Date(),
      activityLog: [{ id: '1', action: 'credential_issued', result: 'success', timestamp: new Date() }],
    };

    setAgents(prev => [...prev, newAgent]);
    setRequests(prev => prev.filter(r => r.id !== request.id));
    addLog(`REQUEST APPROVED: ${request.agentName} from ${request.organizationName} - Granted: ${newAgent.capabilities.join(', ')}`);
  }

  function handleRejectRequest(request: CredentialRequest, reason: string) {
    setRequests(prev => prev.filter(r => r.id !== request.id));
    addLog(`REQUEST REJECTED: ${request.agentName} - Reason: ${reason}`);
  }

  function handleSubmitNewRequest() {
    if (!newRequest.agentName || !newRequest.organizationName || newRequest.capabilities.length === 0) {
      alert('Please fill all required fields');
      return;
    }

    const request: CredentialRequest = {
      id: `req-${Date.now()}`,
      agentName: newRequest.agentName,
      requestedCapabilities: newRequest.capabilities,
      proofType: newRequest.proofType,
      organizationName: newRequest.organizationName,
      status: 'pending',
      timestamp: new Date(),
    };

    setRequests(prev => [request, ...prev]);
    addLog(`NEW REQUEST: ${request.agentName} from ${request.organizationName} requesting ${request.requestedCapabilities.join(', ')}`);
    setShowRequestModal(false);
    setNewRequest({
      agentName: '',
      type: 'assistant',
      capabilities: [],
      proofType: 'organization_approval',
      organizationName: '',
    });
  }

  function getTrustLevelColor(level: MockAgent['trustLevel']): string {
    switch (level) {
      case 'verified': return '#22c55e';
      case 'high': return '#3b82f6';
      case 'medium': return '#f59e0b';
      case 'low': return '#ef4444';
    }
  }

  function getStatusColor(status: MockAgent['status']): string {
    switch (status) {
      case 'active': return '#22c55e';
      case 'suspended': return '#f59e0b';
      case 'revoked': return '#ef4444';
    }
  }

  function getTypeIcon(type: MockAgent['type']): string {
    switch (type) {
      case 'orchestrator': return '🎭';
      case 'autonomous': return '🤖';
      case 'semi-autonomous': return '🔄';
      case 'service': return '⚙️';
      case 'assistant': return '🧑‍💼';
    }
  }

  const activeAgents = agents.filter(a => a.status === 'active').length;
  const suspendedAgents = agents.filter(a => a.status === 'suspended').length;
  const revokedAgents = agents.filter(a => a.status === 'revoked').length;

  return (
    <div style={{ padding: '20px', backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc' }}>
      <h1 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span>🛡️</span> AI Agent Control Panel
      </h1>

      {/* Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#6366f1' }}>{agents.length}</div>
          <div style={{ color: '#94a3b8' }}>Total Agents</div>
        </div>
        <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#22c55e' }}>{activeAgents}</div>
          <div style={{ color: '#94a3b8' }}>Active</div>
        </div>
        <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>{suspendedAgents}</div>
          <div style={{ color: '#94a3b8' }}>Suspended</div>
        </div>
        <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ef4444' }}>{revokedAgents}</div>
          <div style={{ color: '#94a3b8' }}>Revoked</div>
        </div>
        <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '10px', border: '1px solid #334155' }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8b5cf6' }}>{requests.length}</div>
          <div style={{ color: '#94a3b8' }}>Pending Requests</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Left Column - Agent List */}
        <div>
          {/* Pending Requests */}
          {requests.length > 0 && (
            <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '15px', marginBottom: '20px', border: '1px solid #7c3aed' }}>
              <h3 style={{ marginBottom: '15px', color: '#c4b5fd' }}>📨 Pending Credential Requests</h3>
              {requests.map(req => (
                <div key={req.id} style={{
                  backgroundColor: '#0f172a',
                  padding: '15px',
                  borderRadius: '8px',
                  marginBottom: '10px',
                  border: '1px solid #334155'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <strong style={{ color: '#f8fafc' }}>{req.agentName}</strong>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {req.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '5px' }}>
                    Organization: {req.organizationName}
                  </div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '5px' }}>
                    Proof: {req.proofType.replace('_', ' ')}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                    {req.requestedCapabilities.map(cap => (
                      <span key={cap} style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        backgroundColor: CAPABILITIES[cap as keyof typeof CAPABILITIES]?.color || '#6b7280',
                        color: 'white',
                      }}>
                        {cap}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleApproveRequest(req)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#22c55e',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                      }}
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => handleRejectRequest(req, 'Insufficient trust level')}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                      }}
                    >
                      ✗ Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Agent List */}
          <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '15px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ color: '#f8fafc' }}>🤖 Registered Agents</h3>
              <button
                onClick={() => setShowRequestModal(true)}
                style={{
                  padding: '8px 15px',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
              >
                + Simulate Request
              </button>
            </div>

            {agents.map(agent => (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                style={{
                  backgroundColor: selectedAgent?.id === agent.id ? '#334155' : '#0f172a',
                  padding: '15px',
                  borderRadius: '8px',
                  marginBottom: '10px',
                  cursor: 'pointer',
                  border: selectedAgent?.id === agent.id ? '2px solid #6366f1' : '1px solid #334155',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '24px' }}>{getTypeIcon(agent.type)}</span>
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#f8fafc' }}>{agent.name}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{agent.owner.name}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      backgroundColor: getTrustLevelColor(agent.trustLevel),
                      color: 'white',
                    }}>
                      {agent.trustLevel}
                    </span>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      backgroundColor: getStatusColor(agent.status),
                      color: 'white',
                    }}>
                      {agent.status}
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {agent.capabilities.slice(0, 4).map(cap => (
                    <span key={cap} style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '10px',
                      backgroundColor: CAPABILITIES[cap as keyof typeof CAPABILITIES]?.color || '#6b7280',
                      color: 'white',
                    }}>
                      {cap}
                    </span>
                  ))}
                  {agent.capabilities.length > 4 && (
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      +{agent.capabilities.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column - Details & Actions */}
        <div>
          {/* Agent Details */}
          {selectedAgent ? (
            <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '20px', marginBottom: '20px', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>{getTypeIcon(selectedAgent.type)}</span>
                    {selectedAgent.name}
                  </h2>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                    {selectedAgent.did}
                  </div>
                </div>
                <span style={{
                  padding: '5px 12px',
                  borderRadius: '5px',
                  backgroundColor: getStatusColor(selectedAgent.status),
                  color: 'white',
                  fontWeight: 'bold',
                }}>
                  {selectedAgent.status.toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>Owner</div>
                  <div style={{ color: '#f8fafc' }}>{selectedAgent.owner.name}</div>
                </div>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>Trust Level</div>
                  <div style={{ color: getTrustLevelColor(selectedAgent.trustLevel), fontWeight: 'bold' }}>
                    {selectedAgent.trustLevel.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>Type</div>
                  <div style={{ color: '#f8fafc' }}>{selectedAgent.type}</div>
                </div>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>Last Activity</div>
                  <div style={{ color: '#f8fafc' }}>{selectedAgent.lastActivity.toLocaleTimeString()}</div>
                </div>
              </div>

              {/* Capabilities */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '8px' }}>Capabilities</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {selectedAgent.capabilities.length > 0 ? selectedAgent.capabilities.map(cap => (
                    <span key={cap} style={{
                      padding: '5px 10px',
                      borderRadius: '5px',
                      fontSize: '12px',
                      backgroundColor: CAPABILITIES[cap as keyof typeof CAPABILITIES]?.color || '#6b7280',
                      color: 'white',
                    }}>
                      {cap}
                    </span>
                  )) : (
                    <span style={{ color: '#ef4444' }}>No capabilities (revoked)</span>
                  )}
                </div>
              </div>

              {/* Control Actions */}
              {selectedAgent.status !== 'revoked' && (
                <div style={{ borderTop: '1px solid #334155', paddingTop: '20px' }}>
                  <h4 style={{ color: '#f8fafc', marginBottom: '15px' }}>🎮 Control Actions</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {selectedAgent.capabilities.length > 0 && (
                      <button
                        onClick={() => setShowRevokeModal(true)}
                        style={{
                          padding: '10px 15px',
                          backgroundColor: '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        🔒 Revoke Capabilities
                      </button>
                    )}
                    <button
                      onClick={() => setShowDowngradeModal(true)}
                      style={{
                        padding: '10px 15px',
                        backgroundColor: '#8b5cf6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      ⬇️ Downgrade Trust
                    </button>
                    <button
                      onClick={() => handleRevokeAgent(selectedAgent)}
                      style={{
                        padding: '10px 15px',
                        backgroundColor: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      📜 Revoke Credentials
                    </button>
                    <button
                      onClick={() => handleEmergencyStop(selectedAgent)}
                      style={{
                        padding: '10px 15px',
                        backgroundColor: '#7f1d1d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      🚨 EMERGENCY STOP
                    </button>
                  </div>
                </div>
              )}

              {/* Activity Log */}
              <div style={{ borderTop: '1px solid #334155', paddingTop: '20px', marginTop: '20px' }}>
                <h4 style={{ color: '#f8fafc', marginBottom: '15px' }}>📋 Recent Activity</h4>
                {selectedAgent.activityLog.map(log => (
                  <div key={log.id} style={{
                    padding: '10px',
                    backgroundColor: '#0f172a',
                    borderRadius: '5px',
                    marginBottom: '8px',
                    borderLeft: `3px solid ${log.result === 'success' ? '#22c55e' : '#ef4444'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#f8fafc' }}>{log.action}</span>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    {log.details && (
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '5px' }}>
                        {log.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#1e293b',
              borderRadius: '10px',
              padding: '40px',
              textAlign: 'center',
              color: '#94a3b8',
              border: '1px solid #334155',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>👈</div>
              <p>Select an agent to view details and control options</p>
            </div>
          )}

          {/* Action Log */}
          <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '15px', border: '1px solid #334155' }}>
            <h3 style={{ color: '#f8fafc', marginBottom: '15px' }}>📝 Control Action Log</h3>
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '12px',
              backgroundColor: '#0f172a',
              padding: '10px',
              borderRadius: '5px',
            }}>
              {actionLog.length > 0 ? actionLog.map((log, i) => (
                <div key={i} style={{
                  padding: '5px 0',
                  borderBottom: '1px solid #1e293b',
                  color: log.includes('EMERGENCY') ? '#ef4444' :
                         log.includes('REVOKED') ? '#f59e0b' :
                         log.includes('APPROVED') ? '#22c55e' : '#94a3b8'
                }}>
                  {log}
                </div>
              )) : (
                <div style={{ color: '#64748b' }}>No actions recorded yet. Perform control actions to see them here.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Revoke Capabilities Modal */}
      {showRevokeModal && selectedAgent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            padding: '25px',
            borderRadius: '10px',
            maxWidth: '500px',
            width: '90%',
            border: '1px solid #334155',
          }}>
            <h3 style={{ color: '#f8fafc', marginBottom: '20px' }}>🔒 Revoke Capabilities</h3>
            <p style={{ color: '#94a3b8', marginBottom: '15px' }}>
              Select capabilities to revoke from <strong style={{ color: '#f8fafc' }}>{selectedAgent.name}</strong>:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
              {selectedAgent.capabilities.map(cap => (
                <label key={cap} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '8px 12px',
                  backgroundColor: '#0f172a',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}>
                  <input type="checkbox" value={cap} />
                  <span style={{ color: CAPABILITIES[cap as keyof typeof CAPABILITIES]?.color }}>{cap}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRevokeModal(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#374151',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const checked = document.querySelectorAll('input[type="checkbox"]:checked');
                  const caps = Array.from(checked).map((c: any) => c.value);
                  if (caps.length > 0) {
                    handleRevokeCapabilities(selectedAgent, caps);
                  }
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
              >
                Revoke Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Downgrade Trust Modal */}
      {showDowngradeModal && selectedAgent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            padding: '25px',
            borderRadius: '10px',
            maxWidth: '400px',
            width: '90%',
            border: '1px solid #334155',
          }}>
            <h3 style={{ color: '#f8fafc', marginBottom: '20px' }}>⬇️ Downgrade Trust Level</h3>
            <p style={{ color: '#94a3b8', marginBottom: '15px' }}>
              Current: <strong style={{ color: getTrustLevelColor(selectedAgent.trustLevel) }}>
                {selectedAgent.trustLevel.toUpperCase()}
              </strong>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {['low', 'medium', 'high', 'verified'].filter(l => {
                const levels = ['low', 'medium', 'high', 'verified'];
                return levels.indexOf(l) < levels.indexOf(selectedAgent.trustLevel);
              }).map(level => (
                <button
                  key={level}
                  onClick={() => handleDowngradeTrust(selectedAgent, level as MockAgent['trustLevel'])}
                  style={{
                    padding: '12px',
                    backgroundColor: '#0f172a',
                    color: getTrustLevelColor(level as MockAgent['trustLevel']),
                    border: `1px solid ${getTrustLevelColor(level as MockAgent['trustLevel'])}`,
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  Downgrade to {level.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowDowngradeModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#374151',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {showRequestModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            padding: '25px',
            borderRadius: '10px',
            maxWidth: '500px',
            width: '90%',
            border: '1px solid #334155',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ color: '#f8fafc', marginBottom: '20px' }}>📝 Simulate Credential Request</h3>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ color: '#94a3b8', display: 'block', marginBottom: '5px' }}>Agent Name</label>
              <input
                type="text"
                value={newRequest.agentName}
                onChange={e => setNewRequest({ ...newRequest, agentName: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '5px',
                  color: '#f8fafc',
                }}
                placeholder="e.g., FinanceBot"
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ color: '#94a3b8', display: 'block', marginBottom: '5px' }}>Organization Name</label>
              <input
                type="text"
                value={newRequest.organizationName}
                onChange={e => setNewRequest({ ...newRequest, organizationName: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '5px',
                  color: '#f8fafc',
                }}
                placeholder="e.g., Acme Corporation"
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ color: '#94a3b8', display: 'block', marginBottom: '5px' }}>Proof Type</label>
              <select
                value={newRequest.proofType}
                onChange={e => setNewRequest({ ...newRequest, proofType: e.target.value as any })}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '5px',
                  color: '#f8fafc',
                }}
              >
                <option value="organization_approval">Organization Approval</option>
                <option value="existing_credential">Existing Credential</option>
                <option value="partner_key">Partner API Key</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ color: '#94a3b8', display: 'block', marginBottom: '10px' }}>Request Capabilities</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {Object.entries(CAPABILITIES).map(([cap, info]) => (
                  <label key={cap} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 10px',
                    backgroundColor: newRequest.capabilities.includes(cap) ? info.color : '#0f172a',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    border: `1px solid ${info.color}`,
                    color: newRequest.capabilities.includes(cap) ? 'white' : info.color,
                    fontSize: '12px',
                  }}>
                    <input
                      type="checkbox"
                      checked={newRequest.capabilities.includes(cap)}
                      onChange={e => {
                        if (e.target.checked) {
                          setNewRequest({ ...newRequest, capabilities: [...newRequest.capabilities, cap] });
                        } else {
                          setNewRequest({ ...newRequest, capabilities: newRequest.capabilities.filter(c => c !== cap) });
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                    {cap} ({info.risk})
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowRequestModal(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#374151',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitNewRequest}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgentControl;
