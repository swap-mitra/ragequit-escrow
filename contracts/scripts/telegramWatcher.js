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

function getStateFilePath(networkName) {
  return path.join(__dirname, "..", "state", `telegram-watcher-${networkName}.json`);
}

function loadWatcherState(networkName) {
  const statePath = getStateFilePath(networkName);
  if (!fs.existsSync(statePath)) {
    return { lastProcessedBlock: null };
  }

  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { lastProcessedBlock: null };
  }
}

function saveWatcherState(networkName, state) {
  const statePath = getStateFilePath(networkName);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

async function sendTelegramMessage(botToken, chatId, message) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${body}`);
  }
}

function toShortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatMessage(networkName, escrowAddress, event) {
  const paymentId = event.args.paymentId.toString();
  const agent = event.args.agent;
  const recipient = event.args.recipient;
  const amountWei = event.args.amount.toString();
  const unlocksAt = Number(event.args.unlocksAt);
  const unlockIso = new Date(unlocksAt * 1000).toISOString();
  const txHash = event.transactionHash;

  return [
    `RageQuitEscrow alert (${networkName})`,
    `PaymentQueued #${paymentId}`,
    `Escrow: ${toShortAddress(escrowAddress)}`,
    `Agent: ${toShortAddress(agent)}`,
    `Recipient: ${toShortAddress(recipient)}`,
    `Amount (wei): ${amountWei}`,
    `Unlocks at: ${unlockIso}`,
    `Tx: ${txHash}`,
  ].join("\n");
}

async function processQueuedPayments(contract, networkName, escrowAddress, fromBlock, toBlock, botToken, chatId) {
  if (fromBlock > toBlock) {
    return;
  }

  const events = await contract.queryFilter(contract.filters.PaymentQueued(), fromBlock, toBlock);

  for (const event of events) {
    const message = formatMessage(networkName, escrowAddress, event);
    await sendTelegramMessage(botToken, chatId, message);
    console.log(`Sent Telegram alert for payment #${event.args.paymentId.toString()} in tx ${event.transactionHash}`);
  }
}

async function main() {
  const { ethers, network } = hre;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment.");
  }

  const escrowAddress = resolveEscrowAddress(network.name);
  if (!escrowAddress) {
    throw new Error(
      `Missing ESCROW_ADDRESS and no deployment file found at contracts/deployments/${network.name}.json.`
    );
  }

  const code = await ethers.provider.getCode(escrowAddress);
  if (code === "0x") {
    throw new Error(`No contract code at ${escrowAddress} on network ${network.name}.`);
  }

  const contract = await ethers.getContractAt("RageQuitEscrow", escrowAddress);
  const pollMs = Number(process.env.WATCHER_POLL_MS || "8000");
  const runOnce = String(process.env.WATCHER_ONCE || "false").toLowerCase() === "true";

  const state = loadWatcherState(network.name);

  console.log(`Telegram watcher started for network: ${network.name}`);
  console.log(`Escrow: ${escrowAddress}`);

  while (true) {
    const latestBlock = await ethers.provider.getBlockNumber();
    const configuredStart = process.env.WATCHER_START_BLOCK ? Number(process.env.WATCHER_START_BLOCK) : null;

    let fromBlock;
    if (state.lastProcessedBlock !== null) {
      fromBlock = Number(state.lastProcessedBlock) + 1;
    } else if (configuredStart !== null && !Number.isNaN(configuredStart)) {
      fromBlock = configuredStart;
    } else {
      fromBlock = Math.max(0, latestBlock - 100);
    }

    await processQueuedPayments(contract, network.name, escrowAddress, fromBlock, latestBlock, botToken, chatId);

    state.lastProcessedBlock = latestBlock;
    saveWatcherState(network.name, state);

    if (runOnce) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});