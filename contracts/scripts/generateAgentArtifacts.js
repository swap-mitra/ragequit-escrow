const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
require("dotenv").config();

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

function mkdirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

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

function buildServices(baseUrl, agentWalletAddress) {
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

  const ensName = process.env.AGENT_ENS_NAME;
  if (ensName) {
    services.push({
      name: "ENS",
      endpoint: ensName,
      version: "v1",
    });
  }

  const email = process.env.AGENT_EMAIL;
  if (email) {
    services.push({
      name: "email",
      endpoint: email,
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

async function main() {
  const { ethers, network } = hre;
  const deployment = resolveDeployment(network.name);
  const escrowAddress = process.env.ESCROW_ADDRESS || deployment?.escrowAddress;

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
  const fromBlock = Number(process.env.AGENT_LOG_FROM_BLOCK || deployment?.deploymentBlock || 0);
  const decisionEvents = await contract.queryFilter(contract.filters.PaymentDecisionLogged(), fromBlock, latestBlock);

  const [owner, authorizedAgent, vetoWindow, spendLimit] = await Promise.all([
    contract.owner(),
    contract.authorizedAgent(),
    contract.vetoWindow(),
    contract.spendLimit(),
  ]);

  const baseUrl = (process.env.AGENT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const name = process.env.AGENT_NAME || "RageQuit Escrow";
  const description =
    process.env.AGENT_DESCRIPTION ||
    "Human-vetoed autonomous payment agent that queues payouts onchain and exposes a revocable execution window.";
  const image = process.env.AGENT_IMAGE_URL || `${baseUrl}/agent-avatar.svg`;
  const registrations = buildRegistrations();
  const supportedTrust = parseOptionalJson(
    process.env.AGENT_SUPPORTED_TRUST_JSON,
    ["reputation", "validation"]
  );

  const agentCard = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name,
    description,
    image,
    services: buildServices(baseUrl, authorizedAgent),
    x402Support: false,
    active: true,
    registrations,
    supportedTrust,
  };

  const agentLog = {
    type: `${baseUrl}/schemas/agent-log-v1`,
    generatedAt: new Date().toISOString(),
    network: network.name,
    chainId,
    escrowAddress,
    owner,
    authorizedAgent,
    vetoWindowSeconds: vetoWindow.toString(),
    spendLimitWei: spendLimit.toString(),
    decisions: decisionEvents.map((event) => ({
      paymentId: event.args.paymentId.toString(),
      decisionType: Number(event.args.decisionType),
      decisionLabel: ["queued", "vetoed", "executed"][Number(event.args.decisionType)] || "unknown",
      actor: event.args.actor,
      agent: event.args.agent,
      recipient: event.args.recipient,
      amountWei: event.args.amount.toString(),
      intentHash: event.args.intentHash,
      timestamp: event.args.timestamp.toString(),
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
    })),
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
