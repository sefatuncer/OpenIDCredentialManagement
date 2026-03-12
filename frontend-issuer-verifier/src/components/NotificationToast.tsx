import { useCallback } from 'react';
import { useWebSocket, WSMessage } from '../hooks/useWebSocket';
import { showToast } from '../hooks/useToast';

const EVENT_LABELS: Record<string, { type: 'success' | 'error' | 'warning' | 'info'; label: string }> = {
  'credential:issued': { type: 'success', label: 'Credential Issued' },
  'credential:revoked': { type: 'warning', label: 'Credential Revoked' },
  'credential:verified': { type: 'info', label: 'Credential Verified' },
  'credential:expiring': { type: 'warning', label: 'Credential Expiring' },
  'credential:expired': { type: 'error', label: 'Credential Expired' },
};

export function NotificationListener() {
  const handleMessage = useCallback((msg: WSMessage) => {
    const config = EVENT_LABELS[msg.type];
    if (!config) return;

    const data = msg.data || {};
    const detail = data.credentialId
      ? ` (${String(data.credentialId).substring(0, 16)}...)`
      : '';

    showToast(config.type, `${config.label}${detail}`, 5000);
  }, []);

  useWebSocket(handleMessage);

  return null;
}
