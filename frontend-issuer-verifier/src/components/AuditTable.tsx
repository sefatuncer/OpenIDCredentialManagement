interface AuditLog {
  id: string;
  action: string;
  actor: string;
  target?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

interface AuditTableProps {
  logs: AuditLog[];
  isLoading?: boolean;
}

export function AuditTable({ logs, isLoading }: AuditTableProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US');
  };

  const getActionBadge = (action: string) => {
    const actionLower = action.toLowerCase();

    if (actionLower.includes('issue') || actionLower.includes('create')) {
      return 'badge-success';
    }
    if (actionLower.includes('revoke') || actionLower.includes('delete')) {
      return 'badge-error';
    }
    if (actionLower.includes('verify')) {
      return 'badge-info';
    }
    return 'badge-warning';
  };

  const truncate = (text: string, maxLength: number = 30) => {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <p>No records yet</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Action</th>
            <th>Actor</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{formatDate(log.timestamp)}</td>
              <td>
                <span className={`badge ${getActionBadge(log.action)}`}>
                  {log.action}
                </span>
              </td>
              <td title={log.actor}>{truncate(log.actor)}</td>
              <td title={log.target}>{log.target ? truncate(log.target) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
