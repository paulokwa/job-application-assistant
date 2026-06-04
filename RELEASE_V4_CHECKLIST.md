# v4.0 Release Checklist

Version 4.0 is the active post-v3 release cycle. v3.0 was approved by Google on 2026-06-04. This checklist tracks v4.0 development, release gates, smoke tests, packaging, and Chrome Web Store submission steps.

Do not bump `manifest.json`, create a v4.0 package, update the Chrome Web Store listing, or submit v4.0 unless the user explicitly confirms the v4.0 release scope and asks to proceed.

## Release Gate

- [DONE] v3.0 approved by Google on 2026-06-04.
- [DONE] v4.0 development cycle opened.
- [DONE] Tab-Scoped Job Sessions and Draft Restore implemented and user-tested locally.
- [WAITING] User confirms final v4.0 release scope.
- [WAITING] `manifest.json` version bump to `4.0.0`.
- [WAITING] Full v4.0 smoke testing passes.
- [WAITING] User explicitly confirms packaging/submission.
- [WAITING] v4.0 submission zip created and inspected.
- [WAITING] Chrome Web Store listing/privacy fields reviewed for v4.0 changes.
- [WAITING] v4.0 submitted to the Chrome Web Store.
- [WAITING] Google review outcome for v4.0.

## Current v4.0 Candidate Scope

Included so far:

- **Tab-Scoped Job Sessions and Draft Restore**
  - Active scanned-job session data is stored per source browser tab using `jobSessionsByTab[tabId]`.
  - Generated draft restore data is stored per source browser tab using `savedDraftsByTab[tabId]`.
  - Side panel launches include `sourceTabId`.
  - Dashboard startup loads only its own tab session and draft.
  - Dashboard storage-change handling ignores job-session changes for other tab IDs.
  - Context-menu scans write only the clicked tab's session.
  - Saved Jobs load/generate and History regenerate route into the current dashboard instead of overwriting global session state.
  - Full-page handoff preserves the target tab context.
  - Clear removes only the current tab's job session and draft restore data.
  - Scanning a different job in the same tab clears that tab's stale generated draft restore data.

Not yet confirmed for v4.0:

- Any additional feature work.
- Any new permissions.
- Any Chrome Web Store listing copy changes beyond describing the confirmed release scope.

## Permission Review

- Preserve the existing `activeTab` permission model unless the user explicitly approves a separate permission experiment.
- Do not add broad host permissions as part of tab-scoped state work.
- Confirm `manifest.json` does not include `debugger` or `downloads` unless a future, explicitly approved feature requires them.
- Direct PDF Download remains removed/deferred for store-safety; Print / Save as PDF remains the supported export path.
- If v4.0 scope adds any permission-sensitive behavior, update this checklist before packaging.

## Manifest Version Check

- [WAITING] Confirm final v4.0 release scope.
- [WAITING] Set `manifest.json` version to `4.0.0`.
- [WAITING] Confirm the extension name and description still match the Chrome Web Store listing.
- [WAITING] Confirm all permissions and host permissions are expected.
- [WAITING] Confirm `debugger` and `downloads` are absent unless explicitly reintroduced by approved scope.

## v4.0 Smoke Test Checklist

**Tab-scoped sessions and draft restore**
- Open Job A in Tab A, open the extension, scan. Open Job B in Tab B, open the extension, scan. Confirm each dashboard shows only its own job.
- With both dashboards open, rescan Tab A. Confirm Tab B does not change.
- Generate for Job A. Close/reopen from Tab A. Confirm Job A draft restores only for Tab A.
- Scan Job B without generating. Close/reopen from Tab B. Confirm Job B restores and Job A does not appear.
- Open a new blank Tab C and open the extension. Confirm it starts blank unless Tab C already has its own context.
- Use context-menu scan in Tab A. Confirm only Tab A's dashboard updates.
- Open full-page mode from Tab A. Confirm it carries Tab A's job context without changing Tab B.
- Click Clear in Tab A. Confirm Tab B is unaffected.

**Core generation**
- Settings -> AI Provider: set provider and key, verify saves and loads.
- Demo/Mock Mode: generates resume and cover letter without a real API key.
- Scan page on a job posting -> Generate Resume.
- Manual job description paste -> Generate Cover Letter.
- Stop generation while a run is in progress; confirm controls recover.
- Clear: scan a job, click Clear, reload dashboard; old job description does not reappear for that tab.

**Saved Jobs and History**
- Save to Jobs from a scanned or manually entered job; job appears in Saved Jobs list.
- Load saved job into generator from Tab A. Confirm only Tab A updates.
- Launch Resume-only generation from a saved job card. Confirm only the current dashboard updates.
- Launch Cover Letter-only generation from a saved job card. Confirm only the current dashboard updates.
- History -> Regenerate from Tab A. Confirm only Tab A updates/regenerates.
- Saved Jobs remains global across tabs, while active dashboard workspace remains tab-scoped.

**Print and filename**
- Settings -> Documents: filename pattern saves and reloads.
- Print -> Resume Only: print dialog opens, Save as PDF suggests the configured filename.
- Print -> Cover Letter Only: print dialog opens, Save as PDF suggests the configured filename.
- Print -> Resume + Cover Letter: two print dialogs open with per-document filename titles.
- Print -> Merged Document: one print dialog opens with the merged filename title.
- Confirm no Direct PDF Download buttons are visible in the dashboard.

**Fit Check and Job Chat**
- Successful scan prepares Fit Check context without running AI automatically.
- Run AI Fit Check explicitly and confirm the result card appears on the correct tab.
- With Tab A and Tab B dashboards open, run/rescan Fit Check on Tab A and confirm Tab B does not change.
- Job Chat entry points are gated until job context exists.
- Scanning or loading a different job clears previous Job Chat messages for that dashboard.
- Chat-to-Refine actions prefill Refine only and do not auto-apply or generate.

**Application Pack Actions**
- Recruiter message opens from a saved job and generates review-first copy.
- Follow-up message opens from a saved job and remains status-aware.
- Follow-up reminder text opens and copies title/body.
- Short answers overlay opens with copy buttons and guarded editable fields.
- Application email overlay opens with manual instruction textarea and review checklist.
- Confirm nothing is sent, scheduled, attached, submitted, or form-filled automatically.

**Autofill**
- Open a form page or fixture, click Scan form fields, and confirm the review overlay appears.
- Uncheck a row, click Fill checked fields, and confirm unchecked fields are not written.
- Sensitive/demographic/legal fields do not appear as auto-checked rows.
- If any autofill matcher changes are included in v4.0, run the extra checks required by `TROUBLESHOOTING.md` entry 16.

**Storage and settings**
- My Profile and Manage Profiles: create, edit, switch, delete; data persists across reload.
- Provider settings and profile data remain local-only.
- No console errors in dashboard, settings, saved jobs, history, or autofill review.

## Automated Checks

Run before packaging:

```powershell
node --check background.js
node --check dashboard/dashboard.js
node --check jobs/jobs.js
node --check history/history.js
node --check settings/settings.js
node --check content.js
node tests/autofillMatcher.test.js
node tests/pdfImport.test.js
git diff --check
```

Add any new tests required by v4.0 scope before packaging.

## Packaging Steps

Do not start these until the user explicitly confirms v4.0 release scope and packaging/submission.

1. [WAITING] Confirm working tree is clean: `git status`
2. [WAITING] Confirm latest commit is the expected v4.0 release baseline: `git log --oneline -5`
3. [WAITING] Confirm `manifest.json` version is `4.0.0`
4. [WAITING] Reload the unpacked extension in Chrome
5. [WAITING] Run the smoke test checklist above
6. [WAITING] Update Chrome Web Store listing copy only for confirmed v4.0 changes
7. [WAITING] Verify privacy policy and Chrome Web Store privacy fields still match shipped behavior
8. [WAITING] Package runtime files, excluding `.git/`, `tests/`, `*.md` planning docs, and dev-only files
9. [WAITING] Inspect zip root and manifest version
10. [WAITING] Upload zip to the Chrome Web Store developer dashboard
11. [WAITING] Submit for review
12. [WAITING] Record submission date and Google review outcome in this file and `SESSION_HANDOVER.md`

## Listing / Privacy Check

- Do not mention Direct PDF Download as a shipped feature unless it is explicitly reintroduced in a future release.
- If describing tab-scoped restore, frame it as reliability/state isolation: multiple job tabs keep their own active job and draft context.
- Do not imply automatic application submission or automatic email sending.
- Confirm the privacy policy still accurately describes draft generation and storage behavior.

## Handover Rule

When any gate changes:

1. Mark the gate `[DONE]`, `[WAITING]`, or `[BLOCKED]`.
2. Add the date and commit hash when available.
3. Update `SESSION_HANDOVER.md`.
4. Update `START_HERE.md`, `AGENTS.md`, and `AGENT.md` if the release status or startup checklist changes.
