# Solana Trading Engine

A private, modular system for researching Solana activity, evaluating trade opportunities, enforcing risk limits, and eventually routing explicitly approved live orders through replaceable execution adapters.

## Current status

The repository foundation and credential-validation workflows for Helius, Jupiter, Birdeye, GMGN, Solscan, and the observation worker are implemented. Telegram Bot delivery is implemented but still requires the operator's Bot token and allowed chat ID; the separate future Telegram user-account ingestion path currently has only a local format validator. Birdeye REST, the exact-locked official GMGN CLI, and Solscan Pro REST now provide candidate-triggered, read-only evidence after a narrative match clears the alert floor. Persisted request budgets and provider backoff keep those calls bounded. Research governance is explicit: material rules carry a source, evidence class, limitations, and calibration status, and research hypotheses must define falsification tests before promotion. The current numeric policy contains paper-only hypotheses and conservative guardrails—not empirically proven optimums.

The read-only canonical Pump/PumpSwap stage resolver, Helius point collector, Pump log observer, Jupiter intended-size quote adapter, and channel-agnostic alert delivery exist. An observation-only narrative radar adds modular X, plan-eligible LunarCrush and NewsAPI, approved RSS, and GDELT attention collection; shared entity extraction and clustering; Helius/DexScreener mint enrichment; Pump mint matching; research-priority scoring; candidate-triggered Birdeye/GMGN/Solscan evidence; ledger evidence; and Telegram alerts. In narrative-only mode, Jupiter is not called for every raw mint. The owner-locked desk law now converts qualified candidates into deterministic `RISK_KILL`, `SCOUT_SKIP`, or `SCOUT_PASS` decisions before alerts. THE LAWYER ranks only passes, learns separate curve/migrated ordering weights from 15-minute results, and submits auditable recommendations without changing the desk thresholds. Successful alerts with an observed price are followed at 1, 5, 15, and 60 minutes, with point-to-point changes persisted and optionally sent to Telegram. The observer remains live-locked: the current evaluator emits only `REJECT` or `ALERT_ONLY`; `PAPER_ELIGIBLE` is reserved and currently unreachable. A paper executor, transactional paper-state persistence, reconnect backfill, and a confirmed always-on deployment do not exist. No master trading executor exists, and live trading remains locked.

See the [desk filter law](docs/DESK_FILTER_LAW.md), [THE LAWYER and trading-floor roles](docs/THE_LAWYER.md), [strategy specification](docs/STRATEGY_SPECIFICATION.md), [narrative radar](docs/NARRATIVE_RADAR.md), [evidence ledger](docs/EVIDENCE_LEDGER.md), [research and calibration protocol](docs/RESEARCH_AND_CALIBRATION_PROTOCOL.md), [master decision contract](docs/MASTER_DECISION_CONTRACT.md), [market participation feature specification](docs/TRAFFIC_FEATURE_SPECIFICATION.md), [Pump stage resolver](docs/PUMP_STAGE_RESOLVER.md), [audit of supplied recommendations](docs/SUPPLIED_RECOMMENDATION_AUDIT.md), [machine-readable evidence registry](config/evidence-registry.v1.json), [provider subscription policy](config/provider-subscriptions.v1.json), [narrative source catalog](config/narrative-source-catalog.v1.json), [traffic feature catalog](config/traffic-feature-catalog.v1.json), [paper-only hypothesis candidates](config/hypothesis-candidates.v1.json), [versioned policy](config/policy.v1.yaml), and [complete integration roadmap](docs/INTEGRATION_ROADMAP.md).

## Observation beta quickstart

The deployable surface is a read-only Pump observer with bounded processing,
reconnection, health endpoints, an append-only JSONL discovery log, intended-size
Jupiter quotes, and optional Telegram Bot alerts. It has no signer and no
paper or live executor.

Coverage is intentionally narrow in this beta: it admits Pump `create` and
`migrate` events, not full PumpSwap trade flow; Token-2022 / `create_v2`
candidates abstain until extension parsing is implemented; and reconnect gaps
are recorded but not backfilled. Treat alerts as partial observations, not a
complete or validated market feed.

```bash
cp .env.example .env
# Add Helius, Jupiter, and one complete notification channel to .env.
npm test
npm run observe:run:local -- --notify
```

Read [the deployment runbook](docs/DEPLOYMENT.md) before placing the observer on
an always-on host. `GET /readyz` becomes healthy only after Helius acknowledges
the subscription and local observation storage remains writable.

### Optional narrative radar

Set `NARRATIVE_RADAR_ENABLED=true` and configure at least one production-eligible
source: X API, a social-enabled LunarCrush plan, a production NewsAPI plan, or
`NARRATIVE_RSS_FEEDS`. A Hobby LunarCrush key and Developer NewsAPI key do not
qualify in the production container. The radar runs inside the same observer, writes to the
same ledger, and uses the same optional Telegram Bot channel. It has no default
keywords or wallet lists, and its uncalibrated priority score can route alerts
only—it cannot authorize a trade. See the [radar runbook](docs/NARRATIVE_RADAR.md).

Add `BIRDEYE_API_KEY`, `GMGN_API_KEY`, and/or `SOLSCAN_API_KEY` for bounded evidence enrichment and
post-alert price checks. These providers are not polled for every mint. By
default, generic opportunity alerts are disabled when the narrative radar is
enabled so Telegram receives only threshold-clearing narrative alerts and their
measured follow-ups. `LUNARCRUSH_PLAN=hobby` disables unsupported social-topic
calls in production, and `NEWSAPI_PLAN=developer` disables delayed,
development-only NewsAPI calls in production. LunarCrush and NewsAPI also use persisted daily ceilings,
exponential failure backoff, and `Retry-After` handling rather than relying on
one unlimited polling clock.

## Research-governed decision system

The future executor must estimate three separate quantities: adverse-event/manipulation risk, the engine's net return after all costs, and execution/landing probability. When an approved wallet observation nominates a candidate, net return must also include the imitation delay and crowding cost. The executor may combine these quantities only through deterministic policy and only after point-in-time, chronological validation. API access improves data coverage and reliability; it does not create predictive edge by itself.

The repository rejects fixed “magic formulas,” raw leader copying, social virality as authorization, provider labels as ground truth, and any claim that a backtest proves future profit. The evidence-registry validator keeps those shortcuts forbidden while the project is live-locked.

## Planned pipeline

1. Collect Telegram, on-chain, market, news, search, video, community, and social signals.
2. Normalize and deduplicate events.
3. Score opportunities using transparent strategy rules.
4. Apply position, liquidity, loss, exposure, and kill-switch limits.
5. Route approved orders through an execution adapter.
6. Reconcile fills and record every decision and transaction.

## Telegram configuration

The planned Telegram user-API integration will monitor explicitly approved signal sources. It is not a privileged strategy or execution channel, and no GMGN Bot trading path is implemented.

Required secret names:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Keep those values local until the Telegram user client and ingestion path exist. Do not add them to GitHub merely to run a format check, and never put real values in `.env.example`, commits, issues, pull requests, screenshots, or chat.

On the future Mac, copy `.env.example` to `.env`, enter the same values locally, and run:

```bash
npm run verify:telegram:local
```

This local command validates formatting only; it does not contact Telegram or prove the credentials work. The first real authorization will be performed interactively on that Mac using Telegram's QR-login flow after the client exists. If code-based login is ever used as a fallback, enter the phone number only at the local prompt. The login code, 2FA password, phone number, and generated session must remain local.

## Helius configuration

Helius supplies the Solana RPC, transaction, and webhook infrastructure used to monitor wallets and on-chain events.

Required secret name:

- `HELIUS_API_KEY`

Add the project key as a GitHub Actions repository secret. The key must never be committed or pasted into an issue, pull request, screenshot, or chat. Use the **Verify integrations** workflow with provider `helius`, or post the exact owner-only command `/verify helius` on a repository issue, to validate its formatting and make a live, read-only mainnet RPC health request.

Run manual **Verify integrations** dispatches from `main`; other selected branches are intentionally skipped. Owner-only issue commands also check out the default branch and never execute pull-request-head code with secrets.

## GMGN reference integration

GMGN is one external intelligence source, not the engine's strategy, risk authority, or master architecture. Its market and behavioral fields are normalized into our own provider-independent observation format so they can later be corroborated against Helius, Telegram, social, and execution-quote sources.

Required secret name:

- `GMGN_API_KEY`

The GMGN integration invokes an exact-version, lockfile-pinned official CLI with
a fixed read-only token-information command, maps the response into the engine's
provider-independent observation contract, and rejects `GMGN_PRIVATE_KEY` at
startup. GitHub's owner-triggered verifier and the deployment preflight can test
read access without printing returned token data. Swap, order, wallet, and
GMGN-controlled execution commands are never accepted.

See [intelligence architecture](docs/INTELLIGENCE_ARCHITECTURE.md) for the boundary between external references and our engine.

## Jupiter reference integration

Jupiter provides an independent source for prices, swap quotes, and route comparison. It is an execution candidate, not the engine's strategy or risk authority.

Required secret name:

- `JUPITER_API_KEY`

Use the **Verify integrations** workflow with provider `jupiter`, or post the exact owner-only command `/verify jupiter` on a repository issue. Verification makes one authenticated, read-only SOL price request and never logs the key or returned price. The quote adapter omits wallet parameters and translates provider responses into our own `RouteQuote` schema. Wallet creation, transaction building, signing, and submission remain disabled.

## Security boundaries

- No wallet seed phrase or private signing key belongs in GitHub, ChatGPT, logs, or screenshots.
- Use a separate Telegram account and a separate, balance-capped trading wallet.
- GitHub workflows receive API credentials only through encrypted repository secrets.
- Secret-bearing workflows are manual and use read-only repository permissions.
- `LIVE_TRADING_ENABLED` defaults to `false`. Changing this environment variable or any configuration file cannot unlock live trading; a future live-capable policy must first pass the documented promotion, security, signer, and owner-approval gates.

See [API inventory](docs/API_INVENTORY.md) and [security policy](SECURITY.md).
