import fs from "fs";
import path from "path";

const FILES = ["App.jsx", "CountdownCard.jsx", "BucketLegend.jsx", "SpouseDobField.jsx", "forecast/CheckpointsPanel.jsx", "planInputs/RealEstateSection.jsx", "planInputs/BudgetEditor.jsx"];
const SMALL = /fontSize: ?(?:\d|10(?:\.\d+)?)(?![\d.])/;

test.each(FILES)("%s has no numeric fontSize below 11", (f) => {
  const hits = fs.readFileSync(path.join(__dirname, f), "utf8").split("\n")
    .map((l, i) => [i + 1, l]).filter(([, l]) => SMALL.test(l) && !/^\s*(\/\/|\*)/.test(l));
  expect(hits.map(([n]) => n)).toEqual([]);
});
