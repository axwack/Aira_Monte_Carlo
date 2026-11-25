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
const focus = (el) => el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
const blur  = (el) => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

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
    expect(input.value).toBe('6126');
    act(() => { type(input, ''); });
    act(() => { type(input, '7500'); });
    act(() => { blur(input); });
    expect(spy.read()).toBe(7500);
    expect(input.value).toBe('7,500');
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
    expect(input.value).toBe('3.');
    act(() => { type(input, '3.8'); });
    act(() => { blur(input); });
    expect(spy.read()).toBeCloseTo(3.8, 10);
  });
});

describe('ANumInput — blur regressions', () => {
  test('REGRESSION: blur commits what was typed, not a stale prop', () => {
    const { input, spy } = mount({ ...MONEY, start: 6126, freeze: 2 });
    act(() => { focus(input); });
    act(() => { type(input, ''); });
    act(() => { type(input, '7'); });
    act(() => { type(input, '75'); });
    act(() => { type(input, '7500'); });
    expect(input.value).toBe('7500');
    expect(spy.read()).toBe(7);

    const beforeBlur = spy.sets.length;
    act(() => { blur(input); });
    const committedByBlur = spy.sets.slice(beforeBlur);

    expect(committedByBlur).toContain(7500);
  });

  test('REGRESSION: a caller that omits min/max does not get NaN on blur', () => {
    const { input, spy } = mount({ step: 1, start: 50 });
    act(() => { focus(input); });
    act(() => { type(input, '75'); });
    act(() => { blur(input); });
    expect(spy.read()).toBe(75);
    expect(spy.sets.every(Number.isFinite)).toBe(true);
    expect(input.value).toBe('75');
  });

  test('the deferred auto-select cannot fire once typing has started', () => {
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
    expect(spy.read()).toBe(1);
    act(() => { blur(input); });
    expect(spy.read()).toBe(2);
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
