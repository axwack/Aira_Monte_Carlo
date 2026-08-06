/**
 * The first-death box must say who actually survives.
 *
 * Reported 2026-08-05 with a screenshot. The user set "Who passes first" to
 * "My spouse" and "Model the first death at spouse's age" to 71, and the box
 * replied "Your spouse survives." He wrote: "I expected it to read 'Your spouse
 * dies first and you survive'." He was right.
 *
 * `primarySurvives === true` means the SPOUSE dies and the PRIMARY survives, and
 * that branch printed the opposite. The arithmetic below it was correct all
 * along — the survivor benefit shown is the deceased spouse's, passing to the
 * primary — so no number was wrong, only the sentence describing them.
 *
 * That is the most repeated defect in this codebase and no engine test can see
 * it, because the engines do not read English. Hence a test on the wording.
 */

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
