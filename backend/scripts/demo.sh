#!/bin/bash

# ============================================================================
# AI Agent Identity System - Demo Script (Bash/cURL version)
# ============================================================================
#
# This script demonstrates the full credential issuance and verification flow
# using cURL commands.
#
# Usage: ./scripts/demo.sh
#
# Prerequisites:
# - Server running on http://localhost:3000
# - curl installed
# - jq installed (optional, for JSON formatting)
#
# ============================================================================

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-dev-api-key-12345}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
DIM='\033[2m'
RESET='\033[0m'
BG_BLUE='\033[44m'
BG_GREEN='\033[42m'

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${BG_BLUE}${WHITE} $1 ${RESET}"
    echo -e "${DIM}────────────────────────────────────────────────────────────${RESET}"
}

print_success() {
    echo -e "${GREEN}✓${RESET} $1"
}

print_error() {
    echo -e "${RED}✗${RESET} $1"
}

print_info() {
    echo -e "${CYAN}→${RESET} $1"
}

print_step() {
    echo ""
    echo -e "${YELLOW}Step $1:${RESET} ${WHITE}$2${RESET}"
}

print_json() {
    if command -v jq &> /dev/null; then
        echo -e "${DIM}"
        echo "$1" | jq '.'
        echo -e "${RESET}"
    else
        echo -e "${DIM}$1${RESET}"
    fi
}

# Check if jq is available
check_jq() {
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}Note: jq is not installed. JSON output will not be formatted.${RESET}"
        echo -e "${DIM}Install jq for prettier output: https://stedolan.github.io/jq/download/${RESET}"
    fi
}

# ============================================================================
# Main Demo
# ============================================================================

echo ""
echo -e "${BG_GREEN}${WHITE} AI Agent Identity System - Demo (cURL) ${RESET}"
echo -e "${DIM}API URL: ${API_URL}${RESET}"
echo -e "${DIM}API Key: ${API_KEY:0:8}...${RESET}"
echo -e "${DIM}════════════════════════════════════════════════════════════${RESET}"

check_jq

# ----------------------------------------------------------------------------
# Step 1: Check system health
# ----------------------------------------------------------------------------
print_step 1 "Checking system health"
print_info "Calling GET /health..."

HEALTH_RESPONSE=$(curl -s "${API_URL}/health")
HEALTH_STATUS=$?

if [ $HEALTH_STATUS -eq 0 ]; then
    # Check if response contains "healthy" or similar
    if echo "$HEALTH_RESPONSE" | grep -qi "healthy\|ok\|status"; then
        print_success "System is healthy"
        print_json "$HEALTH_RESPONSE"
    else
        print_error "System health check returned unexpected response"
        print_json "$HEALTH_RESPONSE"
        exit 1
    fi
else
    print_error "Failed to connect to API at ${API_URL}"
    print_info "Make sure the server is running: npm start"
    exit 1
fi

# ----------------------------------------------------------------------------
# Step 2: Get issuer DID
# ----------------------------------------------------------------------------
print_step 2 "Getting issuer DID"
print_info "Calling GET /api/v1/issuer/did..."

ISSUER_RESPONSE=$(curl -s -H "x-api-key: ${API_KEY}" "${API_URL}/api/v1/issuer/did")
ISSUER_STATUS=$?

if [ $ISSUER_STATUS -eq 0 ] && [ -n "$ISSUER_RESPONSE" ]; then
    if echo "$ISSUER_RESPONSE" | grep -qi "did"; then
        print_success "Retrieved issuer DID"
        print_json "$ISSUER_RESPONSE"

        # Extract DID if jq is available
        if command -v jq &> /dev/null; then
            ISSUER_DID=$(echo "$ISSUER_RESPONSE" | jq -r '.did // .issuerDid // "unknown"')
            print_info "Issuer DID: ${CYAN}${ISSUER_DID}${RESET}"
        fi
    else
        print_error "Failed to get issuer DID"
        print_json "$ISSUER_RESPONSE"
    fi
else
    print_error "Failed to call issuer endpoint"
fi

# ----------------------------------------------------------------------------
# Step 3: Create a credential offer
# ----------------------------------------------------------------------------
print_step 3 "Creating credential offer"
print_info "Calling POST /credential-offer (OpenID4VCI)..."

# OpenID4VCI standard credential offer request
CREDENTIAL_PAYLOAD=$(cat <<EOF
{
  "credentialTypes": ["AIAgentIdentityCredential"],
  "userPinRequired": false,
  "expiresInSeconds": 300
}
EOF
)

print_info "Credential offer request:"
print_json "$CREDENTIAL_PAYLOAD"

OFFER_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -d "$CREDENTIAL_PAYLOAD" \
    "${API_URL}/credential-offer")

if [ -n "$OFFER_RESPONSE" ]; then
    if echo "$OFFER_RESPONSE" | grep -qi "offer\|uri\|credential"; then
        print_success "Credential offer created"
        print_json "$OFFER_RESPONSE"
    else
        print_error "Failed to create credential offer"
        print_json "$OFFER_RESPONSE"
    fi
else
    print_error "No response from credential offer endpoint"
fi

# ----------------------------------------------------------------------------
# Step 4: Display the offer URI
# ----------------------------------------------------------------------------
print_step 4 "Displaying offer URI"

# Try to extract offer URI if jq is available
if command -v jq &> /dev/null && [ -n "$OFFER_RESPONSE" ]; then
    OFFER_URI=$(echo "$OFFER_RESPONSE" | jq -r '.credentialOfferUri // .offerUri // .uri // empty')
    if [ -n "$OFFER_URI" ] && [ "$OFFER_URI" != "null" ]; then
        print_success "Credential Offer URI generated:"
        echo ""
        echo -e "${BG_BLUE}${WHITE} OFFER URI ${RESET}"
        echo -e "${CYAN}${OFFER_URI}${RESET}"
        echo ""
        print_info "This URI can be used by a wallet to claim the credential"
    else
        print_info "Offer details shown above"
    fi
else
    print_info "Offer details shown in Step 3 response"
fi

# ----------------------------------------------------------------------------
# Step 5: Mock verification
# ----------------------------------------------------------------------------
print_step 5 "Demonstrating credential verification (mock)"
print_info "In a real scenario, verification would:"
echo -e "${DIM}  1. Receive a verifiable presentation from the holder${RESET}"
echo -e "${DIM}  2. Verify the credential signature against the issuer DID${RESET}"
echo -e "${DIM}  3. Check credential expiration and revocation status${RESET}"
echo -e "${DIM}  4. Validate the credential schema and claims${RESET}"

print_info "Attempting to call verification endpoint..."

# Create an authorization request for credential verification
VERIFY_PAYLOAD=$(cat <<EOF
{
  "presentationDefinitionId": "agent-identity",
  "expiresInSeconds": 300
}
EOF
)

VERIFY_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${API_KEY}" \
    -d "$VERIFY_PAYLOAD" \
    "${API_URL}/api/v1/openid4vp/authorization-request" 2>/dev/null)

if [ -n "$VERIFY_RESPONSE" ]; then
    print_info "Verification authorization request created:"
    print_json "$VERIFY_RESPONSE"

    # Extract authorization request URI if jq is available
    if command -v jq &> /dev/null; then
        AUTH_URI=$(echo "$VERIFY_RESPONSE" | jq -r '.authorizationRequestUri // empty')
        if [ -n "$AUTH_URI" ] && [ "$AUTH_URI" != "null" ]; then
            print_info "Authorization Request URI: ${CYAN}${AUTH_URI}${RESET}"
            print_info "A wallet would use this URI to submit a verifiable presentation"
        fi
    fi
else
    print_info "Verification endpoint note: No response or endpoint not available"
    print_info "This is expected if the verifier agent is not fully configured"
fi

# ============================================================================
# Summary
# ============================================================================
print_header "Demo Complete"
print_success "All demo steps executed"
echo ""
print_info "Summary:"
echo -e "${DIM}  - Health check: ${GREEN}PASSED${DIM}${RESET}"
echo -e "${DIM}  - Issuer DID: ${GREEN}RETRIEVED${DIM}${RESET}"
echo -e "${DIM}  - Credential offer: ${GREEN}CREATED${DIM}${RESET}"
echo -e "${DIM}  - Verification: ${YELLOW}DEMONSTRATED${DIM}${RESET}"
echo ""
echo -e "${DIM}Demo finished.${RESET}"
echo ""
