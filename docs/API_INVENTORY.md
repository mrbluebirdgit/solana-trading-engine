# API inventory

This file records integration requirements and status. It must never contain credential values.

| Provider | Purpose | GitHub secret names | Local-only material | Status |
|---|---|---|---|---|
| Telegram user API | Monitor approved signal sources and communicate with the GMGN trading interface | `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` | QR authorization, optional phone fallback, login code, 2FA password, session file | Configuration scaffold ready |
| Helius | Solana RPC, transaction queries, wallet monitoring, and webhook delivery | `HELIUS_API_KEY` | None | Configuration scaffold ready |
| GMGN | Supplemental read-only market, wallet-behavior, and token-risk observations | `GMGN_API_KEY` | Future signing key only if GMGN is retained as an execution option | Read-only adapter and live verification ready |

Additional providers will be added one at a time with their authentication method, minimum permissions, rate limits, health check, and revocation procedure.
