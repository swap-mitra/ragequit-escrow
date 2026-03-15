# Rage Quit Escrow — Hackathon Track Fit Map

_Prepared from `https://synthesis.md/hack/` and the live Devfolio catalog on March 13, 2026._

## Idea Summary

**Rage Quit Escrow** is a smart-contract payment control layer for AI agents:
- the agent queues a payment onchain
- the human receives a notification and a bounded veto window
- the payment executes only if the human does nothing
- one onchain cancel action blocks suspicious payments

Core claim: **continuous human consent, enforced by the contract rather than a platform policy**.

## Executive View

### Best-fit, highest-value targets

These are the tracks with the best combination of **strong conceptual fit** and **meaningful prize pool**:

| Priority | Track | Pool | Fit | Why it fits | What to implement |
|---|---|---:|---|---|---|
| 1 | Synthesis Open Track | $14,058.96 | Primary | Broadest eligibility; strong meta-story around trustworthy autonomous payments | Ship the full product story, polished demo, and public repo |
| 2 | Protocol Labs — Agents With Receipts / ERC-8004 | $8,004 | Primary | Your core idea is about trust, identity, verifiability, and auditability for agents | Register ERC-8004 identity, emit verifiable logs, add `agent.json` and `agent_log.json` |
| 3 | Protocol Labs — Let the Agent Cook | $8,000 | Primary | Strong match on autonomous loop plus safety before irreversible actions | Show discover → plan → queue payment → notify → veto/execute → verify |
| 4 | MetaMask — Best Use of Delegations | $5,000 | Primary | Delegations + escrow veto is a clean permissioning story | Use constrained delegations/sub-delegations for spending rights and pair them with escrow windows |
| 5 | Celo — Best Agent on Celo | $5,000 | Strong secondary | Real-world payments and agent utility align well | Deploy on Celo, use stablecoin settlement, optimize for mobile-friendly approval UX |
| 6 | Uniswap — Agentic Finance | $5,000 | Strong secondary | Any agent that pays may need to swap/bridge before settlement | Add swap/bridge before queueing escrowed payouts; keep TxIDs public |
| 7 | Bankr — Best Bankr LLM Gateway Use | $5,000 | Secondary | Good if Bankr becomes the agent brain and wallet/tooling layer | Route planning/tool use through Bankr and use real onchain execution |
| 8 | Venice — Private Agents, Trusted Actions | $11,500* | Secondary | Strong trust narrative if sensitive reasoning stays private before public execution | Use private risk analysis for pre-payment checks, anomaly detection, and recipient validation |
| 9 | Locus — Best Use of Locus | $3,000 | Strong secondary | Spending controls are directly adjacent to your escrow primitive | Use Locus wallet + USDC on Base as the payment rail under the veto wrapper |
| 10 | Status Network — Go Gasless | $2,000 | Secondary | Easy additive qualification if you deploy and prove one gasless AI action | Deploy to Status Sepolia and show one gasless queue/veto/execute path |

*Venice prizes are denominated in `VVV`; the pool above is the page's USD reference amount.*

### Best submission stack

If the goal is **maximum bounty coverage with minimal architectural drift**, the strongest stack is:

1. **Base build**
   - escrow contract with queue / veto / execute
   - relayer or keeper for post-timeout execution
   - notification bot
   - dashboard with pending payments and one-click veto
2. **Trust layer**
   - ERC-8004 agent identity
   - structured execution logs
   - explorer-visible onchain receipts
3. **Permission layer**
   - MetaMask Delegations for scoped agent authority
4. **Optional payment rails**
   - Celo or Base deployment
   - Uniswap for pre-payment swap/bridge
   - Locus for controlled USDC payments
5. **Optional privacy / UX**
   - Venice for private pre-execution reasoning
   - ENS + Self for human-readable and verifiable identity

## Full Track Mapping

Sorted by current pool size on March 13, 2026.

| Rank | Track | Pool | Fit | Implementation hook |
|---:|---|---:|---|---|
| 1 | Synthesis Open Track | $14,058.96 | Primary | Submit the full system as a flagship trustworthy-agent infrastructure project |
| 2 | Venice — Private Agents, Trusted Actions | $11,500* | Secondary | Add private risk analysis over sensitive payment context before public queueing |
| 3 | Protocol Labs — Agents With Receipts / ERC-8004 | $8,004 | Primary | Give the agent an ERC-8004 identity, reputation hooks, and verifiable receipts |
| 4 | Protocol Labs — Let the Agent Cook | $8,000 | Primary | Demonstrate a full autonomous workflow with explicit safety guardrails |
| 5 | Uniswap — Agentic Finance | $5,000 | Strong secondary | Add swap/bridge/settlement before escrowed payouts |
| 6 | Bankr — Best Bankr LLM Gateway Use | $5,000 | Secondary | Use Bankr as the LLM and wallet/tool execution backbone |
| 7 | MetaMask — Best Use of Delegations | $5,000 | Primary | Pair delegated spending authority with time-bounded human veto |
| 8 | Celo — Best Agent on Celo | $5,000 | Strong secondary | Port the contract and agent flow to Celo stablecoin rails |
| 9 | Locus — Best Use of Locus | $3,000 | Strong secondary | Use Locus wallets and spending controls as the payment layer |
| 10 | SuperRare Partner Track | $2,500 | Stretch | Reframe as escrowed agent purchases, bids, or mint actions for NFTs |
| 11 | Status Network — Go Gasless | $2,000 | Secondary | Deploy contract and show one gasless AI-triggered transaction on Status Sepolia |
| 12 | Merit Systems — Build with AgentCash | $1,750 | Secondary | Use AgentCash for paid APIs in risk checks, notifications, or compliance lookups |
| 13 | bond.credit — Agents that pay | $1,500 | Stretch | Pivot to live GMX trading with veto-protected strategy execution |
| 14 | Octant — Agents for Public Goods Data Collection | $1,000 | Low | Reuse the veto pattern for agent-suggested grant disbursements |
| 15 | Self — Best Self Agent ID Integration | $1,000 | Secondary | Add privacy-preserving human-backed identity to the operator or agent |
| 16 | Octant — Agents for Public Goods Evaluation | $1,000 | Low | Adapt the consent + review window to public-goods funding recommendations |
| 17 | Octant — Agents for Public Goods Data Analysis | $1,000 | Low | Use the pattern for analysis-triggered payout or grant decisions |
| 18 | Olas — Hire an Agent on Olas Marketplace | $1,000 | Stretch | Use Olas mech-client for outsourced risk checks or policy evaluation |
| 19 | Olas — Build an Agent for Pearl | $1,000 | Stretch | Package the agent into Pearl if their integration path is lightweight |
| 20 | Octant — Mechanism Design for Public Goods Evaluation | $1,000 | Low | Position veto windows as a governance primitive for grant capital issuance |
| 21 | Olas — Monetize Your Agent on Olas Marketplace | $1,000 | Stretch | Offer risk scoring or veto-policy evaluation as a paid agent service |
| 22 | Markee — Github Integration | $800 | Very low | Only relevant if you add Markee to the repo and drive meaningful traffic |
| 23 | Slice — Ethereum Web Auth / ERC-8128 | $750 | Secondary | Use ERC-8128 for user or agent authentication into the dashboard/API |
| 24 | Slice — The Future of Commerce | $750 | Stretch | Reframe as protected agent checkout for merchant payments |
| 25 | Slice — Slice Hooks | $700 | Stretch | Implement a veto-aware post-checkout or programmable payment hook |
| 26 | ENS — ENS Communication | $600 | Secondary | Use ENS names in notifications, recipient routing, and human approvals |
| 27 | ENS — ENS Identity | $600 | Secondary | Replace raw addresses with ENS names for users, agents, and recipients |
| 28 | ampersend — Best Agent Built with ampersend-sdk | $500 | Stretch | Only pursue if ampersend becomes a core messaging or agent-execution dependency |
| 29 | Arkhai — Applications | $450 | Secondary | Frame the product as a new user-facing escrow/payment application on Arkhai primitives |
| 30 | Arkhai — Escrow Ecosystem Extensions | $450 | Primary | Very direct fit if you position this as a new arbiter / obligation pattern for escrow |
| 31 | ENS — ENS Open Integration | $300 | Secondary | Catch-all ENS track if identity + communication are meaningfully integrated |
| 32 | Bonfires.ai — Best Bonfires.ai Integration | $0 | Very low | Only relevant if Bonfires becomes a core reasoning or knowledge layer |
| 33 | Bonfires.ai — Most Innovative Hack | $0 | Very low | Only useful as narrative upside, not bounty value |

## Recommended Positioning by Track

### Primary story

Use this as the central narrative across the best-fit tracks:

- **Problem:** autonomous agents can spend correctly most of the time and still be unsafe at the margin
- **Insight:** the missing primitive is not better prompting; it is **revocable execution**
- **Mechanism:** every payment becomes a pending claim with a human veto window
- **Outcome:** the system preserves agent speed while keeping final consent human-governed and onchain-verifiable

### Add-ons that unlock more tracks

| Module | Tracks unlocked |
|---|---|
| ERC-8004 identity + receipts | Protocol Labs ERC-8004, Let the Agent Cook, bond.credit |
| MetaMask delegations | MetaMask, Synthesis Open Track |
| Celo deployment | Celo |
| Uniswap swap/bridge before settlement | Uniswap |
| Locus wallet rail | Locus |
| Status Sepolia gasless demo | Status Network |
| ENS names in UX and routing | ENS Identity, ENS Communication, ENS Open Integration |
| Self Agent ID | Self |
| Venice private pre-checks | Venice |
| ERC-8128 auth | Slice Web Auth |
| Arkhai-compatible escrow extension framing | Arkhai Applications, Arkhai Escrow Ecosystem Extensions |

## Suggested Scope

### Submission version to build first

Build this version first:

- Solidity escrow contract with `initiate`, `veto`, and `execute`
- agent runner that prepares payments but never sends irreversible transfers directly
- notification service for each queued payment
- human dashboard listing pending payments and countdown timers
- keeper / relayer for auto-execution after timeout
- onchain + offchain audit trail for every decision
- ERC-8004 identity and manifest files
- MetaMask delegation-based spending authority

### Highest-ROI optional extensions

If time remains, add in this order:

1. Uniswap-funded payout path
2. Celo deployment
3. Locus payment rail
4. ENS + Self identity UX
5. Venice private risk checks
6. Status gasless demo

## Risks and Non-Targets

- **bond.credit** is not a natural fit unless you are willing to pivot into live GMX trading on Arbitrum.
- **SuperRare** is only worth targeting if you explicitly turn the agent into an NFT trading or minting actor.
- **Octant** tracks are possible but require a narrative pivot from payment safety to public-goods allocation.
- **Markee**, **Bonfires.ai**, and **ampersend** are weak unless they become core dependencies rather than decorative add-ons.

## Link Inventory

### Page-level links discovered on the hack page

- `https://synthesis.md/hack/`
- `https://synthesis.md/`
- `https://synthesis.md/favicon.svg`
- `https://synthesis.md/_astro/hack.D_IeFYv9.css`
- `https://synthesis.md/_astro/agentjudge.Fcx5pz6a.css`
- `https://synthesis.md/synthesis-video.mp4`
- `https://synthesis.md/_astro/hack.astro_astro_type_script_index_0_lang.CK_Q4Av1.js`
- `https://scripts.simpleanalyticscdn.com/latest.js`

### Data endpoint used by the page

- `https://synthesis.devfolio.co/catalog?page=1&limit=50`

### Explicit resource links embedded in track descriptions

- `https://www.markee.xyz/ecosystem/platforms/github`
- `https://stack.olas.network/pearl/integration-guide/`
- `https://build.olas.network/build`
- `https://olas.network/mech-marketplace`
- `https://stack.olas.network/mech-client/`
- `https://marketplace.olas.network/`
- `https://build.olas.network/hire`
- `https://stack.olas.network/mech-server/`
- `https://build.olas.network/monetize`
- `https://docs.bankr.bot/llm-gateway/overview`
- `https://docs.bankr.bot/token-launching/overview`
- `https://docs.bankr.bot/openclaw/installation`
- `https://www.npmjs.com/package/@rareprotocol/rare-cli`
- `https://rare.xyz/`
- `https://t.me/+3F5IzO_UmDBkMTM1`
- `https://developers.uniswap.org/`
- `https://github.com/Uniswap/uniswap-ai`
- `https://api-docs.uniswap.org/`
- `https://docs.uniswap.org/`

## Bottom Line

The idea is strongest as a **trust and consent infrastructure layer for agentic payments**. The best bounty strategy is to center the build around:

- **Synthesis Open Track**
- **Protocol Labs ERC-8004**
- **Protocol Labs Let the Agent Cook**
- **MetaMask Delegations**

Then selectively widen coverage with:

- **Celo**
- **Uniswap**
- **Locus**
- **Status Network**
- **ENS / Self**
- **Venice**

That route keeps the concept coherent while still touching the highest-value tracks.
