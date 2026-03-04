#!/usr/bin/env node

/**
 * AI Agent Identity System - Demo Script
 *
 * This script demonstrates the full credential issuance and verification flow.
 * Run with: node scripts/demo.js
 *
 * Prerequisites:
 * - Server running on http://localhost:3000
 * - API key configured (uses dev-api-key-12345 by default)
 */

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'dev-api-key-12345';

// Console colors for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
};

// Helper functions for colored output
function printHeader(text) {
  console.log('\n' + colors.bgBlue + colors.white + colors.bright + ` ${text} ` + colors.reset);
  console.log(colors.dim + '─'.repeat(60) + colors.reset);
}

function printSuccess(text) {
  console.log(colors.green + '✓ ' + colors.reset + text);
}

function printError(text) {
  console.log(colors.red + '✗ ' + colors.reset + text);
}

function printInfo(text) {
  console.log(colors.cyan + '→ ' + colors.reset + text);
}

function printJson(obj) {
  console.log(colors.dim + JSON.stringify(obj, null, 2) + colors.reset);
}

function printStep(num, text) {
  console.log('\n' + colors.yellow + colors.bright + `Step ${num}: ` + colors.reset + colors.white + text + colors.reset);
}

// API helper function
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${endpoint}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

// Main demo function
async function runDemo() {
  console.log('\n' + colors.bgGreen + colors.white + colors.bright + ' AI Agent Identity System - Demo ' + colors.reset);
  console.log(colors.dim + `API URL: ${API_URL}` + colors.reset);
  console.log(colors.dim + `API Key: ${API_KEY.substring(0, 8)}...` + colors.reset);
  console.log(colors.dim + '═'.repeat(60) + colors.reset);

  try {
    // Step 1: Check system health
    printStep(1, 'Checking system health');
    printInfo('Calling GET /health...');

    const healthResponse = await fetch(`${API_URL}/health`);
    const health = await healthResponse.json();

    if (health.status === 'healthy' || healthResponse.ok) {
      printSuccess('System is healthy');
      printJson(health);
    } else {
      printError('System health check failed');
      printJson(health);
      return;
    }

    // Step 2: Get issuer DID
    printStep(2, 'Getting issuer DID');
    printInfo('Calling GET /api/v1/issuer/did...');

    const issuerData = await apiCall('/api/v1/issuer/did');
    printSuccess('Retrieved issuer DID');
    printJson(issuerData);

    const issuerDid = issuerData.did || issuerData.issuerDid;
    printInfo(`Issuer DID: ${colors.cyan}${issuerDid}${colors.reset}`);

    // Step 3: Create a credential offer
    printStep(3, 'Creating credential offer');
    printInfo('Calling POST /credential-offer (OpenID4VCI)...');

    // OpenID4VCI standard credential offer request
    const credentialData = {
      credentialTypes: ['AIAgentIdentityCredential'],
      userPinRequired: false,
      expiresInSeconds: 300,
    };

    printInfo('Credential offer request:');
    printJson(credentialData);

    const offerResponse = await apiCall('/credential-offer', 'POST', credentialData);
    printSuccess('Credential offer created');
    printJson(offerResponse);

    // Step 4: Display the offer URI
    printStep(4, 'Displaying offer URI');

    const offerUri = offerResponse.credentialOfferUri || offerResponse.offerUri || offerResponse.uri;
    if (offerUri) {
      printSuccess('Credential Offer URI generated:');
      console.log('\n' + colors.bgBlue + colors.white + ' OFFER URI ' + colors.reset);
      console.log(colors.cyan + offerUri + colors.reset);
      console.log();
      printInfo('This URI can be used by a wallet to claim the credential');
    } else {
      printInfo('Offer details:');
      printJson(offerResponse);
    }

    // Step 5: Mock verification
    printStep(5, 'Demonstrating credential verification (mock)');
    printInfo('In a real scenario, verification would:');
    console.log(colors.dim + '  1. Receive a verifiable presentation from the holder' + colors.reset);
    console.log(colors.dim + '  2. Verify the credential signature against the issuer DID' + colors.reset);
    console.log(colors.dim + '  3. Check credential expiration and revocation status' + colors.reset);
    console.log(colors.dim + '  4. Validate the credential schema and claims' + colors.reset);

    // Try to call verify endpoint if available
    try {
      printInfo('Attempting to call verification endpoint...');

      // Create an authorization request for credential verification
      const verifyRequest = {
        presentationDefinitionId: 'agent-identity',
        expiresInSeconds: 300,
      };

      const verifyResponse = await apiCall('/api/v1/openid4vp/authorization-request', 'POST', verifyRequest);
      printSuccess('Verification authorization request created');
      printJson(verifyResponse);

      if (verifyResponse.authorizationRequestUri) {
        printInfo(`Authorization Request URI: ${colors.cyan}${verifyResponse.authorizationRequestUri}${colors.reset}`);
        printInfo('A wallet would use this URI to submit a verifiable presentation');
      }
    } catch (verifyError) {
      printInfo(`Verification endpoint note: ${verifyError.message}`);
      printInfo('This is expected if the verifier agent is not fully configured');
    }

    // Summary
    printHeader('Demo Complete');
    printSuccess('All demo steps executed successfully');
    console.log();
    printInfo('Summary:');
    console.log(colors.dim + `  - Health check: ${colors.green}PASSED${colors.dim}` + colors.reset);
    console.log(colors.dim + `  - Issuer DID: ${colors.green}RETRIEVED${colors.dim}` + colors.reset);
    console.log(colors.dim + `  - Credential offer: ${colors.green}CREATED${colors.dim}` + colors.reset);
    console.log(colors.dim + `  - Verification: ${colors.yellow}DEMONSTRATED${colors.dim}` + colors.reset);
    console.log();

  } catch (error) {
    printError(`Demo failed: ${error.message}`);
    console.log(colors.dim + error.stack + colors.reset);

    printInfo('Troubleshooting tips:');
    console.log(colors.dim + '  1. Ensure the server is running: npm start' + colors.reset);
    console.log(colors.dim + '  2. Check API URL is correct: ' + API_URL + colors.reset);
    console.log(colors.dim + '  3. Verify API key is valid' + colors.reset);
    console.log(colors.dim + '  4. Check server logs for detailed errors' + colors.reset);

    process.exit(1);
  }
}

// Run the demo
console.log(colors.bright + '\nStarting AI Agent Identity Demo...' + colors.reset);
runDemo().then(() => {
  console.log(colors.dim + '\nDemo finished.' + colors.reset + '\n');
}).catch((error) => {
  console.error(colors.red + 'Unexpected error:', error + colors.reset);
  process.exit(1);
});
