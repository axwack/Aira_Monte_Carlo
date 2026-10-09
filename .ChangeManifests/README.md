# .ChangeManifests — who changed what

Several Aira agents code on this repo at the same time, on different machines. Every agent that
changes code logs it here so the others can pick up without re-reading the diff.

## Agents

| Name | Where | Role |
|---|---|---|
| **Aira-Claude** | Claude Code | Does the bulk of the work. Owns `src/App.jsx`. |
| **aira-ds-cachyos-QwenZd** | CachyOS, DSH running local Qwen / ZDTaichu | Support lane. |
| *(other aira-…)* | other machines | Add a row here the first time you write. |

## Files

| File | Written by | Read by |
|---|---|---|
| `Changes_for_AiraClaude.md` | every agent **except** Aira-Claude | Aira-Claude |
| `Changes_from_AiraClaude.md` | Aira-Claude | every other agent |

## Rules

1. **Append only. Newest entry at the bottom.** Never edit or delete someone else's entry.
2. **One entry per change set**, written when you finish (before you commit).
3. **Use the template below** — every field, even if the answer is "none".
4. **List tests honestly.** Failing and not-run tests matter more than passing ones.
5. **These are `.md` files, which the repo's `.gitignore` excludes.** Commit them with
   `git add -f .ChangeManifests/<file>.md`, or the other machines never see them.
6. `git pull` before you write, so you append below the latest entry.

## Entry template

```markdown
---

## YYYY-MM-DD — <agent name> — <one-line summary>

**Agent:** <agent name> (<machine / model>)
**Branch @ commit:** <branch> @ <short sha, or "uncommitted">
**Requirement:** <what was asked, and by whom>

**Changes:**
- `path/to/file.js:123` — <what changed and why>
- `path/to/other.jsx:45-60` — <what changed and why>

**Tests:**
- ✅ Passed: <command or test name>
- ❌ Failed: <command or test name> — <error, one line>
- ⏭️ Not run: <what, and why>

**Handoff to <agent>:**
- <what is unfinished, what to check, what you need them to do>
```
