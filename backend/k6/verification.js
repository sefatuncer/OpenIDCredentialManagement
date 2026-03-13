/**
 * k6 Load Test — Credential Verification Flow
 *
 * Tests the OpenID4VP flow:
 *   1. POST /verifier/verify/agent-identity (create verification request)
 *   2. GET /verifier/verify/:sessionId/result (poll for result)
 *
 * Note: Full VP submission requires a holder wallet. This test covers
 * the verifier-side request creation and session polling under load.
 *
 * Usage:
 *   k6 run backend/k6/verification.js
 *   k6 run -e K6_PROFILE=stress backend/k6/verification.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { API, authHeaders, standardThresholds, getStages } from './config.js';

// Custom metrics
const verificationErrors = new Rate('verification_errors');
const requestCreationDuration = new Trend('verification_request_duration', true);
const sessionPollDuration = new Trend('session_poll_duration', true);

export const options = {
  stages: getStages(),
  thresholds: {
    ...standardThresholds,
    verification_errors: ['rate<0.05'],
  },
};

export default function () {
  const headers = authHeaders();

  group('Verification Flow', () => {
    // Step 1: Get verifier DID
    const didRes = http.get(`${API}/verifier/did`, { headers });
    check(didRes, {
      'verifier DID returned': (r) => r.status === 200,
    });

    // Step 2: Create agent-identity verification request
    const verifyRes = http.post(
      `${API}/verifier/verify/agent-identity`,
      JSON.stringify({}),
      { headers },
    );
    requestCreationDuration.add(verifyRes.timings.duration);

    const verifyOk = check(verifyRes, {
      'verification request created': (r) => r.status === 200 || r.status === 201,
      'has session ID': (r) => {
        try {
          const body = JSON.parse(r.body);
          return !!body.sessionId;
        } catch {
          return false;
        }
      },
    });

    if (!verifyOk) {
      verificationErrors.add(1);
      return;
    }

    let sessionId;
    try {
      sessionId = JSON.parse(verifyRes.body).sessionId;
    } catch {
      verificationErrors.add(1);
      return;
    }

    // Step 3: Poll session result (verifier-side only, no holder submission)
    const resultRes = http.get(`${API}/verifier/verify/${sessionId}/result`, { headers });
    sessionPollDuration.add(resultRes.timings.duration);

    check(resultRes, {
      'session poll successful': (r) => r.status === 200,
      'session status returned': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status === 'pending' || body.status === 'completed' || body.status === 'expired';
        } catch {
          return false;
        }
      },
    });

    // Step 4: Create delegation verification request
    const delegRes = http.post(
      `${API}/verifier/verify/delegation`,
      JSON.stringify({}),
      { headers },
    );

    check(delegRes, {
      'delegation verification request created': (r) => r.status === 200 || r.status === 201,
    });

    // Step 5: Create combined verification request
    const combinedRes = http.post(
      `${API}/verifier/verify/combined`,
      JSON.stringify({}),
      { headers },
    );

    check(combinedRes, {
      'combined verification request created': (r) => r.status === 200 || r.status === 201,
    });

    verificationErrors.add(0);
  });

  sleep(1);
}
