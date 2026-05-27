# Session Handover

## Current Release Status

- v2.0 submitted to the Chrome Web Store on 2026-05-22 and accepted by Google.
- `main` is the active development branch for post-v2 / v3 candidate work.

## Next Action Gate

Status:
- [DONE] v1.0 approved and live on the Chrome Web Store (confirmed 2026-05-22).
- [DONE] v2.0 release checklist completed (2026-05-22) - manifest bumped to 2.0.0, all smoke tests passed, privacy policy verified live.
- [DONE] User completed two manual steps before submitting v2.0 (confirmed 2026-05-22):
  1. Updated Chrome Web Store screenshots to show Saved Jobs and Fit Analysis.
  2. Pasted updated overview copy into the Chrome Web Store developer dashboard.
- [DONE] v2.0 submitted to the Chrome Web Store (2026-05-22).
- [DONE] v2.0 accepted by Google.
- [WAITING] User to confirm next v3 candidate priority and v3.0 release scope.

Next planned work: v3 release readiness review - user to confirm priority and v3.0 release scope.

## v3 Candidate Work In Progress

- Application Email Assistant added on `main` (2026-05-26):
  - New "Prepare application email" button in the Export PDF card — enabled whenever a job description is loaded, no generated resume/cover letter required.
  - Clicking opens a full-screen overlay (same slide-in pattern as Settings/History/Jobs/Autofill Review) with a complete review panel — the user must review before any action is taken, nothing is sent automatically.
  - `modules/emailDrafting.js` (new): `prepareApplicationEmail(jobData, profile, settings, options?, signal?)` — builds system/user prompts, calls `callAI()`, follows existing drafting.js patterns. Includes `EMAIL_HALLUCINATION_GUARD` blocking invention of salary, availability, work authorization, certifications, language ability. `doNotClaimNotes` surfaced via `profileToPromptText`. JSON schema embedded in system prompt.
  - AI classifies the posting into two paths: Path A (special application instructions detected — apply by email, reference/competition numbers, screening questions, salary expectations, availability, subject line format, deadlines) or Path B (no special instructions — clean generic professional email). Context banner in overlay reflects which path was taken.
  - Returned JSON schema: `hasSpecialInstructions`, `applicationMethod`, `recipientEmail`, `subject`, `emailBody`, `detectedInstructionsSummary`, `requiredItems`, `screeningQuestions` (with `suggestedAnswer`, `needsUserConfirmation`, `reason`), `attachmentsReminder`, `warnings`, `mailtoRecommended`.
  - Normalization in `dashboard.js` (`normalizeEmailResult`): coerces all fields to correct types, validates `recipientEmail` contains `@`, normalizes `applicationMethod` to `email|website|unknown`, builds and length-checks `mailtoUrl` (≤ 2000 encoded chars), sets `mailtoRecommended: false` if URL too long / no email / method not email.
  - Mock mode (`modules/mock.js` — `generateMockApplicationEmail`): detects special-instruction keywords in description (`email`, `reference`, `competition number`, `screening`, `salary`, `availability`, `subject line`) — returns special-instructions mock or generic mock accordingly.
  - Manual instruction override textarea: always visible at the top of the overlay; user can paste missed instructions before/after generation; content sent as `extraInstructions` in user prompt, labeled authoritative.
  - Pre-send checklist replaces bare action area: 5 checkboxes (confirm recipient, confirm screening answers, attach resume, attach cover letter, confirm reference number). Amber-tinted callout: "Files are not attached automatically when opening your email app." Open email app button sits below the checklist.
  - `mailto:` link: only shown when `applicationMethod === 'email'` AND `recipientEmail` found AND encoded URL ≤ 2000 chars. If body too long, link hidden and fallback message shown instead.
  - Missing resume/cover letter notice shown in overlay if either document has not been generated yet.
  - Abort controller (`currentEmailController`) cancels in-flight AI if user closes overlay or clicks Regenerate.
  - `refreshExportButtons()` updated to enable/disable the email button based on `state.jobData.description`.
  - **Do not send email automatically. Do not invent user facts. Do not attempt file attachments through mailto.**



- Direct PDF Download was removed/deferred for store-safety before v3 packaging.
- The print-dialog Save as PDF function remains the supported export path.
- Print export now sets the print-window document title from the configured filename pattern, so Chrome Save as PDF can suggest the user's preferred filename.
- Fit Check v3 candidate work was added on `main`:
  - Local Basic Fit Check scoring after job-page scan.
  - Context-menu scan support and a Settings -> Documents toggle for automatic Fit Check.
  - Job-page detector coverage improvements and activeTab URL fallback for scan.
  - Keyword scoring improved with phrase matching and normalization.
  - Multi-profile Fit Check card selector with temporary profile switching only.
  - Best scoring profile row with "Use this profile" action.
  - Manual AI review button on the Fit Check card, shown only when an AI provider is configured.
  - Fit Check AI review runs only after explicit user click/retry, uses `analyzeFit()` in `dashboard.js`, caps job text at 4000 chars, passes `sourceResumeText` as an empty string, uses `transferable` inference mode, caches the card-facing result by profile, aborts in-flight AI on Fit Check profile changes, and does not write `activeProfileId`.
  - Fit Check AI review payload to `content.js` is whitelisted so `suggestedAngle`, provider settings, API keys, raw profile data, and job text do not reach the content script.

## Completed Since v1.0 Submission

- [DONE] Saved Jobs workflow merged.
- [DONE] Fit Analysis merged.
- [DONE] Privacy/storage readiness merged.
- [DONE] Safe URL opening merged.
- [DONE] Clear session cleanup merged.
- [DONE] Storage quota guards merged.
- [DONE] `ROADMAP.md` and `RELEASE_V2_CHECKLIST.md` updated.
- [DONE] AI job info suggestions (job title/employer extraction via AI suggest fields) - `feature/ai-job-info-extraction`.
- [DONE] Fit score `/100` reference added to saved job cards (`jobs/jobs.js`, `jobs/jobs.css`).
- [DONE] Fit score label bug fixed - label now always derived from numeric score, not trusted from AI response (`modules/fitAnalysis.js`).
- [DONE] Fit Analysis scoring prompt overhauled - added 0-100 rubric with anchor points, replaced over-strict "do not infer" rule with transferable skills recognition.
- [DONE] Per-profile Fit Analysis inference mode toggle (Transferable / Exact) - stored in profile metadata, visible and switchable in Manage Profiles, explanation text added (`settings/settings.html`, `settings/settings.js`, `settings/settings.css`, `dashboard/dashboard.js`, `modules/fitAnalysis.js`).
- [DONE] Section-level locking for My Profile AI import (V1, section-blocking only) - users can lock any of 7 profile sections to prevent AI analyser import from overwriting them. Lock state stored in `profile.metadata.lockedSections`. Side-effect fix: `saveProfileData()`, `clearProfile()`, and profile switch/add paths now preserve full `profile.metadata`. (`modules/schema.js`, `settings/settings.html`, `settings/settings.css`, `settings/settings.js`)
- [DONE] Lock button UX polish - label updated to "Locked from AI import"; `syncLockToggles()` updates `title` attribute dynamically. (`settings/settings.js`)
- [DONE] Education dates fix - `normalizeResumeDraft()` was silently dropping education dates when AI returned `year`/`graduationYear` keys. Added `normalizeEducationDraft()` helper with full fallback chain. (`dashboard/dashboard.js`)
- [DONE] Cover letter export — last-paragraph spacing and styling fixes across all four templates (2026-05-26):
  - `8639d41` - `fix: cover letter closing block spacing and styling across all templates`
  - Root cause: `<p>` tags had browser-default `margin-top: 1em` not reset, causing additive margin stacking in Chrome's PDF renderer. Sidebar additionally had `gap: 20pt` on `.main-content` compounding the closing block's `margin-top`. Fixed by resetting `<p>` margins, zeroing last-paragraph bottom margin, calibrating closing block margins per template, and removing compact's `<strong>` wrapper from closing text.
- [DONE] AI-generated resume `headline` field (2026-05-26):
  - `90a9b87` - `feat: generate tailored resume headline per application`
  - `8ffc342` - `fix: pass headline through normalizeResumeDraft`
  - Sidebar template was hardcoding `experience[0]?.jobTitle` as the subtitle regardless of the target role. New `headline` field added to schema, AI prompt, and `normalizeResumeDraft`. Sidebar render now uses `headline || experience[0]?.jobTitle`.
  - **Key gotcha:** `normalizeResumeDraft` in `dashboard.js` explicitly whitelists fields — any new top-level resume field must be added there or it is silently dropped.
- [DONE] `{name}` chip added to filename builder (2026-05-26):
  - `b840e53` - `feat: add {name} variable to filename chip builder`
  - Added to `ALL_CHIPS` in `settings.js`, `buildFilename` in `modules/template.js`, preview substitution in `updateFilenamePreview`, and `getSuggestedFilenameBase` in `dashboard.js`.
- [DONE] Application Pack Actions complete on `main` (2026-05-26 to 2026-05-27):
  - Saved Jobs can launch resume-only and cover-letter-only generation.
  - Saved Jobs can prepare recruiter messages, follow-up messages, reminder text, short application answers, and application email drafts.
  - All actions remain review-first: nothing is sent, scheduled, attached, submitted, or form-filled automatically.
- [DONE] Fit Check v3 candidate work (2026-05-25):
  - `d1b1ea8` - `feat: add local Fit Check scoring after job page scan`
  - `d95e78e` - `docs: add Fit Check follow-up items to ROADMAP`
  - `5a58334` - `fix: allow scan when tab URL is unavailable due to activeTab scope`
  - `98d7e04` - `fix: improve job page detector coverage and apostrophe matching`
  - `7bed02c` - `feat: add Fit Check auto setting and context-menu support`
  - `4966109` - `feat: improve Fit Check keyword scoring with phrase matching and normalization`
  - `fdbc1fe` - `feat: add profile selector to Fit Check card for multi-profile users`
  - `55cd8ec` - `feat: add best-profile comparison to Fit Check card`
  - `13a94e7` - `fix: whitelist Fit Check AI review card payload`
- [DONE] Fit Check search-results detector refinement (2026-05-27):
  - `c30b005` - `fix: refine Fit Check search results detection`
  - Added search/listing path patterns and high-precision text patterns such as save-search and job-alert phrases.
  - Fixed the Glassdoor `/Job/...jobs-SRCH...` search-page false negative while preserving `/job-listing/...` single postings with content signals.
  - Added `isLikelySearchPage` to all `detectJobPage()` return objects.
  - Dashboard skip toast now distinguishes search/listing pages from generic non-job pages.
  - Added lightweight Node detector checks for LinkedIn, Indeed, Glassdoor, Greenhouse/Lever-style postings, JSON-LD, and plain non-job pages.
- [DONE] Saved Jobs workspace upgrades (2026-05-26):
  - `de17007` - `feat: add saved jobs stats bar` - compact Saved Jobs stats row showing total, strong matches, good matches, and developing/unscored jobs.
  - `90e4582` - `fix: support recently updated saved jobs sort` - Recently updated sort uses `updatedAt || createdAt`, newest first.
  - `0c12ce8` - `fix: cap large session scan payloads` - caps large temporary session scan text before `chrome.storage.session` writes while preserving scan metadata.
  - `a746e95` - `feat: launch resume and cover letter generation from saved jobs` - saved job cards can launch resume-only or cover-letter-only generation; existing Load into generator remains unchanged.
  - `a26f3b4` - `feat: use fit analysis context for saved job generation` - saved-job resume/cover-letter generation can pass `suggestedAngle`, `strongMatches`, and `possibleGaps` as advisory context. Possible gaps are caution areas only. No output schema changes and no content script changes.
- [DONE] Phase 2 Workday autofill improvements (`modules/autofillMatcher.js`, `settings/settings.js`):
  - `toMonthYear()` helper - converts freeform date strings to MM/YYYY; returns '' for unconvertible values so empty-fill guard fires.
  - `toMonth()` / `toYear()` helpers - extract two-digit month or four-digit year from freeform strings.
  - `splitDates()` - splits a combined "Oct 2020 - Dec 2021" dates string into [startStr, endStr]; uses `\p{Dash}` (Unicode property) to cover all dash variants.
  - Workday MM/YYYY combined date matchers - From+mm/yyyy and To+mm/yyyy signals; mutual exclusion guards removed because nearbyText bleed defeats them.
  - Workday split Month/Year date matchers (4 matchers) - match by `datesectionmonth`/`datesectionyear` id segments since Workday provides no label or placeholder on these inputs.
  - Iterate pattern in Workday date `get` functions - iterates all experience entries to find first parseable value, preventing flat-pass gate failure when experience[0] has year-only dates.
  - Experience location matcher - matches work location fields; excludes personal address, city, postal, country signals.
  - Experience location field added to My Profile settings UI - text input in each experience card, collected by `collectProfileFromForm()`. (`settings/settings.js`)
  - `EMPLOYMENT_FIELD_TYPES` reduced to `{employer, jobTitle}` - startDate/endDate removed to prevent Workday's 4 split-date inputs from collapsing the between-section gap below threshold.
  - `EXPERIENCE_ASSIGNABLE` set added - dates, location, bulletPoints are post-assigned by fieldIndex position after cluster detection rather than driving gap detection.
  - `regroupEmploymentMatches` assignable pass updated - applies `toMonth()`/`toYear()`/`toMonthYear()`/raw based on field id signals, with `splitDates()` fallback for profiles that store dates as a single string.
  - Test form added: `tests/autofill-multi-employment.html` - 30-field form with 11 hidden spacer inputs engineered to produce a fieldIndex gap exceeding the threshold, validating two-section grouping detection.
  - Known quirk: profiles where the dates separator is stored as an unusual Unicode dash may still need manual confirmation across profiles; `\p{Dash}` fix was applied.
- [DONE] Autofill graduation year and GitHub matching (2026-05-27):
  - `d9cd644` - `feat: improve autofill graduation year and GitHub matching`
  - Added `toGraduationYear()` helper and a select-only graduation year matcher that extracts the last four-digit year from education dates.
  - Multi-education regrouping preserves graduation-year extraction for later education sections.
  - Added GitHub, GitHub Profile, and GitHub URL signals to the existing portfolio matcher.
  - Added `tests/autofill-multi-education.html` and fixed the stale threshold comment in `tests/autofill-multi-employment.html`.
  - No `content.js`, dashboard, settings, manifest, or autofill fill-logic changes.
- [DONE] Storage cleanup after migration confidence (2026-05-27):
  - Provider settings and profile data now use local-only reads/writes.
  - Removed legacy `chrome.storage.sync` fallback migration for provider/profile data.
  - Other intentional `chrome.storage.sync` usage for low-sensitivity settings/history was left untouched.
- [DONE] Direct PDF Download removed/deferred for store-safety (2026-05-27):
  - Removed Direct PDF Download UI and dashboard code.
  - Removed `debugger` and `downloads` permissions from `manifest.json`.
  - Kept Print / Save as PDF export.
  - Print export keeps filename preference support through print-window document titles.

## Current Main Branch State

Latest known `main` commit (2026-05-27):

`5289447` - `fix: apply filename pattern to print export titles`

Working tree had doc-only roadmap/handover updates when this handover was refreshed.

## Do Not Repeat

- Do not rebuild Saved Jobs.
- Do not redo Saved Jobs stats, recently-updated sorting, saved-job resume/cover-letter launch, or saved-job Fit Analysis advisory context for generation.
- Do not rebuild Fit Analysis.
- Do not send saved-job Fit Analysis advisory context to `content.js`; it is session/dashboard/drafting context only.
- Do not redo privacy/storage migration.
- Do not re-add legacy sync fallback migration for provider settings or profile data; private provider/profile storage is local-only.
- Do not redo storage quota guards.
- Do not redo the session scan payload cap.
- Do not rewrite roadmap docs unless the user asks.
- Do not rebuild Fit Check Phases 1-3; current `main` already has Basic Fit Check, auto/context-menu support, better scoring, multi-profile selector, best-profile row, and manual AI review.
- Do not redo Fit Check search/listing detector refinement; current `main` already skips common search/listing pages, handles Glassdoor SRCH pages, returns `isLikelySearchPage`, and has lightweight detector checks.
- Do not send Fit Check AI internals to `content.js`; keep the card payload whitelisted and do not expose `suggestedAngle`, provider settings, API keys, raw profile data, or job text to the content script.
- Do not add AI to the autofill matcher - it is intentionally deterministic and rule-based.
- Do not redo graduation year select or GitHub portfolio matching in `modules/autofillMatcher.js`; those targeted matcher improvements are complete.
- Do not change `content.js`, the profile schema/storage (beyond documented UI additions), fill logic, or ATS-specific adapters unless the user explicitly requests it.
- Do not auto-submit forms or fill sensitive/legal/demographic fields.
- Do not guess missing work locations or invent months for year-only dates.
- Do not duplicate Education 1 into Education 2.

## Manual Tests Already Passed

- Saved Jobs tests passed.
- Fit Analysis tests passed.
- Privacy/storage readiness tests passed.
- Storage quota guard tests passed.
- Core quick flows passed.
- Workday autofill: Electric Playground (exp[2]) - all 4 split date rows fill correctly (07/2022, 09/2022). Multi-section grouping confirmed working.
- Fit Check Phase 3 final regression audit passed by code review after `13a94e7` fix. Verified:
  - `node --check dashboard/dashboard.js`
  - `node --check content.js`
  - `git diff --check -- dashboard/dashboard.js content.js` reported only line-ending normalization warnings.
  - Manual live Chrome extension test was not run in that audit session.
- Fit Check detector refinement checks passed after `c30b005`:
  - `node --check modules/jobPageDetector.js`
  - `node --check dashboard/dashboard.js`
  - `node --check tests/jobPageDetector.test.js`
  - `node tests/jobPageDetector.test.js`
  - Manual live Chrome extension test was not run in that session.
- Autofill graduation year/GitHub matcher checks passed after `d9cd644`:
  - `node --check modules/autofillMatcher.js`
  - `git diff --check`
  - Manual live Chrome extension test was not run in that session.

## Future Roadmap

See `ROADMAP.md`. Do not duplicate the full roadmap here.

## Release Checklists

See `RELEASE_V3_CHECKLIST.md` for active v3 planning.
See `RELEASE_V2_CHECKLIST.md` only as the historical checklist for the already-submitted and accepted v2.0 package.

## Handover Maintenance Rule

Every time a gated action is completed:

1. Mark it `[DONE]`.
2. Add the commit/PR link if available.
3. Move the next waiting item into "Next Action Gate."
4. Remove or downgrade stale warnings so future agents do not repeat completed work.
