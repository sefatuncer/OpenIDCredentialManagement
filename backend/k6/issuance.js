/**
 * k6 Load Test — Credential Issuance Flow
 *
 * Tests the full OpenID4VCI flow:
 *   1. GET /issuer/did (resolve issuer identity)
 *   2. POST /issuer/credentials/agent-identity (create offer)
 *   3. POST /issuer/token (exchange pre-auth code)
 *   4. POST /issuer/credential (claim credential)
 *
 * Usage:
 *   k6 run backend/k6/issuance.js
 *   k6 run -e K6_PROFILE=stress -e BASE_URL=http://staging:3000 backend/k6/issuance.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { API, authHeaders, standardThresholds, getStages, HOLDER_DID } from './config.js';

// Custom metrics
const issuanceErrors = new Rate('issuance_errors');
const offerDuration = new Trend('offer_creation_duration', true);
const tokenDuration = new Trend('token_exchange_duration', true);
const credentialDuration = new Trend('credential_claim_duration', true);

export const options = {
  stages: getStages(),
  thresholds: {
    ...standardThresholds,
    issuance_errors: ['rate<0.05'],
  },
};

export default function () {
  const headers = authHeaders();

  group('Credential Issuance Flow', () => {
    // Step 1: Resolve issuer DID
    const didRes = http.get(`${API}/issuer/did`, { headers });
    check(didRes, {
      'issuer DID returned': (r) => r.status === 200,
      'DID format valid': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.did && body.did.startsWith('did:');
        } catch {
          return false;
        }
      },
    });

    // Step 2: Create credential offer
    const offerPayload = JSON.stringify({
      holderDid: HOLDER_DID,
      agentType: 'autonomous',
      agentName: `k6-agent-${__VU}-${__ITER}`,
      ownerDid: HOLDER_DID,
    });

    const offerRes = http.post(`${API}/issuer/credentials/agent-identity`, offerPayload, { headers });
    offerDuration.add(offerRes.timings.duration);

    const offerOk = check(offerRes, {
      'offer created': (r) => r.status === 200 || r.status === 201,
      'offer has URI': (r) => {
        try {
          const body = JSON.parse(r.body);
          return !!body.credentialOfferUri || !!body.credential_offer_uri;
        } catch {
          return false;
        }
      },
    });

    if (!offerOk) {
      issuanceErrors.add(1);
      return;
    }

    let offerBody;
    try {
      offerBody = JSON.parse(offerRes.body);
    } catch {
      issuanceErrors.add(1);
      return;
    }

    // Step 3: Token exchange (if pre-authorized code available)
    const preAuthCode =
      offerBody['pre-authorized_code'] ||
      offerBody.preAuthorizedCode ||
      (offerBody.grants &&
        offerBody.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'] &&
        offerBody.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'][
          'pre-authorized_code'
        ]);

    if (preAuthCode) {
      const tokenPayload = JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': preAuthCode,
      });

      const tokenRes = http.post(`${API}/issuer/token`, tokenPayload, { headers });
      tokenDuration.add(tokenRes.timings.duration);

      const tokenOk = check(tokenRes, {
        'token obtained': (r) => r.status === 200,
      });

      if (tokenOk) {
        let tokenBody;
        try {
          tokenBody = JSON.parse(tokenRes.body);
        } catch {
          issuanceErrors.add(1);
          return;
        }

        // Step 4: Claim credential
        const credPayload = JSON.stringify({
          format: 'jwt_vc_json',
          credential_identifier: 'AIAgentIdentityCredential',
        });

        const credHeaders = {
          ...headers,
          Authorization: `Bearer ${tokenBody.access_token}`,
        };

        const credRes = http.post(`${API}/issuer/credential`, credPayload, {
          headers: credHeaders,
        });
        credentialDuration.add(credRes.timings.duration);

        check(credRes, {
          'credential issued': (r) => r.status === 200 || r.status === 201,
        });
      }
    }

    issuanceErrors.add(0);
  });

  sleep(1);
}
