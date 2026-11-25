import fs from "fs";
import path from "path";

test("historical-range year inputs are ungrouped", () => {
  const src = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
  expect(src).toMatch(/setRange\("start", v\)[^\n]*plain \/>/);
  expect(src).toMatch(/setRange\("end", v\)[^\n]*plain \/>/);
});
