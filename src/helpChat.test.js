import { retrieveHelpEntries, helpContext, plainText } from "./helpChat.js";
import { ABOUT_FEATURES } from "./about.js";

describe("help chat retrieval", () => {
  test("a check-in question finds the check-in entry first", () => {
    const hits = retrieveHelpEntries("How do I save a check-in?", ABOUT_FEATURES);
    expect(hits[0].id).toBe("check-ins");
  });

  test("returns at most k entries, best first", () => {
    const hits = retrieveHelpEntries("roth conversion tax bracket", ABOUT_FEATURES, 2);
    expect(hits.length).toBeLessThanOrEqual(2);
    expect(hits.length).toBeGreaterThan(0);
  });

  test("an empty or stop-word-only question matches nothing", () => {
    expect(retrieveHelpEntries("", ABOUT_FEATURES)).toEqual([]);
    expect(retrieveHelpEntries("what is the", ABOUT_FEATURES)).toEqual([]);
  });

  test("an off-topic question matches nothing, so no AI call is needed", () => {
    expect(retrieveHelpEntries("zebra xylophone", ABOUT_FEATURES)).toEqual([]);
  });

  test("context drops style blocks and tags and caps length", () => {
    const entry = { id: "x", title: "T", body: "<style>.a{color:red}</style><p>Hello <b>world</b></p>" + "z".repeat(5000) };
    expect(plainText(entry.body)).not.toMatch(/color:red|<p>/);
    const ctx = helpContext([entry], 100);
    expect(ctx.startsWith("[x] T\nHello world")).toBe(true);
    expect(ctx.length).toBeLessThan(150);
  });
});
