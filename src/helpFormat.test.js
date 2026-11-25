import { ABOUT_FEATURES } from "./about.js";

describe("help topic format", () => {
  test("every topic opens with exactly one lede", () => {
    const offenders = ABOUT_FEATURES
      .map((e) => ({ id: e.id, ledes: (String(e.body).match(/help-lede/g) || []).length }))
      .filter((r) => r.ledes !== 1);
    expect(offenders).toEqual([]);
  });

  test("paragraph tags are balanced in every topic", () => {
    const offenders = ABOUT_FEATURES
      .map((e) => {
        const open = (String(e.body).match(/<p[\s>]/g) || []).length;
        const close = (String(e.body).match(/<\/p>/g) || []).length;
        return { id: e.id, open, close };
      })
      .filter((r) => r.open !== r.close);
    expect(offenders).toEqual([]);
  });

  test("keeps the shipped topic set and its labels", () => {
    expect(ABOUT_FEATURES.length).toBeGreaterThanOrEqual(28);
    ABOUT_FEATURES.forEach((e) => {
      expect(typeof e.id).toBe("string");
      expect(e.id.length).toBeGreaterThan(0);
      expect(typeof e.group).toBe("string");
      expect(typeof e.title).toBe("string");
    });
  });
});
