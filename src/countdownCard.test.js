import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CountdownCard, { careerProgress, COUNTDOWN_TICK_MS } from "./CountdownCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props) {
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<CountdownCard {...props} />));
  return { el, root };
}

test("real dob shows the exact date; no HRS/MIN/SEC", () => {
  const { el, root } = mount({ dob: "1980-03-10", retireAge: 65 });
  expect(el.textContent).toMatch(/Mar 10, 2045/);
  expect(el.textContent).not.toMatch(/HRS|MIN|SEC/);
  act(() => root.unmount());
});

test("estimated dob shows only the year and says estimate", () => {
  const { el, root } = mount({ dob: "1980-06-15", retireAge: 65, dobIsEstimate: true });
  expect(el.textContent).toMatch(/Retirement year: 2045/);
  expect(el.textContent).not.toMatch(/Jun 15/);
  expect(el.textContent).toMatch(/estimate/);
  act(() => root.unmount());
});

test("ticks once a minute and clears its timer on unmount", () => {
  jest.useFakeTimers();
  const spy = jest.spyOn(global, "clearInterval");
  const { root } = mount({ dob: "1980-03-10", retireAge: 65 });
  expect(COUNTDOWN_TICK_MS).toBe(60000);
  act(() => root.unmount());
  expect(spy).toHaveBeenCalled();
  jest.useRealTimers();
  spy.mockRestore();
});

test("careerProgress: null without an honest start date, clamped otherwise", () => {
  const target = { date: new Date(2040, 0, 1) };
  expect(careerProgress("", target)).toBeNull();
  expect(careerProgress("2050-01-01", target)).toBeNull();
  expect(careerProgress("2000-01-01", target, new Date(2020, 0, 1))).toBeCloseTo(50, 0);
  expect(careerProgress("2000-01-01", target, new Date(2060, 0, 1))).toBe(100);
});
