/**
 * k6 Scaling Test — 10K+ Concurrent Agents
 *
 * Progressive ramp-up from 0 → 10,000 VUs with bottleneck markers.
 * Measures p95/p99 latency degradation at each concurrency tier.
 *
 * Prerequisites:
 *   - Backend deployed with production config (connection pools, rate limits adjusted)
 *   - Prometheus scraping enabled for bottleneck correlation
 *
 * Usage:
 *   k6 run -e K6_PROFILE=scale_10k backend/k6/scaling-10k.js
 *   k6 run -e K6_PROFILE=scale_1k backend/k6/scaling-10k.js   # smaller test
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { API, BASE_URL, authHeaders, getStages, HOLDER_DID } from './config.js';

// Custom metrics for bottleneck analysis
const scalingErrors = new Rate('scaling_errors');
const issuanceDuration = new Trend('scaling_issuance_duration', true);
const verificationDuration = new Trend('scaling_verification_duration', true);
const healthDuration = new Trend('scaling_health_duration', true);
const totalOps = new Counter('scaling_total_operations');
const activeVUs = new Gauge('scaling_active_vus');

// Scaling-specific thresholds
export const options = {
  stages: getStages(),
  thresholds: {
    http_req_duration: [
      'p(95)<2000', // p95 < 2s at any scale
      'p(99)<5000', // p99 < 5s (min acceptance for 10K)
    ],
    scaling_errors: ['rate<0.10'], // Allow up to 10% under extreme load
    scaling_issuance_duration: ['p(99)<5000'],
    scaling_verification_duration: ['p(99)<5000'],
  },
  // Increase batch size for high VU counts
  batch: 20,
  batchPerHost: 10,
};

export default function () {
  const headers = authHeaders();
  activeVUs.add(__VU);

  const roll = Math.random();

  if (roll < 0.5) {
    // 50% — Credential Issuance (heaviest operation)
    group('Scale: Issuance', () => {
      const start = Date.now();

      const offerRes = http.post(
        `${API}/issuer/credentials/agent-identity`,
        JSON.stringify({
          holderDid: HOLDER_DID,
          agentType: 'autonomous',
          agentName: `k6-scale-${__VU}-${__ITER}`,
          ownerDid: HOLDER_DID,
        }),
        { headers, timeout: '30s' },
      );

      const ok = check(offerRes, {
        'issuance ok': (r) => r.status === 200 || r.status === 201,
        'not rate limited': (r) => r.status !== 429,
      });

      if (!ok) {
        scalingErrors.add(1);
        if (offerRes.status === 429) {
          // Back off on rate limit
          sleep(2 + Math.random() * 3);
        }
      } else {
        scalingErrors.add(0);
      }

      issuanceDuration.add(Date.now() - start);
      totalOps.add(1);
    });
  } else if (roll < 0.85) {
    // 35% — Verification Request
    group('Scale: Verification', () => {
      const start = Date.now();

      const verifyRes = http.post(
        `${API}/verifier/verify/agent-identity`,
        JSON.stringify({}),
        { headers, timeout: '30s' },
      );

      const ok = check(verifyRes, {
        'verification ok': (r) => r.status === 200 || r.status === 201,
        'not rate limited': (r) => r.status !== 429,
      });

      if (!ok) {
        scalingErrors.add(1);
        if (verifyRes.status === 429) {
          sleep(2 + Math.random() * 3);
        }
      } else {
        scalingErrors.add(0);

        // Poll session
        try {
          const sessionId = JSON.parse(verifyRes.body).sessionId;
          if (sessionId) {
            http.get(`${API}/verifier/verify/${sessionId}/result`, { headers, timeout: '10s' });
          }
        } catch {
          // Best effort
        }
      }

      verificationDuration.add(Date.now() - start);
      totalOps.add(1);
    });
  } else {
    // 15% — Health + DID resolve (lightweight ops)
    group('Scale: Health', () => {
      const start = Date.now();

      const healthRes = http.get(`${BASE_URL}/health`, { timeout: '10s' });
      check(healthRes, { 'health ok': (r) => r.status === 200 });

      const didRes = http.get(`${API}/issuer/did`, { headers, timeout: '10s' });
      check(didRes, { 'DID ok': (r) => r.status === 200 });

      healthDuration.add(Date.now() - start);
      totalOps.add(1);
    });
  }

  // Variable sleep to simulate realistic inter-request delays
  sleep(0.1 + Math.random() * 0.9);
}

export function handleSummary(data) {
  // Log scaling tier analysis
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] || 'N/A';
  const p99 = data.metrics.http_req_duration?.values?.['p(99)'] || 'N/A';
  const totalReqs = data.metrics.http_reqs?.values?.count || 0;
  const errRate = data.metrics.scaling_errors?.values?.rate || 0;

  console.log('\n=== 10K Scaling Test Summary ===');
  console.log(`Total requests: ${totalReqs}`);
  console.log(`p95 latency: ${p95}ms`);
  console.log(`p99 latency: ${p99}ms`);
  console.log(`Error rate: ${(errRate * 100).toFixed(2)}%`);
  console.log('================================\n');

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
