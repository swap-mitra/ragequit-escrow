# RageQuit Escrow

RageQuit Escrow is a smart-contract payment control layer for AI agents. Instead of letting an agent send irreversible payments directly, the agent queues a payout into escrow, the human operator gets a veto window, and the payment executes only if the human does nothing.

The core idea is simple: safer agentic payments need revocable execution, not just better prompting.

## Problem

Autonomous agents can make correct payment decisions most of the time and still be dangerous at the margin.

Common failure modes:

- the agent pays the wrong recipient
- the payment amount is valid in format but wrong in context
- a malicious or suspicious instruction pressures the agent into urgency
- the user notices too late, after funds are already gone

RageQuit Escrow addresses that by turning every payout into a pending claim with an explicit human override period enforced onchain.

## Solution

The system splits payment execution into two phases:

1. The agent prepares and queues a payment through `RageQuitEscrow`.
2. The human can veto during the veto window, or let the payment execute after timeout.

Supporting layers around that core:

- private risk scoring before queueing
- Telegram notifications for queued payments
- a dashboard for visibility and veto control
- structured agent artifacts and audit logs
- token-settlement and swap-backed funding support
- optional Celo, ENS, Self, and payment-rail metadata

## Architecture

### Core contract

`contracts/contracts/RageQuitEscrow.sol`

- authorized agent can queue a payment
- owner can veto during the active window
- anyone or a keeper can execute after timeout
- supports native settlement and ERC-20 settlement
- stores `intentHash` and `fundingReference` for auditability
- emits structured decision events for queue, veto, and execute

### Agent loop

`contracts/scripts/agentRunner.js`

- turns a task into a payment intent
- runs deterministic local reasoning or OpenAI-backed reasoning
- runs local or Venice-backed private risk checks
- supports direct token funding or swap-backed token funding
- writes run logs to `contracts/runs/<network>.json`

### Notifications

`contracts/scripts/telegramWatcher.js`

- watches `PaymentQueued` events
- sends operator alerts to Telegram
- now includes payment-rail and identity labeling metadata when configured

Telegram is the operator notification channel used by the project. There is no separate mobile notification implementation in this repo.

### Frontend

`frontend/`

- Next.js operator console
- wallet connect and owner-gated veto action
- pending payment feed
- agent identity and audit panel
- supports `localhost`, `sepolia`, and `alfajores`

### Artifacts and audit

`contracts/scripts/generateAgentArtifacts.js`

- generates `agent.json`
- generates `agent_log.json`
- includes rail metadata, ENS labels, and Self verification metadata when configured
- publishes artifacts to repo root and `frontend/public/`

## Repo layout

- `contracts/` Hardhat workspace for contracts, scripts, deployments, and tests
- `frontend/` Next.js dashboard
- `agent.json` generated agent registration artifact
- `agent_log.json` generated audit artifact

## Features

- Human-vetoed escrow payments
- Native and ERC-20 settlement
- Direct funding and swap-backed funding
- Localhost, Sepolia, and Celo Alfajores support
- Telegram notifications
- Private risk gate with local or Venice mode
- MetaMask Smart Account and delegation support
- ERC-8004-style agent artifacts
- Configurable payment rail metadata for Locus-style positioning
- ENS and Self identity metadata support

## How It Works

1. An agent receives a task and constructs a payment intent.
2. The runner hashes the intent and evaluates risk privately.
3. If allowed, the agent queues the payment onchain instead of transferring immediately.
4. Telegram alerts and the dashboard expose the pending payment.
5. The owner can veto before `unlocksAt`.
6. If not vetoed, the keeper or any caller can execute after the window closes.

## Tracks Targeted

Primary targets:

- Synthesis Open Track
- Protocol Labs: Agents With Receipts / ERC-8004
- Protocol Labs: Let the Agent Cook
- MetaMask: Best Use of Delegations

Strong secondary targets:

- Uniswap: Agentic Finance
- Celo: Best Agent on Celo
- Locus: Best Use of Locus
- Venice: Private Agents, Trusted Actions
- ENS: Identity / Communication / Open Integration
- Self: Best Self Agent ID Integration
- Status Network: Go Gasless

How the project maps:

- ERC-8004 artifacts and audit logs support the Protocol Labs trust-and-receipts story.
- Delegation tooling supports the MetaMask permissions story.
- Swap-backed token funding supports the Uniswap finance story.
- Alfajores support supports the Celo stablecoin/payment story.
- Payment rail metadata supports the Locus controlled-wallet story.
- ENS and Self metadata support identity-focused tracks.
- Venice risk mode supports the private-reasoning trust story.

## Setup

### Install

1. Install dependencies:

```powershell
"C:\Program Files\nodejs\npm.cmd" install
```

2. Copy contract env template:

```powershell
copy contracts\.env.example contracts\.env
```

3. Copy frontend env template:

```powershell
copy frontend\.env.local.example frontend\.env.local
```

## Local Run

### 1. Run tests

```powershell
"C:\Program Files\nodejs\npm.cmd" run contracts:test
```

### 2. Start the local node

```powershell
"C:\Program Files\nodejs\npm.cmd" run contracts:node
```

### 3. Deploy escrow

Native mode:

```powershell
"C:\Program Files\nodejs\npm.cmd" run contracts:deploy:local
```

Token mode:

- set `SETTLEMENT_MODE=token` in `contracts/.env`
- optional: set `INITIAL_FUND_TOKEN_UNITS`

```powershell
"C:\Program Files\nodejs\npm.cmd" run contracts:deploy:local
```

### 4. Start Telegram watcher

- set `TELEGRAM_BOT_TOKEN`
- set `TELEGRAM_CHAT_ID`

```powershell
"C:\Program Files\nodejs\npm.cmd" run contracts:watch:telegram:local
```

### 5. Run the agent

Set in `contracts/.env`:

- `AGENT_TASK`
- `AGENT_RECIPIENT`
- either `AGENT_AMOUNT_WEI` or `AGENT_AMOUNT_ETH`

Then run:

```powershell
"C:\Program Files\nodejs\npm.cmd" run contracts:run-agent:local
```

### 6. Execute expired payments

```powershell
KEEPER_ONCE=true "C:\Program Files\nodejs\npm.cmd" run contracts:keeper
```

### 7. Start frontend

Set in `frontend/.env.local`:

- `NEXT_PUBLIC_ESCROW_ADDRESS`
- optional: `NEXT_PUBLIC_TARGET_CHAIN=localhost`
- optional: `AUDIT_ARTIFACT_NETWORK=localhost`

Then run:

```powershell
"C:\Program Files\nodejs\npm.cmd" run frontend:dev
```

## Sepolia Run

Set in `contracts/.env`:

- `PRIVATE_KEY`
- `SEPOLIA_RPC_URL`
- optional token mode values such as `SETTLEMENT_MODE`, `SETTLEMENT_TOKEN`, `SWAP_ROUTER_ADDRESS`

Useful commands:

```powershell
"C:\Program Files\nodejs\npm.cmd" run contracts:deploy:sepolia
"C:\Program Files\nodejs\npm.cmd" run contracts:run-agent:sepolia
"C:\Program Files\nodejs\npm.cmd" run contracts:artifacts:sepolia
"C:\Program Files\nodejs\npm.cmd" run contracts:watch:telegram:sepolia
```

## Alfajores Run

Set in `contracts/.env`:

- `CELO_ALFAJORES_RPC_URL`
- `CELO_PRIVATE_KEY` or reuse `PRIVATE_KEY`
- `SETTLEMENT_MODE=token`
- `SETTLEMENT_TOKEN=<token address>`

Useful commands:

```powershell
"C:\Program Files\nodejs\npm.cmd" run contracts:deploy:alfajores
"C:\Program Files\nodejs\npm.cmd" run contracts:run-agent:alfajores
"C:\Program Files\nodejs\npm.cmd" run contracts:artifacts:alfajores
"C:\Program Files\nodejs\npm.cmd" run contracts:watch:telegram:alfajores
KEEPER_ONCE=true "C:\Program Files\nodejs\npm.cmd" run contracts:keeper:alfajores
```

For the frontend:

- `NEXT_PUBLIC_TARGET_CHAIN=alfajores`
- `NEXT_PUBLIC_ESCROW_ADDRESS=<deployed escrow>`
- `NEXT_PUBLIC_ALFAJORES_RPC_URL=<rpc url>`

## Optional Configuration

### Risk gate

- `RISK_PROVIDER=local|venice`
- `RISK_THRESHOLD=70`
- `RISK_HIGH_VALUE_WEI=500000000000000000`
- `RISK_BLOCKED_RECIPIENTS=...`
- `RISK_SUSPICIOUS_KEYWORDS=...`
- `VENICE_API_KEY=...`

### Swap-backed token funding

- `AGENT_FUNDING_MODE=swap-native`
- `AGENT_SWAP_NATIVE_AMOUNT_WEI=...`
- `AGENT_SWAP_NATIVE_AMOUNT_ETH=...`
- `AGENT_SWAP_MIN_AMOUNT_OUT=...`
- `SWAP_ROUTER_KIND=mock|uniswap-v3`
- `SWAP_ROUTER_ADDRESS=...`
- `UNISWAP_WRAPPED_NATIVE_TOKEN=...`
- `UNISWAP_QUOTER_ADDRESS=...`
- `UNISWAP_POOL_FEE=3000`

### Delegations and smart accounts

- `SMART_ACCOUNT_OWNER_PRIVATE_KEY`
- `AGENT_DELEGATE_PRIVATE_KEY`
- `AGENT_SUBDELEGATE_PRIVATE_KEY`
- `DELEGATION_MAX_CALLS`
- `SUBDELEGATION_MAX_CALLS`

### Payment rail metadata

Useful for Locus-style positioning:

- `PAYMENT_RAIL_PROVIDER=locus`
- `PAYMENT_RAIL_NETWORK=base|alfajores|sepolia|localhost`
- `PAYMENT_RAIL_ASSET_SYMBOL=USDC`
- `PAYMENT_RAIL_ASSET_ADDRESS=...`
- `PAYMENT_RAIL_WALLET_ADDRESS=...`
- `PAYMENT_RAIL_WALLET_LABEL=...`
- `PAYMENT_RAIL_POLICY_URL=...`

### ENS and Self identity metadata

- `AGENT_ENS_NAME=...`
- `OWNER_ENS_NAME=...`
- `AUTHORIZED_AGENT_ENS_NAME=...`
- `OWNER_DISPLAY_NAME=...`
- `AUTHORIZED_AGENT_DISPLAY_NAME=...`
- `ADDRESS_BOOK_JSON={...}`
- `RECIPIENT_ENS_JSON={...}`
- `SELF_VERIFICATION_ENABLED=true|false`
- `SELF_VERIFIED=true|false`
- `SELF_PROOF_URL=...`

## Generated Outputs

- `contracts/deployments/<network>.json`
- `contracts/runs/<network>.json`
- `contracts/delegations/<network>.json`
- `agent.json`
- `agent_log.json`
- `frontend/public/agent.json`
- `frontend/public/agent_log.json`

## Verification

Validated in this repo:

- contract test suite passes
- frontend production build passes

Not included in this repo automation:

- final hackathon video recording
- submission form completion
- mainnet deployment execution
