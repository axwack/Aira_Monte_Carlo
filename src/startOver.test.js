import { resetLocalProfile, saveProfileToLocal, BLANK_PROFILE } from "./App";

beforeEach(() => localStorage.clear());

test("resetLocalProfile removes only the profile and cached results", () => {
  saveProfileToLocal({ ...BLANK_PROFILE, name: "Sam" });
  localStorage.setItem("aira_results_v1", "{}");
  ["aira_checkins_v1", "aira_yearend_ack_v1", "aira_buckets_cfg.v1", "aira_theme"].forEach((k) => localStorage.setItem(k, "keep"));

  expect(resetLocalProfile()).toBe(true);

  expect(localStorage.getItem("aira_profile_v1")).toBeNull();
  expect(localStorage.getItem("aira_results_v1")).toBeNull();
  ["aira_checkins_v1", "aira_yearend_ack_v1", "aira_buckets_cfg.v1", "aira_theme"].forEach((k) =>
    expect(localStorage.getItem(k)).toBe("keep"));
});

test("reload recovery: with no saved profile the landing gate is open", () => {
  saveProfileToLocal({ ...BLANK_PROFILE });
  resetLocalProfile();
  expect(localStorage.getItem("aira_profile_v1")).toBeNull(); // showWelcome = !loadProfileFromLocal()
});

test("dobIsEstimate round-trips through the saved profile and defaults to false", () => {
  expect(BLANK_PROFILE.dobIsEstimate).toBe(false);
  saveProfileToLocal({ ...BLANK_PROFILE, dob: "1980-06-15", dobIsEstimate: true });
  expect(JSON.parse(localStorage.getItem("aira_profile_v1")).dobIsEstimate).toBe(true);
});
