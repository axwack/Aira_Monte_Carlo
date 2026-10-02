/**
 * `CheckpointsPanel` — lifted out of `MCTab`.
 *
 * Beyond "it renders", this pins the four things that changed in the move,
 * because each one was a defect rather than a preference:
 *   1. the row actions are named in text, not by emoji alone;
 *   2. "set baseline" confirms first and says what it will do;
 *   3. Save says WHY it did nothing;
 *   4. the panel admits when it is showing only some of the checkpoints.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CheckpointsPanel, { checkpointError } from "./forecast/CheckpointsPanel";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DOB = "1970-01-01";
const MC = { pcts: [{ age: 50, p50: 900000 }, { age: 51, p50: 950000 }] };

const cp = (over = {}) => ({ id: "c1", date: "2020-01-01", value: 1000000, note: "", ...over });

function mount(props = {}) {
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<CheckpointsPanel defaultOpen dob={DOB} retireAge={50} mc={MC} {...props} />));
  const byLabel = (re) => Array.from(el.querySelectorAll("[aria-label]")).find((n) => re.test(n.getAttribute("aria-label")));
  const buttons = () => Array.from(el.querySelectorAll("button"));
  const text = () => el.textContent;
  return { el, root, byLabel, buttons, text, unmount: () => act(() => root.unmount()) };
}

describe("checkpointError", () => {
  test("names the empty field rather than failing silently", () => {
    expect(checkpointError({ date: "", value: "1000" })).toMatch(/date/i);
    expect(checkpointError({ date: "2020-01-01", value: "" })).toMatch(/value/i);
    expect(checkpointError({ date: "not-a-date", value: "1000" })).toMatch(/YYYY-MM-DD/);
    expect(checkpointError({ date: "2020-13-99", value: "1000" })).toMatch(/does not exist/i);
    expect(checkpointError({ date: "2020-01-01", value: "0" })).toMatch(/greater than zero/i);
    expect(checkpointError({ date: "2020-01-01", value: "1000" })).toBe("");
  });
});

test("names the dollar basis count, and admits what it is not showing", () => {
  const many = Array.from({ length: 9 }, (_, i) => cp({ id: `c${i}`, date: `2020-01-0${(i % 9) + 1}` }));
  const { text, unmount } = mount({ checkpoints: many });
  expect(text()).toContain("9 saved");
  expect(text()).toContain("Showing the 6 most recent of 9 checkpoints.");
  unmount();
});

test("the empty state says none are saved", () => {
  const { text, unmount } = mount({ checkpoints: [] });
  expect(text()).toContain("none saved yet");
  unmount();
});

test("row actions carry text and an accessible name, not emoji alone", () => {
  const { text, byLabel, unmount } = mount({ checkpoints: [cp()] });
  expect(text()).toMatch(/Edit/);
  expect(text()).toMatch(/Delete/);
  expect(text()).toMatch(/Set baseline/);
  expect(byLabel(/Edit the 2020-01-01 checkpoint/)).toBeTruthy();
  expect(byLabel(/Delete the 2020-01-01 checkpoint/)).toBeTruthy();
  expect(byLabel(/resetting every account balance to/)).toBeTruthy();
  unmount();
});

test("save explains why it did nothing on an empty field", () => {
  const onUpdate = jest.fn();
  const { el, buttons, text, unmount } = mount({ checkpoints: [], onUpdate });
  act(() => buttons().find((b) => /Add checkpoint/.test(b.textContent)).click());
  act(() => buttons().find((b) => /Save checkpoint/.test(b.textContent)).click());
  expect(onUpdate).not.toHaveBeenCalled();
  expect(text()).toMatch(/Add the date this balance was true/);

  // Fill the date, leave the value: the message must change to the new field.
  const dateInput = el.querySelector('input[aria-label="Checkpoint date"]');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  act(() => { set.call(dateInput, "2020-01-01"); dateInput.dispatchEvent(new Event("input", { bubbles: true })); });
  act(() => buttons().find((b) => /Save checkpoint/.test(b.textContent)).click());
  expect(onUpdate).not.toHaveBeenCalled();
  expect(text()).toMatch(/Add the portfolio value/);
  unmount();
});

test("set baseline confirms first, names the consequence, then fires", () => {
  const onSetBaseline = jest.fn();
  const { byLabel, text, unmount } = mount({ checkpoints: [cp()], onSetBaseline });

  act(() => byLabel(/resetting every account balance/).click());
  expect(onSetBaseline).not.toHaveBeenCalled();
  expect(text()).toMatch(/Reset all balances to \$1,000,000\?/);

  act(() => byLabel(/Confirm: reset all balances/).click());
  expect(onSetBaseline).toHaveBeenCalledWith(1000000);
  unmount();
});

test("cancelling the baseline confirm leaves the balances alone", () => {
  const onSetBaseline = jest.fn();
  const { byLabel, buttons, unmount } = mount({ checkpoints: [cp()], onSetBaseline });
  act(() => byLabel(/resetting every account balance/).click());
  act(() => buttons().find((b) => b.textContent === "Cancel").click());
  expect(onSetBaseline).not.toHaveBeenCalled();
  expect(byLabel(/resetting every account balance/)).toBeTruthy();
  unmount();
});

test("delete hands the id back rather than mutating anything", () => {
  const onDelete = jest.fn();
  const { byLabel, unmount } = mount({ checkpoints: [cp()], onDelete });
  act(() => byLabel(/Delete the 2020-01-01 checkpoint/).click());
  expect(onDelete).toHaveBeenCalledWith("c1");
  unmount();
});

test("compares the actual value against the median for that age", () => {
  const { text, unmount } = mount({ checkpoints: [cp()] });
  expect(text()).toMatch(/Ahead/);
  expect(text()).toContain("$900,000"); // the p50 it was compared against
  unmount();
});
