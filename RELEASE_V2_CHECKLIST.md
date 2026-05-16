# v2.0 Release Checklist

Version 1.0 has already been submitted to the Chrome Web Store and is pending review. This checklist is for the future v2.0 package based on the current `main` branch.

## Version Decision

- Recommended version: `2.0.0`.
- Reason: Saved Jobs and Fit Analysis are substantial user-facing additions.

## Manifest Version Check

- Confirm `manifest.json` version is bumped before packaging.
- Confirm the extension name and description still match the Chrome Web Store listing.
- Confirm permissions and host permissions are still expected.

## Package/Zip Check

- Build/package from latest `main`.
- Exclude development-only files if the packaging process requires it.
- Load the unpacked extension in Chrome.
- Confirm dashboard, settings, saved jobs, and history pages open without console errors.

## Smoke Test Checklist

- Settings -> AI Provider saves and reloads.
- Demo/Mock Mode works.
- My Profile and Manage Profiles persist data.
- Source resume upload still works.
- Scan page -> Generate Resume.
- Manual job description -> Generate.
- Save to Jobs -> Load into generator.
- Analyze Fit and Re-analyze.
- History -> Regenerate.
- Safe URL opening allows normal HTTPS links and blocks unsafe schemes.
- Clear prevents old scanned or saved job data from reappearing.
- Storage quota guard messages are clear for oversized content.

## Screenshots/Listing Check

- Decide whether the Chrome Web Store screenshots should show Saved Jobs.
- Decide whether screenshots should show Fit Analysis.
- Update release notes/changelog with the new workflow.
- Make sure listing copy does not imply auto-apply or automatic submission.

## Privacy Policy URL Check

- Confirm the Chrome Web Store privacy policy URL is current.
- Confirm privacy copy reflects local storage for API keys, profile content, source resume text, saved jobs, drafts, and full job history.
- Confirm any remaining Chrome sync usage is described as low-sensitivity settings or compact history metadata.

## Known Follow-Up Items Not Blocking v2

- Application Pack actions.
- Optional use of Fit Analysis as generation context.
- Batch/manual multi-job intake.
- Job URL import.
- Search results page link scan.
- Assisted form filling.
- Job dashboard stats.
- Cleanup of old sync storage after migration confidence.
- Session scan payload cap if very large pages cause practical issues.
