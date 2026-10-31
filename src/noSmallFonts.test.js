import fs from "fs";
import path from "path";

// Owner ruling 2026-10-30: no text below --fs-small (11px). Same ratchet idea as noEmojiChrome.test.js, with a limit of zero.
// Admin, AI and PrintReport files are left out on purpose.
const FILES = ["App.jsx", "CountdownCard.jsx", "BucketLegend.jsx", "SpouseDobField.jsx", "forecast/CheckpointsPanel.jsx", "planInputs/RealEstateSection.jsx", "planInputs/BudgetEditor.jsx"];
const SMALL = /fontSize: ?(?:\d|10(?:\.\d+)?)(?![\d.])/;

test.each(FILES)("%s has no numeric fontSize below 11", (f) => {
  const hits = fs.readFileSync(path.join(__dirname, f), "utf8").split("\n")
    .map((l, i) => [i + 1, l]).filter(([, l]) => SMALL.test(l) && !/^\s*(\/\/|\*)/.test(l));
  expect(hits.map(([n]) => n)).toEqual([]);
});
