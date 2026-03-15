# RageQuit Escrow

Day 1-2 implementation from `RageQuitEscrow_BuildPlan.docx`.

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