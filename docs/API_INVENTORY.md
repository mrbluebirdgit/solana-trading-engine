# API inventory

This file records integration requirements and status. It must never contain credential values.

| Provider | Purpose | GitHub secret names | Local-only material | Status |
|---|---|---|---|---|
| Telegram user API | Monitor explicitly approved signal sources | None; keep unused credentials out of GitHub | `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, QR authorization, optional phone fallback, login code, 2FA password, session file | Local format scaffold only; client and live verification not implemented |
| Telegram Bot API | Deliver observation-only startup probes and candidate alerts to one approved chat | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID` | None | Delivery and live observer preflight implemented; authenticated control commands pending |
| Helius | Solana RPC, transaction queries, wallet monitoring, and webhook delivery | `HELIUS_API_KEY` | None | Verified read-only mainnet RPC |
| GMGN | Candidate-triggered read-only market, wallet-behavior, token-risk, and price observations | `GMGN_API_KEY` | No signing material; `GMGN_PRIVATE_KEY` is rejected | Exact-version locked official CLI adapter, normalized evidence, persisted quota budget, owner-triggered verification, and post-alert price checks implemented |
| Jupiter | Independent prices, swap quotes, and route comparison | `JUPITER_API_KEY` | Wallet signing key and transaction approval | Read-only health verification ready; execution disabled |
| Birdeye Data | Candidate-triggered prices, liquidity, token security, holders, trades, and wallet intelligence | `BIRDEYE_API_KEY` | None | REST overview/security enrichment, normalized evidence, persisted quota budget, read-only verification, and post-alert price checks implemented |
| Solscan API | Candidate-triggered token metadata, holders, authority evidence, and last-resort price checkpoints | `SOLSCAN_API_KEY` | None | Pro v2 metadata/holder enrichment, normalized evidence, persisted quota budget, read-only verification, and price fallback implemented |
| X API | Dynamic-topic discovery and optional recent-search confirmation | `X_BEARER_TOKEN` | None | Official trends adapter, bounded recent-search adapter, and live read check implemented |
| LunarCrush | Aggregate topic-level social discovery | `LUNARCRUSH_API_KEY` | None | Topics adapter and live read check implemented; `LUNARCRUSH_PLAN=hobby` disables unsupported production topic calls |
| NewsAPI | Broad event and product-news discovery | `NEWSAPI_KEY` | None | Top-headlines adapter implemented; `NEWSAPI_PLAN=developer` disables delayed development-only calls in production |
| Approved RSS/Atom | Explicit company and newsroom feeds | None | Operator-approved HTTPS feed URLs | Bounded adapter implemented; local/reserved targets rejected |
| GDELT DOC API | Targeted news corroboration | None | None | Bounded confirmation adapter implemented and disabled by default |
| DexScreener | Pair links, attached socials, and liquidity enrichment | None | None | Public token-pairs enrichment implemented; never canonical for lifecycle stage |

Deferred and rejected narrative sources are recorded in the [narrative source catalog](../config/narrative-source-catalog.v1.json); undocumented Pump frontend routes and unreviewed social scrapers are not production dependencies.

The full ordered provider, infrastructure, and secret roadmap is maintained in [Integration roadmap v1](INTEGRATION_ROADMAP.md).
The operator-reported plan limits and current upgrade decisions are recorded without credentials in [provider subscriptions v1](../config/provider-subscriptions.v1.json).
