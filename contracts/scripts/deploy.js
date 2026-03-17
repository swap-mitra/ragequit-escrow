const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
require("dotenv").config();
const { createSmartAccountContext } = require("./lib/smartAccounts");

async function main() {
  const { ethers, network } = hre;
  const [deployer, fallbackAgent] = await ethers.getSigners();

  const owner = process.env.ESCROW_OWNER || deployer.address;
  const vetoWindowSeconds = Number(process.env.VETO_WINDOW_SECONDS || "60");
  const spendLimitWei = BigInt(process.env.SPEND_LIMIT_WEI || ethers.parseEther("1").toString());
  const initialFundWei = BigInt(process.env.INITIAL_FUND_WEI || ethers.parseEther("10").toString());
  const deploySmartAccountEnvironment =
    String(process.env.SMART_ACCOUNT_DEPLOY_ENVIRONMENT || "false").toLowerCase() === "true";

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

  const Escrow = await ethers.getContractFactory("RageQuitEscrow");
  const escrow = await Escrow.deploy(owner, authorizedAgent, vetoWindowSeconds, spendLimitWei);
  const deploymentTx = escrow.deploymentTransaction();
  const deploymentReceipt = deploymentTx ? await deploymentTx.wait() : null;
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log(`RageQuitEscrow deployed at: ${escrowAddress}`);
  console.log(`Owner: ${owner}`);
  console.log(`Authorized agent: ${authorizedAgent}`);
  console.log(`Authorization mode: ${authorizationMode}`);
  if (smartAccountOwnerAddress) {
    console.log(`Smart account owner: ${smartAccountOwnerAddress}`);
  }
  console.log(`Veto window (seconds): ${vetoWindowSeconds}`);
  console.log(`Spend limit (wei): ${spendLimitWei}`);

  if (initialFundWei > 0n) {
    const tx = await deployer.sendTransaction({
      to: escrowAddress,
      value: initialFundWei,
    });
    await tx.wait();
    console.log(`Funded contract with ${initialFundWei} wei`);
  }

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
