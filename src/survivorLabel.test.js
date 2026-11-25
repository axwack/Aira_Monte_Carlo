import { firstDeathHeadline } from "./App";

describe("firstDeathHeadline", () => {
  test("THE REPORTED BUG: when the primary survives, it does NOT say the spouse survives", () => {
    const h = firstDeathHeadline(true, 70, 71);
    expect(h).not.toContain("Your spouse survives");
  });

  test("primary survives → names the spouse as dying and the user as surviving", () => {
    const h = firstDeathHeadline(true, 70, 71);
    expect(h).toContain("your spouse dies first");
    expect(h).toContain("you survive");
  });

  test("spouse survives → names the user as dying, with the spouse's age", () => {
    const h = firstDeathHeadline(false, 70, 71);
    expect(h).toContain("you die first");
    expect(h).toContain("71");
  });

  test("the two cases can never read the same way", () => {
    expect(firstDeathHeadline(true, 70, 71)).not.toBe(firstDeathHeadline(false, 70, 71));
  });

  test("both name the modelled age so the box is self-explaining", () => {
    expect(firstDeathHeadline(true, 70, 71)).toContain("70");
    expect(firstDeathHeadline(false, 70, 71)).toContain("70");
  });
});
