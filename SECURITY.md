# Security policy

## Credential rules

1. Never commit credentials, private keys, seed phrases, Telegram sessions, login codes, or `.env` files.
2. Store API credentials in GitHub Actions secrets only when they are required for a non-signing verification workflow.
3. Store wallet signing material only on the trusted execution machine and use a dedicated, balance-capped wallet.
4. Keep Telegram session material local to the trusted execution machine.
5. Keep any future GMGN signing key local to the trusted execution machine; the current GitHub integration is read-only and receives only `GMGN_API_KEY`.
6. Do not expose secrets in workflow inputs, command-line arguments, error messages, screenshots, issues, pull requests, or logs.
7. Rotate a credential immediately if its value is exposed.

## Workflow rules

- Workflows that receive secrets must be manually triggered or limited to trusted branches.
- Pull-request code must never receive production secrets.
- Repository workflow permissions default to read-only.
- Verification output reports only presence, format, and pass/fail status.

## Live-trading controls

Live execution must remain disabled until the repository contains tested position limits, daily-loss limits, token and liquidity validation, duplicate-order prevention, a kill switch, transaction reconciliation, and an immutable audit trail.
