# Session Handover

## Current Release Status

- v2.0 submitted to the Chrome Web Store (2026-05-22). Pending review.
- `main` is the active development branch.

## Next Action Gate

Status:
[DONE] v1.0 approved and live on the Chrome Web Store (confirmed 2026-05-22).
[DONE] v2.0 release checklist completed (2026-05-22) — manifest bumped to 2.0.0, all smoke tests passed, privacy policy verified live.
[DONE] User completed two manual steps before submitting v2.0 (confirmed 2026-05-22):
  1. Updated Chrome Web Store screenshots to show Saved Jobs and Fit Analysis.
  2. Pasted updated overview copy into the Chrome Web Store developer dashboard.
[WAITING] v2.0 Chrome Web Store review result.

Next planned work: Application Pack, or V2.1 polish — user to confirm priority once v2.0 review clears.

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
- [DONE] Section-level locking for My Profile AI import (V1, section-blocking only) — users can lock any of 7 profile sections to prevent AI analyser import from overwriting them. Lock state stored in `profile.metadata.lockedSections`. Side-effect fix: `saveProfileData()`, `clearProfile()`, and profile switch/add paths now preserve full `profile.metadata`. (`modules/schema.js`, `settings/settings.html`, `settings/settings.css`, `settings/settings.js`)
- [DONE] Lock button UX polish — label updated to "Locked from AI import"; `syncLockToggles()` updates `title` attribute dynamically. (`settings/settings.js`)
- [DONE] Education dates fix — `normalizeResumeDraft()` was silently dropping education dates when AI returned `year`/`graduationYear` keys. Added `normalizeEducationDraft()` helper with full fallback chain. (`dashboard/dashboard.js`)
- [DONE] Phase 2 Workday autofill improvements (`modules/autofillMatcher.js`, `settings/settings.js`):
  - `toMonthYear()` helper — converts freeform date strings to MM/YYYY; returns '' for unconvertible values so empty-fill guard fires.
  - `toMonth()` / `toYear()` helpers — extract two-digit month or four-digit year from freeform strings.
  - `splitDates()` — splits a combined "Oct 2020 – Dec 2021" dates string into [startStr, endStr]; uses `\p{Dash}` (Unicode property) to cover all dash variants (hyphen-minus, en-dash, em-dash, figure dash, horizontal bar, minus sign, etc.).
  - Workday MM/YYYY combined date matchers — From+mm/yyyy and To+mm/yyyy signals; mutual exclusion guards removed (nearbyText bleed defeats them).
  - Workday split Month/Year date matchers (4 matchers) — match by `datesectionmonth`/`datesectionyear` id segments since Workday provides no label or placeholder on these inputs.
  - Iterate pattern in Workday date `get` functions — iterates all experience entries to find first parseable value, preventing flat-pass gate failure when experience[0] has year-only dates.
  - Experience location matcher — matches work location fields; excludes personal address, city, postal, country signals.
  - Experience location field added to My Profile settings UI — text input in each experience card, collected by `collectProfileFromForm()`. (`settings/settings.js`)
  - `EMPLOYMENT_FIELD_TYPES` reduced to `{employer, jobTitle}` — startDate/endDate removed to prevent Workday's 4 split-date inputs from collapsing the between-section gap below threshold.
  - `EXPERIENCE_ASSIGNABLE` set added — dates, location, bulletPoints are post-assigned by fieldIndex position after cluster detection rather than driving gap detection.
  - `regroupEmploymentMatches` assignable pass updated — applies `toMonth()`/`toYear()`/`toMonthYear()`/raw based on field id signals, with `splitDates()` fallback for profiles that store dates as a single string.
  - Test form added: `tests/autofill-multi-employment.html` — 30-field form with 11 hidden spacer inputs engineered to produce a fieldIndex gap exceeding the threshold, validating two-section grouping detection.
  - Known quirk: profiles where the dates separator is stored as an unusual Unicode dash (not covered by the previous `[-–—]` class) may still fail to split; `\p{Dash}` fix applied but not yet confirmed resolved for all profiles.

## Current Main Branch State

Latest known `main` commit (2026-05-23):

`61486f5` - `feat: improve education date handling and lock button UX in settings`

Uncommitted at time of handover: Phase 2 Workday autofill work listed above — to be committed in this session.

## Do Not Repeat

- Do not rebuild Saved Jobs.
- Do not rebuild Fit Analysis.
- Do not redo privacy/storage migration.
- Do not redo storage quota guards.
- Do not rewrite roadmap docs unless the user asks.
- Do not add AI to the autofill matcher — it is intentionally deterministic and rule-based.
- Do not change `content.js`, the profile schema/storage (beyond documented UI additions), fill logic, or ATS-specific adapters.
- Do not auto-submit forms or fill sensitive/legal/demographic fields.
- Do not guess missing work locations or invent months for year-only dates.
- Do not duplicate Education 1 into Education 2.

## Manual Tests Already Passed

- Saved Jobs tests passed.
- Fit Analysis tests passed.
- Privacy/storage readiness tests passed.
- Storage quota guard tests passed.
- Core quick flows passed.
- Workday autofill: Electric Playground (exp[2]) — all 4 split date rows fill correctly (07/2022, 09/2022). Multi-section grouping confirmed working.

## Future Roadmap

See `ROADMAP.md`. Do not duplicate the full roadmap here.

## Release Checklist

See `RELEASE_V2_CHECKLIST.md`.

## Handover Maintenance Rule

Every time a gated action is completed:

1. Mark it `[DONE]`.
2. Add the commit/PR link if available.
3. Move the next waiting item into "Next Action Gate."
4. Remove or downgrade stale warnings so future agents do not repeat completed work.
