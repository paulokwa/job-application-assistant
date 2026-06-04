# Agent Startup Instructions

Before planning or coding, read these files in order:

1. START_HERE.md
2. SESSION_HANDOVER.md
3. AGENT.md
4. RELEASE_V4_CHECKLIST.md
5. RELEASE_V3_CHECKLIST.md
6. ROADMAP.md
7. TROUBLESHOOTING.md

Current release status:
v2.0 was accepted by Google. v3.0 was submitted to the Chrome Web Store on 2026-06-02 and approved by Google on 2026-06-04. v4.0 is the active release cycle, with Tab-Scoped Job Sessions and Draft Restore completed as v4.0 development work. Do not create or submit a v4.0 package unless the user explicitly confirms a release scope.

Important v3 release note:
Direct PDF download was removed/deferred for store-safety. Keep the print-dialog Save as PDF path available.

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
