"use client";

import { useCallback, useEffect, useState } from "react";

type AgentCard = {
  type: string;
  name: string;
  description: string;
  image: string;
  services: Array<{
    name: string;
    endpoint: string;
    version?: string;
  }>;
  registrations: Array<{
    agentId: number;
    agentRegistry: string;
  }>;
  supportedTrust?: string[];
};

type AgentLog = {
  generatedAt: string;
  authorizedAgent: string;
  owner: string;
  spendLimitWei: string;
  vetoWindowSeconds: string;
  decisions: Array<{
    paymentId: string;
    decisionLabel: string;
    actor: string;
    recipient: string;
    amountWei: string;
    timestamp: string;
    transactionHash: string;
  }>;
  riskDecisions?: Array<{
    createdAt: string;
    status: string;
    task: string;
    recipient: string;
    amountWei: string;
    paymentId: string | null;
    transactionHash: string | null;
    riskProvider: string;
    verdict: string;
    riskScore: string;
    riskThreshold: string;
    reasons: string[];
  }>;
};

export function AgentAudit() {
  const [agentCard, setAgentCard] = useState<AgentCard | null>(null);
  const [agentLog, setAgentLog] = useState<AgentLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshState, setRefreshState] = useState<"idle" | "refreshing">("idle");
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const loadArtifacts = useCallback(async () => {
    try {
      const [cardResponse, logResponse] = await Promise.all([fetch("/agent.json?ts=" + Date.now()), fetch("/agent_log.json?ts=" + Date.now())]);

      if (!cardResponse.ok || !logResponse.ok) {
        throw new Error("Agent identity artifacts have not been generated yet.");
      }

      const [card, log] = await Promise.all([cardResponse.json(), logResponse.json()]);
      setAgentCard(card);
      setAgentLog(log);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load agent artifacts.");
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        const [cardResponse, logResponse] = await Promise.all([fetch("/agent.json?ts=" + Date.now()), fetch("/agent_log.json?ts=" + Date.now())]);

        if (!cardResponse.ok || !logResponse.ok) {
          throw new Error("Agent identity artifacts have not been generated yet.");
        }

        const [card, log] = await Promise.all([cardResponse.json(), logResponse.json()]);
        if (!active) {
          return;
        }

        setAgentCard(card);
        setAgentLog(log);
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Unable to load agent artifacts.");
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, []);

  async function refreshArtifacts() {
    setRefreshState("refreshing");
    setRefreshMessage(null);

    try {
      const response = await fetch("/api/audit-artifacts/refresh", {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Artifact refresh failed.");
      }

      await loadArtifacts();
      setRefreshMessage(`Artifacts refreshed for ${payload.network}.`);
    } catch (refreshError) {
      setRefreshMessage(refreshError instanceof Error ? refreshError.message : "Artifact refresh failed.");
    } finally {
      setRefreshState("idle");
    }
  }

  if (error) {
    return <p className="subtle">{error}</p>;
  }

  if (!agentCard || !agentLog) {
    return <p className="subtle">Loading agent identity and audit log...</p>;
  }

  const riskEntries = (agentLog.riskDecisions || []).slice(-5).reverse();

  return (
    <div className="audit-grid">
      <article className="audit-card">
        <div className="identity-row">
          <img alt={agentCard.name} className="agent-avatar" src={agentCard.image} />
          <div>
            <p className="tagline">ERC-8004 Registration</p>
            <h3>{agentCard.name}</h3>
            <p className="subtle">{agentCard.description}</p>
          </div>
        </div>
        <dl className="meta-list">
          <div>
            <dt>Authorized Agent</dt>
            <dd>{shortAddress(agentLog.authorizedAgent)}</dd>
          </div>
          <div>
            <dt>Escrow Owner</dt>
            <dd>{shortAddress(agentLog.owner)}</dd>
          </div>
          <div>
            <dt>Spend Limit</dt>
            <dd>{agentLog.spendLimitWei} wei</dd>
          </div>
          <div>
            <dt>Veto Window</dt>
            <dd>{agentLog.vetoWindowSeconds}s</dd>
          </div>
        </dl>
        <div className="pill-row">
          {(agentCard.supportedTrust || []).map((trust) => (
            <span key={trust} className="status-chip status-pending">
              {trust}
            </span>
          ))}
        </div>
        <div className="service-list">
          {agentCard.services.map((service) => (
            <a href={service.endpoint} key={`${service.name}-${service.endpoint}`} rel="noreferrer" target="_blank">
              {service.name}
            </a>
          ))}
        </div>
      </article>

      <article className="audit-card">
        <div className="section-head">
          <div>
            <p className="tagline">Structured Decisions</p>
            <h3>Latest Audit Entries</h3>
          </div>
          <div className="audit-actions">
            <p className="subtle">Updated {new Date(agentLog.generatedAt).toLocaleString()}</p>
            <button onClick={refreshArtifacts} disabled={refreshState === "refreshing"} type="button">
              {refreshState === "refreshing" ? "Refreshing..." : "Refresh Audit Artifacts"}
            </button>
          </div>
        </div>

        {refreshMessage ? <p className="subtle">{refreshMessage}</p> : null}

        {agentLog.decisions.length === 0 ? (
          <p className="subtle">No onchain decisions recorded yet. Generate artifacts after queueing a payment.</p>
        ) : (
          <div className="audit-log-list">
            {agentLog.decisions.slice(-5).reverse().map((entry) => (
              <div key={`${entry.transactionHash}-${entry.paymentId}`} className="audit-log-item">
                <div>
                  <strong>#{entry.paymentId}</strong> {entry.decisionLabel}
                </div>
                <div className="subtle">
                  {shortAddress(entry.actor)} -&gt; {shortAddress(entry.recipient)}
                </div>
                <div className="subtle">{entry.amountWei} wei</div>
              </div>
            ))}
          </div>
        )}

        <div className="section-head" style={{ marginTop: 24 }}>
          <div>
            <p className="tagline">Private Risk Gate</p>
            <h3>Latest Risk Verdicts</h3>
          </div>
        </div>

        {riskEntries.length === 0 ? (
          <p className="subtle">No risk verdicts recorded yet. Run the Day 5 agent flow to populate this feed.</p>
        ) : (
          <div className="audit-log-list">
            {riskEntries.map((entry) => (
              <div key={`${entry.createdAt}-${entry.status}-${entry.recipient}`} className="audit-log-item">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className={riskChipClass(entry.verdict)}>{formatVerdict(entry.verdict)}</span>
                  <strong>{entry.riskScore}</strong>
                  <span className="subtle">/ {entry.riskThreshold}</span>
                  <span className="subtle">via {entry.riskProvider}</span>
                </div>
                <div className="subtle">{entry.task}</div>
                <div className="subtle">
                  {shortAddress(agentLog.authorizedAgent)} -&gt; {shortAddress(entry.recipient)}
                </div>
                <div className="subtle">{entry.amountWei} wei</div>
                <div className="subtle">{entry.reasons.join("; ")}</div>
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

function riskChipClass(verdict: string) {
  return verdict === "block_payment" ? "status-chip status-vetoed" : "status-chip status-pending";
}

function formatVerdict(verdict: string) {
  return verdict === "block_payment" ? "Blocked" : "Allowed";
}

function shortAddress(address: string) {
  if (!address) {
    return "";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
