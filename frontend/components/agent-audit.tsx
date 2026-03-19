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
      const stamp = Date.now();
      const [cardResponse, logResponse] = await Promise.all([
        fetch(`/agent.json?ts=${stamp}`),
        fetch(`/agent_log.json?ts=${stamp}`),
      ]);

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
    void loadArtifacts();
  }, [loadArtifacts]);

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

  const latestDecisionCount = agentLog.decisions.length;
  const riskEntries = (agentLog.riskDecisions || []).slice(-4).reverse();

  return (
    <div className="audit-compact-grid">
      <article className="audit-card audit-identity-card">
        <div className="identity-row">
          <img alt={agentCard.name} className="agent-avatar" src={agentCard.image} />
          <div>
            <p className="tagline">ERC-8004 Registration</p>
            <h3>{agentCard.name}</h3>
            <p className="subtle">{agentCard.description}</p>
          </div>
        </div>

        <div className="metric-strip compact-strip">
          <div className="metric-box">
            <span className="metric-label">Agent</span>
            <strong>{shortAddress(agentLog.authorizedAgent)}</strong>
          </div>
          <div className="metric-box">
            <span className="metric-label">Owner</span>
            <strong>{shortAddress(agentLog.owner)}</strong>
          </div>
          <div className="metric-box">
            <span className="metric-label">Spend Limit</span>
            <strong>{compactWei(agentLog.spendLimitWei)}</strong>
          </div>
          <div className="metric-box">
            <span className="metric-label">Veto Window</span>
            <strong>{agentLog.vetoWindowSeconds}s</strong>
          </div>
        </div>

        <div className="pill-row">
          {(agentCard.supportedTrust || []).map((trust) => (
            <span key={trust} className="status-chip status-pending">
              {trust}
            </span>
          ))}
        </div>

        <div className="service-list brutal-links">
          {agentCard.services.map((service) => (
            <a href={service.endpoint} key={`${service.name}-${service.endpoint}`} rel="noreferrer" target="_blank">
              {service.name}
            </a>
          ))}
        </div>
      </article>

      <article className="audit-card">
        <div className="section-head brutal-head">
          <div>
            <p className="tagline">Decision Feed</p>
            <h3>Onchain</h3>
          </div>
          <span className="metric-pill">{latestDecisionCount} entries</span>
        </div>

        {agentLog.decisions.length === 0 ? (
          <p className="subtle">No onchain decisions recorded yet.</p>
        ) : (
          <div className="audit-log-list compact-log-list">
            {agentLog.decisions.slice(-4).reverse().map((entry) => (
              <div key={`${entry.transactionHash}-${entry.paymentId}`} className="audit-log-item brutal-item">
                <div className="log-topline">
                  <strong>#{entry.paymentId}</strong>
                  <span className="status-chip status-executed">{entry.decisionLabel}</span>
                </div>
                <div className="subtle">{shortAddress(entry.actor)} -&gt; {shortAddress(entry.recipient)}</div>
                <div className="subtle">{compactWei(entry.amountWei)}</div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="audit-card audit-risk-card">
        <div className="section-head brutal-head">
          <div>
            <p className="tagline">Private Risk Gate</p>
            <h3>Latest Verdicts</h3>
          </div>
          <button onClick={refreshArtifacts} disabled={refreshState === "refreshing"} type="button">
            {refreshState === "refreshing" ? "Refreshing..." : "Refresh Artifacts"}
          </button>
        </div>

        {refreshMessage ? <p className="subtle">{refreshMessage}</p> : null}

        {riskEntries.length === 0 ? (
          <p className="subtle">No risk verdicts recorded yet.</p>
        ) : (
          <div className="audit-log-list compact-log-list">
            {riskEntries.map((entry) => (
              <div key={`${entry.createdAt}-${entry.status}-${entry.recipient}`} className="audit-log-item brutal-item">
                <div className="log-topline">
                  <span className={riskChipClass(entry.verdict)}>{formatVerdict(entry.verdict)}</span>
                  <strong>
                    {entry.riskScore}/{entry.riskThreshold}
                  </strong>
                </div>
                <div className="subtle">{entry.task}</div>
                <div className="subtle">{shortAddress(agentLog.authorizedAgent)} -&gt; {shortAddress(entry.recipient)}</div>
                <div className="subtle">{compactWei(entry.amountWei)}</div>
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

function compactWei(raw: string) {
  if (raw.length <= 9) {
    return `${raw} wei`;
  }

  return `${raw.slice(0, 4)}...${raw.slice(-4)} wei`;
}
