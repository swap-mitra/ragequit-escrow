const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RageQuitEscrow", function () {
  async function deployNativeFixture() {
    const [owner, authorizedAgent, recipient, outsider] = await ethers.getSigners();

    const vetoWindow = 60;
    const spendLimit = ethers.parseEther("1");

    const Escrow = await ethers.getContractFactory("RageQuitEscrow");
    const escrow = await Escrow.deploy(
      owner.address,
      authorizedAgent.address,
      vetoWindow,
      spendLimit,
      ethers.ZeroAddress
    );
    await escrow.waitForDeployment();

    await owner.sendTransaction({
      to: await escrow.getAddress(),
      value: ethers.parseEther("5"),
    });

    return { escrow, owner, authorizedAgent, recipient, outsider, vetoWindow, spendLimit };
  }

  async function deployTokenFixture() {
    const [owner, authorizedAgent, recipient, outsider] = await ethers.getSigners();
    const vetoWindow = 60;
    const decimals = 6;
    const spendLimit = 500_000_000n;

    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy(
      "Mock Celo Dollar",
      "mcUSD",
      decimals,
      owner.address,
      5_000_000_000n
    );
    await token.waitForDeployment();

    const Escrow = await ethers.getContractFactory("RageQuitEscrow");
    const escrow = await Escrow.deploy(
      owner.address,
      authorizedAgent.address,
      vetoWindow,
      spendLimit,
      await token.getAddress()
    );
    await escrow.waitForDeployment();

    await token.connect(owner).approve(await escrow.getAddress(), 2_000_000_000n);
    await escrow.connect(owner).fundToken(2_000_000_000n);

    return { escrow, token, owner, authorizedAgent, recipient, outsider, vetoWindow, spendLimit };
  }

  it("queues a payment from the authorized agent", async function () {
    const { escrow, authorizedAgent, recipient } = await loadFixture(deployNativeFixture);
    const amount = ethers.parseEther("0.5");
    const intentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-001"));
    const tx = escrow.connect(authorizedAgent).initiate(recipient.address, amount, intentHash);

    await expect(tx)
      .to.emit(escrow, "PaymentQueued")
      .withArgs(0, authorizedAgent.address, recipient.address, amount, anyUint(), intentHash, ethers.ZeroHash);

    await expect(tx)
      .to.emit(escrow, "PaymentDecisionLogged")
      .withArgs(
        0,
        0,
        authorizedAgent.address,
        authorizedAgent.address,
        recipient.address,
        amount,
        intentHash,
        ethers.ZeroHash,
        anyUint()
      );

    const payment = await escrow.pendingPayments(0);
    expect(payment.agent).to.equal(authorizedAgent.address);
    expect(payment.recipient).to.equal(recipient.address);
    expect(payment.amount).to.equal(amount);
    expect(payment.intentHash).to.equal(intentHash);
    expect(payment.fundingReference).to.equal(ethers.ZeroHash);
    expect(payment.vetoed).to.equal(false);
    expect(payment.executed).to.equal(false);
    expect(await escrow.lockedBalance()).to.equal(amount);
  });

  it("rejects initiate from a non-authorized caller", async function () {
    const { escrow, outsider, recipient } = await loadFixture(deployNativeFixture);

    await expect(
      escrow.connect(outsider).initiate(recipient.address, ethers.parseEther("0.1"), ethers.ZeroHash)
    ).to.be.revertedWithCustomError(escrow, "NotAuthorizedAgent");
  });

  it("enforces per-payment spend limit", async function () {
    const { escrow, authorizedAgent, recipient } = await loadFixture(deployNativeFixture);

    await expect(
      escrow.connect(authorizedAgent).initiate(recipient.address, ethers.parseEther("1.1"), ethers.ZeroHash)
    ).to.be.revertedWithCustomError(escrow, "SpendLimitExceeded");
  });

  it("lets owner veto during the veto window", async function () {
    const { escrow, authorizedAgent, owner, recipient } = await loadFixture(deployNativeFixture);
    const amount = ethers.parseEther("0.2");

    await escrow.connect(authorizedAgent).initiate(recipient.address, amount, ethers.ZeroHash);

    await expect(escrow.connect(owner).veto(0))
      .to.emit(escrow, "PaymentDecisionLogged")
      .withArgs(0, 1, owner.address, authorizedAgent.address, recipient.address, amount, ethers.ZeroHash, ethers.ZeroHash, anyUint());

    const payment = await escrow.pendingPayments(0);
    expect(payment.vetoed).to.equal(true);
    expect(payment.executed).to.equal(false);
    expect(await escrow.lockedBalance()).to.equal(0n);
  });

  it("blocks veto after veto window expires", async function () {
    const { escrow, authorizedAgent, owner, recipient, vetoWindow } = await loadFixture(deployNativeFixture);

    await escrow.connect(authorizedAgent).initiate(recipient.address, ethers.parseEther("0.2"), ethers.ZeroHash);
    await time.increase(vetoWindow + 1);

    await expect(escrow.connect(owner).veto(0)).to.be.revertedWithCustomError(escrow, "VetoWindowClosed");
  });

  it("executes payment after timeout and transfers native funds", async function () {
    const { escrow, authorizedAgent, recipient, vetoWindow } = await loadFixture(deployNativeFixture);
    const amount = ethers.parseEther("0.3");

    await escrow.connect(authorizedAgent).initiate(recipient.address, amount, ethers.ZeroHash);
    await time.increase(vetoWindow + 1);
    const tx = escrow.execute(0);

    await expect(tx).to.changeEtherBalances([escrow, recipient], [-amount, amount]);
    await expect(tx)
      .to.emit(escrow, "PaymentDecisionLogged")
      .withArgs(0, 2, anyAddress(), authorizedAgent.address, recipient.address, amount, ethers.ZeroHash, ethers.ZeroHash, anyUint());

    const payment = await escrow.pendingPayments(0);
    expect(payment.executed).to.equal(true);
    expect(payment.vetoed).to.equal(false);
    expect(await escrow.lockedBalance()).to.equal(0n);
  });

  it("prevents execute before timeout", async function () {
    const { escrow, authorizedAgent, recipient } = await loadFixture(deployNativeFixture);

    await escrow.connect(authorizedAgent).initiate(recipient.address, ethers.parseEther("0.3"), ethers.ZeroHash);

    await expect(escrow.execute(0)).to.be.revertedWithCustomError(escrow, "VetoWindowOpen");
  });

  it("queues and executes token-settled payments with a funding reference", async function () {
    const { escrow, token, authorizedAgent, recipient, vetoWindow } = await loadFixture(deployTokenFixture);
    const amount = 125_000_000n;
    const fundingReference = ethers.keccak256(ethers.toUtf8Bytes("swap-receipt-1"));
    const balanceBefore = await token.balanceOf(recipient.address);

    const queueTx = escrow
      .connect(authorizedAgent)
      .initiateWithFundingReference(recipient.address, amount, ethers.ZeroHash, fundingReference);

    await expect(queueTx)
      .to.emit(escrow, "PaymentQueued")
      .withArgs(0, authorizedAgent.address, recipient.address, amount, anyUint(), ethers.ZeroHash, fundingReference);

    await time.increase(vetoWindow + 1);
    await expect(escrow.execute(0)).to.changeTokenBalances(token, [escrow, recipient], [-amount, amount]);

    const payment = await escrow.pendingPayments(0);
    expect(payment.fundingReference).to.equal(fundingReference);
    expect(await token.balanceOf(recipient.address)).to.equal(balanceBefore + amount);
  });

  it("rejects native funding in token settlement mode", async function () {
    const { escrow, owner } = await loadFixture(deployTokenFixture);

    await expect(
      owner.sendTransaction({
        to: await escrow.getAddress(),
        value: 1n,
      })
    ).to.be.revertedWithCustomError(escrow, "InvalidFundingMode");
  });

  it("rejects token funding in native settlement mode", async function () {
    const { escrow, owner } = await loadFixture(deployNativeFixture);

    await expect(escrow.connect(owner).fundToken(1n)).to.be.revertedWithCustomError(escrow, "InvalidFundingMode");
  });
});

function anyUint() {
  return (value) => typeof value === "bigint" && value > 0n;
}

function anyAddress() {
  return (value) => typeof value === "string" && value.startsWith("0x") && value.length === 42;
}
