import { ABOUT_FEATURES } from "./about.js";

// Help entries: the shape the Help modal's search and the future source check rely on.
describe("ABOUT_FEATURES help entries", () => {
  test("every id is a unique lowercase slug (no spaces)", () => {
    const ids = ABOUT_FEATURES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  });

  test("every entry has 4 to 8 lowercase keywords for search", () => {
    ABOUT_FEATURES.forEach((e) => {
      expect(e.keywords.length).toBeGreaterThanOrEqual(4);
      expect(e.keywords.length).toBeLessThanOrEqual(8);
      e.keywords.forEach((k) => expect(k).toBe(k.toLowerCase()));
    });
  });

  test("every entry has a title, a body, and string source and verified fields", () => {
    ABOUT_FEATURES.forEach((e) => {
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.body.length).toBeGreaterThan(0);
      expect(typeof e.source).toBe("string");
      expect(typeof e.verified).toBe("string");
    });
  });
});
