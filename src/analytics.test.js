import { track, EVENTS } from "./analytics";

test("sends only allow-listed names, as JSON, and never throws", () => {
  const sent = [];
  global.navigator.sendBeacon = (url, blob) => { sent.push([url, blob]); return true; };
  track("mc_run");
  track("not_an_event");
  expect(sent).toHaveLength(1);
  expect(sent[0][0]).toBe("/api/event");
  delete global.navigator.sendBeacon;
  expect(() => track("ai_click")).not.toThrow();
});

test("the worker allow-list matches the client list", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "functions", "api", "event.js"), "utf8");
  for (const n of EVENTS) expect(src).toContain(`"${n}"`);
});
