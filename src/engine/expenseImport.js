/**
 * expenseImport.js
 *
 * Parses a user-uploaded CSV budget and turns it into something the
 * retirement engine can consume — replacing the single aggregate "core
 * lifestyle spend" (p.sp) with a detailed line-item budget.
 *
 * No external dependencies (keeps the Netlify bundle lean — CSV only, not
 * native .xlsx). Pure functions, fully unit-testable.
 *
 * Two outcomes, auto-detected from the file shape:
 *   - "single" : one budget (line items) → sum to a single annual total.
 *                Flows into the existing p.sp field and inflates forward
 *                exactly like a hand-typed spend number.
 *   - "multi"  : a year-by-year budget → an explicit nominal spend schedule
 *                [{year, amount}]. Used as the per-year base spend, overriding
 *                the distribution strategy's spend rule (a detailed multi-year
 *                budget IS the spending plan). Beyond the last listed year the
 *                last value is carried forward, inflation-adjusted.
 *
 * Supported CSV layouts (header row optional/auto-detected):
 *   A. Single-year, 2 columns:        Category,Amount
 *   B. Multi-year wide:               Category,2026,2027,2028   (one col per year)
 *   C. Multi-year long:               Year,Category,Amount      (one row per year/item)
 *   D. Bare single column of amounts: Amount                    (no labels)
 */

const YEAR_RE = /^(19|20)\d{2}$/;

/** A header cell that names the amount column. */
function isAmountHeader(s) {
  return /amount|annual|cost|spend|expense|total|\$|usd|budget/i.test(s);
}

/** A header cell that names the year column (long format). */
function isYearHeader(s) {
  return /^(year|yr|cal\.?\s*year|calendar\s*year)$/i.test(s.trim());
}

/** A header cell naming the discretionary/total ("Like to Spend") column. */
function isLikeHeader(s) {
  return /like\s*to\s*spend|discretionary|nice\s*to|wants?/i.test(s);
}

/** A header cell naming the essential ("Must Spend") column. */
function isMustHeader(s) {
  return /must\s*spend|essential|need|required/i.test(s);
}

/** A header cell naming the frequency column. */
function isFreqHeader(s) {
  return /^(frequency|freq|period|recurrence)$/i.test(s.trim());
}

/**
 * Annualization multiplier for a frequency label. Unknown → 1 (assume already
 * annual). One-time entries are counted once (×1) and flagged by the caller.
 */
function freqMultiplier(cell) {
  const s = String(cell || "").trim().toLowerCase();
  if (/month/.test(s)) return 12;
  if (/bi.?week|fortnight/.test(s)) return 26;
  if (/week/.test(s)) return 52;
  if (/quarter/.test(s)) return 4;
  if (/semi.?annual|half.?year/.test(s)) return 2;
  if (/(^|[^a-z])day|daily/.test(s)) return 365;
  return 1; // annual / yearly / annually / one-time / blank / unknown
}

/**
 * Parse one CSV line into cells, honoring double-quoted fields (which may
 * themselves contain commas, e.g. a quoted "1,200"). Doubled quotes ("")
 * inside a quoted field are an escaped quote.
 */
function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { cells.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Coerce a cell to a number, tolerating $, thousands commas, surrounding
 * whitespace, and accounting-style parentheses for negatives. Returns NaN if
 * the cell is not numeric.
 */
function toNumber(cell) {
  if (cell == null) return NaN;
  let s = String(cell).trim();
  if (s === "") return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (!/^\d*\.?\d+$/.test(s)) return NaN;
  const n = Number(s);
  if (!isFinite(n)) return NaN;
  return neg ? -n : n;
}

/** True if a row is entirely empty cells. */
function isBlankRow(cells) {
  return cells.every((c) => c === "");
}

/**
 * Parse a CSV budget string.
 * @param {string} text raw file contents
 * @returns {{
 *   mode: "single"|"multi",
 *   total: number|null,             // single mode: summed annual budget
 *   schedule: Array<{year:number, amount:number}>|null, // multi mode
 *   lineItems: Array<{label:string, amount:number}>,    // single mode detail
 *   warnings: string[],
 *   rowCount: number
 * }}
 * @throws {Error} when the file has no usable numeric data.
 */
export function parseExpenseCsv(text) {
  const warnings = [];
  if (text == null || String(text).trim() === "") {
    throw new Error("The file is empty.");
  }
  // Strip a UTF-8 BOM if present, normalize newlines.
  const clean = String(text).replace(/^﻿/, "");
  const rawRows = clean
    .split(/\r\n|\r|\n/)
    .map(splitCsvLine)
    .filter((cells) => !isBlankRow(cells));

  if (rawRows.length === 0) throw new Error("The file has no rows.");

  // --- Header detection -----------------------------------------------------
  // A first row is a header if it contains any year-like or column-naming cell.
  // Otherwise it "looks like data" when its amount cell (last column) is numeric.
  const first = rawRows[0];
  const firstHasYearCol = first.some((c) => YEAR_RE.test(c));
  const firstNamesCols = first.some(
    (c) => isAmountHeader(c) || isYearHeader(c) || isLikeHeader(c) || isMustHeader(c) || isFreqHeader(c)
  );
  const firstAmountCell = first[first.length - 1];
  const firstLooksLikeData = !isNaN(toNumber(firstAmountCell)) && !firstNamesCols && !firstHasYearCol;
  const hasHeader = firstHasYearCol || firstNamesCols || !firstLooksLikeData;

  const header = hasHeader ? first : null;
  const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

  // --- Layout B: multi-year WIDE (multiple year columns in the header) ------
  if (header) {
    const yearCols = [];
    header.forEach((cell, idx) => {
      if (YEAR_RE.test(cell)) yearCols.push({ year: Number(cell), idx });
    });
    if (yearCols.length >= 2) {
      const sums = new Map(yearCols.map((yc) => [yc.year, 0]));
      let any = false;
      for (const row of dataRows) {
        for (const yc of yearCols) {
          const n = toNumber(row[yc.idx]);
          if (!isNaN(n)) { sums.set(yc.year, sums.get(yc.year) + n); any = true; }
        }
      }
      if (!any) throw new Error("No numeric amounts found under the year columns.");
      const schedule = [...sums.entries()]
        .map(([year, amount]) => ({ year, amount: Math.round(amount) }))
        .sort((a, b) => a.year - b.year);
      return { mode: "multi", total: null, essentialTotal: null, schedule, lineItems: [], warnings, rowCount: dataRows.length };
    }
  }

  // --- Locate columns -------------------------------------------------------
  // "Like to Spend" (full budget) is preferred over a generic amount column;
  // "Must Spend" (essential floor) and "Frequency" are captured when present.
  let amountIdx = -1;
  let yearIdx = -1;
  let likeIdx = -1;
  let mustIdx = -1;
  let freqIdx = -1;
  if (header) {
    likeIdx = header.findIndex(isLikeHeader);
    mustIdx = header.findIndex(isMustHeader);
    freqIdx = header.findIndex(isFreqHeader);
    yearIdx = header.findIndex(isYearHeader);
    // The total/amount column: prefer Like-to-Spend, else a generic amount header.
    amountIdx = likeIdx >= 0 ? likeIdx : header.findIndex(isAmountHeader);
    if (amountIdx < 0 && mustIdx >= 0) amountIdx = mustIdx; // only Must given
  }

  // Fall back: pick the last column whose data is consistently numeric.
  if (amountIdx < 0) {
    const width = Math.max(...dataRows.map((r) => r.length));
    for (let c = width - 1; c >= 0; c--) {
      const vals = dataRows.map((r) => toNumber(r[c])).filter((n) => !isNaN(n));
      if (vals.length > 0 && vals.length >= Math.ceil(dataRows.length / 2)) { amountIdx = c; break; }
    }
  }
  if (amountIdx < 0) throw new Error("Could not find a numeric amount column.");

  // Detect a year column by data if not named: a column of all year-like ints.
  if (yearIdx < 0) {
    const width = Math.max(...dataRows.map((r) => r.length));
    for (let c = 0; c < width; c++) {
      if (c === amountIdx) continue;
      const cells = dataRows.map((r) => (r[c] || "").trim()).filter((s) => s !== "");
      if (cells.length > 0 && cells.every((s) => YEAR_RE.test(s))) { yearIdx = c; break; }
    }
  }

  // Per-row total/essential, normalized to an annual figure via the frequency
  // column (Boldin-style "Must Spend" / "Like to Spend" / "Monthly" exports).
  let oneTimeSeen = false;
  const rowAnnual = (row) => {
    const mult = freqIdx >= 0 ? freqMultiplier(row[freqIdx]) : 1;
    if (freqIdx >= 0 && /one.?time|once/i.test(row[freqIdx] || "")) oneTimeSeen = true;
    const totalCell = toNumber(row[amountIdx]);
    const mustCell = mustIdx >= 0 ? toNumber(row[mustIdx]) : NaN;
    // "Like to Spend" already represents the full desired amount; if only Must
    // was given, amountIdx === mustIdx so total === essential.
    const total = isNaN(totalCell) ? NaN : totalCell * mult;
    const essential = isNaN(mustCell) ? total : mustCell * mult;
    return { total, essential };
  };

  // --- Layout C: multi-year LONG (a year column + amount column) -------------
  if (yearIdx >= 0) {
    const sums = new Map();
    for (const row of dataRows) {
      const yr = Number((row[yearIdx] || "").trim());
      const { total } = rowAnnual(row);
      if (!YEAR_RE.test(String(yr)) || isNaN(total)) continue;
      sums.set(yr, (sums.get(yr) || 0) + total);
    }
    if (sums.size === 0) throw new Error("No rows with both a valid year and amount.");
    const schedule = [...sums.entries()]
      .map(([year, amount]) => ({ year, amount: Math.round(amount) }))
      .sort((a, b) => a.year - b.year);
    if (oneTimeSeen) warnings.push("One-time entries were counted once in their row's year.");
    if (schedule.length === 1) {
      // Only one year present → treat as a single-year budget total.
      return {
        mode: "single", total: schedule[0].amount, essentialTotal: null, schedule: null,
        lineItems: [{ label: String(schedule[0].year), amount: schedule[0].amount }],
        warnings, rowCount: dataRows.length,
      };
    }
    return { mode: "multi", total: null, essentialTotal: null, schedule, lineItems: [], warnings, rowCount: dataRows.length };
  }

  // --- Layout A/D: single-year budget (sum the amount column) ---------------
  const labelIdx = [amountIdx, mustIdx, likeIdx, freqIdx, yearIdx].includes(0) ? -1 : 0;
  const lineItems = [];
  let total = 0;
  let essentialTotal = 0;
  let skipped = 0;
  for (const row of dataRows) {
    const { total: t, essential: e } = rowAnnual(row);
    if (isNaN(t)) { skipped++; continue; }
    total += t;
    essentialTotal += isNaN(e) ? t : e;
    lineItems.push({ label: labelIdx >= 0 ? (row[labelIdx] || "") : "", amount: Math.round(t) });
  }
  if (lineItems.length === 0) throw new Error("No numeric amounts found.");
  if (skipped > 0) warnings.push(`${skipped} row(s) had no readable amount and were skipped.`);
  if (oneTimeSeen) warnings.push("One-time entries were added to the annual total — they recur every year unless removed.");
  return {
    mode: "single",
    total: Math.round(total),
    essentialTotal: mustIdx >= 0 ? Math.round(essentialTotal) : null,
    schedule: null,
    lineItems,
    warnings,
    rowCount: dataRows.length,
  };
}

/**
 * Resolve the base spend for a given calendar year from a multi-year schedule.
 * - Exact year present → that nominal amount.
 * - Gap or year beyond the last entry → carry the most recent prior amount
 *   forward, inflated at infPct/yr for the elapsed years.
 * - Year before the first entry → the first entry's amount (no back-inflation).
 *
 * @param {Array<{year:number, amount:number}>} schedule sorted ascending
 * @param {number} calYear
 * @param {number} infPct annual inflation rate, percent (e.g. 2.5)
 * @returns {number}
 */
export function scheduleSpendForYear(schedule, calYear, infPct) {
  if (!schedule || schedule.length === 0) return 0;
  const sorted = [...schedule].sort((a, b) => a.year - b.year);
  if (calYear <= sorted[0].year) return sorted[0].amount;
  // Most recent entry at or before calYear.
  let base = sorted[0];
  for (const e of sorted) {
    if (e.year <= calYear) base = e; else break;
  }
  const elapsed = calYear - base.year;
  if (elapsed === 0) return base.amount;
  return Math.round(base.amount * Math.pow(1 + (infPct || 0) / 100, elapsed));
}

/**
 * Resolve the Guyton-Klinger spend floor and ceiling for a year-0 budget.
 *
 * When a one-year detailed budget carried a Must Spend / Like to Spend split
 * (`spImportMeta.essentialTotal` present), the budget — not the % sliders —
 * drives the guardrails: the floor is the essential ("Must Spend") total so
 * spending never drops below necessities, and the ceiling is the full
 * ("Like to Spend") total so spending never exceeds the stated desired budget.
 * Out-of-country spend is treated as committed and added to both bounds.
 *
 * Otherwise the legacy behavior applies: floor/ceiling = a percentage of
 * combined core spend.
 *
 * @returns {{ gkFloor:number, gkCeiling:number, source:"import"|"percent" }}
 */
export function resolveSpendGuardrails({
  sp = 0,
  spOutOfCountry = 0,
  gkFloorPct = 0,
  gkCeilingPct = 0,
  spImportMeta = null,
} = {}) {
  const ooc = spOutOfCountry || 0;
  const combined = (sp || 0) + ooc;
  const imp = spImportMeta;
  if (imp && imp.mode === "single" && imp.essentialTotal != null) {
    const like = imp.total != null ? imp.total : sp || 0;
    return {
      gkFloor: Math.round((imp.essentialTotal || 0) + ooc),
      gkCeiling: Math.round(like + ooc),
      source: "import",
    };
  }
  return {
    gkFloor: Math.round(combined * ((gkFloorPct || 0) / 100)),
    gkCeiling: Math.round(combined * ((gkCeilingPct || 0) / 100)),
    source: "percent",
  };
}

/**
 * CSV text for the downloadable single-year template. Boldin-style: a
 * Frequency column (normalized to annual) and a Must Spend / Like to Spend
 * split (essentials vs. full desired budget → spend floor / ceiling).
 * Excludes mortgage/rent, debt, medical, long-term care, and income tax —
 * those are modeled elsewhere in the app.
 */
export const SINGLE_YEAR_TEMPLATE =
  "Category,Frequency,Must Spend,Like to Spend\n" +
  "Groceries,Monthly,800,1000\n" +
  "Utilities,Monthly,350,400\n" +
  "Transportation,Monthly,400,500\n" +
  "Personal Care,Monthly,120,200\n" +
  "Travel,Annually,8000,20000\n" +
  "Dining & Entertainment,Monthly,300,700\n" +
  "Hobbies,Monthly,100,300\n" +
  "Miscellaneous,Monthly,250,400\n";

/** CSV text for the downloadable multi-year (wide) template. */
export const MULTI_YEAR_TEMPLATE =
  "Category,2026,2027,2028,2029,2030\n" +
  "Groceries,12000,12300,12600,12900,13200\n" +
  "Utilities,4800,4900,5000,5100,5200\n" +
  "Transportation,6000,6000,6000,4000,4000\n" +
  "Healthcare,9000,9300,9600,10000,10400\n" +
  "Travel,20000,20000,15000,10000,8000\n" +
  "Dining & Entertainment,8000,8000,7000,7000,6000\n" +
  "Miscellaneous,5000,5000,5000,5000,5000\n";
