# Roadmap - Job Application Assistant

This document captures release prep notes and future roadmap ideas. It is planning only and does not commit any feature to a specific release.

## Current Status

Version 1.0 is live on the Chrome Web Store.

Version 2.0 was submitted to the Chrome Web Store on 2026-05-22 and accepted by Google. The v2.0 release checklist is complete: manifest bumped, smoke tests passed, privacy policy verified, screenshots updated, and overview copy updated.

`main` currently contains:

- Saved Jobs workflow
- Fit Analysis for Saved Jobs
- Privacy/storage readiness fixes
- Safe URL opening
- Clear session cleanup
- Storage quota guards
- Application Form Autofill MVP (Phases 1–5, deterministic rule-based, review-before-fill, no AI, no auto-submit)
- Post-v2 / v3 candidate work including Fit Check improvements, direct PDF download, and Application Email Assistant

## v2.0 Release Status

- [DONE] Version number set to `2.0.0`.
- [DONE] Release notes/changelog prepared.
- [DONE] Manifest version bumped.
- [DONE] Packaged extension loaded cleanly.
- [DONE] Final smoke tests passed.
- [DONE] Chrome Web Store listing screenshots and overview copy updated.
- [DONE] v2.0 submitted to the Chrome Web Store on 2026-05-22.
- [DONE] v2.0 accepted by Google.

v3.0 planning can continue, but do not package or submit v3.0 until the user explicitly confirms the release scope.

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

## Future Roadmap Ideas

### 1. Application Pack Actions

Status: **Phase 1 complete on `main`** (2026-05-26).

Suggested branch: `feature/application-pack-actions`

Goal: let a saved job become a launchpad for application materials.

Phase 1 completed scope:

- Generate tailored resume from saved job
- Generate cover letter from saved job

Later scope:

- Generate recruiter message
- Generate short application answers
- Generate follow-up message
- Suggest follow-up date/reminder text

Product rule: the app prepares materials, but the user reviews and stays in control.

### 2. Use Fit Analysis As Generation Context

Suggested branch: `feature/use-fit-analysis-in-generation`

Goal: when a saved job has Fit Analysis, generation can optionally use:

- `suggestedAngle`
- `strongMatches`
- `possibleGaps`

Important:

- Do not invent qualifications.
- Treat possible gaps as caution areas, not things to fake.
- Keep generated content grounded in the profile/source resume.

### 3. Batch/Manual Multi-Job Intake

Suggested branch: `feature/batch-job-intake`

Goal: let users add multiple jobs without scanning each one individually.

Possible intake methods:

- Manual multi-job paste
- Paste multiple job URLs
- CSV import later

Recommended first version: manual multi-job paste using separators or multiple cards.

### 4. Job URL Import

Suggested branch: `feature/job-url-import`

Goal: allow users to paste one or more job URLs and attempt generic extraction.

Preferred behavior:

- Try generic extraction.
- Save successful results to Jobs.
- Mark failed/partial imports clearly.
- Suggest using Scan page when URL import fails.

Important: do not promise universal extraction from every job board.

### 5. Search Results Page Link Scan

Suggested branch: `feature/job-link-scan`

Goal: let the extension scan a job search results page and collect candidate job links.

Preferred behavior:

- Find possible job links on the visible page.
- Show results for review.
- User selects which to save/import.

Treat it as a link collector first, not guaranteed full job-description extraction.

### 6. Application Form Autofill

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

See `## Autofill Known Limitations / Future Improvements` for next steps.

### 7. Job Dashboard Stats

Status: **Complete on `main`** (2026-05-26).

Suggested branch: `feature/job-dashboard-stats`

Goal: make Saved Jobs feel more like an active job-search workspace.

Completed scope:

- Total saved jobs
- Strong matches (fit score >= 75)
- Good matches (fit score 50-74)
- Developing (fit score < 50 or unscored)

### 8. Storage Cleanup After Migration Confidence

Suggested branch: `maintenance/cleanup-old-sync-storage`

Goal: eventually remove old sync copies of provider settings and profile data after the local-first migration has proven safe.

Important: do not do this immediately. Wait until the local migration has been used successfully in a released version.

### 9. Session Scan Payload Cap

Status: **Complete on `main`** (2026-05-26).

Suggested branch: `fix/session-scan-payload-cap`

Goal: cap very large temporary scan payloads before writing to `chrome.storage.session`.

Completed scope:

- Context-menu scan payloads cap large text fields before session storage writes.
- Full-page dashboard handoff caps the temporary job description payload before session storage writes.
- Small scan metadata such as title, company, URL, source title, source type, and tab ID stays intact.

## Suggested Order After v2.0 Acceptance

1. ~~`release/v2.0-prep`~~ — complete; v2.0 submitted on 2026-05-22 and accepted by Google
2. ~~`feature/assisted-form-fill`~~ — MVP complete on `main` (see above)
3. `feature/job-dashboard-stats` — low-risk, visible Saved Jobs improvement
4. `fix/session-scan-payload-cap` — low-risk maintenance guard
5. `feature/application-pack-actions`
6. `feature/use-fit-analysis-in-generation`
7. `feature/batch-job-intake`
8. `feature/job-url-import`

### Autofill improvements (suggested branch: `feature/autofill-improvements`)

See `## Autofill Known Limitations / Future Improvements` for scope.

## Autofill Known Limitations / Future Improvements

These are known constraints of the current MVP. None block local testing; they are inputs for future iterations.

### Matching

- Field matching currently uses deterministic rules only. AI-assisted matching for custom question fields (e.g. "Why do you want to work here?") is a future consideration.
- Multiple employment history sections are not fully mapped — only the most recent experience entry is used per field group.
- Multiple education entries are not mapped — only the first education entry is used.
- Employment and education date handling is basic because profile dates are stored as freeform strings (e.g. "Jan 2021"). Structured month/year fields on application forms may not match reliably.
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

## Fit Check follow-ups

- [DONE] Wire Fit Check into context-menu scan path / applySession flow.
- [DONE] Add profile selector or best-profile comparison inside the card.
- [DONE] Improve keyword scoring with phrase matching and normalization.
- [DONE] Add manual AI Match button only after provider availability checks.
- [DONE] Add user setting to disable automatic Basic Fit Check after scan.
- [TODO] Refine detector for job-search result pages vs single job postings.
