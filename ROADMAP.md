# Roadmap - Job Application Assistant

This document captures release prep notes and future roadmap ideas. It is planning only and does not commit any feature to a specific release.

## Roadmap Maintenance Rule

Only active, undone roadmap items should use numbered headings or numbered order lists. Completed work must be moved to an unnumbered completed/history section so future agents do not mistake finished items for pending work.

## Current Status

Version 1.0 is live on the Chrome Web Store.

Version 2.0 was submitted to the Chrome Web Store on 2026-05-22 and accepted by Google. The v2.0 release checklist is complete: manifest bumped, smoke tests passed, privacy policy verified, screenshots updated, and overview copy updated.

Version 3.0 was submitted to the Chrome Web Store on 2026-06-02 and is awaiting Google review. Do not create or submit a replacement v3.0 package unless the user explicitly confirms a new release scope.

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
- Submitted v3.0 work including print filename support, Application Email Assistant, Application Pack actions, AI-only Fit Check, Job Chat follow-ups, and targeted autofill matcher improvements

The AI-only Fit Check revision is committed and included in the submitted v3.0 package.

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
- [WAITING] Google review outcome.

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

Version 3.0 is still awaiting Chrome Web Store review. Do not package or submit a replacement v3.0 build unless the user explicitly confirms a new release scope.

The first implementation task after review, or earlier only if the user explicitly confirms a post-v3 fix scope, should be the tab-scoped dashboard state work below.

### Tab-Scoped Job Sessions And Draft Restore

Suggested branch: `fix/tab-scoped-job-sessions`

Status: **Urgent candidate for next implementation pass. Audit before coding.**

Problem:

- Job scan and generated draft state currently use shared extension-wide storage keys such as `chrome.storage.session.extractedData` and `chrome.storage.local.savedDraft`.
- If the user opens the extension on multiple job tabs, scanning Job A can update every open dashboard instance, including the dashboard opened for Job B.
- If the user scans Job B after generating for Job A, then closes/reopens the side panel, Job A can reappear because the last generated `savedDraft` is global rather than tied to the tab/job context.
- A new extension instance opened from a fresh tab should start blank unless that tab already has its own saved job session.

Desired behavior:

- Tab A with Job A remembers Job A.
- Tab B with Job B remembers Job B.
- Scanning in Tab A must not update the dashboard instance for Tab B.
- Reopening the extension on Tab A restores Tab A's job context and draft, if any.
- Reopening the extension on Tab B restores Tab B's job context and draft, if any.
- Opening the extension on a new Tab C with no prior job context opens blank.
- Saved Jobs remains global. The per-tab state is only for the active dashboard/session/draft workspace.

Implementation direction to audit carefully:

- Replace the single global session payload with tab-scoped storage, for example `jobSessionsByTab[tabId]`.
- Replace the single global saved draft key with tab-scoped draft storage, for example `savedDraftsByTab[tabId]`.
- Ensure each dashboard instance knows its owning `sourceTabId`. `background.js` should open the side panel with a path such as `dashboard/dashboard.html?sourceTabId=<tab.id>` when launched from a browser tab.
- Dashboard startup should load only the job session and saved draft for its own `sourceTabId`.
- Dashboard `chrome.storage.onChanged` handling should ignore job-session changes for other tab IDs.
- Dashboard scan should write only the current tab's job session and clear only that tab's previous generated draft.
- Context-menu scan should write only the clicked tab's job session.
- Saved Jobs and History "load into generator" flows need explicit routing to the intended dashboard/source tab, not a global `extractedData` overwrite.
- The Clear button should clear only the current tab's job session and draft, not every tab's workspace.
- Generated drafts should still survive closing/reopening the side panel, but only for the same tab/job context.

Risk notes:

- This must be done as a deliberate lifecycle/storage refactor, not as another small patch to the current global `extractedData` flow.
- Audit `dashboard/dashboard.js`, `background.js`, `jobs/jobs.js`, and `history/history.js` before editing because all four currently participate in session handoff.
- Preserve the existing `activeTab` permission model. Do not add broad host permissions as part of this task.
- Do not break full-page mode. Full-page dashboard URLs already use `mode=full` and may include `sourceTabId`; confirm expected behavior before changing.
- Do not break Saved Jobs, History regenerate, Fit Analysis context handoff, Application Pack actions, print/export, or manual Clear.

Suggested manual smoke tests:

- Open Job A in Tab A, open the extension, scan. Open Job B in Tab B, open the extension, scan. Confirm each dashboard shows only its own job.
- With both dashboards open, rescan Tab A. Confirm Tab B does not change.
- Generate for Job A. Confirm Job A auto-restores only when reopening from Tab A.
- Scan Job B without generating. Close/reopen from Tab B. Confirm Job B restores and Job A does not appear.
- Open a new blank Tab C and open the extension. Confirm it starts blank.
- Load a Saved Job into the generator and confirm it targets only the current dashboard.
- Regenerate from History and confirm it targets only the current dashboard.
- Clear Tab A and confirm Tab B is unaffected.

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

Status: **Complete on `main` and included in the submitted v3.0 package** (2026-06-01).

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

No active implementation task is selected while v3.0 is awaiting Chrome Web Store review.

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
