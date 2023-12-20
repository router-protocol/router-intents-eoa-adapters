#!/bin/bash

echo "[BASH] Setting up testnet environment"

# Export MARKET_NAME variable to use Aave market as testnet deployment setup
export REPORT_GAS=true
export ENV=testnet

export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # dummy hardhat pk
export OWNER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 # dummy hardhat owner

export POLYGON_URL=https://polygon.llamarpc.com
export FANTOM_URL=https://rpc2.fantom.network
export ETH_MAINNET_URL=https://eth.llamarpc.com
export GOERLI_URL=https://rpc.ankr.com/eth_goerli
export HOLESKY_URL=https://ethereum-holesky.publicnode.com
export POLYGON_MUMBAI_URL=https://polygon-mumbai-bor.publicnode.com				

export POLYGONSCAN_API_KEY=43A14UI3HB6DHBGGE3JRSZB4J9V3P1S9SE
export AVALANCHE_API_KEY=QAE2JD7XIBCYB6Z6GSKNJIHKZ8XGVYM8AI
export ETHERSCAN_API_KEY=FF9TZXKT2JWZ68M2EJH1FGCX13IB7ZKPUZ


echo "[BASH] Testnet environment ready"