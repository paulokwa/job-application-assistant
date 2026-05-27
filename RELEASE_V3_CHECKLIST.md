# v3.0 Release Checklist

Version 2.0 has been accepted by Google after Chrome Web Store submission. This checklist is for the future v3.0 package based on post-v2 work on `main`.

## Release Gate

- v3.0 planning can continue now that v2.0 has been accepted.
- Do not package or submit v3.0 until the user explicitly confirms the release scope.
- Direct PDF Download was removed/deferred for store-safety before v3 packaging.

## Permission Review

- The print-dialog Save as PDF path remains the supported export path.
- Print export sets the print-window document title from the configured filename pattern so Chrome's Save as PDF dialog can suggest the user's preferred filename.
- Direct PDF Download was removed/deferred and no longer requires the powerful PDF-generation permissions.
- Confirm `manifest.json` does not include `debugger` or `downloads` unless a future, explicitly approved feature requires them.

## Candidate v3 Work

- Export PDF UI uses the store-safer print-dialog flow:
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
- Confirm `debugger` and `downloads` are absent unless a future release scope explicitly reintroduces a permission-requiring feature.
- Confirm Fit Check changes did not add new permissions. `manifest.json` was not changed by Fit Check Phase 3.

## Smoke Test Checklist

- Settings -> Documents filename pattern saves and reloads.
- Settings -> Documents Auto Fit Check toggle saves and reloads.
- Generate Resume only, then Print -> Resume Only opens the print dialog and Save as PDF suggests the configured filename.
- Generate Cover Letter only, then Print -> Cover Letter Only opens the print dialog and Save as PDF suggests the configured filename.
- Generate Resume + Cover Letter, then Print -> Resume + Cover Letter opens two print dialogs/windows with per-document filename titles.
- Generate Resume + Cover Letter, then Print -> Merged Document opens one print dialog/window with the merged filename title.
- Confirm no Direct PDF Download buttons are visible.
- Confirm print-based Save as PDF formatting still works as before.
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

- Do not mention Direct PDF Download as a shipped feature unless it is explicitly reintroduced in a future release.
- If mentioning Fit Check AI review in listing or release notes, describe it as manual and provider-backed. Avoid implying automatic AI analysis or submission help.
- Confirm the privacy policy and Chrome Web Store privacy fields accurately describe document generation/download behavior and any permission-sensitive behavior.

## Deferred Direct Download Notes

- Direct PDF Download was removed/deferred for v3 store-safety.
- Reintroducing it would require a fresh permission review, Chrome Web Store justification, UI copy, and release-scope confirmation.
