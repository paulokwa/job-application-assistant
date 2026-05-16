# Roadmap - Job Application Assistant

This document captures release prep notes and future roadmap ideas. It is planning only and does not commit any feature to a specific release.

## Current Status

Version 1.0 has already been submitted to the Chrome Web Store and is pending review.

`main` currently contains the v2.0 candidate foundation:

- Saved Jobs workflow
- Fit Analysis for Saved Jobs
- Privacy/storage readiness fixes
- Safe URL opening
- Clear session cleanup
- Storage quota guards

## v2.0 Release Prep

- Decide version number. Recommended: `2.0.0`, because Saved Jobs and Fit Analysis are substantial user-facing additions.
- Prepare release notes/changelog.
- Confirm manifest version bump.
- Confirm packaged extension loads cleanly.
- Run final smoke tests.
- Review Chrome Web Store listing and screenshots if the new features should be shown.

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

Suggested branch: `feature/application-pack-actions`

Goal: let a saved job become a launchpad for application materials.

Possible first scope:

- Generate tailored resume from saved job
- Generate cover letter from saved job
- Generate recruiter message

Later scope:

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

### 6. Assisted Form Filling

Suggested branch: `feature/assisted-form-fill`

Goal: help users fill common application form fields using their saved profile.

Possible fields:

- Name
- Email
- Phone
- Address
- LinkedIn
- Portfolio
- Work authorization
- Resume upload
- Cover letter upload

Guardrails:

- User reviews all fields.
- User manually submits the application.
- No automatic submission.

### 7. Job Dashboard Stats

Suggested branch: `feature/job-dashboard-stats`

Goal: make Saved Jobs feel more like an active job-search workspace.

Possible stats:

- Total saved jobs
- Strong matches
- Good matches
- Ready to apply
- Applied
- Rejected

### 8. Storage Cleanup After Migration Confidence

Suggested branch: `maintenance/cleanup-old-sync-storage`

Goal: eventually remove old sync copies of provider settings and profile data after the local-first migration has proven safe.

Important: do not do this immediately. Wait until the local migration has been used successfully in a released version.

### 9. Session Scan Payload Cap

Suggested branch: `fix/session-scan-payload-cap`

Goal: cap very large temporary scan payloads before writing to `chrome.storage.session`.

Why later: persistent storage risks were handled first. Session storage is temporary, so this can wait unless huge pages cause practical issues.

## Suggested Order After v2.0 Prep

1. `release/v2.0-prep`
2. `feature/application-pack-actions`
3. `feature/use-fit-analysis-in-generation`
4. `feature/batch-job-intake`
5. `feature/job-url-import`
6. `feature/assisted-form-fill`

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
