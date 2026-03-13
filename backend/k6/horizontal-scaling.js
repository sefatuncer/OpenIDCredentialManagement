/**
 * k6 Horizontal Scaling Test
 *
 * Parameterized test for measuring throughput scaling across pod counts.
 * Run this test once per pod configuration (1, 2, 4, 8 pods), then
 * compare the results to verify linear throughput scaling.
 *
 * Usage:
 *   # Run with 1 pod, then 2, then 4, then 8
 *   k6 run -e PODS=1 -e K6_PROFILE=load backend/k6/horizontal-scaling.js
 *   k6 run -e PODS=2 -e K6_PROFILE=load backend/k6/horizontal-scaling.js
 *   k6 run -e PODS=4 -e K6_PROFILE=stress backend/k6/horizontal-scaling.js
 *   k6 run -e PODS=8 -e K6_PROFILE=stress backend/k6/horizontal-scaling.js
 *
 * Each run saves results with pod count tag for comparison.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { API, BASE_URL, authHeaders, getStages, HOLDER_DID } from './config.js';

const PODS = parseInt(__ENV.PODS || '1', 10);

// Pod-count tagged metrics
const throughput = new Counter('scaling_throughput');
const latency = new Trend('scaling_latency', true);
const errors = new Rate('scaling_error_rate');

export const options = {
  stages: getStages(),
  thresholds: {
    scaling_latency: ['p(95)<2000', 'p(99)<5000'],
    scaling_error_rate: ['rate<0.05'],
  },
  tags: {
    pod_count: String(PODS),
  },
};

export default function () {
  const headers = authHeaders();
  const roll = Math.random();

  if (roll < 0.4) {
    // 40% — Credential issuance
    group(`Pods=${PODS}: Issuance`, () => {
      const res = http.post(
        `${API}/issuer/credentials/agent-identity`,
        JSON.stringify({
          holderDid: HOLDER_DID,
          agentType: 'autonomous',
          agentName: `k6-hscale-${PODS}p-${__VU}-${__ITER}`,
          ownerDid: HOLDER_DID,
        }),
        { headers, timeout: '30s', tags: { operation: 'issuance', pod_count: String(PODS) } },
      );

      latency.add(res.timings.duration);
      throughput.add(1);

      const ok = check(res, {
        'issuance ok': (r) => r.status === 200 || r.status === 201,
      });
      errors.add(!ok ? 1 : 0);
    });
  } else if (roll < 0.7) {
    // 30% — Verification
    group(`Pods=${PODS}: Verification`, () => {
      const res = http.post(
        `${API}/verifier/verify/agent-identity`,
        JSON.stringify({}),
        { headers, timeout: '30s', tags: { operation: 'verification', pod_count: String(PODS) } },
      );

      latency.add(res.timings.duration);
      throughput.add(1);

      const ok = check(res, {
        'verification ok': (r) => r.status === 200 || r.status === 201,
      });
      errors.add(!ok ? 1 : 0);
    });
  } else if (roll < 0.9) {
    // 20% — DID resolution
    group(`Pods=${PODS}: DID Resolve`, () => {
      const res = http.get(`${API}/issuer/did`, {
        headers,
        timeout: '10s',
        tags: { operation: 'did_resolve', pod_count: String(PODS) },
      });

      latency.add(res.timings.duration);
      throughput.add(1);

      const ok = check(res, { 'DID ok': (r) => r.status === 200 });
      errors.add(!ok ? 1 : 0);
    });
  } else {
    // 10% — Health check
    group(`Pods=${PODS}: Health`, () => {
      const res = http.get(`${BASE_URL}/health`, {
        timeout: '10s',
        tags: { operation: 'health', pod_count: String(PODS) },
      });

      latency.add(res.timings.duration);
      throughput.add(1);

      const ok = check(res, { 'health ok': (r) => r.status === 200 });
      errors.add(!ok ? 1 : 0);
    });
  }

  sleep(0.2 + Math.random() * 0.8);
}

export function handleSummary(data) {
  const p95 = data.metrics.scaling_latency?.values?.['p(95)'] || 0;
  const p99 = data.metrics.scaling_latency?.values?.['p(99)'] || 0;
  const total = data.metrics.scaling_throughput?.values?.count || 0;
  const errRate = data.metrics.scaling_error_rate?.values?.rate || 0;
  const duration = data.state?.testRunDurationMs || 0;
  const rps = duration > 0 ? ((total / duration) * 1000).toFixed(1) : 'N/A';

  console.log(`\n=== Horizontal Scaling: ${PODS} Pod(s) ===`);
  console.log(`Throughput: ${total} requests (${rps} RPS)`);
  console.log(`p95 latency: ${p95.toFixed(0)}ms`);
  console.log(`p99 latency: ${p99.toFixed(0)}ms`);
  console.log(`Error rate: ${(errRate * 100).toFixed(2)}%`);
  console.log(`Expected linear scaling: ~${rps} RPS per pod`);
  console.log('==========================================\n');

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
