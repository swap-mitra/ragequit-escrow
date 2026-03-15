import { ConnectWallet } from "../components/connect-wallet";
import { PendingPayments } from "../components/pending-payments";

export default function HomePage() {
  return (
    <main className="page-wrap">
      <section className="hero-card">
        <p className="tagline">Rage Quit Escrow</p>
        <h1>Human-vetoed autonomous payments</h1>
        <p>
          Day 1 scaffold: wallet connection + pending-payment board wired to the escrow contract for read-only visibility.
        </p>
        <ConnectWallet />
      </section>

      <section className="panel">
        <h2>Pending Payments</h2>
        <p className="subtle">Showing the most recent queued payments and countdown to execution window expiry.</p>
        <PendingPayments />
      </section>
    </main>
  );
}