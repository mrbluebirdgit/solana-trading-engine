# Solana Trading Engine

A private, modular system for researching Solana activity, scoring trade opportunities, enforcing risk limits, and eventually routing approved live orders through execution providers such as GMGN.

## Current status

The repository foundation and Telegram credential validation are active. Live trading is intentionally disabled until the signal, risk, execution, and audit layers have been implemented and verified.

## Planned pipeline

1. Collect Telegram, on-chain, market, and social signals.
2. Normalize and deduplicate events.
3. Score opportunities using transparent strategy rules.
4. Apply position, liquidity, loss, exposure, and kill-switch limits.
5. Route approved orders through an execution adapter.
6. Reconcile fills and record every decision and transaction.

## Telegram configuration

The first integration uses Telegram's user API for signal monitoring and eventual GMGN Bot communication.

Required secret names:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Add those values as GitHub Actions repository secrets. Never put real values in `.env.example`, commits, issues, pull requests, screenshots, or chat.

To verify repository-secret formatting, manually run the **Verify integrations** workflow from the Actions tab or post the exact owner-only command `/verify telegram` on a repository issue. The workflow never prints secret values and is not triggered by pull requests.

On the future Mac, copy `.env.example` to `.env`, enter the same values locally, and run:

```bash
npm run verify:telegram:local
```

The first Telegram authorization will be performed interactively on that Mac using Telegram's QR-login flow. A phone number is therefore not required as a GitHub secret. If code-based login is ever used as a fallback, enter the phone number only at the local prompt. The login code, 2FA password, phone number, and generated session must remain local.

## Helius configuration

Helius supplies the Solana RPC, transaction, and webhook infrastructure used to monitor wallets and on-chain events.

Required secret name:

- `HELIUS_API_KEY`

Add the project key as a GitHub Actions repository secret. The key must never be committed or pasted into an issue, pull request, screenshot, or chat. Use the **Verify integrations** workflow with provider `helius`, or post the exact owner-only command `/verify helius` on a repository issue, to validate its presence and formatting.

## Security boundaries

- No wallet seed phrase or private signing key belongs in GitHub, ChatGPT, logs, or screenshots.
- Use a separate Telegram account and a separate, balance-capped trading wallet.
- GitHub workflows receive API credentials only through encrypted repository secrets.
- Secret-bearing workflows are manual and use read-only repository permissions.
- `LIVE_TRADING_ENABLED` defaults to `false` and requires a deliberate local production change.

See [API inventory](docs/API_INVENTORY.md) and [security policy](SECURITY.md).
