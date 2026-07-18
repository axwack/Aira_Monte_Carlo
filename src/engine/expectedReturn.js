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
 * NOTE: App.jsx keeps its OWN copy of the raw SP500/BONDS arrays because those
 * feed `bootstrapDraw`/`portReturn` — the actual stochastic Monte Carlo draws,
 * which resample individual historical years rather than use their mean. That
 * is a different consumer than expectedReturn() (an expected-VALUE helper) and
 * is intentionally left untouched by this refactor to avoid any risk of
 * changing runMC's behavior. This file's SP500/BONDS arrays and clamping MUST
 * stay byte-for-byte identical to App.jsx's copy — if one is ever edited to
 * add a new year of data, edit both.
 */

const SP500 = [
  37.88, -11.91, -28.48, -47.07, -15.15, 46.59, -5.94, 41.37, 27.92, -38.59,
  25.21, -5.45, -15.29, -17.86, 12.43, 19.45, 13.8, 30.72, -11.87, 0, -0.65,
  10.26, 21.78, 16.46, 11.78, -6.62, 45.02, 26.4, 2.62, -14.31, 38.06, 8.48,
  -2.97, 23.13, -11.81, 18.89, 12.97, 9.06, -13.09, 20.09, 7.66, -11.36, 0.1,
  10.79, 15.63, -17.37, -29.72, 31.55, 19.15, -11.5, 1.06, 12.31, 25.77, -9.73,
  14.76, 17.27, 1.4, 26.33, 14.62, 2.03, 12.4, 27.25, -6.56, 26.31, 4.46, 7.06,
  -1.54, 34.11, 20.26, 31.01, 26.67, 19.53, -10.14, -13.04, -23.37, 26.38, 8.99,
  3, 13.62, 3.53, -38.49, 23.45, 12.78, 0, 13.41, 29.6, 11.39, -0.73, 9.54,
  19.42, -6.24, 28.88, 16.26, 26.89, -19.44, 24.23, 23.31, 16.39, 1.53,
].map((r) => Math.max(-30, Math.min(30, r)) / 100);

const BONDS = [
  15.6, 3.0, 1.4, 1.9, 2.7, 6.2, 32.6, 8.4, 8.4, 22.1, 15.1, 15.3, 2.7, 14.5,
  8.9, 16.0, 7.4, 9.8, -2.9, 18.5, 3.6, 9.7, 8.7, -0.8, 11.6, 8.4, 10.3, 4.1,
  4.3, 2.4, 4.3, 7.0, 5.2, 5.9, 6.5, 7.8, 4.2, -2.0, 6.0, 0.5, 2.6, 3.5, 0.0,
  8.7, -1.5, 7.5, -13.0, 5.5, 1.7, 7.1,
].map((r) => Math.max(-15, Math.min(20, r)) / 100);

export const SP500_MEAN = SP500.reduce((s, v) => s + v, 0) / SP500.length;
export const BONDS_MEAN = BONDS.reduce((s, v) => s + v, 0) / BONDS.length;

/**
 * Blends the historical S&P 500 / bond mean annual returns by equity %.
 * Identical formula to App.jsx's own expectedReturn() — kept in sync by hand
 * since App.jsx also needs the raw SP500/BONDS arrays locally for its
 * bootstrapped Monte Carlo draws (see file header note above).
 * @param {number} eqPct — equity allocation, 0-100 (defaults to 91, App.jsx's preRetireEq default)
 * @returns {number} expected blended annual return, as a percentage (e.g. 7.6 for 7.6%)
 */
export function expectedReturn(eqPct) {
  const w = (eqPct ?? 91) / 100;
  return parseFloat((w * SP500_MEAN * 100 + (1 - w) * BONDS_MEAN * 100).toFixed(2));
}
