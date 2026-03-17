"use client";

import { useEffect, useState } from "react";

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
};

export function AgentAudit() {
  const [agentCard, setAgentCard] = useState<AgentCard | null>(null);
  const [agentLog, setAgentLog] = useState<AgentLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadArtifacts() {
      try {
        const [cardResponse, logResponse] = await Promise.all([fetch("/agent.json"), fetch("/agent_log.json")]);

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

    void loadArtifacts();

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return <p className="subtle">{error}</p>;
  }

  if (!agentCard || !agentLog) {
    return <p className="subtle">Loading agent identity and audit log...</p>;
  }

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
          <p className="subtle">Updated {new Date(agentLog.generatedAt).toLocaleString()}</p>
        </div>

        {agentLog.decisions.length === 0 ? (
          <p className="subtle">No decisions recorded yet. Generate artifacts after queueing a payment.</p>
        ) : (
          <div className="audit-log-list">
            {agentLog.decisions.slice(-5).reverse().map((entry) => (
              <div key={`${entry.transactionHash}-${entry.paymentId}`} className="audit-log-item">
                <div>
                  <strong>#{entry.paymentId}</strong> {entry.decisionLabel}
                </div>
                <div className="subtle">
                  {shortAddress(entry.actor)} → {shortAddress(entry.recipient)}
                </div>
                <div className="subtle">{entry.amountWei} wei</div>
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

function shortAddress(address: string) {
  if (!address) {
    return "";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
