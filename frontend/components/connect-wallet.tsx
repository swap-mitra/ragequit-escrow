"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectWallet() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="wallet-card">
        <p className="wallet-label">Wallet</p>
        <button type="button" disabled>
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-card">
      <p className="wallet-label">Operator Wallet</p>
      {isConnected ? (
        <div className="wallet-stack">
          <div className="wallet-badge-row">
            <span className="metric-pill">Connected</span>
            <span className="wallet-address">{shortAddress(address || "")}</span>
          </div>
          <button onClick={() => disconnect()} type="button">
            Disconnect
          </button>
        </div>
      ) : (
        <div className="wallet-stack">
          <div className="wallet-button-grid">
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => connect({ connector })}
                disabled={isPending}
                type="button"
              >
                {isPending ? "Connecting..." : connector.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {error ? <span className="subtle wallet-error">{error.message}</span> : null}
    </div>
  );
}

function shortAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
