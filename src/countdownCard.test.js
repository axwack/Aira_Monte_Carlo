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

test("missing or estimated dob hides the countdown and offers configuration", () => {
  const onConfigure = jest.fn();
  const missing = mount({ retireAge: 65, onConfigure });
  expect(missing.el.textContent).toMatch(/Add your date of birth/i);
  expect(missing.el.textContent).not.toMatch(/Retirement year/);
  act(() => missing.el.querySelector("button").click());
  expect(onConfigure).toHaveBeenCalledTimes(1);
  act(() => missing.root.unmount());

  const estimated = mount({ dob: "1980-06-15", retireAge: 65, dobIsEstimate: true, onConfigure });
  expect(estimated.el.textContent).toMatch(/Add your date of birth/i);
  expect(estimated.el.textContent).not.toMatch(/Jun 15|Retirement year/);
  act(() => estimated.root.unmount());
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

test("start date is shown as entered, not shifted a day west of UTC", () => {
  const { el, root } = mount({ dob: "1980-03-10", retireAge: 65, employerStartDate: "2000-01-01" });
  expect(el.textContent).toMatch(/Career since 2000/);
  act(() => root.unmount());
});
