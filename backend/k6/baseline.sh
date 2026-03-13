#!/usr/bin/env bash
#
# Baseline Performance Measurement
#
# Runs all k6 scenarios with smoke profile and saves results.
# Prerequisites: k6 installed (https://k6.io/docs/get-started/installation/)
#
# Usage:
#   ./backend/k6/baseline.sh
#   BASE_URL=http://staging:3000 API_KEY=my-key ./backend/k6/baseline.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-test-api-key-12345}"

mkdir -p "${RESULTS_DIR}"

echo "============================================"
echo " Performance Baseline — ${TIMESTAMP}"
echo " Target: ${BASE_URL}"
echo "============================================"
echo ""

# Check k6 is installed
if ! command -v k6 &>/dev/null; then
  echo "ERROR: k6 is not installed."
  echo "Install: https://k6.io/docs/get-started/installation/"
  exit 1
fi

# Check backend is reachable
if ! curl -sf "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "WARNING: Backend not reachable at ${BASE_URL}/health"
  echo "Make sure the backend is running before testing."
  exit 1
fi

run_scenario() {
  local name="$1"
  local script="$2"
  local output="${RESULTS_DIR}/${TIMESTAMP}-${name}.json"

  echo "--- Running: ${name} ---"
  k6 run \
    -e K6_PROFILE=smoke \
    -e BASE_URL="${BASE_URL}" \
    -e API_KEY="${API_KEY}" \
    --summary-export="${output}" \
    --quiet \
    "${script}" || true

  echo "  Results: ${output}"
  echo ""
}

run_scenario "issuance" "${SCRIPT_DIR}/issuance.js"
run_scenario "verification" "${SCRIPT_DIR}/verification.js"
run_scenario "mixed-workload" "${SCRIPT_DIR}/mixed-workload.js"

echo "============================================"
echo " Baseline complete. Results in: ${RESULTS_DIR}/"
echo "============================================"

# Print summary comparison if jq is available
if command -v jq &>/dev/null; then
  echo ""
  echo "--- Summary ---"
  for f in "${RESULTS_DIR}/${TIMESTAMP}"-*.json; do
    scenario=$(basename "$f" .json | sed "s/${TIMESTAMP}-//")
    p95=$(jq -r '.metrics.http_req_duration.values["p(95)"] // "N/A"' "$f" 2>/dev/null)
    p99=$(jq -r '.metrics.http_req_duration.values["p(99)"] // "N/A"' "$f" 2>/dev/null)
    reqs=$(jq -r '.metrics.http_reqs.values.count // "N/A"' "$f" 2>/dev/null)
    fails=$(jq -r '.metrics.http_req_failed.values.rate // "N/A"' "$f" 2>/dev/null)
    printf "  %-20s  p95=%sms  p99=%sms  reqs=%s  fail_rate=%s\n" "$scenario" "$p95" "$p99" "$reqs" "$fails"
  done
fi
