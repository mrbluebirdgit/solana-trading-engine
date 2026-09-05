# Observation-only beta deployment

## Scope and safety boundary

This deployment runs the always-on Pump event observer, records admitted,
normalized create/migrate log events as append-only JSONL, requests read-only
Helius and Jupiter data, and may send an observation alert to one allowed
Telegram chat. When explicitly enabled, the same process also polls configured
attention sources, matches extracted narratives to canonical Pump mints, and
writes those records to the same ledger. The log is not a raw transaction
archive.

It does **not** paper trade or live trade. It does not build, sign, submit, or
reconcile transactions; hold a wallet key; manage positions; or establish that
an alert is profitable. The image defaults `TRADING_MODE=observe` and
`LIVE_TRADING_ENABLED=false`, and the runtime rejects any non-observe mode or
truthy live flag. Do not add wallet or signer material to this deployment.

The container command is:

```text
node scripts/run-observer.mjs --notify
```

The same command is available as `npm start` outside Docker.

## Host requirements

The user must create and control the deployment host, its secret manager, its
persistent storage, and its access policy. Use an always-on container or worker
service that supports Node.js 22, automatic restart after process or host
failure, a private persistent volume, and outbound HTTPS and WebSocket access.

The observer initiates its Helius WebSocket connection. It does not require a
public webhook URL. Keep the health port private unless the selected host needs
it for an internal health check.

This beta has no reconnect backfill, finalized reconciliation, or durable
cross-restart deduplication. A post-subscription disconnect is written as a
`stream_gap`, latches readiness unhealthy, and causes the entrypoint to stop
cleanly; the container supervisor then starts a new session. This avoids
accumulating a native WebSocket whose peer ignored the close handshake, but
events in the gap remain missing. Restart does not repair history.

## Runtime configuration

Store these values in the deployment host's secret manager, not in GitHub,
Docker build arguments, the image, shell history, screenshots, or this file.
GitHub Actions secrets are not automatically available to a deployment host.

| Variable | Required | Purpose |
|---|---:|---|
| `HELIUS_API_KEY` | Yes | Read-only Solana RPC and Pump log subscription |
| `JUPITER_API_KEY` | Yes | Read-only intended-size route quotes |
| `TELEGRAM_BOT_TOKEN` | Yes | Sends observation alerts through the Telegram Bot API |
| `TELEGRAM_ALLOWED_CHAT_ID` | Yes | Restricts alert delivery to the user's approved chat |
| `PORT` | No | Health listener port; defaults to `3000` |
| `OBSERVATION_LOG_PATH` | No | Append-only discovery log; defaults to `/var/lib/solana-observer/observations.jsonl` in the image |
| `OBSERVER_MAX_EVENT_AGE_MS` | No | Suppresses delayed triggers; defaults to `30000` ms |
| `NARRATIVE_RADAR_ENABLED` | No | Enables observation-only attention clustering and mint matching; defaults to `false` |
| `X_BEARER_TOKEN` | Conditional | X trends and optional recent-search access |
| `LUNARCRUSH_API_KEY` | Conditional | Aggregate topic discovery |
| `NEWSAPI_KEY` | Conditional | Top-headline discovery |
| `NARRATIVE_NEWS_COUNTRIES` | No | One to five comma-separated ISO alpha-2 headline scopes; defaults to `us` |
| `NARRATIVE_RSS_FEEDS` | Conditional | Comma/newline-separated approved HTTPS RSS/Atom feeds |
| `NARRATIVE_POLL_INTERVAL_MS` | No | Attention polling interval; defaults to `1200000` ms (20 minutes) |
| `NARRATIVE_X_RECENT_SEARCH_ENABLED` | No | Enables bounded X confirmation queries; defaults to `false` |
| `NARRATIVE_GDELT_ENABLED` | No | Enables bounded GDELT confirmation queries; defaults to `false` |
| `NARRATIVE_CONFIRMATION_MAX_TERMS` | No | Maximum terms confirmed per tick; defaults to `3` |
| `NARRATIVE_ALERT_MIN_PRIORITY` | No | Uncalibrated research-routing floor; defaults to `70` |
| `LUNARCRUSH_DAILY_REQUEST_LIMIT` | No | Persisted conservative ceiling; defaults to `100` |
| `LUNARCRUSH_DAILY_REQUEST_RESERVE` | No | Calls held outside routine collection; defaults to `10` |
| `NEWSAPI_DAILY_REQUEST_LIMIT` | No | Persisted conservative ceiling; defaults to `100` |
| `NEWSAPI_DAILY_REQUEST_RESERVE` | No | Calls held outside routine collection; defaults to `10` |
| `GENERIC_OPPORTUNITY_ALERTS_ENABLED` | No | Broad stage/quote alerts; defaults off in narrative mode to prevent duplicate alert traffic |
| `BIRDEYE_API_KEY` | No | Candidate-triggered token overview, security, and price evidence |
| `GMGN_API_KEY` | No | Candidate-triggered token intelligence and price evidence; never signing |
| `CANDIDATE_PROVIDER_TIMEOUT_MS` | No | Maximum bounded enrichment wait; defaults to `6000` ms |
| `BIRDEYE_DAILY_REQUEST_LIMIT` | No | Conservative configured ceiling; defaults to `100` |
| `BIRDEYE_DAILY_REQUEST_RESERVE` | No | Calls held outside routine enrichment; defaults to `10` |
| `GMGN_DAILY_REQUEST_LIMIT` | No | Conservative configured ceiling; defaults to `50` |
| `GMGN_DAILY_REQUEST_RESERVE` | No | Calls held outside routine enrichment; defaults to `5` |
| `NARRATIVE_OUTCOME_TRACKING_ENABLED` | No | Defaults on when Birdeye or GMGN is configured |
| `NARRATIVE_OUTCOME_NOTIFICATIONS_ENABLED` | No | Sends measured price follow-ups; defaults to `true` |
| `NARRATIVE_OUTCOME_CHECKPOINTS_MS` | No | Defaults to 1, 5, 15, and 60 minutes |

When `NARRATIVE_RADAR_ENABLED=true`, at least one discovery source—X,
LunarCrush, NewsAPI, or approved RSS—must be configured. Social and news keys
are read-only data credentials. They do not replace the four baseline values
required by the notifying observer image, and GitHub Actions secrets are not
automatically available on the deployment host.

The user should create the Telegram bot and approved chat, enter the four
required values directly into the host, and retain the ability to rotate or
revoke each credential. Never provide a seed phrase, wallet private key, or
Telegram user-session file to this service.

On Render, attach the smallest persistent disk available and set its mount path
to `/var/lib/solana-observer`. If the current service-creation form does not ask
for a disk name, none needs to be entered; Render assigns the disk resource from
the service. The mount path is the setting the container depends on.

## Build and preflight

Build from a reviewed commit rather than from an unreviewed working tree:

```bash
docker build --pull --tag solana-observer:beta .
```

Before starting the worker, run the non-signing dependency checks using secrets
injected by the host:

```bash
docker run --rm --env-file /secure/host/path/observer.env \
  solana-observer:beta npm run verify:helius

docker run --rm --env-file /secure/host/path/observer.env \
  solana-observer:beta npm run verify:jupiter

docker run --rm --env-file /secure/host/path/observer.env \
  solana-observer:beta npm run verify:observer
```

The combined observer preflight opens and acknowledges a Helius subscription,
requests a read-only Jupiter SOL-to-USDC route, optionally tests configured
Birdeye and GMGN read access, and sends one real Telegram test message to
`TELEGRAM_ALLOWED_CHAT_ID`. It never builds, signs, or submits a transaction.

`/secure/host/path/observer.env` is an example location outside the repository.
If an environment file is unavoidable, restrict it to the deployment account
and set its permissions to `0600`. A managed secret store is preferred.

## Start the worker

Create one persistent volume and start one observer instance:

```bash
docker volume create solana-observer-data

docker run --detach \
  --name solana-observer \
  --restart unless-stopped \
  --stop-timeout 30 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 128 \
  --memory 512m \
  --cpus 1.0 \
  --env-file /secure/host/path/observer.env \
  --publish 127.0.0.1:3000:3000 \
  --volume solana-observer-data:/var/lib/solana-observer \
  solana-observer:beta
```

Allow at least 30 seconds for `SIGTERM` shutdown. The process uses a 25-second
internal deadline, then exits explicitly so a peer that ignores the WebSocket
close handshake cannot hold the container open. The worker stops intake,
persists already accepted raw ingress, discards queued enrichment, aborts active
provider requests, flushes the ledger, and then closes health.

If `PORT` is changed, update both sides of the published-port mapping and the
host's health-check target.

The image runs as the unprivileged `node` user. If a bind mount is used instead
of a named volume, give container UID/GID `1000:1000` write access only to the
dedicated observation directory.

Run only one instance against a single log volume. The JSONL writer is
append-only, not a multi-writer database or paper-position ledger.

## Health checks

The runtime exposes two private endpoints on `PORT`:

- `GET /livez` reports whether the process and health listener are alive.
- `GET /readyz` reports whether the observer is ready to receive events. Use it
  as the deployment platform's readiness check. The Docker image also uses
  this endpoint for its health check. Readiness fails closed until
  the observation ledger is writable, the configured notification channel has
  accepted a startup probe, Helius/Jupiter startup reads have succeeded, and
  Helius has acknowledged the subscription, and every enabled subsystem has
  completed its startup checks. If the narrative radar is enabled, at least one
  configured discovery adapter must succeed. Provider health can recover after a
  later successful enrichment. Dropped or skipped pipeline work, exhausted
  transport failures, stream gaps, missed narrative mint enrichment, and
  stale-trigger suppression are latched unhealthy until restart so they cannot
  be silently forgotten. A persisted,
  candidate-level abstention such as an unsupported token or unavailable route
  is not treated as a pipeline gap.

Check them from the host:

```bash
curl --fail --silent --show-error http://127.0.0.1:3000/livez
curl --fail --silent --show-error http://127.0.0.1:3000/readyz
```

A healthy endpoint does not authorize a trade and does not prove alert quality,
profitability, complete market coverage, or durable paper-trading state. The
bounded ingress queue drops new events before persistence when saturated and
increments `overloadedEvents`; a separate bounded enrichment queue retains the
raw event but can skip analysis. Either condition makes readiness fail closed,
and the JSONL log is not guaranteed to be complete market history. Keep the worker
in observation-only beta if readiness is unstable, discovery logging stops, or
the expected Telegram alert does not arrive.

Alert delivery is best-effort and at most once in this beta: there is no durable
outbox, retry worker, or cross-restart idempotency key. Any Telegram delivery
failure is recorded and latches readiness unhealthy until restart, but a crash
between the observation write and send can still lose an alert. Do not treat the
Telegram channel as a complete signal archive.

Docker does not restart a container merely because its health status becomes
`unhealthy`. A standalone Docker deployment therefore needs an external monitor
that restarts on sustained `/readyz` failure; an orchestrator should use its
native readiness and restart policy.

## Persistence and operations

Mount durable storage at `/var/lib/solana-observer` or set
`OBSERVATION_LOG_PATH` to another writable path on a dedicated persistent
volume. The default file is `observations.jsonl`.

The host owner is responsible for:

1. Restricting access to the volume and host logs.
2. Monitoring disk use and rotating or archiving JSONL without truncating a
   file that the worker is actively writing.
3. Backing up the observations needed for later research or replay.
4. Monitoring restarts, readiness failures, provider rate limits, and Telegram
   delivery errors.
5. Deploying reviewed image tags and retaining a known-good tag for rollback.

The JSONL file is evidence from an observation beta. It is not a transactional
database, an order ledger, a fill record, or proof that the future paper-trading
acceptance gates have been met.
