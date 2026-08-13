/**
 * Gemini model selection.
 *
 * Reported: "Gemini 404 — this model models/gemini-2.5-flash is no longer
 * available to new users." The id was hardcoded, and Google retires ids PER
 * AUDIENCE: it kept working for the project that shipped it and 404'd for every
 * new key, so it was invisible in the author's own testing while breaking every
 * new user.
 *
 * Two defences, both tested here:
 *   1. Defaults are rolling "-latest" aliases Google repoints, so a retirement
 *      is an upgrade rather than an outage.
 *   2. The dropdown is built from a live ListModels call, filtered to models we
 *      can actually send an analysis prompt to.
 *
 * The filter is the part that needed real data. `generateContent` is also
 * supported by text-to-speech, image, computer-use and custom-tools variants, so
 * a suffix-shaped filter let `gemini-2.5-flash-preview-tts`,
 * `gemini-3.1-flash-image` and `gemini-2.5-computer-use-preview-10-2025` through
 * as candidate analysis engines. The ids below are a real ListModels response.
 */
import { MODEL_IS_TEXT_ANALYSIS, GEMINI_MODELS, DEFAULT_GEMINI_MODEL, GEMINI_PRICING } from './ai/ai-analysis.js';

// Verbatim from a live GET /v1beta/models (2026-08), generateContent only.
const LIVE_IDS = [
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts', 'gemini-flash-latest', 'gemini-flash-lite-latest',
  'gemini-pro-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-image',
  'gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-3.1-pro-preview-customtools',
  'gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite', 'gemini-3-pro-image-preview',
  'gemini-3-pro-image', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image', 'gemini-3.5-flash', 'gemini-3.5-flash-lite',
  'gemini-omni-flash-preview', 'gemini-3.6-flash', 'gemini-3.7-flash',
  'gemini-3.1-flash-tts-preview', 'gemini-robotics-er-1.6-preview',
  'gemini-robotics-er-2-preview', 'gemini-2.5-computer-use-preview-10-2025',
];

describe('MODEL_IS_TEXT_ANALYSIS — against a real ListModels response', () => {
  test('never offers a non-text model as an analysis engine', () => {
    const wrong = LIVE_IDS.filter(MODEL_IS_TEXT_ANALYSIS)
      .filter(id => /(image|tts|audio|robotics|computer-use|customtools)/.test(id));
    expect(wrong).toEqual([]);
  });

  test.each([
    'gemini-2.5-flash-preview-tts',            // speech, not analysis
    'gemini-2.5-flash-image',                  // "Nano Banana"
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image',
    'gemini-3-pro-image',
    'gemini-3.1-pro-preview-customtools',      // survived the old suffix filter
    'gemini-2.5-computer-use-preview-10-2025', // ditto — dated suffix after "preview"
    'gemini-robotics-er-2-preview',
  ])('rejects %s', (id) => {
    expect(MODEL_IS_TEXT_ANALYSIS(id)).toBe(false);
  });

  test.each([
    'gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest',
    'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro',
  ])('accepts %s', (id) => {
    expect(MODEL_IS_TEXT_ANALYSIS(id)).toBe(true);
  });

  test('excludes previews — a moving target the user did not knowingly choose', () => {
    expect(MODEL_IS_TEXT_ANALYSIS('gemini-3-flash-preview')).toBe(false);
    expect(MODEL_IS_TEXT_ANALYSIS('gemini-3.1-pro-preview')).toBe(false);
  });

  test('non-gemini families are not offered', () => {
    expect(MODEL_IS_TEXT_ANALYSIS('gemma-4-31b-it')).toBe(false);
    expect(MODEL_IS_TEXT_ANALYSIS('nano-banana-pro-preview')).toBe(false);
  });

  test('survives junk without throwing', () => {
    for (const v of [null, undefined, '', 42, {}]) {
      expect(MODEL_IS_TEXT_ANALYSIS(v)).toBe(false);
    }
  });

  test('the live list still yields usable choices (filter is not over-broad)', () => {
    const kept = LIVE_IDS.filter(MODEL_IS_TEXT_ANALYSIS);
    expect(kept.length).toBeGreaterThanOrEqual(7);
    expect(kept).toContain('gemini-flash-latest');
  });
});

describe('shipped defaults', () => {
  test('the default is a rolling alias, not a pinned version', () => {
    // A dated id here is the bug this whole suite exists for.
    expect(DEFAULT_GEMINI_MODEL).toMatch(/-latest$/);
  });

  test('the default is itself a valid text-analysis id', () => {
    expect(MODEL_IS_TEXT_ANALYSIS(DEFAULT_GEMINI_MODEL)).toBe(true);
  });

  test('the default appears in the fallback dropdown list', () => {
    expect(GEMINI_MODELS.map(m => m.id)).toContain(DEFAULT_GEMINI_MODEL);
  });

  test('every fallback entry is a usable text model', () => {
    for (const m of GEMINI_MODELS) {
      expect(MODEL_IS_TEXT_ANALYSIS(m.id)).toBe(true);
    }
  });

  test('the default has a pricing row, so the cost badge is never a silent guess', () => {
    expect(GEMINI_PRICING[DEFAULT_GEMINI_MODEL]).toBeDefined();
  });
});
