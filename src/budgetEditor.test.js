import React, { act } from "react";
import { createRoot } from "react-dom/client";
import BudgetEditor, { budgetLinesToCsv, lineError } from "./planInputs/BudgetEditor";
import { parseExpenseCsv } from "./engine/expenseImport.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("editor adds a line and reports its controlled value", () => {
  const values = [];
  function Host() {
    const [lines, setLines] = React.useState([]);
    return <BudgetEditor value={lines} onChange={(next) => { values.push(next); setLines(next); }} />;
  }
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => root.render(<Host />));
  act(() => Array.from(el.querySelectorAll("button")).find((b) => b.textContent.includes("Add budget line")).click());
  expect(values.at(-1)).toHaveLength(1);
  expect(el.querySelector('[data-testid="budget-line-0"]')).not.toBeNull();
  act(() => root.unmount());
});

test("validation catches a Like to Spend lower than Must Spend", () => {
  expect(lineError({ category: "Travel", frequency: "Annually", mustSpend: 5000, likeToSpend: 4000 })).toMatch(/at least Must Spend/);
  expect(lineError({ category: "Travel", frequency: "Annually", mustSpend: 5000, likeToSpend: 7000 })).toBe("");
});

test("serialized editor rows are accepted by the existing expense parser", () => {
  const csv = budgetLinesToCsv([
    { category: "Groceries", frequency: "Monthly", mustSpend: 800, likeToSpend: 1000 },
    { category: "Travel", frequency: "Annually", mustSpend: 8000, likeToSpend: 20000 },
  ]);
  const result = parseExpenseCsv(csv);
  expect(result.mode).toBe("single");
  expect(result.total).toBe(32000);
  expect(result.essentialTotal).toBe(17600);
});
