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

## RMD Ages (SECURE 2.0)
- Born before July 1, 1949: 70½
- Born July 1, 1949 – Dec 31, 1950: 72
- Born 1951–1959: 73
- Born 1960 or later: 75