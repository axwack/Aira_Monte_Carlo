/**
 * yearEnd.js — the December deadline.
 *
 * Almost every tax lever in this app is use-it-or-lose-it on December 31: a Roth
 * conversion must SETTLE by the 31st (it is not like an IRA contribution, which
 * you can make until April), gain/loss harvesting must trade by the 31st, and a
 * QCD or charitable gift must clear. Bracket room that goes unused on January 1
 * is gone permanently — you cannot go back and fill last year's 12% bracket.
 *
 * The app knew all of this and never said it at the moment it mattered. These
 * helpers are pure so the trigger window and the room math are testable without
 * a clock or a DOM.
 *
 * DATE SOURCE: everything here reads the BROWSER's clock (`new Date()`), which is
 * the user's PC time. There is no server. A machine with a wrong system date will
 * see the prompt at the wrong time — accepted, since the alternative is a network
 * dependency for a reminder.
 */

/** Month index for December in JS Date (0-based). */
const DECEMBER = 11;

/**
 * Is `now` inside the year-end action window (Dec 1 → Dec 31)?
 *
 * December 1 rather than later in the month on purpose: a conversion or a trade
 * needs settlement time, and custodians get slow — and fully booked — in the last
 * two weeks of the year.
 */
export function isYearEndWindow(now = new Date()) {
  return now.getMonth() === DECEMBER;
}

/** Whole days remaining until Dec 31 end-of-day, local time. Never negative. */
export function daysLeftInTaxYear(now = new Date()) {
  const end = new Date(now.getFullYear(), DECEMBER, 31, 23, 59, 59, 999);
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

/**
 * Remaining tax room for the CURRENT calendar year.
 *
 * @param {Array}  rows            buildWithdrawalWaterfall smart rows
 * @param {object} o
 * @param {number} o.year          calendar year to look up
 * @param {function} o.bracketCeiling  (target, filingStatus, inflFactor) => number
 * @param {function} o.irmaaCeiling    (tier, filingStatus, inflFactor) => number
 * @param {string} o.filingStatus
 * @param {string} o.target        bracket target, e.g. "12" | "22" | "24"
 * @returns {{ hasData: boolean, reason?: string, bracketRoom?: number, ... }}
 *
 * `hasData: false` is a real and common answer, not an error: this app does not
 * model wage income, so a user who is still working has no engine row for the
 * current year and therefore no honest room figure. Say so rather than invent one.
 */
export function yearEndTaxRoom(rows, { year, bracketCeiling, irmaaCeiling, filingStatus, target } = {}) {
  const row = (rows || []).find((r) => r.yr === year);
  if (!row) {
    return {
      hasData: false,
      reason: "no projected row for this year — AiRA does not model wage income, so it cannot see your current bracket while you are still working",
    };
  }
  // Current year, so no inflation indexing is required: the published 2026
  // thresholds ARE this year's thresholds.
  const INFL_FACTOR_NOW = 1;
  const bracketTop = bracketCeiling(target, filingStatus, INFL_FACTOR_NOW);
  const irmaaTop   = irmaaCeiling(1, filingStatus, INFL_FACTOR_NOW);

  const taxableIncome = row.taxableIncome || 0;
  const magi = row.magi || 0;

  const bracketRoom = bracketTop === Infinity ? Infinity : Math.max(0, bracketTop - taxableIncome);
  const irmaaRoom   = Math.max(0, irmaaTop - magi);

  return {
    hasData: true,
    bracketTop, irmaaTop,
    taxableIncome, magi,
    bracketRoom,
    irmaaRoom,
    // What you could still convert without breaching EITHER ceiling. The binding
    // one is whichever is tighter — converting past the IRMAA cliff costs a
    // Medicare surcharge two years later that no bracket saving repays.
    conversionRoom: Math.max(0, Math.min(bracketRoom, irmaaRoom)),
    bindingConstraint: irmaaRoom < bracketRoom ? "irmaa" : "bracket",
    alreadyConverted: row.conversionAmount || 0,
    marginalBracket: row.marginalBracket ?? null,
  };
}
