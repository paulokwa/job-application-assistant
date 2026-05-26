# Agent Startup Instructions

Before planning or coding, read these files in order:

1. START_HERE.md
2. SESSION_HANDOVER.md
3. AGENT.md
4. RELEASE_V3_CHECKLIST.md
5. ROADMAP.md
6. TROUBLESHOOTING.md

Current release status:
v2.0 was accepted by Google after Chrome Web Store submission. v3.0 planning can continue, but do not package or submit v3.0 until the user explicitly confirms the release scope.

Important v3 release risk:
Direct PDF download currently uses the Chrome `debugger` permission. Review `RELEASE_V3_CHECKLIST.md` before deciding whether it can ship.

Before doing work, report:

- current branch
- latest main commit
- current release status
- next gated action
- completed work that must not be repeated

If any of these files are missing or conflict, stop and ask the user before coding.

Do not start feature work, release packaging, or cleanup work until the startup files have been read and the user confirms the next action.

**Hard requirement — autofill / matcher work:**
Before modifying `modules/autofillMatcher.js` or any autofill-related logic, read `TROUBLESHOOTING.md` entry 16. That entry defines the rule that prevents ATS-specific fixes from breaking other already-working ATS platforms (especially Workday). Any autofill fix that modifies a general matcher rather than adding a new ATS-specific matcher must be explicitly justified and confirmed with the user before committing.

Important:
This file is intentionally short. Keep detailed project rules in AGENT.md and current status in SESSION_HANDOVER.md.
