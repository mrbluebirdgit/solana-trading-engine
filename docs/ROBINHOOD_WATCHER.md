# Robinhood Chain early-momentum watcher

This is a separate, alert-only service. It does not import the Solana observer, does not read any Solana credentials, contains no wallet or signer, and cannot place trades.

## Detection path

1. Poll Robinhood Chain blocks through a dedicated RPC endpoint.
2. Read `TokenLaunched` from the fixed Pons V2 factory and retain V1 event coverage as a dormant compatibility check.
3. Track `CurveBuy` and `CurveSell` directly on each new token's Pons bonding curve, including unique buyers.
4. Query DexScreener after graduation for current price, five-minute flow, volume, liquidity, and market cap.
5. Query Blockscout for source verification, proxy status, holder count, and concentration.
6. Send at most one `EARLY WATCH` and one later `STRONG MOMENTUM` upgrade. Tokens are discarded permanently at 30 minutes.

Pons V2 factory: `0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e`  
Pons V1 factory: `0xa5aab3f0c6eeadf30ef1d3eb997108e976351feb`

## Separate Render service

Create a new private Web Service from the same repository using `Dockerfile.robinhood`. Do not change the existing Solana service.

- Dockerfile path: `Dockerfile.robinhood`
- Health check: `/readyz`
- Disk mount: `/var/lib/robinhood-watcher`
- Port: `3100`

Required secrets:

- `ROBINHOOD_WATCHER_ENABLED=true`
- `ROBINHOOD_RPC_URL=https://robinhood-mainnet.g.alchemy.com/v2/...`
- `ROBINHOOD_TELEGRAM_BOT_TOKEN=...`
- `ROBINHOOD_TELEGRAM_CHAT_ID=...`

The Robinhood-specific Telegram variables are intentionally separate from the Solana observer variables.

## Default gates

- Hard maximum token age: 30 minutes
- Scout: $25,000 liquidity, $25,000 five-minute volume, 40 Pons unique buyers
- Strong: $75,000 liquidity, $75,000 five-minute volume, 100 Pons unique buyers
- Buy-flow ratio: at least 55%
- Top-ten concentration: no more than 30%
- Five-minute gain ceiling: 175% to avoid alerting into a vertical candle

All thresholds are environment-configurable, but the 30-minute age ceiling cannot be raised.

