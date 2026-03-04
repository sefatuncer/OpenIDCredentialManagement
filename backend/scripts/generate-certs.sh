#!/bin/bash

# AI Agent Identity System - Certificate Generation Script
# This script generates self-signed certificates for development/testing
# For production, use certificates from a trusted CA

set -e

CERTS_DIR="${1:-./docker/certs}"
DAYS_VALID=365
KEY_SIZE=4096

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}AI Agent Identity System - Certificate Generator${NC}"
echo "=================================================="

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

# Generate CA (Certificate Authority)
echo -e "\n${YELLOW}[1/5] Generating CA private key...${NC}"
openssl genrsa -out "$CERTS_DIR/ca.key" $KEY_SIZE

echo -e "${YELLOW}[2/5] Generating CA certificate...${NC}"
openssl req -new -x509 -days $DAYS_VALID -key "$CERTS_DIR/ca.key" \
    -out "$CERTS_DIR/ca.crt" \
    -subj "/C=TR/ST=Istanbul/L=Istanbul/O=AI Agent Identity/OU=Development/CN=AI Agent Identity CA"

# Generate Server Certificate
echo -e "\n${YELLOW}[3/5] Generating server private key...${NC}"
openssl genrsa -out "$CERTS_DIR/server.key" $KEY_SIZE

echo -e "${YELLOW}[4/5] Generating server CSR...${NC}"
cat > "$CERTS_DIR/server.cnf" << EOF
[req]
default_bits = $KEY_SIZE
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
C = TR
ST = Istanbul
L = Istanbul
O = AI Agent Identity
OU = Server
CN = localhost

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = api-gateway
DNS.3 = issuer
DNS.4 = verifier
DNS.5 = holder
DNS.6 = *.ai-identity.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

openssl req -new -key "$CERTS_DIR/server.key" \
    -out "$CERTS_DIR/server.csr" \
    -config "$CERTS_DIR/server.cnf"

echo -e "${YELLOW}[5/5] Signing server certificate with CA...${NC}"
openssl x509 -req -days $DAYS_VALID \
    -in "$CERTS_DIR/server.csr" \
    -CA "$CERTS_DIR/ca.crt" \
    -CAkey "$CERTS_DIR/ca.key" \
    -CAcreateserial \
    -out "$CERTS_DIR/server.crt" \
    -extensions req_ext \
    -extfile "$CERTS_DIR/server.cnf"

# Generate Client Certificate (for mTLS)
echo -e "\n${YELLOW}Generating client certificate for mTLS...${NC}"
openssl genrsa -out "$CERTS_DIR/client.key" $KEY_SIZE

openssl req -new -key "$CERTS_DIR/client.key" \
    -out "$CERTS_DIR/client.csr" \
    -subj "/C=TR/ST=Istanbul/L=Istanbul/O=AI Agent Identity/OU=Client/CN=AI Agent Client"

openssl x509 -req -days $DAYS_VALID \
    -in "$CERTS_DIR/client.csr" \
    -CA "$CERTS_DIR/ca.crt" \
    -CAkey "$CERTS_DIR/ca.key" \
    -CAcreateserial \
    -out "$CERTS_DIR/client.crt"

# Create combined PEM files
cat "$CERTS_DIR/server.crt" "$CERTS_DIR/server.key" > "$CERTS_DIR/server.pem"
cat "$CERTS_DIR/client.crt" "$CERTS_DIR/client.key" > "$CERTS_DIR/client.pem"

# Set permissions
chmod 600 "$CERTS_DIR"/*.key
chmod 644 "$CERTS_DIR"/*.crt "$CERTS_DIR"/*.pem

# Cleanup CSR files
rm -f "$CERTS_DIR"/*.csr "$CERTS_DIR"/*.cnf "$CERTS_DIR"/*.srl

echo -e "\n${GREEN}Certificate generation complete!${NC}"
echo "=================================================="
echo "Generated files in $CERTS_DIR:"
echo "  - ca.crt        : CA certificate (trust this)"
echo "  - ca.key        : CA private key (keep secret)"
echo "  - server.crt    : Server certificate"
echo "  - server.key    : Server private key"
echo "  - server.pem    : Combined server cert + key"
echo "  - client.crt    : Client certificate (for mTLS)"
echo "  - client.key    : Client private key"
echo "  - client.pem    : Combined client cert + key"
echo ""
echo -e "${YELLOW}Note: These are self-signed certificates for development.${NC}"
echo -e "${YELLOW}For production, use certificates from a trusted CA.${NC}"
