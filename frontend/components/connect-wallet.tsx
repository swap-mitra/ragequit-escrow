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
      <div className="wallet-row">
        <button type="button" disabled>
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-row">
      {isConnected ? (
        <>
          <span>Connected: {shortAddress(address || "")}</span>
          <button onClick={() => disconnect()} type="button">
            Disconnect
          </button>
        </>
      ) : (
        connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={isPending}
            type="button"
          >
            {isPending ? "Connecting..." : `Connect ${connector.name}`}
          </button>
        ))
      )}
      {error ? <span className="subtle">{error.message}</span> : null}
    </div>
  );
}

function shortAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}