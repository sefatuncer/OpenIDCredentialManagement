#!/bin/bash
##
## HLF Channel Setup Script
## Run inside the CLI container: docker exec hlf-cli /scripts/setup-channel.sh
##

set -e

CHANNEL_NAME="ssi-channel"
CHAINCODE_NAME="credential-anchor"
CHAINCODE_VERSION="1.0"
CHAINCODE_PATH="/opt/gopath/src/github.com/chaincode/credential-anchor"
ORDERER_ADDRESS="orderer.ssi.network:7050"

echo "============================================="
echo "  SSI Credential Anchoring — HLF Setup"
echo "============================================="

# --- Step 1: Create channel ---
echo ""
echo ">>> Creating channel: ${CHANNEL_NAME}"
peer channel create \
  -o ${ORDERER_ADDRESS} \
  -c ${CHANNEL_NAME} \
  -f /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.tx \
  --outputBlock /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block

# --- Step 2: Join Org1 peers ---
echo ""
echo ">>> Joining Org1 peers to channel"

export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_MSPCONFIGPATH="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.ssi.network/users/Admin@org1.ssi.network/msp"

export CORE_PEER_ADDRESS="peer0.org1.ssi.network:7051"
peer channel join -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block
echo "  peer0.org1 joined"

export CORE_PEER_ADDRESS="peer1.org1.ssi.network:8051"
peer channel join -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block
echo "  peer1.org1 joined"

# --- Step 3: Join Org2 peers ---
echo ""
echo ">>> Joining Org2 peers to channel"

export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_MSPCONFIGPATH="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org2.ssi.network/users/Admin@org2.ssi.network/msp"

export CORE_PEER_ADDRESS="peer0.org2.ssi.network:9051"
peer channel join -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block
echo "  peer0.org2 joined"

export CORE_PEER_ADDRESS="peer1.org2.ssi.network:10051"
peer channel join -b /opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block
echo "  peer1.org2 joined"

# --- Step 4: Package chaincode ---
echo ""
echo ">>> Packaging chaincode: ${CHAINCODE_NAME}"

# Build chaincode (TypeScript → JS)
cd ${CHAINCODE_PATH}
if [ -f "package.json" ]; then
  npm install 2>/dev/null || true
  npm run build 2>/dev/null || true
fi
cd -

peer lifecycle chaincode package ${CHAINCODE_NAME}.tar.gz \
  --path ${CHAINCODE_PATH} \
  --lang node \
  --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION}

# --- Step 5: Install on Org1 ---
echo ""
echo ">>> Installing chaincode on Org1 peers"

export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_MSPCONFIGPATH="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.ssi.network/users/Admin@org1.ssi.network/msp"

export CORE_PEER_ADDRESS="peer0.org1.ssi.network:7051"
peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz

export CORE_PEER_ADDRESS="peer1.org1.ssi.network:8051"
peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz

# --- Step 6: Install on Org2 ---
echo ""
echo ">>> Installing chaincode on Org2 peers"

export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_MSPCONFIGPATH="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org2.ssi.network/users/Admin@org2.ssi.network/msp"

export CORE_PEER_ADDRESS="peer0.org2.ssi.network:9051"
peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz

export CORE_PEER_ADDRESS="peer1.org2.ssi.network:10051"
peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz

# --- Step 7: Approve and Commit ---
echo ""
echo ">>> Approving and committing chaincode definition"

# Get package ID
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep "${CHAINCODE_NAME}_${CHAINCODE_VERSION}" | awk -F', ' '{print $1}' | awk -F': ' '{print $2}')
echo "  Package ID: ${PACKAGE_ID}"

# Approve for Org2
peer lifecycle chaincode approveformyorg \
  -o ${ORDERER_ADDRESS} \
  --channelID ${CHANNEL_NAME} \
  --name ${CHAINCODE_NAME} \
  --version ${CHAINCODE_VERSION} \
  --package-id ${PACKAGE_ID} \
  --sequence 1

# Approve for Org1
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_MSPCONFIGPATH="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.ssi.network/users/Admin@org1.ssi.network/msp"
export CORE_PEER_ADDRESS="peer0.org1.ssi.network:7051"

peer lifecycle chaincode approveformyorg \
  -o ${ORDERER_ADDRESS} \
  --channelID ${CHANNEL_NAME} \
  --name ${CHAINCODE_NAME} \
  --version ${CHAINCODE_VERSION} \
  --package-id ${PACKAGE_ID} \
  --sequence 1

# Commit
peer lifecycle chaincode commit \
  -o ${ORDERER_ADDRESS} \
  --channelID ${CHANNEL_NAME} \
  --name ${CHAINCODE_NAME} \
  --version ${CHAINCODE_VERSION} \
  --sequence 1 \
  --peerAddresses peer0.org1.ssi.network:7051 \
  --peerAddresses peer0.org2.ssi.network:9051

# --- Step 8: Initialize chaincode ---
echo ""
echo ">>> Initializing chaincode"
peer chaincode invoke \
  -o ${ORDERER_ADDRESS} \
  -C ${CHANNEL_NAME} \
  -n ${CHAINCODE_NAME} \
  -c '{"function":"initLedger","Args":[]}' \
  --peerAddresses peer0.org1.ssi.network:7051 \
  --peerAddresses peer0.org2.ssi.network:9051

echo ""
echo "============================================="
echo "  HLF Setup Complete!"
echo "  Channel: ${CHANNEL_NAME}"
echo "  Chaincode: ${CHAINCODE_NAME} v${CHAINCODE_VERSION}"
echo "============================================="
