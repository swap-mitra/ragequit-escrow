const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
require("dotenv").config();
const {
  buildIdentityMetadata,
  buildPaymentRailMetadata,
  resolveAddressLabel,
} = require("./lib/metadata");

const DEFAULT_STATE = {
  lastProcessedBlock: null,
  lastTelegramUpdateId: null,
  telegramWebhookCleared: false,
  paymentMessages: {},
};

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

function resolveEscrowAddress(networkName, deployment) {
  if (process.env.ESCROW_ADDRESS) {
    return process.env.ESCROW_ADDRESS;
  }

  return deployment?.escrowAddress || null;
}

function getStateFilePath(networkName) {
  return path.join(__dirname, "..", "state", `telegram-watcher-${networkName}.json`);
}

function normalizeWatcherState(state) {
  return {
    ...DEFAULT_STATE,
    ...(state || {}),
    paymentMessages: { ...(state?.paymentMessages || {}) },
  };
}

function loadWatcherState(networkName) {
  const statePath = getStateFilePath(networkName);
  if (!fs.existsSync(statePath)) {
    return normalizeWatcherState();
  }

  try {
    return normalizeWatcherState(JSON.parse(fs.readFileSync(statePath, "utf8")));
  } catch {
    return normalizeWatcherState();
  }
}

function saveWatcherState(networkName, state) {
  const statePath = getStateFilePath(networkName);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(normalizeWatcherState(state), null, 2));
}

async function callTelegram(botToken, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = null;
  }

  if (!response.ok || !body?.ok) {
    const error = new Error(`Telegram API error ${response.status}: ${bodyText}`);
    error.telegramStatus = response.status;
    error.telegramBody = bodyText;
    throw error;
  }

  return body.result;
}

async function sendTelegramMessage(botToken, chatId, message, options = {}) {
  return callTelegram(botToken, "sendMessage", {
    chat_id: chatId,
    text: message,
    ...options,
  });
}

async function editTelegramMessage(botToken, chatId, messageId, message, options = {}) {
  return callTelegram(botToken, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: message,
    ...options,
  });
}

async function answerCallbackQuery(botToken, callbackQueryId, text) {
  return callTelegram(botToken, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

async function deleteTelegramWebhook(botToken) {
  return callTelegram(botToken, "deleteWebhook", {
    drop_pending_updates: false,
  });
}

async function getTelegramUpdates(botToken, offset, state) {
  try {
    return await callTelegram(botToken, "getUpdates", {
      offset,
      timeout: 0,
      allowed_updates: ["callback_query", "message"],
    });
  } catch (error) {
    const body = String(error.telegramBody || error.message || "");
    const hasWebhookConflict = String(error.telegramStatus || "") === "409" || body.includes("webhook is active");
    if (!hasWebhookConflict || state.telegramWebhookCleared) {
      throw error;
    }

    await deleteTelegramWebhook(botToken);
    state.telegramWebhookCleared = true;
    return callTelegram(botToken, "getUpdates", {
      offset,
      timeout: 0,
      allowed_updates: ["callback_query", "message"],
    });
  }
}

function toShortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function describeAddress(address, deployment) {
  const label = resolveAddressLabel(address, deployment);
  return label ? `${label} (${toShortAddress(address)})` : toShortAddress(address);
}

function toUnixNow() {
  return Math.floor(Date.now() / 1000);
}

function formatDuration(totalSeconds) {
  if (totalSeconds <= 0) {
    return "0s";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`);
  }

  parts.push(`${seconds}s`);
  return parts.join(" ");
}

function getTimerBucket(secondsRemaining) {
  if (secondsRemaining <= 0) {
    return "closed";
  }

  const interval = Math.max(5, Number(process.env.WATCHER_TIMER_INTERVAL_SECONDS || "15"));
  return String(Math.floor(secondsRemaining / interval));
}

function buildReplyMarkup(networkName, paymentId, enabled) {
  if (!enabled) {
    return { inline_keyboard: [] };
  }

  return {
    inline_keyboard: [[{ text: `Veto payment #${paymentId}`, callback_data: `veto:${networkName}:${paymentId}` }]],
  };
}

function buildQueuedMessage(networkName, escrowAddress, paymentRecord, deployment, secondsRemaining) {
  const identityMetadata = buildIdentityMetadata(deployment);
  const paymentRail = buildPaymentRailMetadata(networkName, deployment);
  const unlockIso = new Date(Number(paymentRecord.unlocksAt) * 1000).toISOString();
  const lines = [
    `RageQuitEscrow alert (${networkName})`,
    `PaymentQueued #${paymentRecord.paymentId}`,
    `Escrow: ${describeAddress(escrowAddress, deployment)}`,
    `Agent: ${describeAddress(paymentRecord.agent, deployment)}`,
    `Recipient: ${describeAddress(paymentRecord.recipient, deployment)}`,
    `Amount (wei): ${paymentRecord.amountWei}`,
    `Unlocks at: ${unlockIso}`,
    `Time remaining: ${formatDuration(Math.max(0, secondsRemaining))}`,
  ];

  if (paymentRail.provider) {
    lines.push(`Rail: ${paymentRail.provider}${paymentRail.assetSymbol ? ` ${paymentRail.assetSymbol}` : ""}`);
  }

  if (identityMetadata.agentEnsName) {
    lines.push(`Agent ENS: ${identityMetadata.agentEnsName}`);
  }

  if (identityMetadata.self.verified) {
    lines.push("Operator ID: Self verified");
  }

  lines.push(`Tx: ${paymentRecord.txHash}`);
  lines.push("Action: tap veto before the timer reaches zero or send /veto.");
  return lines.join("\n");
}

function buildFinalizedMessage(networkName, escrowAddress, paymentRecord, deployment, status, decisionTxHash) {
  const baseLines = [
    `RageQuitEscrow alert (${networkName})`,
    `${status} #${paymentRecord.paymentId}`,
    `Escrow: ${describeAddress(escrowAddress, deployment)}`,
    `Agent: ${describeAddress(paymentRecord.agent, deployment)}`,
    `Recipient: ${describeAddress(paymentRecord.recipient, deployment)}`,
    `Amount (wei): ${paymentRecord.amountWei}`,
  ];

  if (decisionTxHash) {
    baseLines.push(`Tx: ${decisionTxHash}`);
  }

  return baseLines.join("\n");
}

function buildExpiredMessage(networkName, escrowAddress, paymentRecord, deployment) {
  const lines = [
    `RageQuitEscrow alert (${networkName})`,
    `Veto window closed #${paymentRecord.paymentId}`,
    `Escrow: ${describeAddress(escrowAddress, deployment)}`,
    `Recipient: ${describeAddress(paymentRecord.recipient, deployment)}`,
    `Amount (wei): ${paymentRecord.amountWei}`,
    "Timer expired. The keeper can execute this payment now.",
  ];

  return lines.join("\n");
}

function getAuthorizedVetoUserIds() {
  const raw = process.env.TELEGRAM_VETO_USER_IDS || "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function isVetoEnabled() {
  return String(process.env.TELEGRAM_VETO_ENABLED || "false").toLowerCase() === "true";
}

function canUserTriggerVeto(updateChatId, updateUserId) {
  if (String(updateChatId) !== String(process.env.TELEGRAM_CHAT_ID || "")) {
    return false;
  }

  const allowedUserIds = getAuthorizedVetoUserIds();
  if (allowedUserIds.size === 0) {
    return true;
  }

  return allowedUserIds.has(String(updateUserId));
}

async function resolveVetoSigner(ethers, contract) {
  const ownerAddress = String(await contract.owner()).toLowerCase();
  const configuredPrivateKey = process.env.TELEGRAM_VETO_PRIVATE_KEY || process.env.PRIVATE_KEY;

  if (configuredPrivateKey) {
    const signer = new ethers.Wallet(configuredPrivateKey, ethers.provider);
    if (signer.address.toLowerCase() !== ownerAddress) {
      throw new Error("TELEGRAM_VETO_PRIVATE_KEY/PRIVATE_KEY does not match the escrow owner address.");
    }

    return signer;
  }

  const signers = await ethers.getSigners();
  const ownerSigner = signers.find((signer) => signer.address.toLowerCase() === ownerAddress);
  if (!ownerSigner) {
    throw new Error("Unable to resolve an owner signer for Telegram veto. Configure TELEGRAM_VETO_PRIVATE_KEY.");
  }

  return ownerSigner;
}

function buildPaymentRecord(paymentId, event) {
  return {
    paymentId: String(paymentId),
    agent: event.args.agent,
    recipient: event.args.recipient,
    amountWei: event.args.amount.toString(),
    unlocksAt: Number(event.args.unlocksAt),
    txHash: event.transactionHash,
    status: "queued",
    lastTimerBucket: null,
  };
}

async function createQueuedAlert(networkName, escrowAddress, deployment, event, botToken, chatId, state) {
  const paymentId = event.args.paymentId.toString();
  if (state.paymentMessages[paymentId]?.messageId) {
    return;
  }

  const paymentRecord = buildPaymentRecord(paymentId, event);
  const secondsRemaining = Math.max(0, paymentRecord.unlocksAt - toUnixNow());
  const telegramResult = await sendTelegramMessage(
    botToken,
    chatId,
    buildQueuedMessage(networkName, escrowAddress, paymentRecord, deployment, secondsRemaining),
    {
      reply_markup: buildReplyMarkup(networkName, paymentId, isVetoEnabled() && secondsRemaining > 0),
    }
  );

  state.paymentMessages[paymentId] = {
    ...paymentRecord,
    chatId: String(chatId),
    messageId: telegramResult.message_id,
    lastTimerBucket: getTimerBucket(secondsRemaining),
  };

  console.log(`Sent Telegram alert for payment #${paymentId} in tx ${event.transactionHash}`);
}

async function syncDecisionEvent(contract, networkName, escrowAddress, deployment, event, botToken, chatId, state, statusLabel) {
  const paymentId = event.args.paymentId.toString();
  const existingRecord = state.paymentMessages[paymentId];
  const payment = await contract.pendingPayments(paymentId);
  const paymentRecord = {
    paymentId,
    agent: payment.agent,
    recipient: payment.recipient,
    amountWei: payment.amount.toString(),
    unlocksAt: Number(payment.unlocksAt),
    txHash: existingRecord?.txHash || event.transactionHash,
    status: statusLabel.toLowerCase(),
    chatId: existingRecord?.chatId || String(chatId),
    messageId: existingRecord?.messageId || null,
    lastTimerBucket: "closed",
  };

  const message = buildFinalizedMessage(networkName, escrowAddress, paymentRecord, deployment, statusLabel, event.transactionHash);

  if (paymentRecord.messageId) {
    try {
      await editTelegramMessage(botToken, paymentRecord.chatId, paymentRecord.messageId, message, {
        reply_markup: buildReplyMarkup(networkName, paymentId, false),
      });
    } catch (error) {
      if (!String(error.message || "").includes("message is not modified")) {
        throw error;
      }
    }
  } else {
    const telegramResult = await sendTelegramMessage(botToken, chatId, message);
    paymentRecord.messageId = telegramResult.message_id;
  }

  state.paymentMessages[paymentId] = paymentRecord;
}

async function processQueuedPayments(contract, networkName, escrowAddress, deployment, fromBlock, toBlock, botToken, chatId, state) {
  if (fromBlock > toBlock) {
    return;
  }

  const events = await contract.queryFilter(contract.filters.PaymentQueued(), fromBlock, toBlock);
  for (const event of events) {
    await createQueuedAlert(networkName, escrowAddress, deployment, event, botToken, chatId, state);
  }
}

async function processDecisionEvents(contract, networkName, escrowAddress, deployment, fromBlock, toBlock, botToken, chatId, state) {
  if (fromBlock > toBlock) {
    return;
  }

  const [vetoEvents, executedEvents] = await Promise.all([
    contract.queryFilter(contract.filters.PaymentVetoed(), fromBlock, toBlock),
    contract.queryFilter(contract.filters.PaymentExecuted(), fromBlock, toBlock),
  ]);

  for (const event of vetoEvents) {
    await syncDecisionEvent(contract, networkName, escrowAddress, deployment, event, botToken, chatId, state, "PaymentVetoed");
  }

  for (const event of executedEvents) {
    await syncDecisionEvent(contract, networkName, escrowAddress, deployment, event, botToken, chatId, state, "PaymentExecuted");
  }
}

async function refreshCountdowns(networkName, escrowAddress, deployment, botToken, state) {
  const now = toUnixNow();

  for (const [paymentId, paymentRecord] of Object.entries(state.paymentMessages)) {
    if (!paymentRecord?.messageId || paymentRecord.status !== "queued") {
      continue;
    }

    const secondsRemaining = Math.max(0, Number(paymentRecord.unlocksAt) - now);
    const nextBucket = getTimerBucket(secondsRemaining);
    if (paymentRecord.lastTimerBucket === nextBucket) {
      continue;
    }

    const isWindowOpen = secondsRemaining > 0;
    const message = isWindowOpen
      ? buildQueuedMessage(networkName, escrowAddress, paymentRecord, deployment, secondsRemaining)
      : buildExpiredMessage(networkName, escrowAddress, paymentRecord, deployment);

    try {
      await editTelegramMessage(botToken, paymentRecord.chatId, paymentRecord.messageId, message, {
        reply_markup: buildReplyMarkup(networkName, paymentId, isVetoEnabled() && isWindowOpen),
      });
      paymentRecord.lastTimerBucket = nextBucket;
      if (!isWindowOpen) {
        paymentRecord.status = "expired";
      }
    } catch (error) {
      if (!String(error.message || "").includes("message is not modified")) {
        throw error;
      }
    }
  }
}

function getLatestActivePaymentId(state) {
  const active = Object.values(state.paymentMessages)
    .filter((payment) => payment && payment.status === "queued" && Number(payment.unlocksAt) > toUnixNow())
    .sort((left, right) => Number(right.paymentId) - Number(left.paymentId));

  return active[0]?.paymentId || null;
}

async function submitTelegramVeto(ethers, contract, paymentId) {
  const signer = await resolveVetoSigner(ethers, contract);
  const tx = await contract.connect(signer).veto(paymentId);
  await tx.wait();
  return tx.hash;
}

async function handleVetoRequest(ethers, contract, update, paymentId) {
  if (!isVetoEnabled()) {
    throw new Error("Telegram veto is disabled. Set TELEGRAM_VETO_ENABLED=true to enable it.");
  }

  const callback = update.callback_query;
  const message = callback?.message || update.message;
  const chatId = String(message?.chat?.id || "");
  const userId = String(callback?.from?.id || update.message?.from?.id || "");

  if (!canUserTriggerVeto(chatId, userId)) {
    throw new Error("Telegram veto is not authorized for this chat or user.");
  }

  return submitTelegramVeto(ethers, contract, paymentId);
}

function parseVetoCommand(update, networkName, state) {
  const callbackData = update.callback_query?.data;
  if (callbackData) {
    const [action, callbackNetwork, paymentId] = callbackData.split(":");
    if (action === "veto" && callbackNetwork === networkName && paymentId) {
      return paymentId;
    }
  }

  const text = update.message?.text?.trim();
  if (!text) {
    return null;
  }

  const explicitMatch = text.match(/^\/veto(?:@\w+)?\s+(\d+)$/i);
  if (explicitMatch) {
    return explicitMatch[1];
  }

  const bareMatch = text.match(/^\/veto(?:@\w+)?$/i);
  if (bareMatch) {
    return getLatestActivePaymentId(state);
  }

  return null;
}

async function processTelegramUpdates(ethers, contract, networkName, botToken, state) {
  const offset = state.lastTelegramUpdateId === null ? undefined : Number(state.lastTelegramUpdateId) + 1;
  const updates = await getTelegramUpdates(botToken, offset, state);

  for (const update of updates) {
    state.lastTelegramUpdateId = update.update_id;
    const paymentId = parseVetoCommand(update, networkName, state);
    if (!paymentId) {
      const isBareVeto = Boolean(update.message?.text?.trim()?.match(/^\/veto(?:@\w+)?$/i));
      if (isBareVeto) {
        const chatId = update.message?.chat?.id;
        if (chatId) {
          await sendTelegramMessage(botToken, chatId, "No active pending payment found for /veto. Use /veto <paymentId> if needed.");
        }
      }
      continue;
    }

    try {
      const txHash = await handleVetoRequest(ethers, contract, update, paymentId);
      if (update.callback_query?.id) {
        await answerCallbackQuery(botToken, update.callback_query.id, `Veto submitted in tx ${txHash.slice(0, 10)}...`);
      } else {
        const chatId = update.message?.chat?.id;
        if (chatId) {
          await sendTelegramMessage(botToken, chatId, `Submitted veto for payment #${paymentId}. Tx: ${txHash}`);
        }
      }
    } catch (error) {
      const reason = String(error.message || error);
      if (update.callback_query?.id) {
        await answerCallbackQuery(botToken, update.callback_query.id, reason.slice(0, 180));
      } else {
        const chatId = update.message?.chat?.id;
        if (chatId) {
          await sendTelegramMessage(botToken, chatId, `Unable to veto payment #${paymentId}: ${reason}`);
        }
      }
    }
  }
}

async function main() {
  const { ethers, network } = hre;
  const deployment = resolveDeployment(network.name) || {};

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment.");
  }

  const escrowAddress = resolveEscrowAddress(network.name, deployment);
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
  console.log(`Telegram veto enabled: ${isVetoEnabled()}`);

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

    await processQueuedPayments(contract, network.name, escrowAddress, deployment, fromBlock, latestBlock, botToken, chatId, state);
    await processDecisionEvents(contract, network.name, escrowAddress, deployment, fromBlock, latestBlock, botToken, chatId, state);
    await refreshCountdowns(network.name, escrowAddress, deployment, botToken, state);
    await processTelegramUpdates(ethers, contract, network.name, botToken, state);

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
