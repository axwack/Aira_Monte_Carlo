# Bucket color drift and proposed source of truth

## Current surfaces

- Profile account chips in `SavingsPanel` use the account-category color (`ACCOUNT_CATEGORIES` near App.jsx:3239), not the bucket color. B1/B2/B3 are text buttons with category-tinted active borders.
- Bucket cards use explicit colors in `BucketsTab` near App.jsx:10406-10414: B1 `#0ea5e9`, B2 `var(--accent-purple)`, B3 `var(--positive)`.
- Screenshot key `Screenshot 2026-10-01 at 7.56.01 AM.png` confirms users interpret these three colors as a bucket legend.
- Other charts/summary surfaces should be audited before wiring them to a shared table; some colors describe tax categories rather than time-horizon buckets.

## Proposed table

`src/engine/bucketColors.js` exports:

- B1: `#0ea5e9` — cash cushion / near-term spending
- B2: `#a78bfa` — income bridge / intermediate horizon
- B3: `#14b8a6` — growth / long-term reserve

It also exports labels and horizons for an accessible legend. `bucketColor(n)` returns `null` for invalid bucket numbers instead of silently choosing a color.

## Wiring request

Claude should import this table into the Bucket cards and any true bucket legend/chip surfaces. Do not replace account-category colors in the tax-treatment donut; account category and bucket are orthogonal dimensions. If a screen displays both, use separate legends and labels.
