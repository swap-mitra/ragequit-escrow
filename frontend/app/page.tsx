import { ConnectWallet } from "../components/connect-wallet";
import { PendingPayments } from "../components/pending-payments";

export default function HomePage() {
  return (
    <main className="page-wrap">
      <section className="hero-card">
        <p className="tagline">Rage Quit Escrow</p>
        <h1>Human-vetoed autonomous payments</h1>
        <p>
          Day 2 build: wallet connection, pending-payment feed, countdown timers, and owner-only one-click veto.
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
    </main>
  );
}