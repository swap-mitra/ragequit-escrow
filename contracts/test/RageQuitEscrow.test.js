const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RageQuitEscrow", function () {
  async function deployFixture() {
    const [owner, authorizedAgent, recipient, outsider] = await ethers.getSigners();

    const vetoWindow = 60;
    const spendLimit = ethers.parseEther("1");

    const Escrow = await ethers.getContractFactory("RageQuitEscrow");
    const escrow = await Escrow.deploy(owner.address, authorizedAgent.address, vetoWindow, spendLimit);
    await escrow.waitForDeployment();

    await owner.sendTransaction({
      to: await escrow.getAddress(),
      value: ethers.parseEther("5"),
    });

    return { escrow, owner, authorizedAgent, recipient, outsider, vetoWindow, spendLimit };
  }

  it("queues a payment from the authorized agent", async function () {
    const { escrow, authorizedAgent, recipient } = await loadFixture(deployFixture);
    const amount = ethers.parseEther("0.5");
    const intentHash = ethers.keccak256(ethers.toUtf8Bytes("invoice-001"));
    const tx = escrow.connect(authorizedAgent).initiate(recipient.address, amount, intentHash);

    await expect(tx)
      .to.emit(escrow, "PaymentQueued")
      .withArgs(0, authorizedAgent.address, recipient.address, amount, anyUint(), intentHash);

    await expect(tx)
      .to.emit(escrow, "PaymentDecisionLogged")
      .withArgs(0, 0, authorizedAgent.address, authorizedAgent.address, recipient.address, amount, intentHash, anyUint());
    const payment = await escrow.pendingPayments(0);
    expect(payment.agent).to.equal(authorizedAgent.address);
    expect(payment.recipient).to.equal(recipient.address);
    expect(payment.amount).to.equal(amount);
    expect(payment.intentHash).to.equal(intentHash);
    expect(payment.vetoed).to.equal(false);
    expect(payment.executed).to.equal(false);
    expect(await escrow.lockedBalance()).to.equal(amount);
  });

  it("rejects initiate from a non-authorized caller", async function () {
    const { escrow, outsider, recipient } = await loadFixture(deployFixture);

    await expect(
      escrow.connect(outsider).initiate(recipient.address, ethers.parseEther("0.1"), ethers.ZeroHash)
    ).to.be.revertedWithCustomError(escrow, "NotAuthorizedAgent");
  });

  it("enforces per-payment spend limit", async function () {
    const { escrow, authorizedAgent, recipient } = await loadFixture(deployFixture);

    await expect(
      escrow.connect(authorizedAgent).initiate(recipient.address, ethers.parseEther("1.1"), ethers.ZeroHash)
    ).to.be.revertedWithCustomError(escrow, "SpendLimitExceeded");
  });

  it("lets owner veto during the veto window", async function () {
    const { escrow, authorizedAgent, owner, recipient } = await loadFixture(deployFixture);

    await escrow.connect(authorizedAgent).initiate(recipient.address, ethers.parseEther("0.2"), ethers.ZeroHash);

    await expect(escrow.connect(owner).veto(0))
      .to.emit(escrow, "PaymentDecisionLogged")
      .withArgs(0, 1, owner.address, authorizedAgent.address, recipient.address, ethers.parseEther("0.2"), ethers.ZeroHash, anyUint());

    const payment = await escrow.pendingPayments(0);
    expect(payment.vetoed).to.equal(true);
    expect(payment.executed).to.equal(false);
    expect(await escrow.lockedBalance()).to.equal(0n);
  });

  it("blocks veto after veto window expires", async function () {
    const { escrow, authorizedAgent, owner, recipient, vetoWindow } = await loadFixture(deployFixture);

    await escrow.connect(authorizedAgent).initiate(recipient.address, ethers.parseEther("0.2"), ethers.ZeroHash);
    await time.increase(vetoWindow + 1);

    await expect(escrow.connect(owner).veto(0)).to.be.revertedWithCustomError(escrow, "VetoWindowClosed");
  });

  it("executes payment after timeout and transfers funds", async function () {
    const { escrow, authorizedAgent, recipient, vetoWindow } = await loadFixture(deployFixture);
    const amount = ethers.parseEther("0.3");

    await escrow.connect(authorizedAgent).initiate(recipient.address, amount, ethers.ZeroHash);
    await time.increase(vetoWindow + 1);
    const tx = escrow.execute(0);

    await expect(tx).to.changeEtherBalances([escrow, recipient], [-amount, amount]);
    await expect(tx)
      .to.emit(escrow, "PaymentDecisionLogged")
      .withArgs(0, 2, anyAddress(), authorizedAgent.address, recipient.address, amount, ethers.ZeroHash, anyUint());

    const payment = await escrow.pendingPayments(0);
    expect(payment.executed).to.equal(true);
    expect(payment.vetoed).to.equal(false);
    expect(await escrow.lockedBalance()).to.equal(0n);
  });

  it("prevents execute before timeout", async function () {
    const { escrow, authorizedAgent, recipient } = await loadFixture(deployFixture);

    await escrow.connect(authorizedAgent).initiate(recipient.address, ethers.parseEther("0.3"), ethers.ZeroHash);

    await expect(escrow.execute(0)).to.be.revertedWithCustomError(escrow, "VetoWindowOpen");
  });
});

function anyUint() {
  return (value) => typeof value === "bigint" && value > 0n;
}

function anyAddress() {
  return (value) => typeof value === "string" && value.startsWith("0x") && value.length === 42;
}
