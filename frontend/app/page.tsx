import { AgentAudit } from "../components/agent-audit";
import { ConnectWallet } from "../components/connect-wallet";
import { PendingPayments } from "../components/pending-payments";

export default function HomePage() {
  return (
    <main className="page-wrap neo-shell">
      <section className="hero-card hero-band">
        <div className="hero-copy">
          <p className="tagline">Rage Quit Escrow</p>
          <h1>Autonomous payments with a human last word.</h1>
          <p className="hero-text">
            A compact operator console for revocable agent payouts, private risk verdicts, and direct veto control.
          </p>
          <div className="hero-strip">
            <span className="strip-chip">Human veto</span>
            <span className="strip-chip">Private Venice reasoning</span>
            <span className="strip-chip">Onchain execution</span>
          </div>
        </div>
        <ConnectWallet />
      </section>

      <section className="dashboard-grid">
        <section className="panel panel-payments">
          <div className="panel-head">
            <div>
              <p className="tagline">Live Escrow Feed</p>
              <h2>Pending Payments</h2>
            </div>
            <p className="panel-note">Owner-only veto stays exposed in the active window.</p>
          </div>
          <PendingPayments />
        </section>

        <section className="panel panel-audit">
          <div className="panel-head">
            <div>
              <p className="tagline">Agent Surface</p>
              <h2>Identity And Audit</h2>
            </div>
            <p className="panel-note">ERC-8004 metadata, onchain decisions, and private risk outcomes.</p>
          </div>
          <AgentAudit />
        </section>
      </section>
    </main>
  );
}
