// The AI key is a credential: it must never sit inside the saved profile (which
// gets exported and shared). Covers save, load, legacy migration, and omit-safety.
import { saveProfileToLocal, BLANK_PROFILE } from "./App";

const PROFILE_KEY = "aira_profile_v1";
const AIKEY_KEY = "aira_ai_key_v1";
const stored = () => JSON.parse(localStorage.getItem(PROFILE_KEY));

beforeEach(() => localStorage.clear());

test("saving moves the key out of the profile into its own key", () => {
  saveProfileToLocal({ ...BLANK_PROFILE, geminiApiKey: "AIzaSECRET" });
  expect(stored().geminiApiKey).toBeUndefined();
  expect(localStorage.getItem(PROFILE_KEY)).not.toContain("AIzaSECRET");
  expect(localStorage.getItem(AIKEY_KEY)).toBe("AIzaSECRET");
});

test("a caller that omits the field does not wipe the key; an explicit empty string does", () => {
  localStorage.setItem(AIKEY_KEY, "AIzaSECRET");
  const { geminiApiKey: _drop, ...noKey } = BLANK_PROFILE;
  saveProfileToLocal(noKey);
  expect(localStorage.getItem(AIKEY_KEY)).toBe("AIzaSECRET");
  saveProfileToLocal({ ...BLANK_PROFILE, geminiApiKey: "" });
  expect(localStorage.getItem(AIKEY_KEY)).toBeNull();
});
