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

## Manifest Version Check

- Bump `manifest.json` version to `3.0.0` only when preparing the v3 package.
- Confirm the extension name and description still match the Chrome Web Store listing.
- Confirm all permissions and host permissions are expected.
- Specifically re-review `debugger` and `downloads` before packaging.

## Smoke Test Checklist

- Settings -> Documents filename pattern saves and reloads.
- Generate Resume only, then Download PDF -> Resume Only uses the configured filename.
- Generate Cover Letter only, then Download PDF -> Cover Letter Only uses the configured filename.
- Generate Resume + Cover Letter, then Download PDF -> Resume + Cover Letter downloads two separate PDFs.
- Generate Resume + Cover Letter, then Download PDF -> Merged Document downloads one combined PDF.
- Confirm direct PDF formatting matches the existing print-based output closely enough.
- Confirm print-based Save as PDF still works as before.
- Confirm dashboard, settings, saved jobs, history, and autofill pages open without console errors.

## Listing / Privacy Check

- If shipping direct PDF download, update listing copy or release notes to distinguish print export from direct PDF download.
- If shipping `debugger`, add a clear permission justification in the developer dashboard.
- Confirm the privacy policy and Chrome Web Store privacy fields accurately describe document generation/download behavior and any permission-sensitive behavior.

## Rollback Plan

If direct PDF download is not suitable for Chrome Web Store submission:

- Remove the Download PDF button group from `dashboard/dashboard.html`.
- Remove direct PDF download styles from `dashboard/dashboard.css`.
- Remove direct PDF download handlers/helpers from `dashboard/dashboard.js`.
- Remove `debugger` and `downloads` from `manifest.json` unless another feature requires them.
