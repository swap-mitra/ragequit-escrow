const LOCALHOST_RPC_URL = "http://127.0.0.1:8545";

function ensureHex(value, label) {
  if (!value) {
    throw new Error(`Missing ${label}.`);
  }

  return value.startsWith("0x") ? value : `0x${value}`;
}

function resolveRpcUrl(networkName) {
  if (process.env.RPC_URL) {
    return process.env.RPC_URL;
  }

  if (networkName === "localhost" || networkName === "hardhat") {
    return LOCALHOST_RPC_URL;
  }

  if (networkName === "sepolia" && process.env.SEPOLIA_RPC_URL) {
    return process.env.SEPOLIA_RPC_URL;
  }

  if (networkName === "alfajores" && process.env.CELO_ALFAJORES_RPC_URL) {
    return process.env.CELO_ALFAJORES_RPC_URL;
  }

  throw new Error(`Missing RPC URL for network ${networkName}. Set RPC_URL or the network-specific variable.`);
}

function buildChain(chainId, networkName, rpcUrl) {
  const isCelo = networkName === "alfajores" || networkName === "celo";

  return {
    id: chainId,
    name: networkName,
    nativeCurrency: {
      name: isCelo ? "Celo" : "Ether",
      symbol: isCelo ? "CELO" : "ETH",
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [rpcUrl],
      },
      public: {
        http: [rpcUrl],
      },
    },
  };
}

async function createSmartAccountContext({
  chainId,
  networkName,
  ownerPrivateKey,
  rpcUrl = resolveRpcUrl(networkName),
  deployEnvironmentIfMissing = false,
}) {
  const { createPublicClient, createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const {
    Implementation,
    getSmartAccountsEnvironment,
    toMetaMaskSmartAccount,
  } = await import("@metamask/smart-accounts-kit");
  const { deploySmartAccountsEnvironment } = await import("@metamask/smart-accounts-kit/utils");

  const ownerAccount = privateKeyToAccount(ensureHex(ownerPrivateKey, "SMART_ACCOUNT_OWNER_PRIVATE_KEY"));
  const chain = buildChain(chainId, networkName, rpcUrl);

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account: ownerAccount,
    chain,
    transport: http(rpcUrl),
  });

  let environment;
  try {
    environment = getSmartAccountsEnvironment(chainId);
  } catch (error) {
    if (!deployEnvironmentIfMissing) {
      throw error;
    }

    environment = await deploySmartAccountsEnvironment(walletClient, publicClient, chain);
  }

  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [ownerAccount.address, [], [], []],
    deploySalt: "0x",
    signer: { account: ownerAccount },
    environment,
  });

  return {
    chain,
    environment,
    ownerAccount,
    publicClient,
    rpcUrl,
    smartAccount,
    walletClient,
  };
}

module.exports = {
  createSmartAccountContext,
  ensureHex,
  resolveRpcUrl,
};
