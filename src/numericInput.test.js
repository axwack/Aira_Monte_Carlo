/**
 * ANumInput — the one numeric-entry control (46 call sites in App.jsx).
 *
 * Reported as "these numbers don't let me edit — when I copy or paste, or when
 * I delete the value and then try to change it". The React logic was sound in
 * isolation; the failures were on blur, and there were two of them:
 *
 *   1. `Math.max(min, Math.min(max, value))` with an absent bound is NaN.
 *      One blur on a field whose caller forgot `min` or `max` wiped the value.
 *      Latent today (all 46 sites pass both) but one forgotten prop from
 *      zeroing a balance, and invisible when the parent writes `value || 0`.
 *
 *   2. It clamped the `value` PROP rather than what the user typed. Whenever the
 *      parent is a render behind — which is what an expensive re-render on every
 *      keystroke produces, and this app rebuilds `params` and marks the Monte
 *      Carlo stale on each one — blur committed the stale number and the last
 *      digits of the edit vanished. That is the reported symptom.
 *
 * Plus a third, browser-only and so not reproducible in JSDOM: the auto-select
 * is deferred a frame (it must run after the display swaps from "6,126" to
 * "6126"), and a deferred select() landing after typing has begun selects what
 * was just typed, so the next keystroke replaces the whole field — an edit
 * collapsing to a single digit. Guarded by the typedSinceFocus ref; the test
 * below pins the ref's contract rather than the frame timing.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ANumInput, parseNumericEntry } from './App';

global.IS_REACT_ACT_ENVIRONMENT = true;

const type = (el, val) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
// React delegates onFocus/onBlur through focusin/focusout — dispatching
// 'focus'/'blur' silently exercises the UNFOCUSED path and proves nothing.
const focus = (el) => el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
const blur  = (el) => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

/** `freeze: n` models a parent that is a render behind: it stops applying
 *  updates after the nth, while the control keeps receiving keystrokes. */
function Host({ min, max, step, start, spy, freeze }) {
  const [v, setV] = useState(start);
  spy.read = () => v;
  return React.createElement(ANumInput, {
    value: v,
    onSet: (x) => { spy.sets.push(x); if (!freeze || spy.sets.length <= freeze) setV(x); },
    min, max, step,
  });
}

const mount = (props) => {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const spy = { sets: [], read: () => null };
  act(() => { createRoot(div).render(React.createElement(Host, { ...props, spy })); });
  return { input: div.querySelector('input'), spy };
};

const MONEY = { min: 0, max: 1e12, step: 5000 };

describe('ANumInput — editing', () => {
  test('clear, retype, blur commits the new number', () => {
    const { input, spy } = mount({ ...MONEY, start: 6126 });
    act(() => { focus(input); });
    expect(input.value).toBe('6126');          // raw while focused, not "6,126"
    act(() => { type(input, ''); });
    act(() => { type(input, '7500'); });
    act(() => { blur(input); });
    expect(spy.read()).toBe(7500);
    expect(input.value).toBe('7,500');         // grouped once focus leaves
  });

  test('a pasted, formatted amount is parsed', () => {
    const { input, spy } = mount({ ...MONEY, start: 0 });
    act(() => { focus(input); });
    act(() => { type(input, '$1,234,567'); });
    act(() => { blur(input); });
    expect(spy.read()).toBe(1_234_567);
  });

  test('a decimal survives the keystroke that ends in "."', () => {
    const { input, spy } = mount({ min: 2, max: 10, step: 0.1, start: 4 });
    act(() => { focus(input); });
    act(() => { type(input, '3.'); });
    expect(input.value).toBe('3.');            // not rewritten to "3"
    act(() => { type(input, '3.8'); });
    act(() => { blur(input); });
    expect(spy.read()).toBeCloseTo(3.8, 10);
  });
});

describe('ANumInput — blur regressions', () => {
  test('REGRESSION: blur commits what was typed, not a stale prop', () => {
    // Parent applies only the first two updates, then lags.
    const { input, spy } = mount({ ...MONEY, start: 6126, freeze: 2 });
    act(() => { focus(input); });
    act(() => { type(input, ''); });
    act(() => { type(input, '7'); });
    act(() => { type(input, '75'); });
    act(() => { type(input, '7500'); });
    expect(input.value).toBe('7500');          // the field shows the real edit
    expect(spy.read()).toBe(7);                // ...while the parent is behind

    // Measure ONLY what blur does. Asserting on the last element of `sets` would
    // be inert: handleChange already pushed 7500 on the final keystroke, so the
    // broken version ends with 7500 too. What separates them is whether blur
    // re-commits the typed value or silently accepts the stale prop.
    const beforeBlur = spy.sets.length;
    act(() => { blur(input); });
    const committedByBlur = spy.sets.slice(beforeBlur);

    // Old behaviour: clamped the PROP (7), found it unchanged, committed nothing,
    // and reset the display to "7" — the edit silently reverted on click-away.
    expect(committedByBlur).toContain(7500);
  });

  test('REGRESSION: a caller that omits min/max does not get NaN on blur', () => {
    const { input, spy } = mount({ step: 1, start: 50 });   // no min, no max
    act(() => { focus(input); });
    act(() => { type(input, '75'); });
    act(() => { blur(input); });
    expect(spy.read()).toBe(75);
    expect(spy.sets.every(Number.isFinite)).toBe(true);     // never NaN
    expect(input.value).toBe('75');
  });

  test('the deferred auto-select cannot fire once typing has started', () => {
    // The guard is a ref, so assert the observable contract: text typed in the
    // same tick as focus survives, and is what gets committed.
    const { input, spy } = mount({ ...MONEY, start: 6126 });
    act(() => { focus(input); type(input, '9'); });
    expect(input.value).toBe('9');
    act(() => { blur(input); });
    expect(spy.read()).toBe(9);
  });
});

describe('ANumInput — bounds', () => {
  test('max clamps while typing (you never pass through a too-large number)', () => {
    const { input, spy } = mount({ min: 0, max: 100, step: 1, start: 50 });
    act(() => { focus(input); });
    act(() => { type(input, '999'); });
    expect(spy.read()).toBe(100);
  });

  test('min applies only on blur, so en route to 50 you may pass 5', () => {
    const { input, spy } = mount({ min: 2, max: 10, step: 0.1, start: 4 });
    act(() => { focus(input); });
    act(() => { type(input, ''); });
    act(() => { type(input, '1'); });
    expect(spy.read()).toBe(1);                // not snapped to 2 mid-type
    act(() => { blur(input); });
    expect(spy.read()).toBe(2);                // snapped once editing is done
  });
});

describe('parseNumericEntry', () => {
  test.each([
    ['$5,000',      5000],
    ['1.5k',        1500],
    ['2m',          2_000_000],
    ['  42  ',      42],
    ['7%',          7],
  ])('%s -> %s', (input, expected) => {
    expect(parseNumericEntry(input)).toBe(expected);
  });

  test.each(['', '   ', 'abc', '1e999'])('%s -> null (caller keeps the old value)', (input) => {
    expect(parseNumericEntry(input)).toBeNull();
  });
});
