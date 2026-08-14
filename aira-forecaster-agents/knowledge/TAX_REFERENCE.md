# Tax Reference — 2026 (Indexed Annually at 2.5%)

## Federal Ordinary Income Brackets (MFJ 2026)
- 10%: $0 – $24,800
- 12%: $24,800 – $100,800
- 22%: $100,800 – $211,400
- 24%: $211,400 – $403,550
- 32%: $403,550 – $512,450
- 35%: $512,450 – $768,700
- 37%: $768,700+

## Standard Deduction (MFJ 2026)
- Base: $32,200
- Age 65+ per spouse: +$1,650
- Both 65+: $35,500

## OBBBA Senior Bonus Deduction (tax years 2025–2028 ONLY — $0 from 2029)

A **third, independent** below-the-line deduction added by the One Big Beautiful
Bill Act (enacted July 2025). It is NOT part of the standard deduction above and
must NOT be folded into it — it is available to itemizers AND non-itemizers, so
merging it into `getStandardDeduction()` would make an itemizer model impossible
later. Keep it as its own term.

- Amount per qualifying person (age 65+ by the last day of the tax year): **$6,000**
- MFJ, both spouses 65+: **$12,000** (2 × per-person). One spouse 65+: **$6,000** (1×)
- MFJ must file jointly to claim it
- Phase-out start **MAGI** — MFJ: **$150,000** · Single: **$75,000**
- Phase-out rate: **6% of MAGI above the threshold** (−$60 per $1,000 of excess)
- Fully phased out at MAGI — MFJ: **$250,000** · Single: **$175,000**
- **NOT inflation-indexed.** Flat $6,000 and flat thresholds for all four years
  2025–2028. Do NOT apply this file's blanket 2.5%/yr indexing convention to it.
- **Sunset: $0 for tax year 2029+** — a hard cliff to zero, not a phase-down.
  Expires after 2028-12-31 absent new legislation.

**Applies to `taxableIncome` ONLY.** Like the standard deduction, it must never
reduce `totalIncome` / `totInc` / `magi` / AGI. Subtracting it from MAGI would be
a P0 regression against CLAUDE.md rule 3 (IRMAA is computed on MAGI with no
deduction subtracted) and would corrupt the IRMAA tier check.

Verified 2026-07-27 against:
- IRS — "Check your eligibility for the new enhanced deduction for seniors"
  (amount, 2025–2028, $75K/$150K MAGI thresholds, stacks with existing 65+ add-on)
- IRS — "One Big Beautiful Bill Act: tax deductions for working Americans and
  seniors" (itemizers + non-itemizers, MFJ must file jointly)
- Tax Foundation, "How Does the Additional Senior Deduction Compare to No Tax on
  Social Security?" (6% phase-out rate, $175K/$250K full phase-out)
- Fidelity, "What is the new $6,000 senior deduction and how does it work?"
  (flat amount, not indexed, expires after 2028)

## LTCG / Qualified Dividend Brackets (MFJ 2026)
- 0%: $0 – $98,900
- 15%: $98,900 – $613,700
- 20%: $613,700+
- NIIT: 3.8% on lesser of NII or (AGI - $250,000)

## IRMAA Thresholds (MFJ 2026)
- ≤$218,000: $0 surcharge
- $218K-$274K: ~$2,160/yr couple
- $274K-$342K: ~$5,470/yr couple
- $342K-$410K: ~$8,300/yr couple
- $410K-$750K: ~$11,130/yr couple
- >$750K: ~$12,700/yr couple

## NJ State Tax Brackets (2026)
- 1.4%: $0 – $20,000
- 1.75%: $20,000 – $35,000
- 3.5%: $35,000 – $40,000
- 5.525%: $40,000 – $75,000
- 6.37%: $75,000 – $500,000
- 8.97%: $500,000 – $1,000,000
- 10.75%: $1,000,000+

## Social Security
- 85% of benefits included in federal AGI
- NJ fully exempts SS from state tax

### Survivor (widow/widower) benefits
Source: SSA — "Survivors Benefits" (Pub 05-10084) and RS 00615 of the POMS.
Consumed by `src/engine/survivorBenefit.js`. **Do not inline these anywhere else.**

- **Earliest claim age: 60** (50 if disabled; any age if caring for the deceased's
  child under 16 or disabled). This is distinct from **62** for one's OWN retirement
  benefit — the whole reason a survivor has strategic flexibility.
- **Deemed filing does NOT apply to survivor benefits.** The own retirement benefit
  and the survivor benefit are independent: either may be claimed first and the
  claimant may switch to the other later. This is the only place in Social Security
  where that is true, and it is what makes the "take reduced survivor at 60, let my
  own grow to 70" (or the reverse) strategy possible.
- **Survivor full retirement age (survivor FRA)** — differs from retirement FRA:
  | Year of birth | Survivor FRA |
  |---|---|
  | 1945–1956 | 66 |
  | 1957 | 66 + 2 mo |
  | 1958 | 66 + 4 mo |
  | 1959 | 66 + 6 mo |
  | 1960 | 66 + 8 mo |
  | 1961 | 66 + 10 mo |
  | 1962 and later | 67 |
- **Reduction for claiming before survivor FRA:** from **71.5%** at age 60 rising on
  a straight line to **100%** at survivor FRA. (SSA computes 28.5% total reduction
  spread over the months between 60 and survivor FRA.)
- **No credit for delaying past survivor FRA.** A survivor benefit stops growing at
  survivor FRA — unlike an own retirement benefit, which earns delayed retirement
  credits until 70. There is never a reason to delay a survivor claim past its FRA.
- **Delayed retirement credits earned by the DECEASED pass through** to the survivor
  benefit: the survivor receives 100% of what the deceased was receiving or was
  entitled to, including their DRCs. Contrast the **spousal** benefit, which is 50%
  of the higher earner's PIA and into which DRCs do **not** flow.
- **Basis when the deceased had not yet claimed:** the survivor benefit derives from
  the deceased's PIA (plus any DRCs actually earned before death), NOT from zero.
  Eligibility does not depend on the deceased having filed.
- **Earnings test (2026): $1 withheld per $2 earned above $24,480** for a
  beneficiary under FRA for the whole year. NOT modelled by AiRA — the engine models
  no wage income (REQUIREMENTS §24 #5, §30).

## RMD Ages (SECURE 2.0)
- Born before July 1, 1949: 70½
- Born July 1, 1949 – Dec 31, 1950: 72
- Born 1951–1959: 73
- Born 1960 or later: 75
---

## ACA Premium Tax Credit — Federal Poverty Level (§16)

The PTC formula is:

```
applicableAmount = applicablePercentage(MAGI ÷ FPL) × MAGI
PTC              = max(0, benchmarkPremium − applicableAmount)
```

`benchmarkPremium` is the second-lowest-cost Silver plan in the household's own
**rating area**. It is NOT listed here and must never be hardcoded: it varies by
state, by ~500 sub-state rating areas, by age and by tobacco use, and CMS
republishes it annually. It is a **user-entered profile value**
(`acaBenchmarkPremium`). This is deliberate and is what keeps the model from
requiring a national premium database that would be stale within a year.

Note which quantities actually need it: the **marginal** subsidy lost per extra
dollar of MAGI, and the **location** of the cliff, both fall out of the FPL
tables and the applicable-percentage schedule alone. Only the **dollar magnitude**
of the subsidy needs the benchmark premium.

### Federal Poverty Level — 2025 HHS guidelines (used for 2026 coverage year)

Coverage year N uses the FPL guidelines published in year N−1. A 2026 plan year
is measured against the **2025** table below.

| Household size | 48 states + DC | Alaska | Hawaii |
|---|---|---|---|
| 1 | $15,650 | $19,550 | $17,990 |
| each additional person | +$5,500 | +$6,870 | +$6,320 |

Source: HHS annual poverty guidelines (federalregister.gov). **Re-verify each
January** — these are republished annually and the engine indexes forward from
the base year rather than guessing.

### Applicable percentage schedule

Two regimes, because the law changed and may change back. The engine models both
behind `acaCliffReturns` so a plan is honest about the discontinuity rather than
silently assuming one outcome.

**Regime A — ARPA/IRA enhanced (2021–2025).** No upper income limit; the
percentage is capped at 8.5% however high MAGI goes, so there is **no cliff**.

| MAGI as % of FPL | Applicable % (lower → upper, linear within band) |
|---|---|
| under 150% | 0.0% → 0.0% |
| 150% – 200% | 0.0% → 2.0% |
| 200% – 250% | 2.0% → 4.0% |
| 250% – 300% | 4.0% → 6.0% |
| 300% – 400% | 6.0% → 8.5% |
| over 400% | 8.5% (flat, no cliff) |

**Regime B — statutory / pre-ARPA, returns absent Congressional extension.**
Above 400% FPL the credit is **$0** — the subsidy cliff. Percentages are
inflation-indexed annually by IRS revenue procedure; the values below are the
pre-ARPA shape and **MUST be re-verified against the current Rev. Proc. before
being relied on for advice.**

| MAGI as % of FPL | Applicable % (lower → upper, linear within band) |
|---|---|
| under 133% | 2.10% |
| 133% – 150% | 3.14% → 4.19% |
| 150% – 200% | 4.19% → 6.60% |
| 200% – 250% | 6.60% → 8.44% |
| 250% – 300% | 8.44% → 9.96% |
| 300% – 400% | 9.96% (flat) |
| over 400% | **no credit — cliff** |

### Verification status

- FPL dollar figures: **2025 HHS guidelines.** Re-verify each January.
- Regime A percentages: statutory under ARPA §9661 / IRA extension. Stable.
- Regime B percentages: **UNVERIFIED against the current Rev. Proc.** Shape is
  correct; the exact indexed values need confirming before this drives advice.
- Default regime: `acaCliffReturns` defaults to **true** (statutory law as it
  stands), which is the conservative direction — it warns about a cliff that may
  not materialise rather than hiding one that does.
