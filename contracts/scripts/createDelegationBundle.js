const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
require("dotenv").config();
const { createSmartAccountContext, ensureHex } = require("./lib/smartAccounts");

function resolveEscrowAddress(networkName) {
  if (process.env.ESCROW_ADDRESS) {
    return process.env.ESCROW_ADDRESS;
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", `${networkName}.json`);
  if (!fs.existsSync(deploymentPath)) {
    return null;
  }

  try {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    return deployment.escrowAddress || null;
  } catch {
    return null;
  }
}

async function buildScope(escrowAddress) {
  const { toFunctionSelector } = await import("viem");

  const scopeType = (process.env.DELEGATION_SCOPE_TYPE || "function-call").toLowerCase();

  if (scopeType === "native-token-transfer") {
    return {
      type: "nativeTokenTransferAmount",
      maxAmount: BigInt(process.env.DELEGATION_MAX_AMOUNT_WEI || "0"),
    };
  }

  if (scopeType === "native-token-periodic") {
    return {
      type: "nativeTokenPeriodTransfer",
      periodAmount: BigInt(process.env.DELEGATION_MAX_AMOUNT_WEI || "0"),
      periodDuration: Number(process.env.DELEGATION_PERIOD_SECONDS || "3600"),
      startDate: Number(process.env.DELEGATION_START_DATE || Math.floor(Date.now() / 1000)),
    };
  }

  if (!escrowAddress) {
    throw new Error("Missing ESCROW_ADDRESS or deployment metadata for function-call delegation scope.");
  }

  return {
    type: "functionCall",
    targets: [escrowAddress],
    selectors: [toFunctionSelector("initiate(address,uint256,bytes32)")],
    valueLte: {
      maxValue: 0n,
    },
  };
}

function buildCaveats() {
  const caveats = [];
  const maxCalls = Number(process.env.DELEGATION_MAX_CALLS || "0");
  const startsAt = Number(process.env.DELEGATION_START_DATE || "0");
  const expiresAt = Number(process.env.DELEGATION_EXPIRES_AT || "0");

  if (maxCalls > 0) {
    caveats.push({
      type: "limitedCalls",
      limit: maxCalls,
    });
  }

  if (startsAt > 0 || expiresAt > 0) {
    caveats.push({
      type: "timestamp",
      afterThreshold: startsAt > 0 ? startsAt : 0,
      beforeThreshold: expiresAt > 0 ? expiresAt : Math.floor(Date.now() / 1000) + 86400,
    });
  }

  return caveats;
}

function buildRedelegationCaveats() {
  const caveats = [];
  const maxCalls = Number(process.env.SUBDELEGATION_MAX_CALLS || "0");
  const startsAt = Number(process.env.SUBDELEGATION_START_DATE || process.env.DELEGATION_START_DATE || "0");
  const expiresAt = Number(process.env.SUBDELEGATION_EXPIRES_AT || process.env.DELEGATION_EXPIRES_AT || "0");

  if (maxCalls > 0) {
    caveats.push({
      type: "limitedCalls",
      limit: maxCalls,
    });
  }

  if (startsAt > 0 || expiresAt > 0) {
    caveats.push({
      type: "timestamp",
      afterThreshold: startsAt > 0 ? startsAt : 0,
      beforeThreshold: expiresAt > 0 ? expiresAt : Math.floor(Date.now() / 1000) + 3600,
    });
  }

  return caveats;
}

async function main() {
  const { ethers, network } = hre;
  const { privateKeyToAccount } = await import("viem/accounts");
  const { createDelegation, getDelegationHashOffchain, signDelegation } = await import(
    "@metamask/smart-accounts-kit"
  );

  const ownerPrivateKey = ensureHex(process.env.SMART_ACCOUNT_OWNER_PRIVATE_KEY, "SMART_ACCOUNT_OWNER_PRIVATE_KEY");
  const delegatePrivateKey = ensureHex(process.env.AGENT_DELEGATE_PRIVATE_KEY, "AGENT_DELEGATE_PRIVATE_KEY");
  const subdelegatePrivateKey = process.env.AGENT_SUBDELEGATE_PRIVATE_KEY
    ? ensureHex(process.env.AGENT_SUBDELEGATE_PRIVATE_KEY, "AGENT_SUBDELEGATE_PRIVATE_KEY")
    : null;

  const delegateAccount = privateKeyToAccount(delegatePrivateKey);
  const subdelegateAccount = subdelegatePrivateKey ? privateKeyToAccount(subdelegatePrivateKey) : null;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const deployEnvironmentIfMissing =
    String(process.env.SMART_ACCOUNT_DEPLOY_ENVIRONMENT || "false").toLowerCase() === "true";
  const escrowAddress = resolveEscrowAddress(network.name);

  const smartAccountContext = await createSmartAccountContext({
    chainId,
    networkName: network.name,
    ownerPrivateKey,
    deployEnvironmentIfMissing,
  });

  const scope = await buildScope(escrowAddress);
  const rootDelegationUnsigned = createDelegation({
    environment: smartAccountContext.environment,
    scope,
    from: smartAccountContext.smartAccount.address,
    to: delegateAccount.address,
    caveats: buildCaveats(),
  });

  const rootDelegation = {
    ...rootDelegationUnsigned,
    signature: await signDelegation({
      privateKey: ownerPrivateKey,
      delegation: rootDelegationUnsigned,
      delegationManager: smartAccountContext.environment.DelegationManager,
      chainId,
    }),
  };

  let redelegation = null;
  if (subdelegateAccount) {
    const redelegationUnsigned = createDelegation({
      environment: smartAccountContext.environment,
      scope,
      from: delegateAccount.address,
      to: subdelegateAccount.address,
      parentDelegation: rootDelegation,
      caveats: buildRedelegationCaveats(),
    });

    redelegation = {
      ...redelegationUnsigned,
      signature: await signDelegation({
        privateKey: delegatePrivateKey,
        delegation: redelegationUnsigned,
        delegationManager: smartAccountContext.environment.DelegationManager,
        chainId,
      }),
    };
  }

  const deploymentsPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const deployment = fs.existsSync(deploymentsPath) ? JSON.parse(fs.readFileSync(deploymentsPath, "utf8")) : null;

  const output = {
    network: network.name,
    chainId,
    generatedAt: new Date().toISOString(),
    escrowAddress,
    authorizedAgentSmartAccount: smartAccountContext.smartAccount.address,
    smartAccountOwner: smartAccountContext.ownerAccount.address,
    contractSpendLimitWei: deployment?.spendLimitWei || null,
    scopeType: scope.type,
    rootDelegation: {
      hash: getDelegationHashOffchain(rootDelegation),
      delegation: rootDelegation,
      delegate: delegateAccount.address,
    },
    redelegation: redelegation
      ? {
          hash: getDelegationHashOffchain(redelegation),
          delegation: redelegation,
          delegate: subdelegateAccount.address,
        }
      : null,
    note:
      scope.type === "functionCall"
        ? "Delegations are scoped to RageQuitEscrow.initiate(). Effective payment caps remain enforced by the escrow contract spendLimit."
        : "Delegations use a native-token spend scope. Align DELEGATION_MAX_AMOUNT_WEI with the escrow spendLimit.",
  };

  const delegationsDir = path.join(__dirname, "..", "delegations");
  fs.mkdirSync(delegationsDir, { recursive: true });

  const outputPath = path.join(delegationsDir, `${network.name}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`Authorized smart account: ${smartAccountContext.smartAccount.address}`);
  console.log(`Delegate: ${delegateAccount.address}`);
  if (subdelegateAccount) {
    console.log(`Subdelegate: ${subdelegateAccount.address}`);
  }
  console.log(`Delegation bundle written to: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
