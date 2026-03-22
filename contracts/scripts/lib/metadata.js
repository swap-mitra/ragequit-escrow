const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function parseOptionalJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeAddress(address) {
  return typeof address === "string" ? address.toLowerCase() : "";
}

function buildAddressBook(deployment = {}) {
  const byAddress = {
    ...(deployment.addressBook || {}),
    ...parseOptionalJson(process.env.ADDRESS_BOOK_JSON, {}),
  };

  const defaultEntries = [
    [deployment.owner || process.env.ESCROW_OWNER, process.env.OWNER_DISPLAY_NAME || process.env.OWNER_ENS_NAME],
    [deployment.authorizedAgent || process.env.AUTHORIZED_AGENT, process.env.AUTHORIZED_AGENT_DISPLAY_NAME || process.env.AGENT_ENS_NAME],
    [process.env.PAYMENT_RAIL_WALLET_ADDRESS, process.env.PAYMENT_RAIL_WALLET_LABEL],
  ];

  for (const [address, label] of defaultEntries) {
    if (address && label) {
      byAddress[normalizeAddress(address)] = label;
    }
  }

  return byAddress;
}

function resolveAddressLabel(address, deployment = {}) {
  if (!address) {
    return null;
  }

  const book = buildAddressBook(deployment);
  return book[normalizeAddress(address)] || null;
}

function buildIdentityMetadata(deployment = {}) {
  const selfMetadata = {
    enabled: String(process.env.SELF_VERIFICATION_ENABLED || "false").toLowerCase() === "true",
    userId: process.env.SELF_USER_ID || null,
    scope: process.env.SELF_VERIFICATION_SCOPE || null,
    proofUrl: process.env.SELF_PROOF_URL || null,
    verified: String(process.env.SELF_VERIFIED || "false").toLowerCase() === "true",
    attestation: process.env.SELF_ATTESTATION || null,
  };

  return {
    agentEnsName: process.env.AGENT_ENS_NAME || null,
    ownerEnsName: process.env.OWNER_ENS_NAME || null,
    authorizedAgentEnsName: process.env.AUTHORIZED_AGENT_ENS_NAME || null,
    recipientEns: parseOptionalJson(process.env.RECIPIENT_ENS_JSON, {}),
    addressBook: buildAddressBook(deployment),
    self: selfMetadata,
  };
}

function buildPaymentRailMetadata(networkName, deployment = {}) {
  const settlementMode = process.env.SETTLEMENT_MODE || deployment.settlementMode || "native";
  const settlementToken = process.env.SETTLEMENT_TOKEN || deployment.settlementToken || ZERO_ADDRESS;
  const inferredProvider =
    process.env.PAYMENT_RAIL_PROVIDER ||
    deployment.paymentRailProvider ||
    (settlementMode === "token" && (networkName === "alfajores" || networkName === "celo") ? "locus" : settlementMode === "token" ? "erc20-escrow" : "native-escrow");

  return {
    provider: inferredProvider,
    network: process.env.PAYMENT_RAIL_NETWORK || deployment.paymentRailNetwork || networkName,
    assetSymbol: process.env.PAYMENT_RAIL_ASSET_SYMBOL || deployment.paymentRailAssetSymbol || null,
    assetAddress: process.env.PAYMENT_RAIL_ASSET_ADDRESS || deployment.paymentRailAssetAddress || settlementToken,
    walletAddress: process.env.PAYMENT_RAIL_WALLET_ADDRESS || deployment.paymentRailWalletAddress || null,
    walletLabel: process.env.PAYMENT_RAIL_WALLET_LABEL || deployment.paymentRailWalletLabel || null,
    policyUrl: process.env.PAYMENT_RAIL_POLICY_URL || deployment.paymentRailPolicyUrl || null,
    notes: process.env.PAYMENT_RAIL_NOTES || deployment.paymentRailNotes || null,
  };
}

module.exports = {
  ZERO_ADDRESS,
  parseOptionalJson,
  buildAddressBook,
  resolveAddressLabel,
  buildIdentityMetadata,
  buildPaymentRailMetadata,
};
