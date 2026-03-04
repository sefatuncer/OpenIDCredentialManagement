/**
 * Admin Dashboard JavaScript
 * Handles API calls and UI updates for the credential system dashboard
 */

// Configuration
const CONFIG = {
    refreshInterval: 30000, // 30 seconds
    apiKeyStorageKey: 'dashboard_api_key',
};

// State
let state = {
    apiKey: '',
    autoRefreshEnabled: true,
};

// DOM Elements
const elements = {
    apiKeyInput: null,
    saveApiKeyBtn: null,
    healthStatus: null,
    healthDot: null,
    healthText: null,
    uptime: null,
    lastChecked: null,
    agentList: null,
    credentialsList: null,
    auditLogs: null,
    auditFilter: null,
};

/**
 * Initialize the dashboard
 */
function init() {
    // Cache DOM elements
    elements.apiKeyInput = document.getElementById('api-key');
    elements.saveApiKeyBtn = document.getElementById('save-api-key');
    elements.healthStatus = document.getElementById('health-status');
    elements.healthDot = document.querySelector('.status-dot');
    elements.healthText = document.querySelector('.status-text');
    elements.uptime = document.getElementById('uptime');
    elements.lastChecked = document.getElementById('last-checked');
    elements.agentList = document.getElementById('agent-list');
    elements.credentialsList = document.getElementById('credentials-list');
    elements.auditLogs = document.getElementById('audit-logs');
    elements.auditFilter = document.getElementById('audit-filter');

    // Load saved API key
    const savedApiKey = localStorage.getItem(CONFIG.apiKeyStorageKey);
    if (savedApiKey) {
        state.apiKey = savedApiKey;
        elements.apiKeyInput.value = savedApiKey;
    }

    // Set up event listeners
    setupEventListeners();

    // Initial data load
    loadAllData();

    // Set up auto-refresh
    setInterval(loadAllData, CONFIG.refreshInterval);
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Save API key
    elements.saveApiKeyBtn.addEventListener('click', saveApiKey);
    elements.apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });

    // Refresh buttons
    document.getElementById('refresh-health').addEventListener('click', loadHealth);
    document.getElementById('refresh-agents').addEventListener('click', loadAgentStatus);
    document.getElementById('refresh-credentials').addEventListener('click', loadCredentials);
    document.getElementById('refresh-audit').addEventListener('click', loadAuditLogs);

    // Audit filter
    elements.auditFilter.addEventListener('change', loadAuditLogs);
}

/**
 * Save the API key
 */
function saveApiKey() {
    state.apiKey = elements.apiKeyInput.value.trim();
    if (state.apiKey) {
        localStorage.setItem(CONFIG.apiKeyStorageKey, state.apiKey);
        loadAuditLogs();
    }
}

/**
 * Load all dashboard data
 */
function loadAllData() {
    loadHealth();
    loadAgentStatus();
    loadCredentials();
    if (state.apiKey) {
        loadAuditLogs();
    }
}

/**
 * Load system health status
 */
async function loadHealth() {
    try {
        const response = await fetch('/health');
        const data = await response.json();

        // Update status indicator
        elements.healthDot.className = 'status-dot';
        if (data.status === 'healthy') {
            elements.healthDot.classList.add('healthy');
            elements.healthText.textContent = 'System Healthy';
        } else {
            elements.healthDot.classList.add('unhealthy');
            elements.healthText.textContent = 'System Unhealthy';
        }

        // Update details
        elements.uptime.textContent = formatUptime(data.uptime);
        elements.lastChecked.textContent = formatDate(new Date());

    } catch (error) {
        console.error('Failed to load health:', error);
        elements.healthDot.className = 'status-dot unhealthy';
        elements.healthText.textContent = 'Connection Error';
        elements.uptime.textContent = '--';
    }
}

/**
 * Load agent status from credential issuer metadata
 */
async function loadAgentStatus() {
    try {
        const response = await fetch('/.well-known/openid-credential-issuer');
        const data = await response.json();

        // Extract agent information from credential configurations
        const agents = [];
        const configs = data.credential_configurations_supported || {};

        for (const [key, config] of Object.entries(configs)) {
            if (key.includes('Agent') || key.includes('Identity')) {
                agents.push({
                    name: key,
                    type: config.format || 'Unknown',
                    active: true,
                });
            }
        }

        // If no agents found, show default system agents
        if (agents.length === 0) {
            agents.push(
                { name: 'Issuer Agent', type: 'Credential Issuer', active: true },
                { name: 'Verifier Agent', type: 'Credential Verifier', active: true },
                { name: 'Holder Agent', type: 'Credential Holder', active: true }
            );
        }

        renderAgentList(agents);

    } catch (error) {
        console.error('Failed to load agent status:', error);
        elements.agentList.innerHTML = '<p class="error-text">Failed to load agent status</p>';
    }
}

/**
 * Render the agent list
 */
function renderAgentList(agents) {
    if (agents.length === 0) {
        elements.agentList.innerHTML = '<p class="empty-text">No agents configured</p>';
        return;
    }

    const html = agents.map(agent => `
        <div class="agent-item ${agent.active ? 'active' : 'inactive'}">
            <div class="agent-info">
                <span class="agent-name">${escapeHtml(agent.name)}</span>
                <span class="agent-type">${escapeHtml(agent.type)}</span>
            </div>
            <span class="agent-status ${agent.active ? 'active' : 'inactive'}">
                ${agent.active ? 'Active' : 'Inactive'}
            </span>
        </div>
    `).join('');

    elements.agentList.innerHTML = html;
}

/**
 * Load credential configurations
 */
async function loadCredentials() {
    try {
        const response = await fetch('/.well-known/openid-credential-issuer');
        const data = await response.json();

        const credentials = [];
        const configs = data.credential_configurations_supported || {};

        for (const [key, config] of Object.entries(configs)) {
            credentials.push({
                id: key,
                name: key,
                format: config.format || 'Unknown',
                types: config.credential_definition?.type || [],
            });
        }

        renderCredentialsList(credentials);

    } catch (error) {
        console.error('Failed to load credentials:', error);
        elements.credentialsList.innerHTML = '<p class="error-text">Failed to load credential configurations</p>';
    }
}

/**
 * Render the credentials list
 */
function renderCredentialsList(credentials) {
    if (credentials.length === 0) {
        elements.credentialsList.innerHTML = '<p class="empty-text">No credential configurations found</p>';
        return;
    }

    const html = credentials.map(cred => `
        <div class="credential-item">
            <div class="credential-name">${escapeHtml(cred.name)}</div>
            <div class="credential-format">Format: ${escapeHtml(cred.format)}</div>
            ${cred.types.length > 0 ? `
                <div class="credential-types">
                    ${cred.types.map(t => `<span class="credential-type-tag">${escapeHtml(t)}</span>`).join('')}
                </div>
            ` : ''}
        </div>
    `).join('');

    elements.credentialsList.innerHTML = html;
}

/**
 * Load audit logs
 */
async function loadAuditLogs() {
    if (!state.apiKey) {
        elements.auditLogs.innerHTML = '<p class="loading-text">Enter API key to view audit logs...</p>';
        return;
    }

    try {
        const filter = elements.auditFilter.value;
        let url = '/api/v1/audit/logs?limit=50';
        if (filter) {
            url += `&eventType=${encodeURIComponent(filter)}`;
        }

        const response = await fetch(url, {
            headers: {
                'X-API-Key': state.apiKey,
            },
        });

        if (response.status === 401 || response.status === 403) {
            elements.auditLogs.innerHTML = '<p class="error-text">Invalid API key or insufficient permissions</p>';
            return;
        }

        const data = await response.json();
        renderAuditLogs(data.logs || []);

    } catch (error) {
        console.error('Failed to load audit logs:', error);
        elements.auditLogs.innerHTML = '<p class="error-text">Failed to load audit logs</p>';
    }
}

/**
 * Render audit logs table
 */
function renderAuditLogs(logs) {
    if (logs.length === 0) {
        elements.auditLogs.innerHTML = '<p class="empty-text">No audit logs found</p>';
        return;
    }

    const html = `
        <table class="audit-table">
            <thead>
                <tr>
                    <th>Timestamp</th>
                    <th>Event Type</th>
                    <th>Endpoint</th>
                    <th>Actor</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${logs.map(log => `
                    <tr>
                        <td class="timestamp">${formatDate(new Date(log.timestamp))}</td>
                        <td class="event-type ${log.success ? 'success' : 'failure'}">${escapeHtml(log.eventType || '--')}</td>
                        <td class="endpoint">${escapeHtml(log.resourceId || log.details?.path || '--')}</td>
                        <td>${escapeHtml(truncate(log.actorDid || log.actorId || log.actor || '--', 20))}</td>
                        <td>${log.success ? '<span class="event-type success">Success</span>' : '<span class="event-type failure">Failed</span>'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    elements.auditLogs.innerHTML = html;
}

/**
 * Format uptime in a human-readable format
 */
function formatUptime(seconds) {
    if (!seconds && seconds !== 0) return '--';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
}

/**
 * Format a date for display
 */
function formatDate(date) {
    if (!date || isNaN(date.getTime())) return '--';

    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(date);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Truncate a string to a maximum length
 */
function truncate(str, maxLength) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
