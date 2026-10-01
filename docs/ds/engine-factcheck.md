# Mortgage/Housing income-chart fact check

## Findings

The Income/Expenses chart maps `Mortgage/Housing` to `r.housingCost` (`src/App.jsx:5968-5973`). In `buildWithdrawalWaterfall.js`, the engine constructs the mortgage annual-payment map from the mortgage schedule around lines 571-575. For an owned home, the yearly housing amount is assigned from `mortByYear` at lines 828-832.

The initial withdrawal need adds housing separately at lines 743-752. Later yearly need also adds `housingCost` at lines 962 and 981. Therefore the engine can produce a real mortgage/housing cost when `housingType === "own"` and a mortgage schedule has balance/payment data.

However, the user-facing chart can show `$0` when the user's housing cost has already been included in the core spending assumption or when the relevant plan path has no mortgage payment in that modeled year. A bare `$0` does not tell the user which of these cases occurred.

## Required UI wording

Do not alter the engine. In the chart presentation, distinguish at least:

- **Not entered / no mortgage modeled:** no mortgage data exists.
- **Included in core spending:** housing is intentionally inside the general spending number, so no separate housing line is being added.
- **Modeled housing payment:** show the actual calculated amount.
- **Paid off:** no payment remains after the schedule's payoff year.

The exact condition should be derived from the existing profile fields and schedule metadata, not by guessing from a zero alone. Add a small explanatory note beside the row or in the chart footnote.
