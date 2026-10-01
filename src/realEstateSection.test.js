import React, { act } from "react";
import { createRoot } from "react-dom/client";
import RealEstateSection from "./planInputs/RealEstateSection";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount(props = {}) {
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<RealEstateSection {...props} />));
  return { el, root };
}

test("renders the canonical real-estate and original-term fields", () => {
  const { el, root } = mount({
    properties: [{ id: "p1", label: "Home", value: 400000, mortgage: 340000, income: 0 }],
    mortgage: { balance: 340000, rate: 5.25, start: "2020-01", term: 30, extra: 0 },
  });
  expect(el.textContent).toMatch(/Real Estate & Debt/);
  expect(el.textContent).toMatch(/Original term \(yrs\)/);
  expect(el.querySelector('[data-testid="mortgage-start"]').value).toBe("2020-01");
  expect(el.querySelector('[data-testid="p1-mortgage"]').value).toBe("340000");
  act(() => root.unmount());
});

test("primary property mortgage stays synchronized with the mortgage editor", () => {
  const propertyCalls = [];
  const mortgageCalls = [];
  const { el, root } = mount({
    properties: [{ id: "p1", label: "Home", value: 400000, mortgage: 340000, income: 0 }],
    mortgage: { balance: 340000, term: 30 },
    onUpdateProperty: (...args) => propertyCalls.push(args),
    onMortgageChange: (...args) => mortgageCalls.push(args),
  });
  const input = el.querySelector('[data-testid="mortgage-balance"]');
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  act(() => { set.call(input, "300000"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(mortgageCalls).toContainEqual(["balance", 300000]);
  expect(propertyCalls).toContainEqual(["p1", "mortgage", 300000]);
  act(() => root.unmount());
});
