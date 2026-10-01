import fs from "fs";
import path from "path";

// The Advanced Settings From/Through years must not be comma-grouped ("1,928").
test("historical-range year inputs are ungrouped", () => {
  const src = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
  expect(src).toMatch(/setRange\("start", v\)[^\n]*plain \/>/);
  expect(src).toMatch(/setRange\("end", v\)[^\n]*plain \/>/);
});
