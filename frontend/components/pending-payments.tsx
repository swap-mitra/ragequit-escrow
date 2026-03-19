"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { rageQuitEscrowAbi } from "../lib/contracts/rageQuitEscrow";
import { hardhatLocal } from "../lib/wagmi";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

type PaymentTuple = readonly [
  `0x${string}`,
  `0x${string}`,
  bigint,
  bigint,
  `0x${string}`,
  boolean,
  boolean,
];

export function PendingPayments() {
  const configuredAddress = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}` | undefined;
  const contractAddress = configuredAddress || ZERO_ADDRESS;

  const { address, chain } = useAccount();

  const [now, setNow] = useState<bigint>(0n);
  const [pendingVetoId, setPendingVetoId] = useState<bigint | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    const updateNow = () => {
      setNow(BigInt(Math.floor(Date.now() / 1000)));
    };

    updateNow();
    const timer = setInterval(updateNow, 1000);

    return () => clearInterval(timer);
  }, []);

  const {
    data: ownerAddress,
    error: ownerReadError,
  } = useReadContract({
    address: contractAddress,
    abi: rageQuitEscrowAbi,
    functionName: "owner",
    chainId: hardhatLocal.id,
    query: {
      enabled: Boolean(configuredAddress),
      refetchInterval: 5000,
    },
  });

  const {
    data: nextPaymentId,
    isLoading: nextPaymentLoading,
    error: nextPaymentError,
    refetch: refetchNextPaymentId,
  } = useReadContract({
    address: contractAddress,
    abi: rageQuitEscrowAbi,
    functionName: "nextPaymentId",
    chainId: hardhatLocal.id,
    query: {
      enabled: Boolean(configuredAddress),
      refetchInterval: 5000,
    },
  });

  const paymentIds = useMemo(() => {
    if (!nextPaymentId || nextPaymentId === 0n) return [] as bigint[];

    const total = Number(nextPaymentId);
    const start = Math.max(total - 20, 0);

    const ids: bigint[] = [];
    for (let id = start; id < total; id += 1) {
      ids.push(BigInt(id));
    }

    return ids;
  }, [nextPaymentId]);

  const {
    data: paymentResults,
    isLoading: paymentLoading,
    error: paymentReadError,
    refetch: refetchPayments,
  } = useReadContracts({
    contracts: paymentIds.map((id) => ({
      address: contractAddress,
      abi: rageQuitEscrowAbi,
      functionName: "pendingPayments",
      chainId: hardhatLocal.id,
      args: [id],
    })),
    query: {
      enabled: Boolean(configuredAddress) && paymentIds.length > 0,
      refetchInterval: 5000,
    },
  });

  const {
    data: vetoHash,
    error: vetoWriteError,
    isPending: vetoWritePending,
    writeContract,
  } = useWriteContract();

  const {
    isLoading: vetoConfirming,
    isSuccess: vetoConfirmed,
    error: vetoConfirmError,
  } = useWaitForTransactionReceipt({
    hash: vetoHash,
    chainId: hardhatLocal.id,
  });

  useEffect(() => {
    if (!vetoWriteError) {
      return;
    }

    setActionMessage(vetoWriteError.message);
    setPendingVetoId(null);
  }, [vetoWriteError]);

  useEffect(() => {
    if (!vetoConfirmError) {
      return;
    }

    setActionMessage(vetoConfirmError.message);
    setPendingVetoId(null);
  }, [vetoConfirmError]);

  useEffect(() => {
    if (!vetoConfirmed) {
      return;
    }

    setActionMessage("Veto transaction confirmed.");
    setPendingVetoId(null);
    void refetchNextPaymentId();
    void refetchPayments();
  }, [vetoConfirmed, refetchNextPaymentId, refetchPayments]);

  if (!configuredAddress) {
    return <p className="subtle">Set `NEXT_PUBLIC_ESCROW_ADDRESS` to load pending payments.</p>;
  }

  if (ownerReadError || nextPaymentError || paymentReadError) {
    const errorMessage = ownerReadError?.message || nextPaymentError?.message || paymentReadError?.message;
    return <p className="subtle">Contract read failed: {errorMessage}</p>;
  }

  if (nextPaymentLoading || paymentLoading) {
    return <p className="subtle">Loading payment feed...</p>;
  }

  if (!paymentResults || paymentResults.length === 0) {
    return <p className="subtle">No queued payments yet.</p>;
  }

  const rows = paymentResults
    .map((result, index) => ({
      id: paymentIds[index],
      result,
    }))
    .filter((entry) => entry.id !== undefined && entry.result.status === "success")
    .reverse();

  if (rows.length === 0) {
    return <p className="subtle">No readable payments returned by contract.</p>;
  }

  const isOwner =
    Boolean(address) && Boolean(ownerAddress) && address!.toLowerCase() === (ownerAddress as string).toLowerCase();

  const paymentViews = rows.map(({ id, result }) => {
    const payment = result.result as unknown as PaymentTuple;
    const recipient = payment[1];
    const amount = payment[2];
    const unlocksAt = payment[3];
    const vetoed = payment[5];
    const executed = payment[6];
    const remaining = unlocksAt > now ? unlocksAt - now : 0n;
    const status = vetoed ? "Vetoed" : executed ? "Executed" : "Pending";
    const chipClass = vetoed
      ? "status-chip status-vetoed"
      : executed
        ? "status-chip status-executed"
        : "status-chip status-pending";

    return {
      id,
      recipient,
      amount,
      remaining,
      status,
      chipClass,
      vetoed,
      executed,
    };
  });

  const pendingCount = paymentViews.filter((payment) => payment.status === "Pending").length;
  const executedCount = paymentViews.filter((payment) => payment.status === "Executed").length;
  const vetoedCount = paymentViews.filter((payment) => payment.status === "Vetoed").length;

  return (
    <div className="payments-shell">
      <div className="metric-strip">
        <div className="metric-box">
          <span className="metric-label">Queue</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="metric-box">
          <span className="metric-label">Executed</span>
          <strong>{executedCount}</strong>
        </div>
        <div className="metric-box">
          <span className="metric-label">Vetoed</span>
          <strong>{vetoedCount}</strong>
        </div>
        <div className="metric-box owner-box">
          <span className="metric-label">Mode</span>
          <strong>{isOwner ? "Owner live" : "Read only"}</strong>
        </div>
      </div>

      <div className="info-banner-row">
        <p className="info-banner">Connected wallet must match escrow owner to veto pending payments.</p>
        {actionMessage ? <p className="info-banner info-banner-accent">{actionMessage}</p> : null}
      </div>

      <div className="table-wrap brutal-table-wrap">
        <table className="payments-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Recipient</th>
              <th>Amount</th>
              <th>Window</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {paymentViews.map((payment) => {
              const canVeto = isOwner && !payment.vetoed && !payment.executed && payment.remaining > 0n;
              const isCurrentVeto = pendingVetoId !== null && pendingVetoId === payment.id;
              const txInFlight = vetoWritePending || vetoConfirming;

              let buttonText = "Veto";
              if (isCurrentVeto && txInFlight) {
                buttonText = "Vetoing...";
              } else if (payment.vetoed) {
                buttonText = "Vetoed";
              } else if (payment.executed) {
                buttonText = "Executed";
              } else if (payment.remaining === 0n) {
                buttonText = "Window Closed";
              } else if (!isOwner) {
                buttonText = "Owner Only";
              }

              return (
                <tr key={payment.id.toString()}>
                  <td>
                    <span className="cell-kicker">#{payment.id.toString()}</span>
                  </td>
                  <td>{shortAddress(payment.recipient)}</td>
                  <td>{compactWei(payment.amount)}</td>
                  <td>{payment.remaining.toString()}s</td>
                  <td>
                    <span className={payment.chipClass}>{payment.status}</span>
                  </td>
                  <td>
                    <button
                      className="table-action"
                      type="button"
                      disabled={!canVeto || txInFlight}
                      onClick={() => {
                        if (!address || !chain) {
                          setActionMessage("Connect a wallet to send veto transaction.");
                          return;
                        }

                        setActionMessage(null);
                        setPendingVetoId(payment.id);
                        writeContract({
                          account: address,
                          chain,
                          address: contractAddress,
                          abi: rageQuitEscrowAbi,
                          functionName: "veto",
                          args: [payment.id],
                        });
                      }}
                    >
                      {buttonText}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function shortAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function compactWei(value: bigint) {
  const raw = value.toString();
  if (raw.length <= 9) {
    return `${raw} wei`;
  }

  return `${raw.slice(0, 4)}...${raw.slice(-4)} wei`;
}
