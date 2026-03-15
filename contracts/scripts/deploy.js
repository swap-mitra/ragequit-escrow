const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const { ethers, network } = hre;
  const [deployer, fallbackAgent] = await ethers.getSigners();

  const owner = process.env.ESCROW_OWNER || deployer.address;
  const authorizedAgent = process.env.AUTHORIZED_AGENT || fallbackAgent.address;
  const vetoWindowSeconds = Number(process.env.VETO_WINDOW_SECONDS || "60");
  const spendLimitWei = BigInt(process.env.SPEND_LIMIT_WEI || ethers.parseEther("1").toString());
  const initialFundWei = BigInt(process.env.INITIAL_FUND_WEI || ethers.parseEther("10").toString());

  const Escrow = await ethers.getContractFactory("RageQuitEscrow");
  const escrow = await Escrow.deploy(owner, authorizedAgent, vetoWindowSeconds, spendLimitWei);
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log(`RageQuitEscrow deployed at: ${escrowAddress}`);
  console.log(`Owner: ${owner}`);
  console.log(`Authorized agent: ${authorizedAgent}`);
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
        vetoWindowSeconds,
        spendLimitWei: spendLimitWei.toString(),
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