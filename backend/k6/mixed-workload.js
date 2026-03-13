/**
 * k6 Load Test — Mixed Workload
 *
 * Simulates realistic production traffic:
 *   60% credential issuance
 *   30% verification requests
 *   10% health/metrics checks
 *
 * Usage:
 *   k6 run backend/k6/mixed-workload.js
 *   k6 run -e K6_PROFILE=soak backend/k6/mixed-workload.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { API, BASE_URL, authHeaders, standardThresholds, getStages, HOLDER_DID } from './config.js';

// Custom metrics
const mixedErrors = new Rate('mixed_errors');
const issuanceOps = new Counter('issuance_operations');
const verificationOps = new Counter('verification_operations');
const healthOps = new Counter('health_operations');
const issuanceDuration = new Trend('issuance_e2e_duration', true);
const verificationDuration = new Trend('verification_e2e_duration', true);

export const options = {
  stages: getStages(),
  thresholds: {
    ...standardThresholds,
    mixed_errors: ['rate<0.05'],
  },
};

export default function () {
  const headers = authHeaders();
  const roll = Math.random();

  if (roll < 0.6) {
    // 60% — Credential Issuance
    group('Mixed: Issuance', () => {
      const start = Date.now();

      const offerRes = http.post(
        `${API}/issuer/credentials/agent-identity`,
        JSON.stringify({
          holderDid: HOLDER_DID,
          agentType: 'autonomous',
          agentName: `k6-mixed-${__VU}-${__ITER}`,
          ownerDid: HOLDER_DID,
        }),
        { headers },
      );

      const ok = check(offerRes, {
        'issuance offer created': (r) => r.status === 200 || r.status === 201,
      });

      if (!ok) {
        mixedErrors.add(1);
      } else {
        mixedErrors.add(0);

        // If offer has pre-auth code, exchange for token
        try {
          const body = JSON.parse(offerRes.body);
          const preAuthCode =
            body['pre-authorized_code'] ||
            body.preAuthorizedCode ||
            (body.grants &&
              body.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'] &&
              body.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'][
                'pre-authorized_code'
              ]);

          if (preAuthCode) {
            const tokenRes = http.post(
              `${API}/issuer/token`,
              JSON.stringify({
                grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
                'pre-authorized_code': preAuthCode,
              }),
              { headers },
            );

            check(tokenRes, {
              'token exchange succeeded': (r) => r.status === 200,
            });
          }
        } catch {
          // Token exchange is best-effort in mixed test
        }
      }

      issuanceDuration.add(Date.now() - start);
      issuanceOps.add(1);
    });
  } else if (roll < 0.9) {
    // 30% — Verification
    group('Mixed: Verification', () => {
      const start = Date.now();

      const verifyRes = http.post(
        `${API}/verifier/verify/agent-identity`,
        JSON.stringify({}),
        { headers },
      );

      const ok = check(verifyRes, {
        'verification request created': (r) => r.status === 200 || r.status === 201,
      });

      if (!ok) {
        mixedErrors.add(1);
      } else {
        mixedErrors.add(0);

        // Poll session result
        try {
          const sessionId = JSON.parse(verifyRes.body).sessionId;
          if (sessionId) {
            const resultRes = http.get(`${API}/verifier/verify/${sessionId}/result`, { headers });
            check(resultRes, {
              'session poll ok': (r) => r.status === 200,
            });
          }
        } catch {
          // Session poll is best-effort
        }
      }

      verificationDuration.add(Date.now() - start);
      verificationOps.add(1);
    });
  } else {
    // 10% — Health & Metrics
    group('Mixed: Health', () => {
      const healthRes = http.get(`${BASE_URL}/health`);
      check(healthRes, {
        'health check ok': (r) => r.status === 200,
      });

      const metricsRes = http.get(`${BASE_URL}/metrics`);
      check(metricsRes, {
        'metrics endpoint ok': (r) => r.status === 200,
      });

      healthOps.add(1);
    });
  }

  sleep(0.5 + Math.random());
}
