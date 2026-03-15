# RageQuit Escrow

Day 1 scaffold for the hackathon build plan in `RageQuitEscrow_BuildPlan.docx`.

## Monorepo layout

- `contracts/` Hardhat smart-contract workspace
- `frontend/` Next.js dashboard scaffold with `wagmi` + `viem`

## Day 1 status

- Implemented `RageQuitEscrow.sol` with `initiate`, `veto`, `execute`, and `PendingPayment`.
- Added unit tests for queueing, veto flow, timeout execution, and auth/spend-limit checks.
- Added local deploy script and a polling keeper script for expired payments.
- Scaffolded Next.js app with wallet connect and pending payment feed shell.

## Quick start

1. Install dependencies:
   - `"C:\\Program Files\\nodejs\\npm.cmd" install`
2. Run contract tests:
   - `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:test`
3. Optional quick deploy smoke test on in-memory Hardhat network:
   - `"C:\\Program Files\\nodejs\\npm.cmd" --workspace contracts exec hardhat run scripts/deploy.js`
   - Deployment metadata is written to `contracts/deployments/hardhat.json`
4. Start local JSON-RPC node for persistent localhost flow (terminal A):
   - `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:node`
5. Deploy to localhost (terminal B):
   - `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:deploy:local`
   - Deployment metadata is written to `contracts/deployments/localhost.json`
6. Run keeper on localhost (terminal C):
   - `KEEPER_ONCE=true "C:\\Program Files\\nodejs\\npm.cmd" run contracts:keeper`
7. Start frontend:
   - Copy `frontend/.env.local.example` to `frontend/.env.local`
   - Set `NEXT_PUBLIC_ESCROW_ADDRESS` from deployment output
   - `"C:\\Program Files\\nodejs\\npm.cmd" run frontend:dev`