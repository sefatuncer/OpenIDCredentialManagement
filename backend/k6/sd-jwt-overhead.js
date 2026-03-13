/**
 * k6 Load Test — SD-JWT Disclosure Overhead
 *
 * Compares latency between:
 *   - jwt_vc_json format (standard JWT VC)
 *   - vc+sd-jwt format (selective disclosure)
 *
 * Measures the overhead of SD-JWT processing (hashing, salt generation,
 * disclosure array construction) relative to plain JWT.
 *
 * Target: SD-JWT overhead < 20% (min accept), < 15% (target)
 *
 * Usage:
 *   k6 run backend/k6/sd-jwt-overhead.js
 *   k6 run -e K6_PROFILE=load backend/k6/sd-jwt-overhead.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { API, authHeaders, getStages, HOLDER_DID } from './config.js';

// Separate metrics for each format
const jwtDuration = new Trend('jwt_vc_issuance_duration', true);
const sdJwtDuration = new Trend('sdjwt_vc_issuance_duration', true);
const jwtOps = new Counter('jwt_vc_operations');
const sdJwtOps = new Counter('sdjwt_vc_operations');

export const options = {
  stages: getStages(),
  thresholds: {
    jwt_vc_issuance_duration: ['p(95)<2000'],
    sdjwt_vc_issuance_duration: ['p(95)<2400'], // Allow up to 20% overhead
  },
};

export default function () {
  const headers = authHeaders();
  const iteration = __ITER;

  // Alternate between JWT and SD-JWT to get fair comparison
  if (iteration % 2 === 0) {
    group('JWT VC Issuance', () => {
      const start = Date.now();

      const res = http.post(
        `${API}/issuer/credentials/agent-identity`,
        JSON.stringify({
          holderDid: HOLDER_DID,
          agentType: 'autonomous',
          agentName: `k6-jwt-${__VU}-${iteration}`,
          ownerDid: HOLDER_DID,
          format: 'jwt_vc_json',
        }),
        { headers },
      );

      const elapsed = Date.now() - start;
      jwtDuration.add(elapsed);
      jwtOps.add(1);

      check(res, {
        'JWT VC issued': (r) => r.status === 200 || r.status === 201,
      });
    });
  } else {
    group('SD-JWT VC Issuance', () => {
      const start = Date.now();

      const res = http.post(
        `${API}/issuer/credentials/agent-identity`,
        JSON.stringify({
          holderDid: HOLDER_DID,
          agentType: 'autonomous',
          agentName: `k6-sdjwt-${__VU}-${iteration}`,
          ownerDid: HOLDER_DID,
          format: 'vc+sd-jwt',
        }),
        { headers },
      );

      const elapsed = Date.now() - start;
      sdJwtDuration.add(elapsed);
      sdJwtOps.add(1);

      check(res, {
        'SD-JWT VC issued': (r) => r.status === 200 || r.status === 201,
      });
    });
  }

  sleep(0.5);
}

export function handleSummary(data) {
  const jwtP95 = data.metrics.jwt_vc_issuance_duration?.values?.['p(95)'] || 0;
  const sdJwtP95 = data.metrics.sdjwt_vc_issuance_duration?.values?.['p(95)'] || 0;
  const jwtMed = data.metrics.jwt_vc_issuance_duration?.values?.med || 0;
  const sdJwtMed = data.metrics.sdjwt_vc_issuance_duration?.values?.med || 0;

  const overheadP95 = jwtP95 > 0 ? (((sdJwtP95 - jwtP95) / jwtP95) * 100).toFixed(1) : 'N/A';
  const overheadMed = jwtMed > 0 ? (((sdJwtMed - jwtMed) / jwtMed) * 100).toFixed(1) : 'N/A';

  console.log('\n=== SD-JWT Overhead Analysis ===');
  console.log(`JWT VC    — median: ${jwtMed.toFixed(0)}ms, p95: ${jwtP95.toFixed(0)}ms`);
  console.log(`SD-JWT VC — median: ${sdJwtMed.toFixed(0)}ms, p95: ${sdJwtP95.toFixed(0)}ms`);
  console.log(`Overhead  — median: ${overheadMed}%, p95: ${overheadP95}%`);
  console.log(`Target: < 15% (accept: < 20%)`);
  console.log('================================\n');

  return {
    stdout: JSON.stringify(data, null, 2),
  };
}
