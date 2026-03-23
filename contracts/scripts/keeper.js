const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
require("dotenv").config();

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

async function runKeeperPass(escrow, runner) {
  const provider = hre.ethers.provider;
  const networkName = hre.network.name;
  const maxScan = Number(process.env.KEEPER_MAX_SCAN || "50");

  if (networkName === "localhost" || networkName === "hardhat") {
    await provider.send("evm_mine", []);
  }

  const latestBlock = await provider.getBlock("latest");
  if (!latestBlock) {
    throw new Error("Unable to load the latest block while running keeper.");
  }

  const now = Number(latestBlock.timestamp);
  const nextPaymentId = Number(await escrow.nextPaymentId());
  const firstPaymentId = Math.max(0, nextPaymentId - maxScan);

  console.log(`Keeper scan at chain time ${new Date(now * 1000).toISOString()} (${now})`);

  for (let id = firstPaymentId; id < nextPaymentId; id += 1) {
    const payment = await escrow.pendingPayments(id);

    if (payment.executed || payment.vetoed) {
      continue;
    }

    if (payment.unlocksAt > BigInt(now)) {
      console.log(`Skipping payment ${id}; unlocks at ${payment.unlocksAt.toString()}.`);
      continue;
    }

    console.log(`Executing expired payment ${id}...`);
    const tx = await escrow.connect(runner).execute(id);
    await tx.wait();
    console.log(`Payment ${id} executed.`);
  }
}

async function main() {
  const { ethers, network } = hre;

  const escrowAddress = resolveEscrowAddress(network.name);
  if (!escrowAddress) {
    throw new Error(
      `Missing ESCROW_ADDRESS and no deployment file found at contracts/deployments/${network.name}.json.`
    );
  }

  const [runner] = await ethers.getSigners();
  const code = await ethers.provider.getCode(escrowAddress);
  if (code === "0x") {
    throw new Error(`No contract code at ${escrowAddress} on network ${network.name}.`);
  }

  const escrow = await ethers.getContractAt("RageQuitEscrow", escrowAddress);

  const pollMs = Number(process.env.KEEPER_POLL_MS || "10000");
  const runOnce = String(process.env.KEEPER_ONCE || "false").toLowerCase() === "true";

  console.log(`Keeper runner: ${runner.address}`);
  console.log(`Watching escrow: ${escrowAddress}`);

  if (runOnce) {
    await runKeeperPass(escrow, runner);
    return;
  }

  while (true) {
    await runKeeperPass(escrow, runner);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
