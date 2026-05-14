# Roadmap — Job Application Assistant

Ideas and planned features. Nothing here is committed or scheduled — it is a parking lot for things worth building when the time is right.

---

## High priority

### Welcome banner: clearer AI setup path
Update the first-run welcome banner so AI setup is harder to miss. It should make clear that the app needs an AI provider/API key or local Ollama setup before real generation will work, and should offer a direct action into AI Provider settings.

---

### Export / Import settings (JSON)
A single "Export settings" button in the AI Provider or Profile section that downloads all `chrome.storage.sync` and `chrome.storage.local` data (minus large blobs like source resume text) as a JSON file. A matching "Import" button restores from that file.

**Why:** Profile data lives in `chrome.storage.sync` per profile and does not automatically transfer between browsers. Chrome syncs data across devices for the same account, but a manual export/import is a useful backup and migration path. No backend needed — just a file download/upload.

---

## Low priority / Exploratory

### Profile export/import per profile
Allow exporting a single profile (not all settings) as a shareable JSON file, and importing one. Useful for users who want to back up a specific profile or share it across devices without exporting everything.

---

### More document style templates
Explore expanding the resume and cover letter template library beyond the current styles. Possibilities include more conservative corporate layouts, warmer community/nonprofit layouts, compact one-page variants, and role-specific templates. Keep the existing restrained design quality bar: templates should feel professional and usable, not decorative for its own sake.

---

### Support / feedback entry point
Decide whether the app should include a convenient support or feedback link, and where it belongs. Possible placements: welcome banner, header support button, Settings footer, or a small "Help / Feedback" item near the tour button. Keep it useful without making the dashboard feel promotional.

---

## Not planned (and why)

| Idea | Why not |
|---|---|
| Cloud sync via Supabase | Adds backend dependency, auth complexity, and a data-at-rest liability. Not worth it while Chrome sync covers provider/doc settings and export covers profile. |
| Built-in PDF editor | Out of scope — the extension is a drafting tool, not a document editor. Save-as-PDF via the preview already covers the use case. |
| Job board scraping / auto-apply | Moves into automation territory outside the extension's "assist, not replace" principle. |

---

## Completed

| Feature | Session | Notes |
|---|---|---|
| Synced job history summary | Session 6 | Saves a lightweight `chrome.storage.sync` summary with job title, company, date, document type, and source URL. Full drafts and job-description regenerate data stay local, so synced-only rows can show the URL while Regenerate remains disabled. |
| In-line draft editing | Session 5 | Edit button in the preview enables direct `contenteditable` changes inside generated resume and cover letter iframes before saving as PDF. |
| History quick-action: Regenerate | Session 5 | History rows now expose Regenerate when the saved entry includes job description data. It reloads the job into the dashboard and triggers the matching generation mode. |
| Job History page | Session 4 | History viewer at `history/history.html`, accessible from dashboard header. Sortable table with job title, company, date, doc type, URL, delete. |
| Multiple saved profiles | Session 4 | Full multi-profile storage (`profile_{id}` sync keys), CRUD in settings, profile switcher on dashboard, source resume filename tracked per profile. |
| Tone / formality slider | Session 4 | Formal ↔ Casual slider (0–100) with dynamic descriptor label. Injects tone instruction into generation prompt. |
| Cover letter length control | Session 4 | Short / Standard / Detailed pills. Maps to `clLengthInstruction()` controlling paragraph count in prompt. |
| ATS keyword scan | Session 4 | AI extracts 10–15 keywords from job description. Displayed as selectable chips; one-click injects missing keywords into the Refine textarea. |
| Dark/light mode toggle | Session 4 | Sun/moon button overrides `prefers-color-scheme`. Stored as `{ theme }` in local storage. Applied via `data-theme` attribute on `<html>` in both dashboard and settings pages. |
| Settings feature tour | Session 2 | 9-step spotlight tour triggered by `?` button in settings nav. |
| Ollama setup guide | Session 2 | In-app modal with step-by-step CORS setup and model download instructions. |
| Per-provider API config | Session 2 | Switching providers restores previously saved credentials for that provider. |
| Draft persistence across close/reopen | Session 1 | Generated drafts saved to `chrome.storage.local` and restored on next open. |
| Stop/cancel generation | Session 1 | AbortController wired through the full AI call chain; active button transforms to "■ Stop". |
| Filename chip builder | Session 1 | Drag-to-reorder chips replace plain text pattern input in Document Settings. |
| Apply Changes disabled until text entered | Session 3 | Button activates only when draft exists AND revision textarea has non-whitespace content. |
| Overwrite confirmation before generation | Session 3 | Confirms before overwriting an existing draft. |
