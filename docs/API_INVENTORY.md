# API inventory

This file records integration requirements and status. It must never contain credential values.

| Provider | Purpose | GitHub secret names | Local-only material | Status |
|---|---|---|---|---|
| Telegram user API | Monitor approved signal sources and communicate with the GMGN trading interface | `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_PHONE` | Login code, 2FA password, session file | Configuration scaffold ready |

Additional providers will be added one at a time with their authentication method, minimum permissions, rate limits, health check, and revocation procedure.
