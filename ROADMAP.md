# Roadmap - Job Application Assistant

This document captures release prep notes and future roadmap ideas. It is planning only and does not commit any feature to a specific release.

## Roadmap Maintenance Rule

Only active, undone roadmap items should use numbered headings or numbered order lists. Completed work must be moved to an unnumbered completed/history section so future agents do not mistake finished items for pending work.

## Current Status

Version 1.0 is live on the Chrome Web Store.

Version 2.0 was submitted to the Chrome Web Store on 2026-05-22 and accepted by Google. The v2.0 release checklist is complete: manifest bumped, smoke tests passed, privacy policy verified, screenshots updated, and overview copy updated.

`main` currently contains:

- Saved Jobs workflow
- Fit Analysis for Saved Jobs
- Saved Jobs workspace upgrades: stats bar, recently-updated sorting, saved-job resume/cover-letter launch, and Fit Analysis advisory context for saved-job generation
- Privacy/storage readiness fixes
- Safe URL opening
- Clear session cleanup
- Storage quota guards
- Session scan payload cap for large temporary scan text
- Application Form Autofill MVP (Phases 1–5, deterministic rule-based, review-before-fill, no AI, no auto-submit)
- Post-v2 / v3 candidate work including Fit Check improvements, print filename support, Application Email Assistant, Application Pack actions, and targeted autofill matcher improvements

## v2.0 Release Status

- [DONE] Version number set to `2.0.0`.
- [DONE] Release notes/changelog prepared.
- [DONE] Manifest version bumped.
- [DONE] Packaged extension loaded cleanly.
- [DONE] Final smoke tests passed.
- [DONE] Chrome Web Store listing screenshots and overview copy updated.
- [DONE] v2.0 submitted to the Chrome Web Store on 2026-05-22.
- [DONE] v2.0 accepted by Google.

v3.0 release scope is confirmed for smoke testing. Do not package or submit v3.0 until smoke tests pass and the user explicitly confirms packaging/submission.

## Final v2.0 Smoke Test Checklist

- Settings -> AI Provider still works.
- Demo/Mock Mode works.
- My Profile and Manage Profiles persist data.
- Scan page -> Generate Resume.
- Manual job description -> Generate.
- Save to Jobs -> Load into generator.
- Analyze Fit and Re-analyze.
- History -> Regenerate.
- Open URL safety allows normal HTTPS links.
- Clear prevents old scanned job from reappearing.
- No obvious console errors in dashboard/settings/jobs/history.

## Active Roadmap Ideas

### 1. v3 Smoke Test

Goal: run the full v3 smoke test against the confirmed release scope before packaging.

Important: do not package or submit v3.0 until smoke tests pass and the user explicitly confirms packaging/submission. Direct PDF Download has been removed/deferred for store-safety; keep the print-dialog Save as PDF path available.

### 2. Tour Refresh And Saved Jobs Tour

Suggested branch: `feature/saved-jobs-tour`

Goal: review the existing dashboard/settings tours for drift after v3 UI changes, update any stale tour steps, and add a focused Saved Jobs page tour.

Scope notes:

- Check whether the existing dashboard feature tour still points to current controls and terminology.
- Check whether Settings section tours still match current layout and copy.
- Add a Saved Jobs tour that explains the saved job card, fit analysis, status/notes, grouped application-material actions, messaging actions, job management actions, and the "Review in Generator" workflow.
- Keep the tour concise and task-focused; do not turn it into a full onboarding rewrite.
- Verify keyboard navigation, Escape/skip behavior, small side-panel layout, and first-run/replay behavior.

## Later Autofill Improvements

Autofill remains a broad future bucket, but no immediate autofill implementation task is selected. Keep changes targeted, deterministic, and review-before-fill; follow `TROUBLESHOOTING.md` entry 16 before modifying `modules/autofillMatcher.js`.

## Later Intake Experiments

Deferred for now because the primary workflow is one job at a time. Revisit if users ask for bulk intake or URL-based importing.

### Batch/Manual Multi-Job Intake

Suggested branch: `feature/batch-job-intake`

Goal: let users add multiple jobs without scanning each one individually.

Possible intake methods:

- Manual multi-job paste
- Paste multiple job URLs
- CSV import later

Recommended first version: manual multi-job paste using separators or multiple cards.

### Job URL Import

Suggested branch: `feature/job-url-import`

Goal: allow users to paste one or more job URLs and attempt generic extraction.

Preferred behavior:

- Try generic extraction.
- Save successful results to Jobs.
- Mark failed/partial imports clearly.
- Suggest using Scan page when URL import fails.

Important: do not promise universal extraction from every job board.

### Search Results Page Link Scan

Suggested branch: `feature/job-link-scan`

Goal: let the extension scan a job search results page and collect candidate job links.

Preferred behavior:

- Find possible job links on the visible page.
- Show results for review.
- User selects which to save/import.

Treat it as a link collector first, not guaranteed full job-description extraction.

## Completed Roadmap Items

### Direct PDF Download Removed For Store-Safety

Status: **Complete on `main`** (2026-05-27).

Completed scope:

- Direct PDF Download UI and dashboard code were removed/deferred before v3 release.
- `debugger` and `downloads` permissions were removed from `manifest.json`.
- Print / Save as PDF remains the supported export path.
- Print export keeps filename preference support by setting the print-window document title from the configured filename pattern.

### Storage Cleanup After Migration Confidence

Status: **Complete on `main`**.

Completed scope:

- Provider settings and profile data now use local-only reads/writes.
- Legacy `chrome.storage.sync` fallback migration for provider/profile data was removed.
- This cleanup targeted private provider/profile data only.
- Other intentional `chrome.storage.sync` usage for low-sensitivity settings/history was left untouched.

### Fit Check Search-Results Detector Refinement

Status: **Complete on `main`** (2026-05-27).

Completed scope:

- Search/listing page detection now includes additional path patterns and high-precision page-text phrases such as save-search and job-alert language.
- Glassdoor `/Job/...jobs-SRCH...` search pages are skipped, while real `/job-listing/...` postings can still pass when posting content signals are present.
- `detectJobPage()` return values include `isLikelySearchPage`.
- Dashboard Fit Check skip toast distinguishes search/listing pages from generic non-job pages.
- Lightweight Node detector checks cover LinkedIn, Indeed, Glassdoor, Greenhouse/Lever-style postings, JSON-LD JobPosting, and plain non-job pages.

### Autofill Graduation Year And GitHub Matching

Status: **Complete on `main`** (2026-05-27).

Completed scope:

- Added a graduation-year select matcher that extracts the last four-digit year from education dates.
- Added `toGraduationYear()` helper.
- Added GitHub, GitHub Profile, and GitHub URL signals to the existing portfolio matcher.
- Added `tests/autofill-multi-education.html` fixture for multi-education grouping and graduation-year select review.
- Fixed the stale employment fixture threshold comment.
- No content script, dashboard, settings, manifest, or fill-logic changes.

### Application Pack Actions — Phase 1

Status: **Phase 1 complete on `main`** (2026-05-26).

Completed scope:

- Saved Jobs can launch resume-only generation using an existing saved job.
- Saved Jobs can launch cover-letter-only generation using an existing saved job.
- Existing Load into generator behavior remains available.

### Application Pack Actions — Reminder Text

Status: **Complete on `main`** (2026-05-26).

Completed scope:

- Saved Jobs can generate a suggested follow-up timing note, a target date, a reminder title, and a reminder body — all based on the saved job status and the user's local date.
- Deterministic and rule-based: no AI call, no new permissions, no calendar integration, no scheduling.
- Status-aware logic: applied (7-day follow-up), ready to apply (1-day apply reminder), saved/needs review (3-day review reminder), rejected (no reminder suggested).
- Copy buttons for reminder title and text. Nothing is scheduled automatically.

### Application Pack Actions — Short Application Answers

Status: **Complete on `main`** (2026-05-26).

Completed scope:

- Saved Jobs can launch a "Short answers" overlay that drafts answers to 5 preset common application questions: Why interested, Relevant experience, Why a good fit, Tell us about yourself, Anything else.
- Each answer card shows the question, a suggested answer (or an amber notice for answers the AI cannot safely draft), and a copy button.
- When an answer needs user input, the field is editable and starts empty — the user types their own answer and copies it. No AI-generated text is shown that could be mistaken for verified truth.
- Guardrails: no invented examples, metrics, credentials, or experience; no salary, work authorization, or demographic answers; no form filling; no auto-submit.

### Application Pack Actions — Follow-Up Message

Status: **Complete on `main`** (2026-05-26).

Completed scope:

- Saved Jobs can launch a status-aware follow-up message from an existing saved job.
- Dashboard shows a review overlay with optional subject, message body, warnings/notes, copy actions, regenerate, and close.
- Status-aware behavior: only `applied` status may reference a submitted application; `rejected` generates a gracious post-outcome note; all other statuses generate general interest follow-up without claiming application.
- Guardrails: does not claim an interview, phone screen, referral, mutual connection, prior contact, or recruiter invitation under any status. Nothing is sent automatically.

### Application Pack Actions - Recruiter Message

Status: **Complete on `main`** (2026-05-26).

Completed scope:

- Saved Jobs can launch a short recruiter/networking outreach message from an existing saved job.
- Dashboard shows a review overlay with optional subject, message body, warnings/notes, copy actions, regenerate, and close.
- Recruiter messages are initial outreach only: nothing is sent automatically, no `mailto:` is opened, and no content script path is used.

### Use Fit Analysis As Generation Context

Status: **Complete on `main`** (2026-05-26).

Completed scope:

- Saved-job resume and cover-letter generation can use existing Fit Analysis as advisory context: suggested angle, strong matches, and possible gaps.
- Possible gaps are treated as caution areas only.
- Generated content must remain grounded in the profile/source resume.

### Job Dashboard Stats

Status: **Complete on `main`** (2026-05-26).

Completed scope:

- Total saved jobs
- Strong matches (fit score >= 75)
- Good matches (fit score 50-74)
- Developing (fit score < 50 or unscored)

### Session Scan Payload Cap

Status: **Complete on `main`** (2026-05-26).

Completed scope:

- Context-menu scan payloads cap large text fields before session storage writes.
- Full-page dashboard handoff caps the temporary job description payload before session storage writes.
- Small scan metadata such as title, company, URL, source title, source type, and tab ID stays intact.

### Application Form Autofill MVP

Status: **MVP complete on `main`** (Phases 1–5).

What was built:

- Scan form fields button — content script walks visible `input`, `select`, `textarea` on the active tab and returns field descriptors
- Deterministic rule-based matcher — maps scanned fields to active profile values using signal patterns (label text, aria-label, placeholder, name, id, autocomplete attribute)
- Review overlay — shows matched / skipped fields with confidence badges; high-confidence rows pre-checked, medium unchecked; user can uncheck any row before filling
- Controlled page fill — fills only checked rows; dispatches native setter + `input` + `change` events for React/Vue/Angular compatibility; re-checks for sensitive fields before writing; staleness guard using id/name
- Safety guardrails: sensitive/legal/demographic fields skipped, submit/button/password/file/payment/captcha fields excluded, no form submission, no auto-checking consent checkboxes

Guardrails (permanent):

- User reviews all fields before anything is written.
- User manually submits the application.
- No automatic submission, ever.

## Suggested Order For Active Work

1. v3 Smoke Test
2. Tour Refresh And Saved Jobs Tour

## Autofill Known Limitations / Future Improvements

These are known constraints of the current MVP. None block local testing; they are inputs for future iterations.

### Matching

- Field matching currently uses deterministic rules only. AI-assisted matching for custom question fields (e.g. "Why do you want to work here?") is a future consideration.
- Multiple employment history sections are not fully mapped — only the most recent experience entry is used per field group.
- Multiple education entries can be grouped for clear repeated education sections, but unusual ATS layouts may still need targeted fixtures or matchers.
- Employment and education date handling is basic because profile dates are stored as freeform strings (e.g. "Jan 2021"). Graduation year selects are supported, but other structured month/year fields may still need targeted handling.
- Month/year dropdown support is limited to exact and case-insensitive text matching, plus a starts-with pass restricted to known month abbreviations only.

### Field identity

- Field identity uses scan-time index plus id/name attribute validation. More robust selectors (XPath, stable CSS paths) may be needed for heavily dynamic forms.
- If the application form re-renders between scan and fill (e.g. React SPA navigation), the field index can become stale. The current guard catches obvious mismatches but is not foolproof.

### Page compatibility

- Cross-origin iframes cannot be scanned or filled due to browser security restrictions. Many ATS platforms embed their forms in same-origin iframes, but some use cross-origin frames.
- Shadow DOM and custom web component inputs (used by some ATS widgets) may not be detected by `querySelectorAll`.
- Workday, Greenhouse, Lever, SmartRecruiters, Taleo, iCIMS, and other major ATS platforms may need platform-specific adapters for reliable field detection and filling.

### Safety boundaries (permanent — not limitations)

- Autofill does not and must never submit applications.
- Sensitive, legal, demographic, and equal-opportunity fields are always skipped and must be answered manually.
- The user reviews and confirms every fill before anything is written to the page.

## Product Principle

The app should remain an assistant, not an autopilot.

Best direction:

- Save jobs
- Analyze fit
- Prepare application materials
- Help with common form fields
- Keep the user in control

Avoid:

- Promising universal job board extraction
- Building dozens of custom job-board extractors too early
- Letting the app submit applications without user review
