# v3.0 Release Checklist

Version 3.0 was submitted to the Chrome Web Store on 2026-06-02 and approved by Google on 2026-06-04. This checklist records the approved v3.0 package and the checks completed before submission.

## Release Gate

- [DONE] v3.0 release scope confirmed.
- [DONE] `manifest.json` set to `3.0.0`.
- [DONE] Full smoke testing passed and the user explicitly confirmed packaging/submission.
- [DONE] v3.0 submitted to the Chrome Web Store on 2026-06-02.
- [DONE] v3.0 approved by Google on 2026-06-04.
- Do not create or submit a v4.0 package unless the user explicitly confirms a release scope.
- Direct PDF Download was removed/deferred for store-safety before v3 packaging.

## Permission Review

- The print-dialog Save as PDF path remains the supported export path.
- Print export sets the print-window document title from the configured filename pattern so Chrome's Save as PDF dialog can suggest the user's preferred filename.
- Direct PDF Download was removed/deferred and no longer requires the powerful PDF-generation permissions.
- Confirm `manifest.json` does not include `debugger` or `downloads` unless a future, explicitly approved feature requires them.

## v3 Feature Summary

The approved v3.0 package includes these features added since v2.0:

- **Print export**: print-dialog flow for Resume Only, Cover Letter Only, Resume + Cover Letter, and Merged Document. Print-window document title is set from the configured filename pattern so Chrome's Save as PDF dialog suggests the user's preferred filename.
- **AI-only Fit Check**: scans prepare optional context without hidden token spend; context-menu scan support; three-choice apply-details flow; separate explicit Run AI Fit Check action; multi-profile selector with temporary switching and cached per-profile AI results. Card payload to `content.js` is whitelisted — no API keys, no raw profile data, no job text sent to content script.
- **Job Discussion Chat follow-ups**: chat entry points are gated until job context exists; stale chat history clears on job changes; the Fit Check card can open Job Chat when the dashboard side panel is alive; assistant replies can prefill Resume/Cover Letter Refine as positioning guidance only. Chat refine actions do not auto-apply changes or generate automatically.
- **Saved Jobs workspace**: stats bar; recently-updated sort; resume-only and cover-letter-only generation from saved jobs; Fit Analysis advisory context for saved-job generation.
- **Application Pack Actions** (all on Saved Jobs): recruiter message drafts, follow-up message drafts, follow-up reminder text, short application answer drafts, application email drafts. All review-first; nothing is sent, scheduled, attached, submitted, or form-filled automatically.
- **Autofill improvements**: graduation year select matcher; `toGraduationYear()` helper; GitHub/GitHub Profile/GitHub URL signals in portfolio matcher.
- **Storage cleanup**: provider settings and profile data are local-only; legacy `chrome.storage.sync` fallback removed for private data.
- **Direct PDF Download**: removed/deferred for store-safety. `debugger` and `downloads` permissions removed. Print-dialog Save as PDF is the supported export path.

## Manifest Version Check

- Confirm `manifest.json` version is `3.0.0`.
- Confirm the extension name and description still match the Chrome Web Store listing.
- Confirm all permissions and host permissions are expected.
- Confirm `debugger` and `downloads` are absent unless a future release scope explicitly reintroduces a permission-requiring feature.
- Confirm Fit Check changes did not add new permissions. `manifest.json` was not changed by Fit Check Phase 3.

## Smoke Test Checklist

**Core generation**
- Settings → AI Provider: set provider and key, verify saves and loads.
- Demo/Mock Mode: generates resume and cover letter without a real API key.
- Scan page on a job posting → Generate Resume.
- Manual job description paste → Generate Cover Letter.
- History → Regenerate from a previous job.
- Clear: scan a job, click Clear, reload dashboard — old job description does not reappear.

**Print and filename**
- Settings → Documents: filename pattern saves and reloads.
- Print → Resume Only: print dialog opens, Save as PDF suggests the configured filename.
- Print → Cover Letter Only: print dialog opens, Save as PDF suggests the configured filename.
- Print → Resume + Cover Letter: two print dialogs open with per-document filename titles.
- Print → Merged Document: one print dialog opens with the merged filename title.
- Confirm no Direct PDF Download buttons are visible in the dashboard.

**Saved Jobs and Application Pack Actions**
- Save to Jobs from a scanned or manually entered job; job appears in Saved Jobs list.
- Load saved job into generator; verify job description and fields populate.
- Launch Resume-only generation from a saved job card.
- Launch Cover Letter-only generation from a saved job card.
- Saved Jobs stats bar shows total, strong matches, good matches, and developing/unscored counts.
- Recruiter message: open from a saved job, verify subject and body generate, copy buttons work.
- Follow-up message: open from an `applied` job — message references submitted application; open from a non-applied job — message does not claim application was sent.
- Follow-up reminder: open from an `applied` job — 7-day timing note shown; title and text copy buttons work.
- Short answers: overlay opens with 5 question cards; copy buttons work; guarded answers show editable empty fields.
- Application email: overlay opens with manual instruction textarea; generation produces subject and body; pre-send checklist appears before action button.

**Fit Check**
- No AI provider configured: Scan Page prepares job context without running Fit Check; Run AI Fit Check explains that provider setup is required.
- AI job-detail suggestions: review dialog offers Cancel, Apply, and Apply + Fit Check.
- Successful scan: Run AI Fit Check remains available as a separate explicit action and does not run automatically.
- Scan Page and context-menu scans prepare optional AI Fit Check context but do not run AI or show a result card automatically.
- AI provider configured: clicking Run AI Fit Check injects the result card after the explicit AI request.
- Profile selector: switching profiles reuses a cached AI result when available or offers an explicit Run AI Fit Check action without changing `activeProfileId` globally.
- Scanning a new page resets any cached Fit Check AI result.
- Dismissing the Fit Check card while AI is running does not cause uncaught errors.
- Fit Check card shows Discuss this job; clicking it opens Job Chat only when the dashboard is alive and the tab/job context still matches.
- Confirm `suggestedAngle`, provider settings, API keys, raw profile data, and job text are not sent to `content.js`.

**Job Discussion Chat**
- Fresh dashboard with no job: Chat entry points are disabled/hidden until a job is scanned or loaded.
- Scanning or loading a different job clears previous Job Chat messages.
- Assistant replies show Use in Resume Refine and Use in Cover Letter Refine actions; user messages and pending/error replies do not.
- Chat-to-Refine actions prefill the Refine textarea, switch to the target document tab, and require the user to click Apply Changes manually.
- Chat-to-Refine actions treat chat guidance as positioning/emphasis guidance only and do not generate automatically.

**Autofill**
- Open a form page (test fixture or live ATS form), click Scan form fields — review overlay appears with matched and skipped fields, confidence badges, and pre-checked high-confidence rows.
- Uncheck a row, click Fill checked fields — unchecked field is not written to the page.
- Sensitive/demographic/legal fields do not appear as auto-checked rows.

**Storage and settings**
- My Profile and Manage Profiles: create, edit, switch, delete; data persists across reload.
- No console errors in dashboard, settings, saved jobs, history, or autofill review.

## Packaging Steps

Completed before the 2026-06-02 submission:

1. [DONE] Confirm working tree is clean: `git status`
2. [DONE] Confirm latest commit is the expected release baseline: `git log --oneline -5`
3. [DONE] Confirm `manifest.json` version is `3.0.0`
4. [DONE] Reload the unpacked extension in Chrome
5. [DONE] Run the smoke test checklist above
6. [DONE] Update Chrome Web Store listing description to include Application Pack Actions, autofill, and Fit Check improvements
7. [DONE] Verify privacy policy accurately describes Application Pack Action draft generation (drafts are sent to the user's configured AI provider; not stored server-side by the extension)
8. [DONE] Package: zip all extension files, excluding `.git/`, `tests/`, `*.md` planning docs, and any dev-only files
9. [DONE] Upload zip to the Chrome Web Store developer dashboard
10. [DONE] Submit for review on 2026-06-02

## Listing / Privacy Check

- Do not mention Direct PDF Download as a shipped feature unless it is explicitly reintroduced in a future release.
- If mentioning Fit Check AI review in listing or release notes, describe it as manual and provider-backed. Avoid implying automatic AI analysis or submission help.
- Confirm the privacy policy and Chrome Web Store privacy fields accurately describe document generation/download behavior and any permission-sensitive behavior.

## Deferred Direct Download Notes

- Direct PDF Download was removed/deferred for v3 store-safety.
- Reintroducing it would require a fresh permission review, Chrome Web Store justification, UI copy, and release-scope confirmation.
