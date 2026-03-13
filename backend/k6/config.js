/**
 * k6 Shared Configuration
 *
 * Base URL, auth helpers, and performance thresholds.
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const API = `${BASE_URL}/api/v1`;
export const API_KEY = __ENV.API_KEY || 'test-api-key-12345';

/** Standard auth headers for API key authentication */
export function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  };
}

/** Performance thresholds aligned with project targets */
export const standardThresholds = {
  http_req_duration: [
    'p(95)<2000', // p95 < 2s (minimum acceptance)
    'p(99)<5000', // p99 < 5s
  ],
  http_req_failed: ['rate<0.05'], // <5% error rate
};

/** Stricter thresholds for single-agent scenarios */
export const singleAgentThresholds = {
  http_req_duration: [
    'p(95)<1000', // p95 < 1s (target)
    'p(99)<2000', // p99 < 2s
  ],
  http_req_failed: ['rate<0.01'], // <1% error rate
};

/** Test DID for holder */
export const HOLDER_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

/** Stage profiles */
export const stages = {
  smoke: [{ duration: '30s', target: 1 }],
  load: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  stress: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  soak: [
    { duration: '1m', target: 20 },
    { duration: '10m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  // Scaling profiles for 10K+ agent tests
  scale_1k: [
    { duration: '1m', target: 100 },
    { duration: '2m', target: 500 },
    { duration: '2m', target: 1000 },
    { duration: '2m', target: 1000 },
    { duration: '1m', target: 0 },
  ],
  scale_5k: [
    { duration: '1m', target: 500 },
    { duration: '2m', target: 2000 },
    { duration: '2m', target: 5000 },
    { duration: '3m', target: 5000 },
    { duration: '1m', target: 0 },
  ],
  scale_10k: [
    { duration: '1m', target: 500 },
    { duration: '2m', target: 2000 },
    { duration: '2m', target: 5000 },
    { duration: '2m', target: 10000 },
    { duration: '3m', target: 10000 },
    { duration: '1m', target: 0 },
  ],
};

/**
 * Select stage profile from K6_PROFILE env var.
 * Usage: k6 run -e K6_PROFILE=stress issuance.js
 */
export function getStages() {
  const profile = __ENV.K6_PROFILE || 'load';
  return stages[profile] || stages.load;
}
