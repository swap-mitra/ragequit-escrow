const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
require("dotenv").config();
const { createSmartAccountContext } = require("./lib/smartAccounts");

function isTruthy(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === "true";
}

async function maybeDeployLocalSettlementStack({ ethers, network, deployer }) {
  const wantsTokenMode = (process.env.SETTLEMENT_MODE || "native").toLowerCase() === "token";
  if (network.name !== "localhost" || !wantsTokenMode) {
    return {
      settlementMode: wantsTokenMode ? "token" : "native",
      settlementToken: process.env.SETTLEMENT_TOKEN || ethers.ZeroAddress,
      mockTokenAddress: null,
      swapRouterAddress: process.env.SWAP_ROUTER_ADDRESS || null,
      swapRouterKind: process.env.SWAP_ROUTER_KIND || (process.env.SWAP_ROUTER_ADDRESS ? "uniswap-v3" : null),
      wrappedNativeToken: process.env.UNISWAP_WRAPPED_NATIVE_TOKEN || null,
      uniswapQuoterAddress: process.env.UNISWAP_QUOTER_ADDRESS || null,
      uniswapPoolFee: Number(process.env.UNISWAP_POOL_FEE || "3000"),
      uniswapRouterHasDeadline: isTruthy(process.env.UNISWAP_ROUTER_HAS_DEADLINE, false),
      mockSwapRouterAddress: null,
    };
  }

  let settlementToken = process.env.SETTLEMENT_TOKEN || null;
  let mockTokenAddress = null;
  if (!settlementToken && isTruthy(process.env.LOCAL_DEPLOY_MOCK_TOKEN, true)) {
    const decimals = Number(process.env.LOCAL_MOCK_TOKEN_DECIMALS || "6");
    const initialSupply = BigInt(process.env.LOCAL_MOCK_TOKEN_SUPPLY || "1000000000000");
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy(
      process.env.LOCAL_MOCK_TOKEN_NAME || "Mock Celo Dollar",
      process.env.LOCAL_MOCK_TOKEN_SYMBOL || "mcUSD",
      decimals,
      deployer.address,
      initialSupply
    );
    await token.waitForDeployment();
    settlementToken = await token.getAddress();
    mockTokenAddress = settlementToken;
  }

  let swapRouterAddress = process.env.SWAP_ROUTER_ADDRESS || null;
  let mockSwapRouterAddress = null;
  if (!swapRouterAddress && settlementToken && isTruthy(process.env.LOCAL_DEPLOY_MOCK_SWAP_ROUTER, true)) {
    const Router = await ethers.getContractFactory("MockSwapRouter");
    const router = await Router.deploy(
      BigInt(process.env.LOCAL_SWAP_RATE_NUMERATOR || "1000"),
      BigInt(process.env.LOCAL_SWAP_RATE_DENOMINATOR || "1")
    );
    await router.waitForDeployment();
    swapRouterAddress = await router.getAddress();
    mockSwapRouterAddress = swapRouterAddress;
  }

  return {
    settlementMode: settlementToken ? "token" : "native",
    settlementToken: settlementToken || ethers.ZeroAddress,
    mockTokenAddress,
    swapRouterAddress,
    swapRouterKind: mockSwapRouterAddress ? "mock" : process.env.SWAP_ROUTER_KIND || (swapRouterAddress ? "uniswap-v3" : null),
    wrappedNativeToken: process.env.UNISWAP_WRAPPED_NATIVE_TOKEN || null,
    uniswapQuoterAddress: process.env.UNISWAP_QUOTER_ADDRESS || null,
    uniswapPoolFee: Number(process.env.UNISWAP_POOL_FEE || "3000"),
    uniswapRouterHasDeadline: isTruthy(process.env.UNISWAP_ROUTER_HAS_DEADLINE, false),
    mockSwapRouterAddress,
  };
}

async function maybeFundEscrow({ ethers, deployer, escrow, settlementToken }) {
  const escrowAddress = await escrow.getAddress();

  if (settlementToken === ethers.ZeroAddress) {
    const initialFundWei = BigInt(process.env.INITIAL_FUND_WEI || ethers.parseEther("10").toString());
    if (initialFundWei === 0n) {
      return { initialFundWei: "0", initialFundTokenUnits: null };
    }

    const tx = await deployer.sendTransaction({
      to: escrowAddress,
      value: initialFundWei,
    });
    await tx.wait();
    console.log(`Funded contract with ${initialFundWei} wei`);
    return { initialFundWei: initialFundWei.toString(), initialFundTokenUnits: null };
  }

  const initialFundTokenUnits = BigInt(process.env.INITIAL_FUND_TOKEN_UNITS || "0");
  if (initialFundTokenUnits === 0n) {
    return { initialFundWei: null, initialFundTokenUnits: "0" };
  }

  const token = await ethers.getContractAt(
    [
      "function approve(address spender,uint256 amount) external returns (bool)",
      "function balanceOf(address account) external view returns (uint256)",
      "function decimals() external view returns (uint8)",
      "function symbol() external view returns (string)",
    ],
    settlementToken
  );

  const approvalTx = await token.connect(deployer).approve(escrowAddress, initialFundTokenUnits);
  await approvalTx.wait();
  const fundTx = await escrow.connect(deployer).fundToken(initialFundTokenUnits);
  await fundTx.wait();
  console.log(`Funded contract with ${initialFundTokenUnits} settlement-token units`);

  return {
    initialFundWei: null,
    initialFundTokenUnits: initialFundTokenUnits.toString(),
  };
}

async function main() {
  const { ethers, network } = hre;
  const [deployer, fallbackAgent] = await ethers.getSigners();

  const owner = process.env.ESCROW_OWNER || deployer.address;
  const vetoWindowSeconds = Number(process.env.VETO_WINDOW_SECONDS || "60");
  const spendLimitWei = BigInt(process.env.SPEND_LIMIT_WEI || ethers.parseEther("1").toString());
  const deploySmartAccountEnvironment = isTruthy(process.env.SMART_ACCOUNT_DEPLOY_ENVIRONMENT, false);

  let authorizedAgent = process.env.AUTHORIZED_AGENT || fallbackAgent.address;
  let authorizationMode = "raw-address";
  let smartAccountOwnerAddress = null;

  if (!process.env.AUTHORIZED_AGENT && process.env.SMART_ACCOUNT_OWNER_PRIVATE_KEY) {
    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    const smartAccountContext = await createSmartAccountContext({
      chainId,
      networkName: network.name,
      ownerPrivateKey: process.env.SMART_ACCOUNT_OWNER_PRIVATE_KEY,
      deployEnvironmentIfMissing: deploySmartAccountEnvironment,
    });

    authorizedAgent = smartAccountContext.smartAccount.address;
    smartAccountOwnerAddress = smartAccountContext.ownerAccount.address;
    authorizationMode = "metamask-smart-account";
  }

  const settlementConfig = await maybeDeployLocalSettlementStack({
    ethers,
    network,
    deployer,
  });

  const Escrow = await ethers.getContractFactory("RageQuitEscrow");
  const escrow = await Escrow.deploy(
    owner,
    authorizedAgent,
    vetoWindowSeconds,
    spendLimitWei,
    settlementConfig.settlementToken
  );
  const deploymentTx = escrow.deploymentTransaction();
  const deploymentReceipt = deploymentTx ? await deploymentTx.wait() : null;
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const fundingSummary = await maybeFundEscrow({
    ethers,
    deployer,
    escrow,
    settlementToken: settlementConfig.settlementToken,
  });

  console.log(`RageQuitEscrow deployed at: ${escrowAddress}`);
  console.log(`Owner: ${owner}`);
  console.log(`Authorized agent: ${authorizedAgent}`);
  console.log(`Authorization mode: ${authorizationMode}`);
  if (smartAccountOwnerAddress) {
    console.log(`Smart account owner: ${smartAccountOwnerAddress}`);
  }
  console.log(`Settlement mode: ${settlementConfig.settlementMode}`);
  console.log(`Settlement token: ${settlementConfig.settlementToken}`);
  if (settlementConfig.swapRouterAddress) {
    console.log(`Swap router: ${settlementConfig.swapRouterAddress}`);
    console.log(`Swap router kind: ${settlementConfig.swapRouterKind}`);
  }
  console.log(`Veto window (seconds): ${vetoWindowSeconds}`);
  console.log(`Spend limit (units): ${spendLimitWei}`);

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const deploymentPath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(
    deploymentPath,
    JSON.stringify(
      {
        network: network.name,
        chainId,
        escrowAddress,
        owner,
        authorizedAgent,
        authorizationMode,
        smartAccountOwnerAddress,
        vetoWindowSeconds,
        spendLimitWei: spendLimitWei.toString(),
        settlementMode: settlementConfig.settlementMode,
        settlementToken: settlementConfig.settlementToken,
        swapRouterAddress: settlementConfig.swapRouterAddress,
        swapRouterKind: settlementConfig.swapRouterKind,
        wrappedNativeToken: settlementConfig.wrappedNativeToken,
        uniswapQuoterAddress: settlementConfig.uniswapQuoterAddress,
        uniswapPoolFee: settlementConfig.uniswapPoolFee,
        uniswapRouterHasDeadline: settlementConfig.uniswapRouterHasDeadline,
        paymentRailProvider: process.env.PAYMENT_RAIL_PROVIDER || null,
        paymentRailNetwork: process.env.PAYMENT_RAIL_NETWORK || network.name,
        paymentRailAssetSymbol: process.env.PAYMENT_RAIL_ASSET_SYMBOL || null,
        paymentRailAssetAddress: process.env.PAYMENT_RAIL_ASSET_ADDRESS || settlementConfig.settlementToken,
        paymentRailWalletAddress: process.env.PAYMENT_RAIL_WALLET_ADDRESS || null,
        paymentRailWalletLabel: process.env.PAYMENT_RAIL_WALLET_LABEL || null,
        paymentRailPolicyUrl: process.env.PAYMENT_RAIL_POLICY_URL || null,
        paymentRailNotes: process.env.PAYMENT_RAIL_NOTES || null,
        addressBook: process.env.ADDRESS_BOOK_JSON ? JSON.parse(process.env.ADDRESS_BOOK_JSON) : {},
        mockTokenAddress: settlementConfig.mockTokenAddress,
        mockSwapRouterAddress: settlementConfig.mockSwapRouterAddress,
        initialFundWei: fundingSummary.initialFundWei,
        initialFundTokenUnits: fundingSummary.initialFundTokenUnits,
        deploymentBlock: deploymentReceipt ? Number(deploymentReceipt.blockNumber) : null,
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(`Deployment metadata written to: ${deploymentPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});



