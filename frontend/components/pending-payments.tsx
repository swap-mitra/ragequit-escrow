"use client";

import { useEffect, useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
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

  const [now, setNow] = useState<bigint>(0n);

  useEffect(() => {
    const updateNow = () => {
      setNow(BigInt(Math.floor(Date.now() / 1000)));
    };

    updateNow();
    const timer = setInterval(updateNow, 1000);

    return () => clearInterval(timer);
  }, []);

  const { data: nextPaymentId, isLoading: nextPaymentLoading } = useReadContract({
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

  const { data: paymentResults, isLoading: paymentLoading } = useReadContracts({
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

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Recipient</th>
            <th>Amount (wei)</th>
            <th>Time Left</th>
            <th>Status</th>
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

            return (
              <tr key={id.toString()}>
                <td>{id.toString()}</td>
                <td>{shortAddress(recipient)}</td>
                <td>{amount.toString()}</td>
                <td>{remaining.toString()}s</td>
                <td>
                  <span className={chipClass}>{status}</span>
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