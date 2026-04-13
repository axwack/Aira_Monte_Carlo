Great idea. Let me design test cases that isolate each component with predictable math. The key is: **if you can't verify it by hand, you can't trust it.**

## Test Framework

All tests use the **Deterministic Withdrawal View** (not MC) since it uses fixed median returns — no randomness.

---

### Test 1: Pure Accumulation (no retirement spending)
**Purpose:** Verify portfolio growth + contributions during working years

| Field | Value | Why |
|-------|-------|-----|
| DOB | set to make current age = 50 | |
| Portfolio | $1,000,000 | round number |
| Annual contrib | $0 | isolate growth only |
| Retire age | 60 | 10 accumulation years |
| Plan to age | 61 | 1 year retirement (minimal) |
| Annual spend | $0 | no withdrawals |
| SS benefit | $0 | no income streams |
| Rental | $0 | no income streams |
| State | TX (0%) | eliminate state tax |
| Tax drag | OFF | eliminate tax complexity |
| Two household | OFF | |

**Expected:** After 10 years at 9.68% median return:
```
$1,000,000 × (1.0968)^10 = $2,519,766
```

Now add $10,000/yr contribution and re-run:
```
Year 1: 1,000,000 × 1.0968 + 10,000 = 1,106,800
Year 2: 1,106,800 × 1.0968 + 10,000 = 1,223,938
... (or just check the "Portfolio at Retirement" metric)
```

**Quick formula for contrib verification:**
```
FV = PV × (1+r)^n + C × [((1+r)^n - 1) / r]
   = 1,000,000 × (1.0968)^10 + 10,000 × [((1.0968)^10 - 1) / 0.0968]
   = 2,519,766 + 10,000 × 15.698
   = 2,519,766 + 156,980
   = $2,676,746
```

---

### Test 2: Pure Withdrawal (no growth)
**Purpose:** Verify spending depletes portfolio correctly

| Field | Value |
|-------|-------|
| Portfolio | $1,000,000 (all in taxable account) |
| Retire age | 60 (= current age, no accumulation) |
| Plan to age | 70 | 
| Annual spend | $100,000 |
| SS | $0 |
| Rental | $0 |
| State | TX (0%) |
| Tax drag | OFF |
| Inflation | 0% |
| Withdrawal strategy | Fixed % |

**Expected at 9.68% return, $100K spend:**
```
Year 1 (age 60): 1,000,000 × 1.0968 - 100,000 = $996,800
Year 2 (age 61): 996,800 × 1.0968 - 100,000 = $993,271
...portfolio slowly declines (spend > growth for this size)
```

At 8.93% return (age 62+ rate):
```
Year 3 (age 62): prev × 1.0893 - 100,000 = ...
```

**Key check:** Does the chart show the phase 1→phase 2 return shift at age 62?

---

### Test 3: Social Security Offset
**Purpose:** Verify SS reduces portfolio draw correctly

| Field | Value |
|-------|-------|
| Portfolio | $1,000,000 |
| Current age = Retire age | 65 |
| Plan to age | 75 |
| Annual spend | $100,000 |
| SS start age | 65 |
| SS benefit | $30,000/yr |
| Rental | $0 |
| SS COLA | 0% (set in assumptions) |
| State | TX |
| Tax drag | OFF |
| Inflation | 0% |

**Expected:**
```
Portfolio draw = spend - SS = 100,000 - 30,000 = $70,000/yr
(plus tax on the $70K + 85% of SS)
```

**Check the Year-by-Year table:** 
- SS column should show $30,000 every year
- Portfolio Draw should show ~$70,000 (before tax)
- Total Withdrawal = $70,000 + tax amount

---

### Test 4: Tax Calculation Verification
**Purpose:** Verify federal tax brackets are correct

| Field | Value |
|-------|-------|
| Portfolio | $10,000,000 (all pretax) |
| Current age = Retire age | 60 |
| Annual spend | $100,000 |
| SS | $0 |
| Rental | $0 |
| State | TX (0%) |
| Tax drag | ON |
| Inflation | 0% |

**Expected federal tax on $100,000 withdrawal (2026 brackets):**
```
Standard deduction (under 65): $32,200
Taxable income: $100,000 - $32,200 = $67,800

10% on first $24,800        = $2,480
12% on $24,800 to $67,800   = $5,160
                      Total = $7,640
```

**Check:** Fed Tax column in Year-by-Year table should show ~$7,640

Now change state to **NJ** and re-run:
```
NJ tax on $67,800:
1.4% on first $20,000  = $280
1.75% on $20K-$35K     = $263
3.5% on $35K-$40K      = $175
5.525% on $40K-$67,800 = $1,536
                  Total = $2,254
```

**Check:** State Tax column should show ~$2,254

---

### Test 5: RMD Verification
**Purpose:** Verify RMDs kick in at 73 and use correct divisors

| Field | Value |
|-------|-------|
| Portfolio | $1,000,000 (ALL in pretax account) |
| Current age = Retire age | 72 |
| Plan to age | 80 |
| Annual spend | $10,000 (low — so RMD dominates) |
| SS | $0 |
| State | TX |

**Expected at age 73 (first RMD year):**
```
RMD divisor at 73 = 26.5 (Uniform table)
If pretax balance ≈ $1,000,000 at age 73:
RMD = 1,000,000 / 26.5 = $37,736

At age 74: divisor = 25.5
At age 75: divisor = 24.6
...etc
```

**Check the table:** RMD should appear starting at age 73, increasing as a % of portfolio each year.

---

### Test 6: Guyton-Klinger Guardrails
**Purpose:** Verify GK floor/ceiling clamping

| Field | Value |
|-------|-------|
| Portfolio | $1,000,000 |
| Current age = Retire age | 60 |
| Annual spend | $50,000 |
| GK Floor | $30,000 |
| GK Ceiling | $70,000 |
| SS | $0, Rental | $0 |
| State | TX |
| Inflation | 0% |

**Expected:**
```
Initial WR = 50,000 / 1,000,000 = 5%
Prosperity trigger: WR drops below 5% × 0.8 = 4% → raise 10%
Capital preservation trigger: WR rises above 5% × 1.2 = 6% → cut 10%
Floor clamp: spending never below $30,000
Ceiling clamp: spending never above $70,000
```

**Check:** In the Year-by-Year table, the Band column should show:
- ✅ Normal for most years (with 9.68% return and 5% WR, portfolio grows)
- 🔼 Boost once WR drops below 4%
- Spending should never go below $30K or above $70K

---

### Test 7: Two-Household / No State Tax
**Purpose:** Verify state tax = $0 when two-household is ON

Same as Test 4 but with **Two Household = ON** and state = NJ.

**Expected:** State Tax column should show $0 for all years (the `isTwoHousehold` guard skips state tax).

---

### Test 8: Inflation Adjustment
**Purpose:** Verify inflation compounds correctly

| Field | Value |
|-------|-------|
| Portfolio | $1,000,000 |
| Annual spend | $100,000 |
| Inflation | 10% (exaggerated for easy math) |
| GK Floor | $50,000, Ceiling | $200,000 |

**Expected GK floor/ceiling in Year-by-Year table:**
```
Year 0 (age 60): Floor = $50,000, Ceiling = $200,000
Year 1 (age 61): Floor = $55,000, Ceiling = $220,000
Year 2 (age 62): Floor = $60,500, Ceiling = $242,000
Year 5 (age 65): Floor = $80,526, Ceiling = $322,102
```
Each year: `prior × 1.10`

---

### Summary Checklist

| Test | What it validates | Key metric to check |
|------|-------------------|---------------------|
| 1 | Accumulation math | Portfolio at Retirement |
| 2 | Withdrawal depletion | Year-by-year portfolio |
| 3 | SS income offset | Portfolio Draw column |
| 4 | Federal + state tax | Fed Tax / State Tax columns |
| 5 | RMD at 73+ | RMD amounts + divisors |
| 6 | GK guardrails | Band column + floor/ceiling clamp |
| 7 | Two-household state tax bypass | State Tax = $0 |
| 8 | Inflation compounding | Floor/Ceiling growth |

All 8 are valid JSON. Here's your test cheat sheet with expected values:

## Test Cheat Sheet

| Test | Import File | What to Check | Expected Value |
|------|------------|---------------|----------------|
| **1 - Accumulation** | `test_1_accumulation.json` | "Portfolio at Retirement" metric | **$2,519,766** |
| **2 - Withdrawal** | `test_2_withdrawal.json` | Year-by-Year table, age 60 Portfolio End | **$996,800** (then use 8.93% from age 62+) |
| **3 - SS Offset** | `test_3_ss_offset.json` | Portfolio Draw column | **$70,000/yr** (100K spend - 30K SS) |
| **4 - Tax Calc** | `test_4_tax_calc.json` | Fed Tax column (TX = no state) | **$7,640** ($2,480 + $5,160) |
| **4b - NJ Tax** | Change state to NJ manually | State Tax column | **~$2,254** |
| **5 - RMD** | `test_5_rmd.json` | RMD at age 73 | **~$37,736** (balance/26.5) |
| **6 - GK Guardrails** | `test_6_gk_guardrails.json` | Band column; spending ∈ [30K, 70K] | Boost 🔼 when WR < 4%, never exceeds ceiling |
| **7 - Two Household** | `test_7_two_household.json` | State Tax column (NJ but twoHousehold=ON) | **$0** every year |
| **8 - Inflation** | `test_8_inflation.json` | Floor/Ceiling at age 65 (year 5) | Floor **$80,526**, Ceiling **$322,102** |

Import each file via the ⬆ Import button, go to **Scenarios → Withdrawal Analysis**, and check the Year-by-Year table. If the numbers match, that component is working correctly.