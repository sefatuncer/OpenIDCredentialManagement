/**
 * Comprehensive OpenID4VC Performance Benchmark Suite
 * Extended metrics for academic paper
 */

const http = require('http');
const { performance } = require('perf_hooks');

const BASE_URL = 'http://localhost:3000';
const WARMUP_ITERATIONS = 10;
const BENCHMARK_ITERATIONS = 200;
const CONCURRENCY_LEVELS = [1, 5, 10, 20, 50, 100];

// Results storage
const results = {
  issuance: {
    singleClient: [],
    concurrency: {},
    credentialTypes: {},
  },
  verification: {
    singleClient: [],
    concurrency: {},
  },
  e2e: {
    flows: [],
  },
  metadata: {
    startTime: null,
    endTime: null,
    platform: process.platform,
    nodeVersion: process.version,
    iterations: BENCHMARK_ITERATIONS,
  },
};

// HTTP request helper
function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const endTime = performance.now();
        const latency = endTime - startTime;

        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(data),
            latency,
            headers: res.headers,
          });
        } catch {
          resolve({
            statusCode: res.statusCode,
            data: data,
            latency,
            headers: res.headers,
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Statistics calculation
function calculateStats(latencies) {
  if (latencies.length === 0) return null;

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;

  const squaredDiffs = sorted.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / sorted.length;
  const stdDev = Math.sqrt(variance);

  const percentile = (p) => {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  };

  return {
    count: sorted.length,
    mean: mean,
    median: percentile(50),
    stdDev: stdDev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: percentile(50),
    p75: percentile(75),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    throughput: 1000 / mean, // ops/sec
    cv: (stdDev / mean) * 100, // coefficient of variation %
  };
}

// Full credential issuance flow
async function measureIssuanceFlow(credentialType = 'AIAgentIdentityCredential') {
  const flowStart = performance.now();
  const timings = {};

  // Step 1: Create credential offer
  let stepStart = performance.now();
  const offerRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/openid4vci/credential-offer',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { credentialTypes: [credentialType] });
  timings.offerCreation = performance.now() - stepStart;

  if (offerRes.statusCode !== 200) {
    throw new Error(`Offer creation failed: ${offerRes.statusCode}`);
  }

  const preAuthCode = offerRes.data.credentialOffer?.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code'];

  // Step 2: Token request
  stepStart = performance.now();
  const tokenRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/openid4vci/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { 'pre-authorized_code': preAuthCode, grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code' });
  timings.tokenRequest = performance.now() - stepStart;

  if (tokenRes.statusCode !== 200) {
    throw new Error(`Token request failed: ${tokenRes.statusCode}`);
  }

  const accessToken = tokenRes.data.access_token;

  // Step 3: Credential request
  stepStart = performance.now();
  const credRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/openid4vci/credential',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  }, {
    format: 'jwt_vc_json',
    credential_definition: { type: ['VerifiableCredential', credentialType] },
  });
  timings.credentialRequest = performance.now() - stepStart;

  if (credRes.statusCode !== 200) {
    throw new Error(`Credential request failed: ${credRes.statusCode}`);
  }

  timings.totalFlow = performance.now() - flowStart;

  return {
    success: true,
    timings,
    credentialType,
    credential: credRes.data.credential,
  };
}

// Verification request measurement
async function measureVerificationRequest() {
  const startTime = performance.now();

  const res = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/openid4vp/authorization-request',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    presentationDefinitionId: 'agent-identity',
    verifierDid: 'did:key:test-verifier',
  });

  const latency = performance.now() - startTime;

  return {
    success: res.statusCode === 200,
    latency,
    sessionId: res.data?.sessionId,
  };
}

// Concurrent execution helper
async function runConcurrent(fn, concurrency, iterations) {
  const results = [];
  const startTime = performance.now();

  for (let batch = 0; batch < Math.ceil(iterations / concurrency); batch++) {
    const batchSize = Math.min(concurrency, iterations - batch * concurrency);
    const promises = Array(batchSize).fill().map(() => fn());
    const batchResults = await Promise.allSettled(promises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({ success: false, error: result.reason?.message });
      }
    }
  }

  const totalTime = performance.now() - startTime;
  const successCount = results.filter(r => r.success).length;

  return {
    results,
    totalTime,
    successCount,
    failureCount: results.length - successCount,
    successRate: (successCount / results.length) * 100,
    actualThroughput: (results.length / totalTime) * 1000,
  };
}

// Main benchmark runner
async function runBenchmarks() {
  console.log('='.repeat(70));
  console.log('    COMPREHENSIVE OpenID4VC PERFORMANCE BENCHMARK');
  console.log('='.repeat(70));
  console.log(`Platform: ${process.platform} | Node: ${process.version}`);
  console.log(`Warmup: ${WARMUP_ITERATIONS} | Iterations: ${BENCHMARK_ITERATIONS}`);
  console.log(`Concurrency Levels: ${CONCURRENCY_LEVELS.join(', ')}`);
  console.log('='.repeat(70));

  results.metadata.startTime = new Date().toISOString();

  // Check server health
  try {
    await httpRequest({ hostname: 'localhost', port: 3000, path: '/health', method: 'GET' });
    console.log('\n[OK] Server is running\n');
  } catch (e) {
    console.error('[ERROR] Server not available. Start with: node simple-server.js');
    process.exit(1);
  }

  // ===== SECTION 1: Single Client Issuance =====
  console.log('\n' + '-'.repeat(70));
  console.log('SECTION 1: Single Client Credential Issuance');
  console.log('-'.repeat(70));

  const credentialTypes = [
    'AIAgentIdentityCredential',
    'DelegationCredential',
    'CapabilityCredential',
  ];

  for (const credType of credentialTypes) {
    console.log(`\nTesting: ${credType}`);

    // Warmup
    process.stdout.write('  Warmup: ');
    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
      await measureIssuanceFlow(credType);
      process.stdout.write('.');
    }
    console.log(' done');

    // Benchmark
    const latencies = { offer: [], token: [], credential: [], total: [] };
    process.stdout.write('  Benchmark: ');

    for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
      try {
        const result = await measureIssuanceFlow(credType);
        latencies.offer.push(result.timings.offerCreation);
        latencies.token.push(result.timings.tokenRequest);
        latencies.credential.push(result.timings.credentialRequest);
        latencies.total.push(result.timings.totalFlow);

        if ((i + 1) % 20 === 0) process.stdout.write('.');
      } catch (e) {
        console.error(`\n  Error at iteration ${i}: ${e.message}`);
      }
    }
    console.log(' done');

    results.issuance.credentialTypes[credType] = {
      offerCreation: calculateStats(latencies.offer),
      tokenRequest: calculateStats(latencies.token),
      credentialRequest: calculateStats(latencies.credential),
      totalFlow: calculateStats(latencies.total),
    };

    const stats = results.issuance.credentialTypes[credType].totalFlow;
    console.log(`  Results: Mean=${stats.mean.toFixed(3)}ms, P95=${stats.p95.toFixed(3)}ms, P99=${stats.p99.toFixed(3)}ms`);
  }

  // ===== SECTION 2: Single Client Verification =====
  console.log('\n' + '-'.repeat(70));
  console.log('SECTION 2: Single Client Verification Request');
  console.log('-'.repeat(70));

  // Warmup
  process.stdout.write('Warmup: ');
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    await measureVerificationRequest();
    process.stdout.write('.');
  }
  console.log(' done');

  // Benchmark
  const verifyLatencies = [];
  process.stdout.write('Benchmark: ');
  for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
    const result = await measureVerificationRequest();
    if (result.success) {
      verifyLatencies.push(result.latency);
    }
    if ((i + 1) % 20 === 0) process.stdout.write('.');
  }
  console.log(' done');

  results.verification.singleClient = calculateStats(verifyLatencies);
  const vStats = results.verification.singleClient;
  console.log(`Results: Mean=${vStats.mean.toFixed(3)}ms, P95=${vStats.p95.toFixed(3)}ms, P99=${vStats.p99.toFixed(3)}ms`);

  // ===== SECTION 3: Concurrency Scaling - Issuance =====
  console.log('\n' + '-'.repeat(70));
  console.log('SECTION 3: Concurrency Scaling - Issuance');
  console.log('-'.repeat(70));

  for (const concurrency of CONCURRENCY_LEVELS) {
    console.log(`\nConcurrency Level: ${concurrency} clients`);

    const iterations = Math.min(100, BENCHMARK_ITERATIONS);
    const concurrentResults = await runConcurrent(
      () => measureIssuanceFlow('AIAgentIdentityCredential'),
      concurrency,
      iterations
    );

    const successLatencies = concurrentResults.results
      .filter(r => r.success)
      .map(r => r.timings.totalFlow);

    results.issuance.concurrency[concurrency] = {
      stats: calculateStats(successLatencies),
      successRate: concurrentResults.successRate,
      actualThroughput: concurrentResults.actualThroughput,
      totalTime: concurrentResults.totalTime,
    };

    const cStats = results.issuance.concurrency[concurrency];
    console.log(`  Success: ${cStats.successRate.toFixed(1)}% | Mean: ${cStats.stats?.mean?.toFixed(3) || 'N/A'}ms | Throughput: ${cStats.actualThroughput.toFixed(2)} ops/s`);
  }

  // ===== SECTION 4: Concurrency Scaling - Verification =====
  console.log('\n' + '-'.repeat(70));
  console.log('SECTION 4: Concurrency Scaling - Verification');
  console.log('-'.repeat(70));

  for (const concurrency of CONCURRENCY_LEVELS) {
    console.log(`\nConcurrency Level: ${concurrency} clients`);

    const iterations = Math.min(100, BENCHMARK_ITERATIONS);
    const concurrentResults = await runConcurrent(
      measureVerificationRequest,
      concurrency,
      iterations
    );

    const successLatencies = concurrentResults.results
      .filter(r => r.success)
      .map(r => r.latency);

    results.verification.concurrency[concurrency] = {
      stats: calculateStats(successLatencies),
      successRate: concurrentResults.successRate,
      actualThroughput: concurrentResults.actualThroughput,
      totalTime: concurrentResults.totalTime,
    };

    const cStats = results.verification.concurrency[concurrency];
    console.log(`  Success: ${cStats.successRate.toFixed(1)}% | Mean: ${cStats.stats?.mean?.toFixed(3) || 'N/A'}ms | Throughput: ${cStats.actualThroughput.toFixed(2)} ops/s`);
  }

  // ===== SECTION 5: End-to-End Flow =====
  console.log('\n' + '-'.repeat(70));
  console.log('SECTION 5: End-to-End Flow (Issuance + Verification)');
  console.log('-'.repeat(70));

  const e2eLatencies = [];
  process.stdout.write('Running E2E tests: ');

  for (let i = 0; i < 50; i++) {
    const flowStart = performance.now();

    try {
      // Issue credential
      await measureIssuanceFlow('AIAgentIdentityCredential');
      // Create verification request
      await measureVerificationRequest();

      e2eLatencies.push(performance.now() - flowStart);
      process.stdout.write('.');
    } catch (e) {
      console.error(`\nE2E Error: ${e.message}`);
    }
  }
  console.log(' done');

  results.e2e.flows = calculateStats(e2eLatencies);
  const e2eStats = results.e2e.flows;
  console.log(`E2E Results: Mean=${e2eStats.mean.toFixed(3)}ms, P95=${e2eStats.p95.toFixed(3)}ms, P99=${e2eStats.p99.toFixed(3)}ms`);

  // ===== FINAL SUMMARY =====
  results.metadata.endTime = new Date().toISOString();

  console.log('\n' + '='.repeat(70));
  console.log('BENCHMARK SUMMARY');
  console.log('='.repeat(70));

  console.log('\n--- Single Client Performance ---');
  console.log('\nCredential Issuance by Type:');
  for (const [type, data] of Object.entries(results.issuance.credentialTypes)) {
    const s = data.totalFlow;
    console.log(`  ${type}:`);
    console.log(`    Mean: ${s.mean.toFixed(3)} ms | Median: ${s.median.toFixed(3)} ms | StdDev: ${s.stdDev.toFixed(3)} ms`);
    console.log(`    P50: ${s.p50.toFixed(3)} | P90: ${s.p90.toFixed(3)} | P95: ${s.p95.toFixed(3)} | P99: ${s.p99.toFixed(3)} ms`);
    console.log(`    Throughput: ${s.throughput.toFixed(2)} ops/s | CV: ${s.cv.toFixed(2)}%`);
  }

  console.log('\nVerification Request:');
  const vs = results.verification.singleClient;
  console.log(`  Mean: ${vs.mean.toFixed(3)} ms | Median: ${vs.median.toFixed(3)} ms | StdDev: ${vs.stdDev.toFixed(3)} ms`);
  console.log(`  P50: ${vs.p50.toFixed(3)} | P90: ${vs.p90.toFixed(3)} | P95: ${vs.p95.toFixed(3)} | P99: ${vs.p99.toFixed(3)} ms`);
  console.log(`  Throughput: ${vs.throughput.toFixed(2)} ops/s | CV: ${vs.cv.toFixed(2)}%`);

  console.log('\n--- Concurrency Scaling ---');
  console.log('\nIssuance Throughput by Concurrency:');
  console.log('  Conc.  | Mean(ms) | P95(ms)  | P99(ms)  | Throughput | Success');
  console.log('  -------|----------|----------|----------|------------|--------');
  for (const [conc, data] of Object.entries(results.issuance.concurrency)) {
    const s = data.stats;
    if (s) {
      console.log(`  ${conc.padStart(6)} | ${s.mean.toFixed(3).padStart(8)} | ${s.p95.toFixed(3).padStart(8)} | ${s.p99.toFixed(3).padStart(8)} | ${data.actualThroughput.toFixed(2).padStart(10)} | ${data.successRate.toFixed(1)}%`);
    }
  }

  console.log('\nVerification Throughput by Concurrency:');
  console.log('  Conc.  | Mean(ms) | P95(ms)  | P99(ms)  | Throughput | Success');
  console.log('  -------|----------|----------|----------|------------|--------');
  for (const [conc, data] of Object.entries(results.verification.concurrency)) {
    const s = data.stats;
    if (s) {
      console.log(`  ${conc.padStart(6)} | ${s.mean.toFixed(3).padStart(8)} | ${s.p95.toFixed(3).padStart(8)} | ${s.p99.toFixed(3).padStart(8)} | ${data.actualThroughput.toFixed(2).padStart(10)} | ${data.successRate.toFixed(1)}%`);
    }
  }

  console.log('\n--- E2E Flow Performance ---');
  console.log(`  Mean: ${e2eStats.mean.toFixed(3)} ms | P95: ${e2eStats.p95.toFixed(3)} ms | P99: ${e2eStats.p99.toFixed(3)} ms`);

  // Save results to JSON
  const fs = require('fs');
  const outputPath = './benchmark-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  console.log('\n' + '='.repeat(70));
  console.log('Benchmark completed successfully!');
  console.log('='.repeat(70));
}

// Run benchmarks
runBenchmarks().catch(console.error);
