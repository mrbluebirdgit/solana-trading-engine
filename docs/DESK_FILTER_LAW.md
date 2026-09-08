# Desk Filter Law v1

`desk-filter-law.v1` is the owner-locked gate used for `RISK_KILL`,
`SCOUT_SKIP`, and `SCOUT_PASS`. Runtime performance never changes these
numbers. Any later edit requires a deliberate source change to both the JSON
law and its locked loader contract.

## Decision order

1. Helius resolves the canonical Pump/PumpSwap stage and reads SPL mint and
   freeze authority.
2. GMGN's read-only token evidence is normalized into the desk fields. Every
   documented rate is accepted only as a fraction from 0 through 1 and then
   multiplied by 100. A rate above 1 is invalid, not guessed to be a percent.
3. Active mint or freeze authority and any risk-cap breach emit `RISK_KILL`.
4. Missing/invalid evidence, an unsupported stage, or a stage-filter miss emits
   `SCOUT_SKIP`.
5. Only a fully qualifying token emits `SCOUT_PASS` and may be ranked by THE
   LAWYER.

## Shared risk caps

| Filter | Maximum |
|---|---:|
| Developer | 5% |
| Insider | 10% |
| Bundled | 15% |
| Fresh | 30% |
| Snipers | 20% |
| Rug | 1% |
| Phishing | 0% |

Bot trading has no hard cap and may be used only as ranking context. Telegram
calls are ignored. Developer burn is optional. Mint authority or freeze
authority present is always a kill; unread authority is a scout skip.

## Curve / pre-migrate

| Filter | Law |
|---|---:|
| Smart money | minimum 1 |
| Holders | minimum 20 |
| Top 10 | maximum 25% |
| Market cap | $8,000–$80,000 |
| 5-minute volume | minimum $5,000 |
| 5-minute net inflow | minimum $0 |
| 5-minute transactions | minimum 40 |
| Curve fill | 2%–18% |

GMGN `launchpad_progress` is normalized from its 0–1 fraction into the curve
fill percentage above.

The adapter uses exact fields rather than interchangeable labels: creator hold
for developer, suspected-insider hold for insider, top bundler trading share for
bundled, fresh-wallet rate, top-70 sniper hold, rug ratio, entrapment/phishing
share, top-10 holder share, smart-wallet count, and the 5-minute volume, flow,
and swaps fields. It does not substitute `dev.top_10_holder_rate`, generic
`bundler_rate`, or rat-trader volume for differently defined desk fields. If
GMGN's analysis block is structurally unpopulated, its apparent zeros are
invalid evidence and the candidate is skipped.

## Migrated

| Filter | Law |
|---|---:|
| Smart money | minimum 2 |
| Holders | minimum 40 |
| Top 10 | maximum 22% |
| Market cap | $25,000–$250,000 |
| 5-minute volume | minimum $15,000 |
| 5-minute net inflow | minimum $0 |
| 5-minute transactions | minimum 80 |
| Migration age | 0–12 minutes |

Migration age is calculated from the GMGN pool creation timestamp against the
decision timestamp. Unknown, zero, invalid, or future timestamps are skipped.

## Operator-managed terminal entry

These are stored as desk instructions, not transaction-building code:

- Learning buy: 0.05–0.15 SOL.
- Only after RISK clears: 0.3–0.5 SOL.
- Slippage: 15%.
- Priority fee: 0.006 SOL.
- Jito tip: 0.007 SOL.
- Anti-MEV: on.
- Axiom, Photon, and GMGN filter boxes and buys remain operator-managed.

The worker has no Axiom or Photon login path and rejects signing material or
terminal credentials. `AGE_SECRET_KEY` is skipped. Wallet private keys never
belong in this repository.

## Source files

- Law: [`config/desk-filter-law.v1.json`](../config/desk-filter-law.v1.json)
- Locked loader: [`src/config/desk-filter-law.mjs`](../src/config/desk-filter-law.mjs)
- Gate: [`src/core/decision/desk-filter.mjs`](../src/core/decision/desk-filter.mjs)
- JS authority check: [`src/core/decision/authority-check.mjs`](../src/core/decision/authority-check.mjs)
- Python authority contract: [`authority_check.py`](../authority_check.py)
