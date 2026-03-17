# RageQuit Escrow

RageQuit Escrow is a smart-contract payment control layer for AI agents. An agent can queue a payment, the human operator gets a bounded veto window, and the payment executes only if the human does nothing. The goal is to make autonomous payments revocable at the edge without relying on offchain policy alone.

The repo contains the escrow contract, keeper flow, notification hooks, and dashboard needed to monitor pending payments and stop suspicious ones before execution.

## Monorepo layout

- `contracts/` Hardhat smart-contract workspace
- `frontend/` Next.js dashboard with `wagmi` + `viem`

## Day 1 complete

- `RageQuitEscrow.sol` with `initiate`, `veto`, `execute`, `PendingPayment`.
- Unit tests for queueing, veto flow, timeout execution, auth/spend-limit checks.
- Deploy script + keeper script.

## Day 2 complete

- Telegram event watcher for `PaymentQueued` notifications.
- Dashboard veto button wired to `veto(paymentId)` transaction.
- Dashboard owner-gating: only escrow owner can veto.
- Sepolia deployment script path and env wiring.

## Day 3 complete

- ERC-8004-style `agent.json` and `agent_log.json` artifacts in the repo root and `frontend/public/`.
- Structured `PaymentDecisionLogged` onchain event emitted for queue, veto, and execute actions.
- MetaMask Smart Accounts Kit integration for deriving a delegation-backed authorized smart account at deploy time.
- Delegation bundle generator for root delegations plus optional redelegation / subdelegation.
- Dashboard panel showing agent identity, trust metadata, and latest structured audit entries.

## Setup

1. Install dependencies:
   - `"C:\\Program Files\\nodejs\\npm.cmd" install`
2. Copy env template:
   - `copy contracts\\.env.example contracts\\.env`
3. For frontend env:
   - Copy `frontend/.env.local.example` to `frontend/.env.local`
   - Set `NEXT_PUBLIC_ESCROW_ADDRESS`
   - Optional: set `NEXT_PUBLIC_SEPOLIA_RPC_URL`

## Local flow

1. Run tests:
   - `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:test`
2. Start local node (terminal A):
   - `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:node`
3. Deploy to localhost (terminal B):
   - `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:deploy:local`
4. Run keeper (terminal C):
   - `KEEPER_ONCE=true "C:\\Program Files\\nodejs\\npm.cmd" run contracts:keeper`
5. Start frontend:
   - `"C:\\Program Files\\nodejs\\npm.cmd" run frontend:dev`

## Telegram watcher

1. Fill `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `contracts/.env`
2. Run on localhost:
   - `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:watch:telegram:local`
3. Run on Sepolia:
   - `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:watch:telegram:sepolia`

Watcher behavior:

- Reads escrow address from `ESCROW_ADDRESS` or `contracts/deployments/<network>.json`
- Polls `PaymentQueued` events and sends Telegram alerts
- Persists block cursor in `contracts/state/telegram-watcher-<network>.json`

## Sepolia deploy

Set in `contracts/.env`:

- `PRIVATE_KEY`
- `SEPOLIA_RPC_URL`
- Optional overrides: `ESCROW_OWNER`, `AUTHORIZED_AGENT`, `VETO_WINDOW_SECONDS`, `SPEND_LIMIT_WEI`, `INITIAL_FUND_WEI`

Deploy command:

- `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:deploy:sepolia`

Deployment metadata is written to `contracts/deployments/sepolia.json`.

## Day 3: agent identity + delegations

### Generate agent artifacts

1. Ensure the escrow is deployed and `ESCROW_ADDRESS` resolves from env or `contracts/deployments/<network>.json`
2. Set optional metadata in `contracts/.env`:
   - `AGENT_BASE_URL`
   - `AGENT_NAME`
   - `AGENT_DESCRIPTION`
   - `AGENT_REGISTRY`
   - `AGENT_ID`
3. Generate artifacts:
   - Localhost: `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:artifacts:local`
   - Sepolia: `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:artifacts:sepolia`

Generated files:

- `agent.json`
- `agent_log.json`
- `frontend/public/agent.json`
- `frontend/public/agent_log.json`
- `frontend/public/.well-known/agent-registration.json`

### Deploy with a MetaMask smart account as the authorized agent

Set in `contracts/.env`:

- `SMART_ACCOUNT_OWNER_PRIVATE_KEY`
- Optional: `SMART_ACCOUNT_DEPLOY_ENVIRONMENT=true` for localhost-only smart account environment deployment
- Optional: leave `AUTHORIZED_AGENT` empty so the deploy script derives the smart account address automatically

Then deploy:

- Localhost: `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:deploy:local`
- Sepolia: `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:deploy:sepolia`

The deployment metadata now records:

- `authorizationMode`
- `smartAccountOwnerAddress`
- `deploymentBlock`

### Create delegation bundle

Set in `contracts/.env`:

- `SMART_ACCOUNT_OWNER_PRIVATE_KEY`
- `AGENT_DELEGATE_PRIVATE_KEY`
- Optional: `AGENT_SUBDELEGATE_PRIVATE_KEY`
- Optional scope controls:
  - `DELEGATION_SCOPE_TYPE=function-call`
  - `DELEGATION_MAX_CALLS=25`
  - `SUBDELEGATION_MAX_CALLS=5`
  - `DELEGATION_EXPIRES_AT`
  - `SUBDELEGATION_EXPIRES_AT`

Generate signed delegation JSON:

- Localhost: `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:delegations:local`
- Sepolia: `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:delegations:sepolia`

Output:

- `contracts/delegations/<network>.json`

The default delegation scope is a constrained call to `RageQuitEscrow.initiate(address,uint256,bytes32)`. The escrow contract's own `spendLimit` remains the effective per-payment cap, and the signed redelegation chain limits who can invoke it.
