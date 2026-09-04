# Integration roadmap v1

This matrix separates required secrets from sources that need no credential. Each external source remains replaceable and may contribute evidence, alerts, infrastructure, or candidate routes; none controls the strategy.

## Core and next integrations

| Priority | Service | Purpose | Credential / configuration | Current status |
|---:|---|---|---|---|
| 1 | Telegram user API | Monitor approved Telegram sources | `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`; local session later | Verified |
| 2 | Helius | Primary RPC, enhanced transactions, webhooks, WebSockets, replay | `HELIUS_API_KEY` | Verified read-only RPC |
| 3 | GMGN | Supplemental wallet, market, and token-risk evidence | `GMGN_API_KEY` | Verified read-only |
| 4 | Jupiter | Price and provider-neutral route quotes; later execution candidate | `JUPITER_API_KEY` | Verified read-only price; quote adapter ready |
| 5 | Telegram Bot API | Immediate alerts and authenticated pause/status commands | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID` | **Next** |
| 6 | Birdeye Data | Independent token, wallet, security, holder, liquidity, trade, and historical market evidence | `BIRDEYE_API_KEY` | Verified read-only price access |
| 7 | Cielo API | Secondary wallet feed, discovery, profiling, and alert reconciliation | `CIELO_API_KEY` | Account/plan/key required |
| 8 | X API v2 | Authorized pre-crypto meme discovery, velocity, unique authors, and cross-community spread | `X_BEARER_TOKEN`; cost ceiling required | Developer app/key required |
| 9 | DexScreener API | Independent pair, liquidity, volume, price, and profile cross-check | No key for documented public API | Adapter required |
| 10 | Pump/PumpSwap | Canonical stage, program, curve, pool, reserves, and migration evidence | No website API key; use Helius plus official public program documentation | Decoder/indexer required |
| 11 | Solscan Pro API | Slow-path transaction and account spot verification; not primary pricing | `SOLSCAN_API_KEY` | Optional paid fallback |
| 12 | Secondary Solana RPC | Failover, provider-disagreement tests, and missed-range replay | `SECONDARY_SOLANA_RPC_URL` | Select before forward paper deployment |

## Infrastructure and live-only material

| Layer | Configuration | Rule |
|---|---|---|
| Public webhook host | `PUBLIC_WEBHOOK_BASE_URL`, `HELIUS_WEBHOOK_AUTH_TOKEN` | Created when the always-on host is selected |
| PostgreSQL | `DATABASE_URL` | Separate development, paper, and live databases |
| Redis/queue | `REDIS_URL` | Add only when the ingestion design justifies it |
| Policy-controlled signer | Provider organization/public credentials plus deployment-only authentication | Evaluate Turnkey first; never store signer private material in GitHub |
| Dedicated trading wallet | Public address in deployment configuration | New, balance-capped, never the user's main wallet |

## Sources deliberately not made critical dependencies

- RugCheck may be used as a human cross-check, but no supported public automation contract has been accepted into the engine yet. Core risk checks will be independently calculated from Solana data.
- Nansen, Arkham, Kolscan, MadeOnSol, Axiom, and similar products remain optional research sources until their current Solana coverage, supported access, cost, and field semantics are verified.
- Unverified Telegram bots, browser extensions, private endpoints, and scraped interfaces are excluded from the signing and decision paths.
- Solscan prices have documented delay, so Solscan cannot satisfy the 15-second freshness policy.

## Verified official references

- [Birdeye API authentication](https://docs.birdeye.so/docs/authentication-api-keys)
- [Cielo API setup](https://developer.cielo.finance/docs/getting-started)
- [DexScreener API reference](https://docs.dexscreener.com/api/reference)
- [Jupiter Swap API](https://developers.jup.ag/docs/swap)
- [Pump public program documentation](https://github.com/pump-fun/pump-public-docs)
- [Solscan Pro API](https://docs.solscan.io/solscan-api/solscan-pro-api-endpoints)
- [X API](https://docs.x.com/x-api/introduction)
- [Turnkey Solana support](https://docs.turnkey.com/features/networks/solana)
