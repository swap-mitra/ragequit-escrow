require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CELO_PRIVATE_KEY = process.env.CELO_PRIVATE_KEY || PRIVATE_KEY;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const CELO_ALFAJORES_RPC_URL = process.env.CELO_ALFAJORES_RPC_URL;

const networks = {
  hardhat: {},
  localhost: {
    url: "http://127.0.0.1:8545",
  },
};

if (SEPOLIA_RPC_URL && PRIVATE_KEY) {
  networks.sepolia = {
    url: SEPOLIA_RPC_URL,
    accounts: [PRIVATE_KEY],
  };
}

if (CELO_ALFAJORES_RPC_URL && CELO_PRIVATE_KEY) {
  networks.alfajores = {
    url: CELO_ALFAJORES_RPC_URL,
    accounts: [CELO_PRIVATE_KEY],
    chainId: 44787,
  };
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks,
};
