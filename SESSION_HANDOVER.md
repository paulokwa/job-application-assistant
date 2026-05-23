# Session Handover

## Current Release Status

- v1.0 has been submitted to the Chrome Web Store and is pending review.
- `main` contains v2.0 candidate work.
- Do not package or submit v2.0 until the v1.0 review result is known.

## Next Action Gate

Status:
[DONE] v1.0 approved and live on the Chrome Web Store (confirmed 2026-05-22).
[DONE] v2.0 release checklist completed (2026-05-22) — manifest bumped to 2.0.0, all smoke tests passed, privacy policy verified live.
[DONE] User completed two manual steps before submitting v2.0 (confirmed 2026-05-22):
  1. Updated Chrome Web Store screenshots to show Saved Jobs and Fit Analysis.
  2. Pasted updated overview copy into the Chrome Web Store developer dashboard.

Rules:

- Do not submit v2.0 until the user confirms the above two steps are done.

## Completed Since v1.0 Submission

- [DONE] Saved Jobs workflow merged.
- [DONE] Fit Analysis merged.
- [DONE] Privacy/storage readiness merged.
- [DONE] Safe URL opening merged.
- [DONE] Clear session cleanup merged.
- [DONE] Storage quota guards merged.
- [DONE] `ROADMAP.md` and `RELEASE_V2_CHECKLIST.md` updated.
- [DONE] AI job info suggestions (job title/employer extraction via AI suggest fields) — `feature/ai-job-info-extraction`.
- [DONE] Fit score `/100` reference added to saved job cards (`jobs/jobs.js`, `jobs/jobs.css`).
- [DONE] Fit score label bug fixed — label now always derived from numeric score, not trusted from AI response (`modules/fitAnalysis.js`).
- [DONE] Fit Analysis scoring prompt overhauled — added 0–100 rubric with anchor points, replaced over-strict "do not infer" rule with transferable skills recognition.
- [DONE] Per-profile Fit Analysis inference mode toggle (Transferable / Exact) — stored in profile metadata, visible and switchable in Manage Profiles, explanation text added (`settings/settings.html`, `settings/settings.js`, `settings/settings.css`, `dashboard/dashboard.js`, `modules/fitAnalysis.js`).
- [DONE] Section-level locking for My Profile AI import (V1, section-blocking only) — users can lock any of 7 profile sections (Personal Details, Summaries, Skills, Experience, Education, Certifications, Additional Background) to prevent AI analyser import from overwriting them. Lock toggles on each section card, pre-import warning modal, enforcement inside `attemptAutofill()` merge block, skipped-section names shown in success status. Lock state stored in `profile.metadata.lockedSections`. Manual edits unaffected. Side-effect fix: `saveProfileData()`, `clearProfile()`, and profile switch/add paths now preserve full `profile.metadata` (was being discarded on every manual save — pre-existing bug). (`modules/schema.js`, `settings/settings.html`, `settings/settings.css`, `settings/settings.js`)

## Current Main Branch State

Latest known `main` commit (2026-05-22):

`c97375e` - `fix: update ATS platforms list for field detection and filling`

Recent merged work on main (not in previous handover entries):
- `c97375e` fix: update ATS platforms list for field detection and filling
- `90d1bd6` feat: enhance education date handling in autofill and drafting modules
- `351b356` feat: implement autofill review feature with UI and logic (form-field autofill review overlay in dashboard)
- `b2f0415` release: bump to v2.0.0 and update handover gate

## Next Likely Branch

`feature/profile-section-locking` (just implemented — see Completed list)

Next after that: application pack, or V1.1 polish depending on user priority.

## Do Not Repeat

- Do not rebuild Saved Jobs.
- Do not rebuild Fit Analysis.
- Do not redo privacy/storage migration.
- Do not redo storage quota guards.
- Do not rewrite roadmap docs unless the user asks.
- Do not start Application Pack before v2.0 packaging unless the user explicitly changes priority.

## Manual Tests Already Passed

- Saved Jobs tests passed.
- Fit Analysis tests passed.
- Privacy/storage readiness tests passed.
- Storage quota guard tests passed.
- Core quick flows passed.

## Future Roadmap

See `ROADMAP.md`. Do not duplicate the full roadmap here.

## Release Checklist

See `RELEASE_V2_CHECKLIST.md`.

## How To Clear This Handover

When v2.0 is packaged/submitted, update this file:

- Change `[WAITING] v1.0 Chrome Web Store review result` to `[DONE]` or `[RESOLVED]`.
- Add v2.0 package/submission status.
- Move `release/v2.0-package` from blocked to done.
- Replace the Next Action Gate with the next real blocker or next planned feature.
- Keep completed items in Do Not Repeat until the next major release is complete.

## Handover Maintenance Rule

Every time a gated action is completed:

1. Mark it `[DONE]`.
2. Add the commit/PR link if available.
3. Move the next waiting item into "Next Action Gate."
4. Remove or downgrade stale warnings so future agents do not repeat completed work.
