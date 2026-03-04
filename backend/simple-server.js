/**
 * Simplified Backend Server for Benchmarking
 * OpenID4VCI/VP endpoint'lerini simüle eder
 */

const http = require('http');
const crypto = require('crypto');

const PORT = process.env.API_PORT || 3000;

// In-memory storage
const credentialOffers = new Map();
const accessTokens = new Map();
const verificationSessions = new Map();

// UUID generator
const uuid = () => crypto.randomUUID();

// Parse JSON body
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// Route handlers
const routes = {
  // Health check
  'GET /health': (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  },

  // OpenID4VCI - Create credential offer
  'POST /api/openid4vci/credential-offer': async (req, res) => {
    const body = await parseBody(req);
    const offerId = uuid();
    const preAuthorizedCode = uuid();

    const offer = {
      credential_issuer: `http://localhost:${PORT}`,
      credentials: body.credentialTypes || ['AIAgentIdentityCredential'],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': preAuthorizedCode,
          user_pin_required: false,
        },
      },
    };

    credentialOffers.set(preAuthorizedCode, {
      offer,
      offerId,
      createdAt: new Date(),
      claimed: false,
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      offerId,
      credentialOffer: offer,
      credentialOfferUri: `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`,
    }));
  },

  // OpenID4VCI - Token endpoint
  'POST /api/openid4vci/token': async (req, res) => {
    const body = await parseBody(req);
    const preAuthorizedCode = body['pre-authorized_code'];

    if (!preAuthorizedCode) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_request' }));
    }

    const storedOffer = credentialOffers.get(preAuthorizedCode);
    if (!storedOffer) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_grant' }));
    }

    const accessToken = `at_${uuid()}`;
    accessTokens.set(accessToken, {
      offerId: storedOffer.offerId,
      preAuthorizedCode,
      issuedAt: new Date(),
    });

    storedOffer.claimed = true;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      c_nonce: uuid(),
      c_nonce_expires_in: 86400,
    }));
  },

  // OpenID4VCI - Credential endpoint
  'POST /api/openid4vci/credential': async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_token' }));
    }

    const accessToken = authHeader.substring(7);
    const tokenData = accessTokens.get(accessToken);

    if (!tokenData) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_token' }));
    }

    const body = await parseBody(req);

    // Create a simple JWT-like credential
    const now = Math.floor(Date.now() / 1000);
    const credentialPayload = {
      iss: `did:key:issuer-${uuid().substring(0, 8)}`,
      sub: `did:key:holder-${uuid().substring(0, 8)}`,
      iat: now,
      exp: now + 365 * 24 * 60 * 60,
      jti: `urn:uuid:${uuid()}`,
      vc: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: body.credential_definition?.type || ['VerifiableCredential', 'AIAgentIdentityCredential'],
        credentialSubject: {
          agent_id: `agent-${uuid().substring(0, 8)}`,
          agent_type: 'autonomous',
          agent_name: 'Test Agent',
        },
      },
    };

    // Simple base64 encoding as "JWT"
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(credentialPayload)).toString('base64url');
    const credential = `${header}.${payload}.`;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      format: body.format || 'jwt_vc_json',
      credential,
      c_nonce: uuid(),
      c_nonce_expires_in: 86400,
    }));
  },

  // OpenID4VP - Create authorization request
  'POST /api/openid4vp/authorization-request': async (req, res) => {
    const body = await parseBody(req);
    const sessionId = uuid();
    const nonce = uuid();
    const state = uuid();

    const session = {
      id: sessionId,
      presentationDefinitionId: body.presentationDefinitionId || 'agent-identity',
      nonce,
      state,
      createdAt: new Date(),
      status: 'pending',
    };

    verificationSessions.set(sessionId, session);

    const authorizationRequest = {
      response_type: 'vp_token',
      response_mode: 'direct_post',
      client_id: `did:key:verifier-${uuid().substring(0, 8)}`,
      response_uri: `http://localhost:${PORT}/api/openid4vp/direct_post`,
      nonce,
      state,
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      sessionId,
      authorizationRequest,
      authorizationRequestUri: `openid4vp://?${new URLSearchParams(authorizationRequest).toString()}`,
    }));
  },

  // OpenID4VP - Get session
  'GET /api/openid4vp/sessions': (req, res) => {
    const sessions = Array.from(verificationSessions.values()).map(s => ({
      sessionId: s.id,
      status: s.status,
      createdAt: s.createdAt,
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessions }));
  },
};

// Request handler
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const routeKey = `${req.method} ${req.url?.split('?')[0]}`;
  const handler = routes[routeKey];

  if (handler) {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: req.url }));
  }
});

server.listen(PORT, () => {
  console.log(`Simple benchmark server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET  /health');
  console.log('  POST /api/openid4vci/credential-offer');
  console.log('  POST /api/openid4vci/token');
  console.log('  POST /api/openid4vci/credential');
  console.log('  POST /api/openid4vp/authorization-request');
  console.log('  GET  /api/openid4vp/sessions');
});
