# v2.0 Release Checklist

Version 2.0 has been submitted to the Chrome Web Store and accepted by Google. This checklist is now historical documentation for the accepted v2.0 package.

## Version Decision

- [DONE] Version: `2.0.0`.
- Reason: Saved Jobs and Fit Analysis are substantial user-facing additions.

## Manifest Version Check

- [DONE] Confirmed `manifest.json` version was bumped before packaging.
- [DONE] Confirmed the extension name and description matched the Chrome Web Store listing.
- [DONE] Confirmed permissions and host permissions were expected for v2.0.

## Package/Zip Check

- [DONE] Packaged from latest v2.0-ready `main`.
- [DONE] Excluded development-only files if required by the packaging process.
- [DONE] Loaded the unpacked extension in Chrome.
- [DONE] Confirmed dashboard, settings, saved jobs, and history pages opened without obvious console errors.

## Smoke Test Checklist

- [DONE] Settings -> AI Provider saves and reloads.
- [DONE] Demo/Mock Mode works.
- [DONE] My Profile and Manage Profiles persist data.
- [DONE] Source resume upload still works.
- [DONE] Scan page -> Generate Resume.
- [DONE] Manual job description -> Generate.
- [DONE] Save to Jobs -> Load into generator.
- [DONE] Analyze Fit and Re-analyze.
- [DONE] History -> Regenerate.
- [DONE] Safe URL opening allows normal HTTPS links and blocks unsafe schemes.
- [DONE] Clear prevents old scanned or saved job data from reappearing.
- [DONE] Storage quota guard messages are clear for oversized content.

## Screenshots/Listing Check

- [DONE] Chrome Web Store screenshots updated to show Saved Jobs and Fit Analysis.
- [DONE] Release notes/changelog prepared for the new workflow.
- [DONE] Listing copy checked so it does not imply auto-apply or automatic submission.

## Privacy Policy URL Check

- [DONE] Confirmed the Chrome Web Store privacy policy URL was current.
- [DONE] Confirmed privacy copy reflects local storage for API keys, profile content, source resume text, saved jobs, drafts, and full job history.
- [DONE] Confirmed remaining Chrome sync usage is described as low-sensitivity settings or compact history metadata.

## Known Follow-Up Items Not Blocking v2

These were intentionally not blockers for v2.0 and remain future roadmap inputs:

- Application Pack actions.
- Optional use of Fit Analysis as generation context.
- Batch/manual multi-job intake.
- Job URL import.
- Search results page link scan.
- Assisted form filling follow-ups.
- Job dashboard stats.
- Cleanup of old sync storage after migration confidence.
- Session scan payload cap if very large pages cause practical issues.
