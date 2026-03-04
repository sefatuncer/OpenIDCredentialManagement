#!/usr/bin/env node

/**
 * AI Agent Identity System - Comprehensive Test Script
 *
 * Tests all API endpoints and functionality
 * Run with: node scripts/test-all.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'dev-api-key-12345';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgBlue: '\x1b[44m',
  white: '\x1b[37m',
};

let passed = 0;
let failed = 0;
const results = [];

async function apiCall(endpoint, method = 'GET', body = null, auth = true) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (auth) {
    options.headers['x-api-key'] = API_KEY;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${endpoint}`, options);
  const data = await response.json().catch(() => null);

  return { status: response.status, data, ok: response.ok };
}

async function test(name, fn) {
  try {
    const result = await fn();
    if (result.success) {
      passed++;
      results.push({ name, status: 'PASS', details: result.details });
      console.log(`${colors.green}✓${colors.reset} ${name}`);
    } else {
      failed++;
      results.push({ name, status: 'FAIL', error: result.error });
      console.log(`${colors.red}✗${colors.reset} ${name}: ${result.error}`);
    }
  } catch (error) {
    failed++;
    results.push({ name, status: 'ERROR', error: error.message });
    console.log(`${colors.red}✗${colors.reset} ${name}: ${error.message}`);
  }
}

async function runTests() {
  console.log(`\n${colors.bgBlue}${colors.white}${colors.bright} AI Agent Identity System - Test Suite ${colors.reset}`);
  console.log(`${colors.dim}API URL: ${API_URL}${colors.reset}`);
  console.log(`${colors.dim}${'═'.repeat(60)}${colors.reset}\n`);

  // ============================================
  // Public Endpoints
  // ============================================
  console.log(`${colors.yellow}${colors.bright}Public Endpoints${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(40)}${colors.reset}`);

  await test('Health Check', async () => {
    const res = await apiCall('/health', 'GET', null, false);
    return {
      success: res.ok && res.data?.status === 'healthy',
      details: res.data,
      error: res.data?.error || `Status: ${res.status}`
    };
  });

  await test('Dashboard (GET /)', async () => {
    const response = await fetch(`${API_URL}/`);
    return {
      success: response.status === 200,
      details: { status: response.status },
      error: `Status: ${response.status}`
    };
  });

  await test('Swagger Docs (GET /api/v1/docs)', async () => {
    const response = await fetch(`${API_URL}/api/v1/docs/`);
    return {
      success: response.status === 200,
      details: { status: response.status },
      error: `Status: ${response.status}`
    };
  });

  await test('OpenID Issuer Metadata', async () => {
    const res = await apiCall('/.well-known/openid-credential-issuer', 'GET', null, false);
    return {
      success: res.ok && res.data?.credential_issuer,
      details: { issuer: res.data?.credential_issuer },
      error: res.data?.error || `Status: ${res.status}`
    };
  });

  await test('OAuth Server Metadata', async () => {
    const res = await apiCall('/.well-known/oauth-authorization-server', 'GET', null, false);
    return {
      success: res.ok && res.data?.issuer,
      details: { issuer: res.data?.issuer },
      error: res.data?.error || `Status: ${res.status}`
    };
  });

  // ============================================
  // Authentication Tests
  // ============================================
  console.log(`\n${colors.yellow}${colors.bright}Authentication Tests${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(40)}${colors.reset}`);

  await test('Reject request without API key', async () => {
    const res = await apiCall('/api/v1/issuer/did', 'GET', null, false);
    return {
      success: res.status === 401,
      details: { status: res.status },
      error: `Expected 401, got ${res.status}`
    };
  });

  await test('Accept request with valid API key', async () => {
    const res = await apiCall('/api/v1/issuer/did', 'GET', null, true);
    return {
      success: res.ok && res.data?.did,
      details: { did: res.data?.did },
      error: res.data?.error || `Status: ${res.status}`
    };
  });

  // ============================================
  // Issuer Endpoints
  // ============================================
  console.log(`\n${colors.yellow}${colors.bright}Issuer Endpoints${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(40)}${colors.reset}`);

  await test('Get Issuer DID', async () => {
    const res = await apiCall('/api/v1/issuer/did');
    return {
      success: res.ok && res.data?.did?.startsWith('did:'),
      details: { did: res.data?.did },
      error: res.data?.error || `Status: ${res.status}`
    };
  });

  // ============================================
  // OpenID4VCI (Credential Issuance)
  // ============================================
  console.log(`\n${colors.yellow}${colors.bright}OpenID4VCI (Credential Issuance)${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(40)}${colors.reset}`);

  await test('Create AIAgentIdentityCredential Offer', async () => {
    const res = await apiCall('/credential-offer', 'POST', {
      credentialTypes: ['AIAgentIdentityCredential']
    });
    return {
      success: res.ok && res.data?.offerId,
      details: { offerId: res.data?.offerId },
      error: res.data?.error || res.data?.error_description || `Status: ${res.status}`
    };
  });

  await test('Create DelegationCredential Offer', async () => {
    const res = await apiCall('/credential-offer', 'POST', {
      credentialTypes: ['DelegationCredential']
    });
    return {
      success: res.ok && res.data?.offerId,
      details: { offerId: res.data?.offerId },
      error: res.data?.error || res.data?.error_description || `Status: ${res.status}`
    };
  });

  await test('Create CapabilityCredential Offer', async () => {
    const res = await apiCall('/credential-offer', 'POST', {
      credentialTypes: ['CapabilityCredential']
    });
    return {
      success: res.ok && res.data?.offerId,
      details: { offerId: res.data?.offerId },
      error: res.data?.error || res.data?.error_description || `Status: ${res.status}`
    };
  });

  await test('List Credential Offers', async () => {
    const res = await apiCall('/credential-offers');
    return {
      success: res.ok && Array.isArray(res.data?.offers),
      details: { count: res.data?.offers?.length },
      error: res.data?.error || `Status: ${res.status}`
    };
  });

  await test('Reject empty credential types array', async () => {
    const res = await apiCall('/credential-offer', 'POST', {
      credentialTypes: []
    });
    return {
      success: res.status === 400,
      details: { status: res.status },
      error: `Expected 400, got ${res.status}`
    };
  });

  // ============================================
  // OpenID4VP (Verification)
  // ============================================
  console.log(`\n${colors.yellow}${colors.bright}OpenID4VP (Verification)${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(40)}${colors.reset}`);

  await test('List Presentation Definitions', async () => {
    const res = await apiCall('/api/v1/openid4vp/presentation-definitions');
    return {
      success: res.ok && Array.isArray(res.data?.definitions),
      details: { definitions: res.data?.definitions?.map(d => d.id) },
      error: res.data?.error || `Status: ${res.status}`
    };
  });

  await test('Create Agent Identity Verification Request', async () => {
    const res = await apiCall('/api/v1/openid4vp/authorization-request', 'POST', {
      presentationDefinitionId: 'agent-identity'
    });
    return {
      success: res.ok && res.data?.sessionId,
      details: { sessionId: res.data?.sessionId },
      error: res.data?.error || res.data?.error_description || `Status: ${res.status}`
    };
  });

  await test('Create Delegation Verification Request', async () => {
    const res = await apiCall('/api/v1/openid4vp/authorization-request', 'POST', {
      presentationDefinitionId: 'delegation'
    });
    return {
      success: res.ok && res.data?.sessionId,
      details: { sessionId: res.data?.sessionId },
      error: res.data?.error || res.data?.error_description || `Status: ${res.status}`
    };
  });

  await test('Create Capability Verification Request', async () => {
    const res = await apiCall('/api/v1/openid4vp/authorization-request', 'POST', {
      presentationDefinitionId: 'capability'
    });
    return {
      success: res.ok && res.data?.sessionId,
      details: { sessionId: res.data?.sessionId },
      error: res.data?.error || res.data?.error_description || `Status: ${res.status}`
    };
  });

  await test('List Verification Sessions', async () => {
    const res = await apiCall('/api/v1/openid4vp/sessions');
    return {
      success: res.ok && Array.isArray(res.data?.sessions),
      details: { count: res.data?.sessions?.length },
      error: res.data?.error || `Status: ${res.status}`
    };
  });

  // ============================================
  // Audit & Monitoring
  // ============================================
  console.log(`\n${colors.yellow}${colors.bright}Audit & Monitoring${colors.reset}`);
  console.log(`${colors.dim}${'─'.repeat(40)}${colors.reset}`);

  await test('Get Audit Logs', async () => {
    const res = await apiCall('/api/v1/audit/logs');
    return {
      success: res.ok && Array.isArray(res.data?.logs),
      details: { count: res.data?.logs?.length, total: res.data?.total },
      error: res.data?.error || `Status: ${res.status}`
    };
  });

  // ============================================
  // Summary
  // ============================================
  console.log(`\n${colors.dim}${'═'.repeat(60)}${colors.reset}`);

  const total = passed + failed;
  const passRate = ((passed / total) * 100).toFixed(1);

  if (failed === 0) {
    console.log(`${colors.bgGreen}${colors.white}${colors.bright} ALL TESTS PASSED ${colors.reset}`);
  } else {
    console.log(`${colors.bgRed}${colors.white}${colors.bright} SOME TESTS FAILED ${colors.reset}`);
  }

  console.log(`\n${colors.bright}Results:${colors.reset}`);
  console.log(`  ${colors.green}Passed:${colors.reset} ${passed}`);
  console.log(`  ${colors.red}Failed:${colors.reset} ${failed}`);
  console.log(`  ${colors.cyan}Total:${colors.reset}  ${total}`);
  console.log(`  ${colors.yellow}Pass Rate:${colors.reset} ${passRate}%`);
  console.log();

  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error(`${colors.red}Test suite error:${colors.reset}`, error);
  process.exit(1);
});
