const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
require("dotenv").config();
const { buildPaymentRailMetadata, resolveAddressLabel } = require("./lib/metadata");

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
  return process.env.ESCROW_ADDRESS || deployment?.escrowAddress || null;
}

function ensureRecipient(value) {
  if (!value) {
    throw new Error("Missing AGENT_RECIPIENT.");
  }

  return value;
}

function resolveAmountWei(ethers) {
  if (process.env.AGENT_AMOUNT_WEI) {
    return BigInt(process.env.AGENT_AMOUNT_WEI);
  }

  if (process.env.AGENT_AMOUNT_ETH) {
    return ethers.parseEther(process.env.AGENT_AMOUNT_ETH);
  }

  throw new Error("Missing AGENT_AMOUNT_WEI or AGENT_AMOUNT_ETH.");
}

function ensureTask() {
  const task = process.env.AGENT_TASK;
  if (!task) {
    throw new Error("Missing AGENT_TASK.");
  }

  return task;
}
function isHexBytes32(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function resolveFundingReference(ethers, rawValue) {
  if (!rawValue) {
    return ethers.ZeroHash;
  }

  return isHexBytes32(rawValue) ? rawValue : ethers.keccak256(ethers.toUtf8Bytes(rawValue));
}

function ceilDiv(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator;
}

function resolveSwapNativeAmountWei(ethers) {
  if (process.env.AGENT_SWAP_NATIVE_AMOUNT_WEI) {
    return BigInt(process.env.AGENT_SWAP_NATIVE_AMOUNT_WEI);
  }

  if (process.env.AGENT_SWAP_NATIVE_AMOUNT_ETH) {
    return ethers.parseEther(process.env.AGENT_SWAP_NATIVE_AMOUNT_ETH);
  }

  return null;
}

function buildFallbackReasoning({ task, recipient, amountWei, networkName }) {
  return {
    provider: "local-deterministic",
    summary: `Queue a revocable payment for task: ${task}`,
    checks: [
      `recipient=${recipient}`,
      `amountWei=${amountWei.toString()}`,
      `network=${networkName}`,
      "route-through-escrow=true",
    ],
    recommendedAction: "queue_payment",
    confidence: "medium",
  };
}

async function buildReasoning(input) {
  const provider = (process.env.AGENT_REASONING_PROVIDER || "local").toLowerCase();

  if (provider !== "openai") {
    return buildFallbackReasoning(input);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildFallbackReasoning(input);
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are an agent payment planner. Return a compact JSON object with summary, checks, recommendedAction, confidence. recommendedAction must be queue_payment or block_payment.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(input),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "payment_reasoning",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summary: { type: "string" },
              checks: { type: "array", items: { type: "string" } },
              recommendedAction: { type: "string", enum: ["queue_payment", "block_payment"] },
              confidence: { type: "string" },
            },
            required: ["summary", "checks", "recommendedAction", "confidence"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI reasoning request failed: ${response.status} ${body}`);
  }

  const json = await response.json();
  const outputText = json.output?.[0]?.content?.[0]?.text;
  if (!outputText) {
    throw new Error("OpenAI reasoning response did not include structured output.");
  }

  return {
    provider: `openai:${model}`,
    ...JSON.parse(outputText),
  };
}

function parseCsvList(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function extractJsonObject(text) {
  if (!text) {
    throw new Error("Venice response did not include message content.");
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("Venice response did not contain a JSON object.");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function buildLocalRiskAssessment({ task, recipient, amountWei, reasoning }) {
  const riskThreshold = Number(process.env.RISK_THRESHOLD || "70");
  const highValueWei = BigInt(process.env.RISK_HIGH_VALUE_WEI || "500000000000000000");
  const blockedRecipients = parseCsvList(process.env.RISK_BLOCKED_RECIPIENTS);
  const suspiciousKeywords = parseCsvList(process.env.RISK_SUSPICIOUS_KEYWORDS || "urgent,override,bypass,unknown");

  let riskScore = 10;
  const reasons = [];
  const lowerTask = task.toLowerCase();

  if (amountWei >= highValueWei) {
    riskScore += 35;
    reasons.push(`amount exceeds local high-value threshold ${highValueWei.toString()} wei`);
  }

  if (blockedRecipients.includes(recipient.toLowerCase())) {
    riskScore += 90;
    reasons.push("recipient is on local blocked-recipient list");
  }

  const matchedKeywords = suspiciousKeywords.filter((keyword) => lowerTask.includes(keyword));
  if (matchedKeywords.length > 0) {
    riskScore += 20;
    reasons.push(`task matched suspicious keywords: ${matchedKeywords.join(", ")}`);
  }

  if (reasoning.confidence === "low") {
    riskScore += 15;
    reasons.push("agent reasoning confidence is low");
  }

  const verdict = riskScore >= riskThreshold ? "block_payment" : "queue_payment";
  if (reasons.length === 0) {
    reasons.push("no elevated local risk signals triggered");
  }

  return {
    provider: "local-risk",
    private: true,
    verdict,
    riskScore,
    riskThreshold,
    reasons,
  };
}

async function buildVeniceRiskAssessment(input) {
  const apiKey = process.env.VENICE_API_KEY;
  const apiUrl = process.env.VENICE_API_URL || "https://api.venice.ai/api/v1/chat/completions";

  if (!apiKey) {
    return buildLocalRiskAssessment(input);
  }

  const riskThreshold = Number(process.env.RISK_THRESHOLD || "70");
  const model = process.env.VENICE_MODEL || "venice-uncensored";
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a private payment risk analyst. Review the proposed payment and return only a JSON object with keys riskScore, reasons, and verdict. riskScore must be an integer from 0 to 100. verdict must be queue_payment or block_payment. Keep reasons concise.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: input.task,
            recipient: input.recipient,
            amountWei: input.amountWei.toString(),
            network: input.networkName,
            reasoning: input.reasoning,
            metadata: {
              escrowAddress: input.escrowAddress,
            },
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Venice risk request failed: ${response.status} ${body}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  const parsed = typeof content === "string" ? extractJsonObject(content) : payload;
  const rawScore = Number(parsed.riskScore ?? parsed.score ?? 0);
  const normalizedScore = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0;
  const verdict = parsed.verdict === "block_payment" || normalizedScore >= riskThreshold ? "block_payment" : "queue_payment";
  const reasons = Array.isArray(parsed.reasons) && parsed.reasons.length > 0 ? parsed.reasons : ["venice risk score returned without reasons"];

  return {
    provider: `venice:${model}`,
    private: true,
    verdict,
    riskScore: normalizedScore,
    riskThreshold,
    reasons,
    raw: payload,
  };
}

async function buildRiskAssessment(input) {
  const provider = (process.env.RISK_PROVIDER || "local").toLowerCase();

  if (provider === "venice") {
    return buildVeniceRiskAssessment(input);
  }

  return buildLocalRiskAssessment(input);
}

function buildIntentPayload({ task, recipient, amountWei, networkName, escrowAddress, reasoning }) {
  return {
    version: 1,
    task,
    recipient,
    amountWei: amountWei.toString(),
    network: networkName,
    escrowAddress,
    createdAt: new Date().toISOString(),
    reasoning,
  };
}
function isTruthy(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
}

function resolveSwapRouterKind(deployment) {
  if (process.env.SWAP_ROUTER_KIND) {
    return process.env.SWAP_ROUTER_KIND.toLowerCase();
  }

  if (deployment?.swapRouterKind) {
    return String(deployment.swapRouterKind).toLowerCase();
  }

  return deployment?.mockSwapRouterAddress ? "mock" : "uniswap-v3";
}

function resolveSwapMinAmountOut(amountWei, quotedAmountOut) {
  if (process.env.AGENT_SWAP_MIN_AMOUNT_OUT) {
    return BigInt(process.env.AGENT_SWAP_MIN_AMOUNT_OUT);
  }

  if (quotedAmountOut !== null) {
    const slippageBps = BigInt(process.env.UNISWAP_SLIPPAGE_BPS || "500");
    const boundedSlippageBps = slippageBps > 10_000n ? 10_000n : slippageBps;
    const minFromQuote = (quotedAmountOut * (10_000n - boundedSlippageBps)) / 10_000n;
    return minFromQuote > amountWei ? minFromQuote : amountWei;
  }

  return amountWei;
}

function resolveSwapDeadline() {
  const deadlineSeconds = Number(process.env.UNISWAP_DEADLINE_SECONDS || "300");
  return Math.floor(Date.now() / 1000) + deadlineSeconds;
}

function buildSwapQuoteId({ ethers, task, recipient, amountWei, networkName, escrowAddress }) {
  return ethers.keccak256(
    ethers.toUtf8Bytes(
      JSON.stringify({
        version: 1,
        type: "swap-native-for-token",
        task,
        recipient,
        amountWei: amountWei.toString(),
        network: networkName,
        escrowAddress,
        createdAt: new Date().toISOString(),
      })
    )
  );
}

async function prepareMockFunding({
  ethers,
  swapRouterAddress,
  task,
  recipient,
  amountWei,
  networkName,
  escrowAddress,
  settlementMode,
  settlementToken,
  fundingMode,
  signer,
}) {
  const router = await ethers.getContractAt(
    [
      "function rateNumerator() external view returns (uint256)",
      "function rateDenominator() external view returns (uint256)",
      "function quoteExactNativeForToken(uint256 amountIn) external view returns (uint256)",
      "function swapExactNativeForToken(address token,address recipient,uint256 minAmountOut,bytes32 quoteId) external payable returns (uint256 amountOut)",
    ],
    swapRouterAddress
  );

  const [rateNumerator, rateDenominator] = await Promise.all([
    router.rateNumerator(),
    router.rateDenominator(),
  ]);

  const configuredNativeAmountWei = resolveSwapNativeAmountWei(ethers);
  const nativeAmountInWei =
    configuredNativeAmountWei ??
    ceilDiv(BigInt(amountWei) * BigInt(rateDenominator), BigInt(rateNumerator));

  if (nativeAmountInWei <= 0n) {
    throw new Error("Resolved native swap input must be greater than zero.");
  }

  const quotedAmountOut = await router.quoteExactNativeForToken(nativeAmountInWei);
  if (quotedAmountOut < amountWei) {
    throw new Error(
      "Swap quote " + quotedAmountOut + " is below requested token payout " + amountWei + ". Increase AGENT_SWAP_NATIVE_AMOUNT_WEI or reduce AGENT_AMOUNT_WEI."
    );
  }

  const quoteId = buildSwapQuoteId({
    ethers,
    task,
    recipient,
    amountWei,
    networkName,
    escrowAddress,
  });

  const swapTx = await router
    .connect(signer)
    .swapExactNativeForToken(settlementToken, escrowAddress, amountWei, quoteId, {
      value: nativeAmountInWei,
    });
  const swapReceipt = await swapTx.wait();

  return {
    settlementMode,
    settlementToken,
    fundingMode,
    fundingReference: quoteId,
    fundingDetails: {
      routerKind: "mock",
      swapRouterAddress,
      swapQuoteId: quoteId,
      swapTransactionHash: swapReceipt.hash,
      swapBlockNumber: swapReceipt.blockNumber,
      nativeAmountInWei: nativeAmountInWei.toString(),
      quotedAmountOut: quotedAmountOut.toString(),
      minAmountOut: amountWei.toString(),
    },
  };
}

async function quoteUniswapV3AmountOut({ ethers, quoterAddress, wrappedNativeToken, settlementToken, amountIn, poolFee }) {
  if (!quoterAddress) {
    return null;
  }

  const quoter = await ethers.getContractAt(
    [
      "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
    ],
    quoterAddress
  );

  const quote = await quoter.quoteExactInputSingle.staticCall({
    tokenIn: wrappedNativeToken,
    tokenOut: settlementToken,
    amountIn,
    fee: poolFee,
    sqrtPriceLimitX96: 0,
  });

  return BigInt(quote.amountOut ?? quote[0]);
}

async function prepareUniswapV3Funding({
  ethers,
  deployment,
  swapRouterAddress,
  task,
  recipient,
  amountWei,
  networkName,
  escrowAddress,
  settlementMode,
  settlementToken,
  fundingMode,
  signer,
}) {
  const wrappedNativeToken =
    process.env.UNISWAP_WRAPPED_NATIVE_TOKEN || deployment?.wrappedNativeToken || null;
  const quoterAddress = process.env.UNISWAP_QUOTER_ADDRESS || deployment?.uniswapQuoterAddress || null;
  const poolFee = Number(process.env.UNISWAP_POOL_FEE || deployment?.uniswapPoolFee || "3000");
  const routerHasDeadline = isTruthy(
    process.env.UNISWAP_ROUTER_HAS_DEADLINE,
    Boolean(deployment?.uniswapRouterHasDeadline)
  );

  if (!wrappedNativeToken) {
    throw new Error(
      "Real Uniswap funding requires UNISWAP_WRAPPED_NATIVE_TOKEN or wrappedNativeToken in deployment metadata."
    );
  }

  const nativeAmountInWei = resolveSwapNativeAmountWei(ethers);
  if (nativeAmountInWei === null || nativeAmountInWei <= 0n) {
    throw new Error(
      "Real router funding requires AGENT_SWAP_NATIVE_AMOUNT_WEI or AGENT_SWAP_NATIVE_AMOUNT_ETH."
    );
  }

  const token = await ethers.getContractAt(
    ["function balanceOf(address account) external view returns (uint256)"],
    settlementToken
  );
  const beforeBalance = await token.balanceOf(escrowAddress);
  const quotedAmountOut = await quoteUniswapV3AmountOut({
    ethers,
    quoterAddress,
    wrappedNativeToken,
    settlementToken,
    amountIn: nativeAmountInWei,
    poolFee,
  });
  const minAmountOut = resolveSwapMinAmountOut(amountWei, quotedAmountOut);
  if (quotedAmountOut !== null && quotedAmountOut < minAmountOut) {
    throw new Error(
      "Quoted output " + quotedAmountOut + " is below required minimum " + minAmountOut + ". Reduce AGENT_SWAP_MIN_AMOUNT_OUT, increase AGENT_SWAP_NATIVE_AMOUNT_WEI, or adjust slippage."
    );
  }

  const quoteId = resolveFundingReference(
    ethers,
    process.env.AGENT_FUNDING_REFERENCE ||
      buildSwapQuoteId({
        ethers,
        task,
        recipient,
        amountWei,
        networkName,
        escrowAddress,
      })
  );

  const abi = routerHasDeadline
    ? [
        "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)",
      ]
    : [
        "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)",
      ];
  const router = await ethers.getContractAt(abi, swapRouterAddress);

  const params = routerHasDeadline
    ? {
        tokenIn: wrappedNativeToken,
        tokenOut: settlementToken,
        fee: poolFee,
        recipient: escrowAddress,
        deadline: resolveSwapDeadline(),
        amountIn: nativeAmountInWei,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: 0,
      }
    : {
        tokenIn: wrappedNativeToken,
        tokenOut: settlementToken,
        fee: poolFee,
        recipient: escrowAddress,
        amountIn: nativeAmountInWei,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: 0,
      };

  const swapTx = await router.connect(signer).exactInputSingle(params, {
    value: nativeAmountInWei,
  });
  const swapReceipt = await swapTx.wait();
  const afterBalance = await token.balanceOf(escrowAddress);
  const fundedAmountOut = afterBalance - beforeBalance;

  if (fundedAmountOut < amountWei) {
    throw new Error(
      "Swap funded " + fundedAmountOut + " settlement-token units, below required payout " + amountWei + "."
    );
  }

  return {
    settlementMode,
    settlementToken,
    fundingMode,
    fundingReference: quoteId,
    fundingDetails: {
      routerKind: "uniswap-v3",
      swapRouterAddress,
      swapQuoteId: quoteId,
      swapTransactionHash: swapReceipt.hash,
      swapBlockNumber: swapReceipt.blockNumber,
      nativeAmountInWei: nativeAmountInWei.toString(),
      quotedAmountOut: quotedAmountOut === null ? null : quotedAmountOut.toString(),
      actualAmountOut: fundedAmountOut.toString(),
      minAmountOut: minAmountOut.toString(),
      wrappedNativeToken,
      quoterAddress,
      poolFee,
      routerHasDeadline,
    },
  };
}

async function maybePrepareFunding({
  ethers,
  deployment,
  networkName,
  task,
  recipient,
  amountWei,
  escrowAddress,
  signer,
}) {
  const settlementMode = (process.env.SETTLEMENT_MODE || deployment?.settlementMode || "native").toLowerCase();
  const settlementToken = process.env.SETTLEMENT_TOKEN || deployment?.settlementToken || ethers.ZeroAddress;
  const swapRouterAddress = process.env.SWAP_ROUTER_ADDRESS || deployment?.swapRouterAddress || null;
  const swapRouterKind = resolveSwapRouterKind(deployment);
  const requestedFundingMode = (process.env.AGENT_FUNDING_MODE || "").toLowerCase();
  const fundingMode =
    settlementMode === "token"
      ? requestedFundingMode || "direct"
      : requestedFundingMode || "native";

  if (settlementMode !== "token") {
    return {
      settlementMode,
      settlementToken,
      fundingMode,
      fundingReference: ethers.ZeroHash,
      fundingDetails: null,
    };
  }

  if (fundingMode === "direct") {
    return {
      settlementMode,
      settlementToken,
      fundingMode,
      fundingReference: resolveFundingReference(ethers, process.env.AGENT_FUNDING_REFERENCE),
      fundingDetails: {
        routerKind: swapRouterAddress ? swapRouterKind : null,
      },
    };
  }

  if (fundingMode !== "swap-native") {
    throw new Error(
      "Unsupported AGENT_FUNDING_MODE " + fundingMode + ". Use direct or swap-native for token settlement."
    );
  }

  if (!swapRouterAddress) {
    throw new Error(
      "AGENT_FUNDING_MODE=swap-native requires swapRouterAddress in deployment metadata or SWAP_ROUTER_ADDRESS in env."
    );
  }

  if (swapRouterKind === "mock") {
    return prepareMockFunding({
      ethers,
      swapRouterAddress,
      task,
      recipient,
      amountWei,
      networkName,
      escrowAddress,
      settlementMode,
      settlementToken,
      fundingMode,
      signer,
    });
  }

  if (swapRouterKind === "uniswap-v3") {
    return prepareUniswapV3Funding({
      ethers,
      deployment,
      swapRouterAddress,
      task,
      recipient,
      amountWei,
      networkName,
      escrowAddress,
      settlementMode,
      settlementToken,
      fundingMode,
      signer,
    });
  }

  throw new Error("Unsupported SWAP_ROUTER_KIND " + swapRouterKind + ". Use mock or uniswap-v3.");
}

async function resolveAgentSigner(ethers, provider, authorizedAgent) {
  const explicitKey = process.env.AGENT_RUNNER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (explicitKey) {
    const wallet = new ethers.Wallet(explicitKey, provider);
    if (wallet.address.toLowerCase() !== authorizedAgent.toLowerCase()) {
      throw new Error(
        `Configured runner wallet ${wallet.address} does not match authorizedAgent ${authorizedAgent}.`
      );
    }

    return wallet;
  }

  const signers = await ethers.getSigners();
  const matchedSigner = signers.find((signer) => signer.address.toLowerCase() === authorizedAgent.toLowerCase());
  if (!matchedSigner) {
    throw new Error(
      `No local signer matched authorizedAgent ${authorizedAgent}. Set AGENT_RUNNER_PRIVATE_KEY for this network.`
    );
  }

  return matchedSigner;
}

function persistRun(networkName, runRecord) {
  const runsDir = path.join(__dirname, "..", "runs");
  fs.mkdirSync(runsDir, { recursive: true });

  const filePath = path.join(runsDir, `${networkName}.json`);
  const current = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : { runs: [] };
  current.runs.push(runRecord);
  fs.writeFileSync(filePath, JSON.stringify(current, null, 2));

  return filePath;
}

async function maybeRefreshArtifacts(networkName) {
  if (String(process.env.AGENT_REFRESH_ARTIFACTS || "true").toLowerCase() !== "true") {
    return;
  }

  const { spawnSync } = require("node:child_process");
  const npmCmd = process.platform === "win32" ? "C:\\Program Files\\nodejs\\npm.cmd" : "npm";
  const result = spawnSync(npmCmd, ["run", `contracts:artifacts:${networkName}`], {
    cwd: path.join(__dirname, "..", ".."),
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    console.warn(`Artifact refresh failed with exit code ${result.status}.`);
  }
}

async function persistBlockedRunAndRefresh(networkName, runRecord, message) {
  const runFilePath = persistRun(networkName, runRecord);
  console.log(`${message} Run log written to: ${runFilePath}`);
  await maybeRefreshArtifacts(networkName);
}

async function main() {
  const { ethers, network } = hre;
  const deployment = resolveDeployment(network.name);
  const escrowAddress = resolveEscrowAddress(network.name, deployment);
  if (!escrowAddress) {
    throw new Error(
      `Missing ESCROW_ADDRESS and no deployment metadata found at contracts/deployments/${network.name}.json.`
    );
  }

  const task = ensureTask();
  const recipient = ensureRecipient(process.env.AGENT_RECIPIENT);
  const amountWei = resolveAmountWei(ethers);
  const contract = await ethers.getContractAt("RageQuitEscrow", escrowAddress);
  const [authorizedAgent, spendLimit] = await Promise.all([contract.authorizedAgent(), contract.spendLimit()]);

  if (amountWei > spendLimit) {
    throw new Error(`Amount ${amountWei} exceeds contract spendLimit ${spendLimit}.`);
  }

  const paymentRail = buildPaymentRailMetadata(network.name, deployment || {});
  const recipientLabel = resolveAddressLabel(recipient, deployment || {});

  const reasoningInput = {
    task,
    recipient,
    amountWei: amountWei.toString(),
    networkName: network.name,
    escrowAddress,
  };
  const reasoning = await buildReasoning(reasoningInput);
  const riskAssessment = await buildRiskAssessment({
    task,
    recipient,
    amountWei,
    networkName: network.name,
    escrowAddress,
    reasoning,
  });

  const baseRunRecord = {
    createdAt: new Date().toISOString(),
    network: network.name,
    escrowAddress,
    authorizedAgent,
    task,
    recipient,
    recipientLabel,
    amountWei: amountWei.toString(),
    paymentRail,
    reasoning,
    riskAssessment,
  };

  if (reasoning.recommendedAction !== "queue_payment") {
    await persistBlockedRunAndRefresh(
      network.name,
      {
        ...baseRunRecord,
        status: "blocked_by_reasoning",
        intentHash: null,
        intent: null,
        paymentId: null,
        transactionHash: null,
        blockNumber: null,
      },
      "Payment blocked by reasoning."
    );
    return;
  }

  if (riskAssessment.verdict !== "queue_payment") {
    await persistBlockedRunAndRefresh(
      network.name,
      {
        ...baseRunRecord,
        status: "blocked_by_risk",
        intentHash: null,
        intent: null,
        paymentId: null,
        transactionHash: null,
        blockNumber: null,
      },
      "Payment blocked by private risk check."
    );
    return;
  }

  const intentPayload = buildIntentPayload({
    task,
    recipient,
    amountWei,
    networkName: network.name,
    escrowAddress,
    reasoning,
  });
  const intentJson = JSON.stringify(intentPayload);
  const intentHash = ethers.keccak256(ethers.toUtf8Bytes(intentJson));

  const signer = await resolveAgentSigner(ethers, ethers.provider, authorizedAgent);
  const funding = await maybePrepareFunding({
    ethers,
    deployment,
    networkName: network.name,
    task,
    recipient,
    amountWei,
    escrowAddress,
    signer,
  });

  const queueTx =
    funding.fundingReference === ethers.ZeroHash
      ? await contract.connect(signer).initiate(recipient, amountWei, intentHash)
      : await contract
          .connect(signer)
          .initiateWithFundingReference(recipient, amountWei, intentHash, funding.fundingReference);
  const receipt = await queueTx.wait();

  const paymentQueuedLog = receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "PaymentQueued");

  const runRecord = {
    ...baseRunRecord,
    status: "queued_onchain",
    settlementMode: funding.settlementMode,
    settlementToken: funding.settlementToken,
    fundingMode: funding.fundingMode,
    fundingReference: funding.fundingReference,
    fundingDetails: funding.fundingDetails,
    intentHash,
    intent: intentPayload,
    paymentId: paymentQueuedLog ? paymentQueuedLog.args.paymentId.toString() : null,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };

  const runFilePath = persistRun(network.name, runRecord);
  console.log(`Queued payment via escrow: ${receipt.hash}`);
  console.log(`Payment ID: ${runRecord.paymentId ?? "unknown"}`);
  console.log(`Intent hash: ${intentHash}`);
  console.log(`Agent run log written to: ${runFilePath}`);

  await maybeRefreshArtifacts(network.name);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});







