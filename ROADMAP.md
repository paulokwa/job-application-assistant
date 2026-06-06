# Roadmap - Job Application Assistant

This document captures release prep notes and future roadmap ideas. It is planning only and does not commit any feature to a specific release.

## Roadmap Maintenance Rule

Only active, undone roadmap items should use numbered headings or numbered order lists. Completed work must be moved to an unnumbered completed/history section so future agents do not mistake finished items for pending work.

## Current Status

Version 1.0 is live on the Chrome Web Store.

Version 2.0 was submitted to the Chrome Web Store on 2026-05-22 and accepted by Google. The v2.0 release checklist is complete: manifest bumped, smoke tests passed, privacy policy verified, screenshots updated, and overview copy updated.

Version 3.0 was submitted to the Chrome Web Store on 2026-06-02 and approved by Google on 2026-06-04.

Version 4.0 development has started. Do not create or submit a v4.0 package unless the user explicitly confirms a release scope.

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
- Approved v3.0 work including print filename support, Application Email Assistant, Application Pack actions, AI-only Fit Check, Job Chat follow-ups, and targeted autofill matcher improvements
- v4.0 development work started with Tab-Scoped Job Sessions and Draft Restore

The AI-only Fit Check revision is committed and included in the approved v3.0 package.

## v2.0 Release Status

- [DONE] Version number set to `2.0.0`.
- [DONE] Release notes/changelog prepared.
- [DONE] Manifest version bumped.
- [DONE] Packaged extension loaded cleanly.
- [DONE] Final smoke tests passed.
- [DONE] Chrome Web Store listing screenshots and overview copy updated.
- [DONE] v2.0 submitted to the Chrome Web Store on 2026-05-22.
- [DONE] v2.0 accepted by Google.

## v3.0 Release Status

- [DONE] Version number set to `3.0.0`.
- [DONE] Full smoke tests passed.
- [DONE] Privacy policy and Chrome Web Store listing/privacy fields updated.
- [DONE] Submission zip created and inspected.
- [DONE] v3.0 submitted to the Chrome Web Store on 2026-06-02.
- [DONE] v3.0 approved by Google on 2026-06-04.

## v4.0 Release Status

See `RELEASE_V4_CHECKLIST.md` for the active v4.0 release-cycle checklist, smoke tests, gates, and packaging guardrails.

- [DONE] v4.0 development cycle opened.
- [DONE] Tab-Scoped Job Sessions and Draft Restore completed for v4.0 development.
- [WAITING] User confirms final v4.0 release scope.
- [WAITING] `manifest.json` version bump to `4.0.0`.
- [WAITING] Full v4.0 smoke testing.
- [WAITING] User explicitly confirms v4.0 packaging/submission.

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

No active implementation task is selected. v4.0 development has started, but do not package or submit v4.0 unless the user explicitly confirms a release scope.

## Later Autofill Improvements

Autofill remains a broad future bucket, but no immediate autofill implementation task is selected. Keep changes targeted, deterministic, and review-before-fill; follow `TROUBLESHOOTING.md` entry 16 before modifying `modules/autofillMatcher.js`.

## Later Scan Permission Experiment

Deferred for now. The dashboard recovers from expired temporary tab access with clearer instructions and a retry action, without expanding extension permissions.

Potential future enhancement: offer opt-in optional host permissions for common job sites such as Indeed so users can scan those sites without reconnecting the extension after tab navigation or an extension reload.

Guardrails:

- Keep job-site access optional and clearly explained.
- Request only the specific site permission the user chooses.
- Preserve the privacy-first default: no standing access to all websites.
- Reassess Chrome Web Store review impact before implementation.

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

### Job Chat Profile Proposal Apply Pipeline

Status: **Complete for v4.0 development** (2026-06-06).

Completed scope:

- Read-only profile suggestion cards rendered in Job Chat
- Profile proposal validation via `validateProfileUpdateProposal`
- Diff preview showing before/after profile section values
- Edit suggestion before applying — skills, summary, certifications, experience
- Guarded Apply with `validateAndApplyProfileProposal` + fingerprint and active-profile checks
- Real Apply enabled for: skills add, summary update, certifications add, experience add
- One-step Undo with in-memory snapshot + `chrome.storage.session` backup (15-min TTL)
- Stale markers for generated outputs (resume, cover letter, Fit Analysis) after profile change
- Sensitive content warnings and confirmation checkbox
- Locked-section blocking, duplicate blocking, cancel-confirmation blocking
- 5 Node unit test files + 11 Playwright smoke tests covering apply, undo, and safety paths
- npm test scripts: `test:unit`, `test:smoke`, `test:smoke:headed`, `test`
- Update/remove actions intentionally blocked; personalInfo/education/projects/customSections not yet enabled

### Certification Mock Parsing

Status: **Complete for v4.0 development** (2026-06-06).

- Mock mode now parses certification name, issuer, and year from messages like "Add a certification called First Aid from Red Cross, 2024."

### Tab-Scoped Job Sessions And Draft Restore

Status: **Complete for v4.0 development** (2026-06-04).

Completed scope:

- Active scanned-job session data is stored per source browser tab using `jobSessionsByTab[tabId]` instead of one shared `chrome.storage.session.extractedData` flow.
- Generated draft restore data is stored per source browser tab using `savedDraftsByTab[tabId]` instead of one shared `chrome.storage.local.savedDraft` slot.
- Side panel launches include `sourceTabId`, and dashboard startup loads only that tab's session and draft.
- Dashboard storage-change handling ignores job-session changes for other tab IDs.
- Context-menu scans write only the clicked tab's session.
- Saved Jobs load/generate and History regenerate hand their payload to the current dashboard instead of overwriting global session state.
- Full-page handoff preserves the target tab context.
- Clear removes only the current tab's job session and draft restore data.
- Scanning a different job in the same tab clears that tab's stale generated draft restore data so Job A does not reappear over Job B.
- Saved Jobs remains global; only the active dashboard workspace is tab-scoped.

Verification:

- `node --check background.js`
- `node --check dashboard/dashboard.js`
- `node --check jobs/jobs.js`
- `node --check history/history.js`
- `node tests/autofillMatcher.test.js`
- `node tests/pdfImport.test.js`
- `git diff --check` reported only line-ending normalization warnings.
- User manually tested locally and confirmed it seems to work well before commit/push.

### Job Discussion Chat Follow-Ups

Status: **Complete on `main`** (2026-05-30).

Completed scope:

- "Discuss this job" dashboard entry points are gated until a job is scanned, loaded, or otherwise has chat context.
- Job Chat history clears when the job context changes, preventing conversation carryover between different jobs.
- The content-script Fit Check card now includes a "Discuss this job" button that opens Job Chat when the dashboard side panel is alive.
- Assistant Job Chat replies now include "Use in Resume Refine" and "Use in Cover Letter Refine" actions.
- Chat refine action buttons have keyboard-visible focus styling.

Safety note:

- The V1 approach keeps chat actions safe by pre-filling Refine only. It does not auto-apply changes, does not generate automatically, and treats chat guidance as positioning/emphasis guidance rather than new factual profile data.

Deferred:

- Native multi-turn provider messages instead of encoding chat history in one user prompt.
- Optional session persistence for chat history.
- Closed-side-panel routing from the Fit Check card.
- Structured JSON action suggestions from chat replies.

### Tour Refresh And Saved Jobs Tour

Status: **Complete on `main`** (2026-05-30).

Completed scope:

- Dashboard feature tour refreshed for the current v3 flow, including the optional Application Helper and Generate as Step 3.
- Settings section tours refreshed for current document export, profile, and profile-lock behavior.
- Saved Jobs page now has a focused tour covering queue summary, saved job cards, status and notes, application materials, messaging tools, and job management.
- Saved Jobs tour can be replayed from the help button and is marked seen after first run.

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

### AI-Only Fit Check

Status: **Complete on `main` and included in the approved v3.0 package** (2026-06-01).

Completed scope:

- Removed the local keyword-overlap scorer and search/listing detector because everyday words made the score unreliable.
- Removed automatic Fit Check settings and automatic post-scan execution.
- Scans now prepare optional AI Fit Check context without hidden token spend.
- The scanned AI details dialog offers Cancel, Apply, and Apply + Fit Check.
- A separate Run AI Fit Check action remains available after scan.
- The on-page card is AI-only and keeps explicit run/retry, temporary profile selection, cached per-profile AI results, and Job Chat access.

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

No active implementation task is selected. v4.0 development has started, but v4.0 release scope and packaging are not confirmed.

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
