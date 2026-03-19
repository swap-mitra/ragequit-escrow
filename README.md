# RageQuit Escrow

RageQuit Escrow is a smart-contract payment control layer for AI agents. An agent can queue a payment, the human operator gets a bounded veto window, and the payment executes only if the human does nothing. The goal is to make autonomous payments revocable at the edge without relying on offchain policy alone.

The repo contains the escrow contract, keeper flow, notification hooks, agent runner, and dashboard needed to monitor pending payments and stop suspicious ones before execution.

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

## Day 4 complete

- Agent runner script that converts a task into a structured payment intent.
- Deterministic local reasoning with optional OpenAI-backed reasoning.
- Intent JSON hashed before queueing and passed to `initiate()`.
- Local run log persisted under `contracts/runs/<network>.json` for demo and audit.
- Optional post-run refresh of `agent_log.json` artifacts.

## Day 5 complete

- Private risk check inserted before `RageQuitEscrow.initiate()`.
- Deterministic local risk scoring with optional Venice-backed risk assessment.
- Risk-blocked payments stay offchain and are recorded only in local run logs.
- Allowed payments still queue through escrow with the same hashed intent flow.
- Frontend audit panel now shows the latest private risk verdicts from the run log artifacts.
- Frontend audit panel now has a manual refresh button that regenerates artifacts through a local Next.js route.

## Setup

1. Install dependencies:
   - `"C:\\Program Files\\nodejs\\npm.cmd" install`
2. Copy env template:
   - `copy contracts\\.env.example contracts\\.env`
3. For frontend env:
   - Copy `frontend/.env.local.example` to `frontend/.env.local`
   - Set `NEXT_PUBLIC_ESCROW_ADDRESS`
   - Optional: set `NEXT_PUBLIC_SEPOLIA_RPC_URL`
   - Optional: set `AUDIT_ARTIFACT_NETWORK=localhost|sepolia` for the manual refresh button

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

### Manual refresh from the frontend

The `Refresh Audit Artifacts` button in the dashboard calls `POST /api/audit-artifacts/refresh`, which runs:

- `contracts:artifacts:localhost` if `AUDIT_ARTIFACT_NETWORK=localhost`
- `contracts:artifacts:sepolia` if `AUDIT_ARTIFACT_NETWORK=sepolia`

This route is intended for local development and trusted operator use, because it can execute the artifact generation script on the same machine as the frontend server.

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

## Day 4: agent loop

### Run the agent loop

Set in `contracts/.env`:

- `AGENT_TASK`
- `AGENT_RECIPIENT`
- Either `AGENT_AMOUNT_WEI` or `AGENT_AMOUNT_ETH`
- Optional: `AGENT_REASONING_PROVIDER=local|openai`
- Optional: `OPENAI_API_KEY`
- Optional: `AGENT_RUNNER_PRIVATE_KEY`

Run the agent:

- Localhost: `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:run-agent:local`
- Sepolia: `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:run-agent:sepolia`

Outputs:

- Builds reasoning before queueing
- Hashes the structured intent before sending
- Writes local run data to `contracts/runs/<network>.json`
- Refreshes `agent_log.json` by default after a successful queue

## Day 5: private risk gate

### Configure the risk gate

Set in `contracts/.env`:

- `RISK_PROVIDER=local|venice`
- `RISK_THRESHOLD=70`
- `RISK_HIGH_VALUE_WEI=500000000000000000`
- Optional: `RISK_BLOCKED_RECIPIENTS=0xabc...,0xdef...`
- Optional: `RISK_SUSPICIOUS_KEYWORDS=urgent,override,bypass,unknown`
- For Venice mode: `VENICE_API_KEY`
- Optional override: `VENICE_API_URL=https://api.venice.ai/api/v1/chat/completions`
- Optional override: `VENICE_MODEL=venice-uncensored`

Behavior:

- `local` computes a private deterministic score from amount, recipient denylist, suspicious keywords, and reasoning confidence.
- `venice` calls Venice's OpenAI-compatible `chat/completions` API and falls back to local logic only when `VENICE_API_KEY` is absent.
- If the verdict is `block_payment`, the payment is not queued onchain.
- Both allow and block decisions are written to `contracts/runs/<network>.json`.
- Risk decisions are published into `agent_log.json` whenever artifacts are refreshed.

### Venice integration steps

Venice is the private cognition layer in this repo: private reasoning over sensitive payment context, then a public onchain action only if the private risk gate allows it. The integration point is [agentRunner.js](C:/projects/ragequit-escrow/contracts/scripts/agentRunner.js), and it now matches Venice's OpenAI-compatible inference pattern.

1. Set these in `contracts/.env`:
   - `RISK_PROVIDER=venice`
   - `VENICE_API_KEY=your-venice-inference-key`
   - Optional: `VENICE_API_URL=https://api.venice.ai/api/v1/chat/completions`
   - Optional: `VENICE_MODEL=venice-uncensored`
   - `RISK_THRESHOLD=70`
2. Keep your normal agent inputs set:
   - `AGENT_TASK`
   - `AGENT_RECIPIENT`
   - `AGENT_AMOUNT_ETH` or `AGENT_AMOUNT_WEI`
3. Run the agent:
   - `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:run-agent:local`
4. Check results:
   - `contracts/runs/<network>.json`
   - `agent_log.json`
   - frontend audit panel

Outgoing Venice request shape:

```json
{
  "model": "venice-uncensored",
  "temperature": 0,
  "messages": [
    {
      "role": "system",
      "content": "You are a private payment risk analyst. Review the proposed payment and return only a JSON object with keys riskScore, reasons, and verdict. riskScore must be an integer from 0 to 100. verdict must be queue_payment or block_payment. Keep reasons concise."
    },
    {
      "role": "user",
      "content": "{\"task\":\"Pay vendor invoice 42\",\"recipient\":\"0x1234...\",\"amountWei\":\"100000000000000000\",\"network\":\"localhost\",\"reasoning\":{...},\"metadata\":{\"escrowAddress\":\"0x5FbD...\"}}"
    }
  ]
}
```

Expected model output inside `choices[0].message.content`:

```json
{
  "riskScore": 82,
  "reasons": [
    "recipient is newly observed",
    "task description contains urgency terms"
  ],
  "verdict": "block_payment"
}
```

How the runner interprets it:

- `verdict=block_payment` blocks immediately
- otherwise `riskScore >= RISK_THRESHOLD` means `block_payment`
- lower scores mean `queue_payment`
- if `VENICE_API_KEY` is missing, the runner falls back to local risk logic
- if Venice returns text around the JSON, the runner extracts the JSON object and parses it
- if Venice returns no `reasons`, the runner records `venice risk score returned without reasons`

Security note:

- Do not commit or share your Venice inference key.
- If the key you pasted into chat was real, rotate it in Venice and update `contracts/.env`.

### Verify allow path

1. Set a benign task, recipient, and amount below both `SPEND_LIMIT_WEI` and `RISK_HIGH_VALUE_WEI`.
2. Run:
   - Localhost: `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:run-agent:local`
3. Confirm:
   - A new `queued_onchain` entry appears in `contracts/runs/localhost.json`
   - A new pending payment appears in the dashboard
   - A matching `Allowed` verdict appears in the audit panel after artifact refresh

### Verify block path

Use either of these:

- Put the chosen recipient into `RISK_BLOCKED_RECIPIENTS`
- Or use a suspicious task plus a low enough `RISK_THRESHOLD`
- Or have Venice return `verdict=block_payment`
- Or have Venice return a score above the threshold

Then run:

- Localhost: `"C:\\Program Files\\nodejs\\npm.cmd" run contracts:run-agent:local`

Confirm:

- A new `blocked_by_risk` entry appears in `contracts/runs/localhost.json`
- No new pending payment is queued onchain
- A matching `Blocked` verdict appears in the audit panel after artifact refresh
