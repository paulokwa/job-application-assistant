# v3.0 Release Checklist

Version 2.0 has already been submitted to the Chrome Web Store and is pending review. This checklist is for the future v3.0 package based on post-v2 work on `main`.

## Release Gate

- Do not package or submit v3.0 until the v2.0 Chrome Web Store review result is known and the user confirms.
- Before any v3 packaging, confirm whether the direct PDF download feature should ship publicly.

## Important Permission Review

- Direct PDF download currently depends on the Chrome `debugger` permission to call Chrome's print-to-PDF engine and preserve formatting.
- `debugger` is a powerful permission and may slow Chrome Web Store review or trigger rejection if reviewers decide it is excessive for the extension's purpose.
- `debugger` cannot be moved to optional permissions.
- `debugger` adds high-risk user-facing permission warnings, including access to the page debugger backend and broad page data access.
- `downloads` is also required for the Save As download flow and filename control.
- Before submitting v3.0, decide one of:
  - Ship direct PDF download and document/justify `debugger` and `downloads` in the Chrome Web Store privacy/permission fields.
  - Remove or hide direct PDF download and remove `debugger`/`downloads` from `manifest.json`.
  - Replace the debugger-based PDF path with a store-safer PDF generation approach if one preserves formatting well enough.

## Candidate v3 Work

- Export PDF UI split into two paths:
  - Print via dialog: existing browser print flow.
  - Download PDF: direct download using filename settings.
- Download PDF options:
  - Resume + Cover Letter
  - Resume Only
  - Cover Letter Only
  - Merged Document
- Fit Check card improvements:
  - Basic Fit Check runs locally after Scan Page when enabled.
  - Context-menu scans can trigger Basic Fit Check when enabled.
  - Settings -> Documents includes an Auto Fit Check toggle.
  - Job-page detection and keyword scoring include phrase matching and normalization improvements.
  - Multi-profile users get a Fit Check profile selector and best scoring profile row.
  - Manual AI review is available from the Fit Check card only when an AI provider is configured.
  - Manual AI review must remain explicit-click only; no automatic AI call after scan, context-menu scan, `applySession()`, or Basic Fit Check.
  - Fit Check AI review data sent to `content.js` must stay limited to card display fields. Do not send provider settings, API keys, raw profile data, job text, or `suggestedAngle`.

## Manifest Version Check

- Bump `manifest.json` version to `3.0.0` only when preparing the v3 package.
- Confirm the extension name and description still match the Chrome Web Store listing.
- Confirm all permissions and host permissions are expected.
- Specifically re-review `debugger` and `downloads` before packaging.
- Confirm Fit Check changes did not add new permissions. `manifest.json` was not changed by Fit Check Phase 3.

## Smoke Test Checklist

- Settings -> Documents filename pattern saves and reloads.
- Settings -> Documents Auto Fit Check toggle saves and reloads.
- Generate Resume only, then Download PDF -> Resume Only uses the configured filename.
- Generate Cover Letter only, then Download PDF -> Cover Letter Only uses the configured filename.
- Generate Resume + Cover Letter, then Download PDF -> Resume + Cover Letter downloads two separate PDFs.
- Generate Resume + Cover Letter, then Download PDF -> Merged Document downloads one combined PDF.
- Confirm direct PDF formatting matches the existing print-based output closely enough.
- Confirm print-based Save as PDF still works as before.
- With Auto Fit Check enabled and no provider configured, Scan Page on a job posting shows the Basic Fit Check card and no AI review button.
- With Auto Fit Check disabled, Scan Page and context-menu scans do not show the Fit Check card.
- With an AI provider configured, the Fit Check card shows Run AI review, and AI runs only after clicking it.
- Fit Check AI review retry runs one fresh review and does not duplicate active requests.
- Switching the Fit Check profile selector and clicking Use this profile update scores without writing `activeProfileId`.
- Multi-profile best scoring profile row still appears and uses the expected profile.
- Scanning a new page resets any cached Fit Check AI result.
- Dismissing the Fit Check card while AI is running does not cause uncaught errors.
- Confirm `suggestedAngle`, provider settings, API keys, raw profile data, and job text are not sent to `content.js`.
- Confirm dashboard, settings, saved jobs, history, and autofill pages open without console errors.

## Listing / Privacy Check

- If shipping direct PDF download, update listing copy or release notes to distinguish print export from direct PDF download.
- If shipping `debugger`, add a clear permission justification in the developer dashboard.
- If mentioning Fit Check AI review in listing or release notes, describe it as manual and provider-backed. Avoid implying automatic AI analysis or submission help.
- Confirm the privacy policy and Chrome Web Store privacy fields accurately describe document generation/download behavior and any permission-sensitive behavior.

## Rollback Plan

If direct PDF download is not suitable for Chrome Web Store submission:

- Remove the Download PDF button group from `dashboard/dashboard.html`.
- Remove direct PDF download styles from `dashboard/dashboard.css`.
- Remove direct PDF download handlers/helpers from `dashboard/dashboard.js`.
- Remove `debugger` and `downloads` from `manifest.json` unless another feature requires them.
