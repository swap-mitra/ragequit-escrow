import { AgentAudit } from "../components/agent-audit";
import { ConnectWallet } from "../components/connect-wallet";
import { PendingPayments } from "../components/pending-payments";

export default function HomePage() {
  return (
    <main className="page-wrap">
      <section className="hero-card">
        <p className="tagline">RageQuit Escrow</p>
        <h1>Human-vetoed autonomous payments</h1>
        <p>
          Day 5 build: agent-runner flow with a private pre-queue risk gate, so suspicious payments can be blocked
          before they ever hit escrow.
        </p>
        <ConnectWallet />
      </section>

      <section className="panel">
        <h2>Pending Payments</h2>
        <p className="subtle">
          Latest queued payments from the escrow contract. Veto is enabled only for the escrow owner within the active
          veto window.
        </p>
        <PendingPayments />
      </section>

      <section className="panel">
        <h2>Agent Identity & Audit</h2>
        <p className="subtle">
          Day 3 build: ERC-8004 registration artifact, structured onchain decision logs, and delegation-ready agent
          metadata.
        </p>
        <AgentAudit />
      </section>
    </main>
  );
}
