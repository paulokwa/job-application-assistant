# Roadmap — Job Application Assistant

Ideas and planned features. Nothing here is committed or scheduled — it is a parking lot for things worth building when the time is right.

---

## High priority

### Job History page
A dedicated "History" view (accessible from the dashboard header or settings nav) showing every job the user has generated drafts for. Displayed as a sortable table with:

- Job title
- Employer / company name
- Date and time generated
- Document type (Resume, Cover Letter, or Both)
- Source URL of the job posting
- Quick-action buttons: Regenerate, Open URL, Delete entry

**Storage:** Each generation run appends a lightweight record to `chrome.storage.local` under a `jobHistory` key (array of objects). Full draft text is not stored here — only metadata. History records are capped (e.g. last 100 entries) to stay within storage limits.

**Why it matters:** Users applying to many roles lose track of where they applied and what they generated. A history table is the most direct fix.

---

## Medium priority

### Export / Import settings (JSON)
A single "Export settings" button in the AI Provider or Profile section that downloads all `chrome.storage.sync` and `chrome.storage.local` data (minus large blobs like source resume text) as a JSON file. A matching "Import" button restores from that file.

**Why:** Profile data lives in `chrome.storage.local` and does not sync across devices. Chrome syncs provider and document settings automatically, but the full profile (experience, education, skills) requires this manual bridge. No backend needed — just a file download/upload.

---

### In-line draft editing
Allow the user to directly edit generated resume or cover letter text inside the preview pane, rather than only being able to use the Refine/Revision card. A simple `contenteditable` approach within the preview would suffice for v1.

---

### Multiple saved profiles
Support for saving and switching between different profile presets (e.g. "Product Manager track" vs "Operations track"). The current system has one profile. This would require a profile selector at the top of the Profile settings section.

---

## Low priority / Exploratory

### Tone / formality slider
A single slider on the dashboard (Formal ↔ Casual) that adjusts the generation system prompt. Would let users tailor voice for different company cultures without needing to use the Refine card.

### Cover letter length control
A dropdown or pill selector: Short (3 paragraphs) / Standard (4–5 paragraphs) / Detailed (6+ paragraphs). Maps to a word-count instruction in the prompt.

### ATS keyword scan
After generating, a secondary AI call analyses the job description and highlights keywords that appear in the job post but are absent from the generated resume. Displayed as a small chip list with a "Re-run with keywords" button.

### Dark/light mode toggle
Currently the theme follows `prefers-color-scheme`. An explicit toggle saved to storage would let users override the system preference.

---

## Not planned (and why)

| Idea | Why not |
|---|---|
| Cloud sync via Supabase | Adds backend dependency, auth complexity, and a data-at-rest liability. Not worth it while Chrome sync covers provider/doc settings and export covers profile. |
| Built-in PDF editor | Out of scope — the extension is a drafting tool, not a document editor. Save-as-PDF via the preview already covers the use case. |
| Job board scraping / auto-apply | Moves into automation territory outside the extension's "assist, not replace" principle. |
