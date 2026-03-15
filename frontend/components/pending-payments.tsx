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

  const { data: ownerAddress } = useReadContract({
    address: contractAddress,
    abi: rageQuitEscrowAbi,
    functionName: "owner",
    query: {
      enabled: Boolean(configuredAddress),
      refetchInterval: 5000,
    },
  });

  const { data: nextPaymentId, isLoading: nextPaymentLoading, refetch: refetchNextPaymentId } = useReadContract({
    address: contractAddress,
    abi: rageQuitEscrowAbi,
    functionName: "nextPaymentId",
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
    refetch: refetchPayments,
  } = useReadContracts({
    contracts: paymentIds.map((id) => ({
      address: contractAddress,
      abi: rageQuitEscrowAbi,
      functionName: "pendingPayments",
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

  return (
    <div className="table-wrap">
      <p className="subtle">Connected wallet must match escrow owner to veto pending payments.</p>
      {actionMessage ? <p className="subtle">{actionMessage}</p> : null}
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Recipient</th>
            <th>Amount (wei)</th>
            <th>Time Left</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, result }) => {
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

            const canVeto = isOwner && !vetoed && !executed && remaining > 0n;
            const isCurrentVeto = pendingVetoId !== null && pendingVetoId === id;
            const txInFlight = vetoWritePending || vetoConfirming;

            let buttonText = "Veto";
            if (isCurrentVeto && txInFlight) {
              buttonText = "Vetoing...";
            } else if (vetoed) {
              buttonText = "Vetoed";
            } else if (executed) {
              buttonText = "Executed";
            } else if (remaining === 0n) {
              buttonText = "Window Closed";
            } else if (!isOwner) {
              buttonText = "Owner Only";
            }

            return (
              <tr key={id.toString()}>
                <td>{id.toString()}</td>
                <td>{shortAddress(recipient)}</td>
                <td>{amount.toString()}</td>
                <td>{remaining.toString()}s</td>
                <td>
                  <span className={chipClass}>{status}</span>
                </td>
                <td>
                  <button
                    type="button"
                    disabled={!canVeto || txInFlight}
                    onClick={() => {
                      if (!address || !chain) {
                        setActionMessage("Connect a wallet to send veto transaction.");
                        return;
                      }

                      setActionMessage(null);
                      setPendingVetoId(id);
                      writeContract({
                        account: address,
                        chain,
                        address: contractAddress,
                        abi: rageQuitEscrowAbi,
                        functionName: "veto",
                        args: [id],
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
  );
}

function shortAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
