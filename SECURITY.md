# Security policy

## Credential rules

1. Never commit credentials, private keys, seed phrases, Telegram sessions, login codes, or `.env` files.
2. Store API credentials in GitHub Actions secrets only when they are required for a non-signing verification workflow.
3. Store wallet signing material only on the trusted execution machine and use a dedicated, balance-capped wallet.
4. Keep Telegram session material local to the trusted execution machine.
5. Treat `GMGN_API_KEY` as a read-only data credential. It may be used by the trusted deployment and owner-triggered verification on `main`; the worker rejects `GMGN_PRIVATE_KEY` and never constructs GMGN swap, order, or wallet commands.
6. Keep Solana wallet signing material local; Jupiter receives only `JUPITER_API_KEY` during read-only GitHub verification.
7. Treat `BIRDEYE_API_KEY`, `GMGN_API_KEY`, `X_BEARER_TOKEN`, `LUNARCRUSH_API_KEY`, and `NEWSAPI_KEY` as read-only data credentials. They may be used only by trusted-branch or manually dispatched verification workflows and never by pull-request code.
8. Do not expose secrets in workflow inputs, command-line arguments, error messages, screenshots, issues, pull requests, or logs.
9. Rotate a credential immediately if its value is exposed.
10. The observer rejects wallet signing material, `AGE_SECRET_KEY`, and Axiom or Photon API variables; those terminals remain operator-managed.

## Workflow rules

- Workflows that receive secrets must be manually triggered or limited to trusted branches.
- Pull-request code must never receive production secrets.
- Repository workflow permissions default to read-only.
- Verification output may report non-sensitive status metadata and diagnostics, but never secret values or returned market/token data.

## Live-trading controls

Live execution must remain disabled until the repository contains tested position limits, daily-loss limits, token and liquidity validation, duplicate-order prevention, a kill switch, transaction reconciliation, and an immutable audit trail.
