const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
require("dotenv").config();
const {
  ZERO_ADDRESS,
  parseOptionalJson,
  buildIdentityMetadata,
  buildPaymentRailMetadata,
  resolveAddressLabel,
} = require("./lib/metadata");

function resolveDeployment(networkName) {
  const deploymentPath = path.join(__dirname, "..", "deployments", `${networkName}.json`);
  if (!fs.existsSync(deploymentPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  } catch {
    return null;
  }
}

function resolveRuns(networkName) {
  const runsPath = path.join(__dirname, "..", "runs", `${networkName}.json`);
  if (!fs.existsSync(runsPath)) {
    return { runs: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(runsPath, "utf8"));
    return {
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    };
  } catch {
    return { runs: [] };
  }
}

function mkdirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function buildServices(baseUrl, agentWalletAddress, identityMetadata, paymentRail) {
  const services = [
    {
      name: "web",
      endpoint: baseUrl,
    },
    {
      name: "A2A",
      endpoint: `${baseUrl}/agent.json`,
      version: "0.3.0",
    },
    {
      name: "audit-log",
      endpoint: `${baseUrl}/agent_log.json`,
      version: "v1",
    },
    {
      name: "agentWallet",
      endpoint: agentWalletAddress,
    },
  ];

  if (identityMetadata.agentEnsName) {
    services.push({
      name: "ENS",
      endpoint: identityMetadata.agentEnsName,
      version: "v1",
    });
  }

  if (process.env.AGENT_EMAIL) {
    services.push({
      name: "email",
      endpoint: process.env.AGENT_EMAIL,
    });
  }

  if (paymentRail.walletAddress) {
    services.push({
      name: `${paymentRail.provider}-rail`,
      endpoint: paymentRail.walletAddress,
      version: paymentRail.assetSymbol || undefined,
    });
  }

  if (identityMetadata.self.proofUrl) {
    services.push({
      name: "Self",
      endpoint: identityMetadata.self.proofUrl,
      version: identityMetadata.self.verified ? "verified" : "pending",
    });
  }

  return services;
}

function buildRegistrations() {
  if (process.env.AGENT_REGISTRATIONS_JSON) {
    return parseOptionalJson(process.env.AGENT_REGISTRATIONS_JSON, []);
  }

  if (process.env.AGENT_REGISTRY && process.env.AGENT_ID) {
    return [
      {
        agentId: Number(process.env.AGENT_ID),
        agentRegistry: process.env.AGENT_REGISTRY,
      },
    ];
  }

  return [];
}

function buildSupportedTrust(identityMetadata) {
  const baseTrust = parseOptionalJson(process.env.AGENT_SUPPORTED_TRUST_JSON, ["reputation", "validation"]);
  const values = new Set(baseTrust);

  if (identityMetadata.agentEnsName || identityMetadata.ownerEnsName || identityMetadata.authorizedAgentEnsName) {
    values.add("ens-identity");
  }

  if (identityMetadata.self.verified) {
    values.add("self-verification");
  }

  return Array.from(values);
}

function buildRiskDecisions(runs, deployment) {
  return runs
    .filter((run) => run && run.riskAssessment)
    .map((run) => ({
      createdAt: run.createdAt,
      status: run.status || "unknown",
      task: run.task,
      recipient: run.recipient,
      recipientLabel: run.recipientLabel || resolveAddressLabel(run.recipient, deployment),
      amountWei: run.amountWei,
      paymentId: run.paymentId,
      transactionHash: run.transactionHash,
      riskProvider: run.riskAssessment.provider,
      verdict: run.riskAssessment.verdict,
      riskScore: String(run.riskAssessment.riskScore ?? ""),
      riskThreshold: String(run.riskAssessment.riskThreshold ?? ""),
      reasons: Array.isArray(run.riskAssessment.reasons) ? run.riskAssessment.reasons : [],
    }));
}

async function main() {
  const { ethers, network } = hre;
  const deployment = resolveDeployment(network.name) || {};
  const escrowAddress = process.env.ESCROW_ADDRESS || deployment.escrowAddress;

  if (!escrowAddress) {
    throw new Error(
      `Missing ESCROW_ADDRESS and no deployment metadata found at contracts/deployments/${network.name}.json.`
    );
  }

  const code = await ethers.provider.getCode(escrowAddress);
  if (code === "0x") {
    throw new Error(`No contract code found at ${escrowAddress} on network ${network.name}.`);
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const contract = await ethers.getContractAt("RageQuitEscrow", escrowAddress);
  const latestBlock = await ethers.provider.getBlockNumber();
  const fromBlock = Number(process.env.AGENT_LOG_FROM_BLOCK || deployment.deploymentBlock || 0);
  const decisionEvents = await contract.queryFilter(contract.filters.PaymentDecisionLogged(), fromBlock, latestBlock);
  const runLog = resolveRuns(network.name);

  const [owner, authorizedAgent, vetoWindow, spendLimit] = await Promise.all([
    contract.owner(),
    contract.authorizedAgent(),
    contract.vetoWindow(),
    contract.spendLimit(),
  ]);

  const identityMetadata = buildIdentityMetadata(deployment);
  const paymentRail = buildPaymentRailMetadata(network.name, deployment);
  const baseUrl = (process.env.AGENT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const name = process.env.AGENT_NAME || "RageQuit Escrow";
  const description =
    process.env.AGENT_DESCRIPTION ||
    "Human-vetoed autonomous payment agent that queues payouts onchain and exposes a revocable execution window.";
  const image = process.env.AGENT_IMAGE_URL || `${baseUrl}/agent-avatar.svg`;
  const registrations = buildRegistrations();
  const supportedTrust = buildSupportedTrust(identityMetadata);

  const agentCard = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name,
    description,
    image,
    services: buildServices(baseUrl, authorizedAgent, identityMetadata, paymentRail),
    x402Support: false,
    active: true,
    registrations,
    supportedTrust,
    identities: identityMetadata,
    paymentRail,
  };

  const settlementMode =
    process.env.SETTLEMENT_MODE ||
    deployment.settlementMode ||
    (deployment.settlementToken && deployment.settlementToken !== ZERO_ADDRESS ? "token" : "native");

  const agentLog = {
    type: `${baseUrl}/schemas/agent-log-v1`,
    generatedAt: new Date().toISOString(),
    network: network.name,
    chainId,
    escrowAddress,
    owner,
    ownerLabel: resolveAddressLabel(owner, deployment),
    authorizedAgent,
    authorizedAgentLabel: resolveAddressLabel(authorizedAgent, deployment),
    vetoWindowSeconds: vetoWindow.toString(),
    spendLimitWei: spendLimit.toString(),
    settlementMode,
    settlementToken: process.env.SETTLEMENT_TOKEN || deployment.settlementToken || ZERO_ADDRESS,
    swapRouterAddress: process.env.SWAP_ROUTER_ADDRESS || deployment.swapRouterAddress || null,
    swapRouterKind: process.env.SWAP_ROUTER_KIND || deployment.swapRouterKind || null,
    wrappedNativeToken: process.env.UNISWAP_WRAPPED_NATIVE_TOKEN || deployment.wrappedNativeToken || null,
    uniswapQuoterAddress: process.env.UNISWAP_QUOTER_ADDRESS || deployment.uniswapQuoterAddress || null,
    paymentRail,
    identities: identityMetadata,
    decisions: decisionEvents.map((event) => ({
      paymentId: event.args.paymentId.toString(),
      decisionType: Number(event.args.decisionType),
      decisionLabel: ["queued", "vetoed", "executed"][Number(event.args.decisionType)] || "unknown",
      actor: event.args.actor,
      actorLabel: resolveAddressLabel(event.args.actor, deployment),
      agent: event.args.agent,
      agentLabel: resolveAddressLabel(event.args.agent, deployment),
      recipient: event.args.recipient,
      recipientLabel: resolveAddressLabel(event.args.recipient, deployment),
      amountWei: event.args.amount.toString(),
      intentHash: event.args.intentHash,
      fundingReference: event.args.fundingReference,
      timestamp: event.args.timestamp.toString(),
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
    })),
    riskDecisions: buildRiskDecisions(runLog.runs, deployment),
  };

  const repoRoot = path.join(__dirname, "..", "..");
  const frontendPublicDir = path.join(repoRoot, "frontend", "public");
  const wellKnownPath = path.join(frontendPublicDir, ".well-known", "agent-registration.json");
  const rootAgentPath = path.join(repoRoot, "agent.json");
  const rootLogPath = path.join(repoRoot, "agent_log.json");
  const publicAgentPath = path.join(frontendPublicDir, "agent.json");
  const publicLogPath = path.join(frontendPublicDir, "agent_log.json");

  for (const filePath of [wellKnownPath, rootAgentPath, rootLogPath, publicAgentPath, publicLogPath]) {
    mkdirFor(filePath);
  }

  fs.writeFileSync(rootAgentPath, JSON.stringify(agentCard, null, 2));
  fs.writeFileSync(rootLogPath, JSON.stringify(agentLog, null, 2));
  fs.writeFileSync(publicAgentPath, JSON.stringify(agentCard, null, 2));
  fs.writeFileSync(publicLogPath, JSON.stringify(agentLog, null, 2));
  fs.writeFileSync(
    wellKnownPath,
    JSON.stringify(
      {
        registrations,
      },
      null,
      2
    )
  );

  console.log(`Agent card written to: ${rootAgentPath}`);
  console.log(`Agent log written to: ${rootLogPath}`);
  console.log(`Public agent artifacts updated under: ${frontendPublicDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
