/**
 * expectedReturn.js
 *
 * Single source of truth for the historical S&P 500 / bond return data and the
 * expectedReturn(eqPct) formula that blends them by equity %. Every "expected
 * value" (non-stochastic) view of portfolio growth in this app — App.jsx's
 * computeInitialWR, the deterministic schedule, the Fan Chart, AND the
 * withdrawal-waterfall/Roth-explorer/conversion-plan engines — must derive
 * growth from the SAME data and SAME formula, keyed off the user's actual
 * preRetireEq/postRetireEq equity-glide sliders. Before this module existed,
 * buildWithdrawalWaterfall.js / buildRothExplorer.js / rothConversionPlan.js
 * each hardcoded a flat 7% and never read the glide-path sliders at all, so
 * two profiles differing only in risk posture (e.g. postRetireEq 30 vs 70)
 * produced identical Smart Waterfall / Roth Explorer trajectories while the
 * Monte Carlo diverged sharply between them.
 *
 * DATA SOURCE (v1.2.104, 2026-08-20)
 * ----------------------------------
 * Damodaran, "Historical Returns on Stocks, Bonds and Bills: 1928-2024"
 *   https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html
 * Coverage: 1928-2025 (98 years). Updated annually.
 *   • SP500 = "S&P 500 (includes dividends)" — nominal total return, dividends
 *     reinvested.
 *   • BONDS = "US T. Bond (10-year)" — nominal total return (price + coupon)
 *     on the 10-year Treasury.
 *
 * WHY THIS SOURCE
 * ---------------
 * Damodaran is the canonical free retail dataset for retirement-planning MC
 * research (Bengen, Kitces, Pfau all reference it). The two series are
 * year-aligned by calendar year, which is the prerequisite for paired bootstrap
 * sampling in App.jsx's runMC (see portReturn — one shared random index draws
 * SP500[i] and BONDS[i] together so real historical stock/bond correlations,
 * including the flight-to-quality flip in crashes like 2008, are preserved).
 *
 * WHY NO WINSORIZATION
 * --------------------
 * The prior arrays clamped to [-30, 30] for stocks and [-15, 20] for bonds.
 * That censored the exact tail years retirement MC exists to model — 1931
 * (-43.84%), 1937 (-35.34%), 2008 (-36.55%) were all clipped, silently
 * understating ruin probability. If a specific stress test needs damped
 * returns, do it in that caller by scaling the array, not by mutating the
 * canonical dataset.
 *
 * NOTE: this file is now the ONE source. App.jsx used to keep its own
 * byte-identical copy of both arrays for portReturn/bootstrapDraw; that
 * duplication has been removed (App.jsx imports these). If you add a year of
 * data, edit ONLY this file.
 */

const SP500 = [
  43.81, -8.3, -25.12, -43.84, -8.64, 49.98, -1.19, 46.74, 31.94, -35.34,
  29.28, -1.1, -10.67, -12.77, 19.17, 25.06, 19.03, 35.82, -8.43, 5.2,
  5.7, 18.3, 30.81, 23.68, 18.15, -1.21, 52.56, 32.6, 7.44, -10.46,
  43.72, 12.06, 0.34, 26.64, -8.81, 22.61, 16.42, 12.4, -9.97, 23.8,
  10.81, -8.24, 3.56, 14.22, 18.76, -14.31, -25.9, 37, 23.83, -6.98,
  6.51, 18.52, 31.74, -4.7, 20.42, 22.34, 6.15, 31.24, 18.49, 5.81,
  16.54, 31.48, -3.06, 30.23, 7.49, 9.97, 1.33, 37.2, 22.68, 33.1,
  28.34, 20.89, -9.03, -11.85, -21.97, 28.36, 10.74, 4.83, 15.61, 5.48,
  -36.55, 25.94, 14.82, 2.1, 15.89, 32.15, 13.52, 1.38, 11.77, 21.61,
  -4.23, 31.21, 18.02, 28.47, -18.04, 26.06, 24.88, 17.78,
].map((r) => r / 100);

const BONDS = [
  0.84, 4.2, 4.54, -2.56, 8.79, 1.86, 7.96, 4.47, 5.02, 1.38,
  4.21, 4.41, 5.4, -2.02, 2.29, 2.49, 2.58, 3.8, 3.13, 0.92,
  1.95, 4.66, 0.43, -0.3, 2.27, 4.14, 3.29, -1.34, -2.26, 6.8,
  -2.1, -2.65, 11.64, 2.06, 5.69, 1.68, 3.73, 0.72, 2.91, -1.58,
  3.27, -5.01, 16.75, 9.79, 2.82, 3.66, 1.99, 3.61, 15.98, 1.29,
  -0.78, 0.67, -2.99, 8.2, 32.81, 3.2, 13.73, 25.71, 24.28, -4.96,
  8.22, 17.69, 6.24, 15, 9.36, 14.21, -8.04, 23.48, 1.43, 9.94,
  14.92, -8.25, 16.66, 5.57, 15.12, 0.38, 4.49, 2.87, 1.96, 10.21,
  20.1, -11.12, 8.46, 16.04, 2.97, -9.1, 10.75, 1.28, 0.69, 2.8,
  -0.02, 9.64, 11.33, -4.42, -17.83, 3.88, -1.64, 7.8,
].map((r) => r / 100);

// INFL — annual CPI-U year-over-year %, 1928-2025 (98 entries, aligned to
// SP500/BONDS by calendar year). Source: US Bureau of Labor Statistics CPI-U
// "annual average" series as republished at usinflationcalculator.com, with
// 2025 confirmed against BLS's current release. Extended backward from the
// prior 51-entry array (~1975-2025) so that inflation can be drawn from the
// same historical year as the stock/bond return (v1.2.105 paired MC draws).
// The stagflation years now show up correctly paired — 1974's -25.9% S&P
// alongside 11.0% CPI, 1979's 18.4% S&P alongside 11.3% CPI — instead of the
// prior independent sampling that could pair 2008's crash with 2015's 0.1%
// CPI. No winsorization: 1932 (-9.9%) and 1946 (14.4%) are real years.
const INFL = [
  -1.7, 0, -2.3, -9, -9.9, -5.1, 3.1, 2.2, 1.5, 3.6,
  -2.1, -1.4, 0.7, 5, 10.9, 6.1, 1.7, 2.3, 8.3, 14.4,
  8.1, -1.2, 1.3, 7.9, 1.9, 0.8, 0.7, -0.4, 1.5, 3.3,
  2.8, 0.7, 1.7, 1, 1, 1.3, 1.3, 1.6, 2.9, 3.1,
  4.2, 5.5, 5.7, 4.4, 3.2, 6.2, 11, 9.1, 5.8, 6.5,
  7.6, 11.3, 13.5, 10.3, 6.2, 3.2, 4.3, 3.6, 1.9, 3.6,
  4.1, 4.8, 5.4, 4.2, 3, 3, 2.6, 2.8, 3, 2.3,
  1.6, 2.2, 3.4, 2.8, 1.6, 2.3, 2.7, 3.4, 3.2, 2.8,
  3.8, -0.4, 1.6, 3.2, 2.1, 1.5, 1.6, 0.1, 1.3, 2.1,
  2.4, 1.8, 1.2, 4.7, 8, 4.1, 2.9, 2.6,
].map((r) => r / 100);

export { SP500, BONDS, INFL };

export const SP500_MEAN = SP500.reduce((s, v) => s + v, 0) / SP500.length;
export const BONDS_MEAN = BONDS.reduce((s, v) => s + v, 0) / BONDS.length;

/**
 * Blends the historical S&P 500 / bond mean annual returns by equity %.
 * @param {number} eqPct — equity allocation, 0-100 (defaults to 91, App.jsx's preRetireEq default)
 * @returns {number} expected blended annual return, as a percentage (e.g. 7.6 for 7.6%)
 */
export function expectedReturn(eqPct) {
  const w = (eqPct ?? 91) / 100;
  return parseFloat((w * SP500_MEAN * 100 + (1 - w) * BONDS_MEAN * 100).toFixed(2));
}
