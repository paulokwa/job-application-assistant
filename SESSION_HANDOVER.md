# Session Handover — Job Application Assistant

**Last updated:** 2026-05-16 (Session 8 - Generation completion receipt)

---

# Session 8 additions (2026-05-16)

**Branch:** `main`

---

### 49. Generation completion receipt

Added a persistent completion receipt in the dashboard generation status area. After a successful run, the running status turns into a compact sticky receipt that tells the user:

- Which document set completed: resume, cover letter, or both
- Which provider ran the job
- Which model was used
- What time the generation completed
- How long the generation took

Example copy: `Drafts completed by OpenAI with gpt-4o-mini at 10:42 PM. Took 1m 18s.`

The receipt is cleared when a new generation starts, updated after the next successful run, persisted with the saved draft, and cleared when drafts are cleared.

**Files changed:** `dashboard/dashboard.js`, `dashboard/dashboard.css`

---

### 50. Explicit waiting copy for resume vs cover letter

Updated the timed Ollama waiting messages so every stage clearly names the artifact being generated. The longer-running messages now say `resume` or `cover letter` instead of generic text like `the letter` or `still working`.

Examples:

- `Local AI is tailoring the resume. Ollama can take a minute or two depending on your computer.`
- `Still tailoring the resume. You can stop this run if you want to try a smaller Ollama model.`
- `Local AI is drafting the cover letter. Ollama can take a minute or two depending on your computer.`
- `Still writing the cover letter. You can stop this run if you want to try a smaller Ollama model.`

**Verification:** `node --check dashboard/dashboard.js`, `git diff --check`

**Files changed:** `dashboard/dashboard.js`

---

# Session 7 additions (2026-05-14)

**Branch:** `main`

---

### 47. Resume importer custom sections

Added a safe "Additional Background" path for non-standard resume content. This lets the importer and user preserve useful information that does not fit Personal Details, Skills, Work Experience, Education, or Certifications.

**How it works:**

- `modules/extraction.js` now asks the AI resume parser to return `customSections` for useful non-standard sections.
- `modules/schema.js` now normalizes `customSections` and `doNotClaimNotes` so those fields survive profile save/load.
- `settings/settings.html` adds an **Additional Background** card in My Profile with a dynamic list of labelled text sections.
- `settings/settings.js` renders, collects, clears, and auto-fills those custom sections.
- `modules/profile.js` includes custom sections in `profileToPromptText()` under **Additional Background** so generation can use them when relevant.

**Compatibility notes:**

- Draft generation already receives the raw uploaded source resume as ground truth, so this feature is mainly for preserving and reviewing unusual imported details in the structured profile.
- The custom sections are labelled free-text sections, not arbitrary schema changes, to avoid breaking renderer or prompt expectations.
- Existing profile fields remain unchanged and older profiles normalize with `customSections: []`.

**Files changed:** `modules/extraction.js`, `modules/schema.js`, `modules/profile.js`, `settings/settings.html`, `settings/settings.css`, `settings/settings.js`

---

### 48. Profile importer preservation fixes

Fixed two related profile persistence gaps found while adding custom sections:

- Imported `summaries` are now saved into the profile instead of being discarded after auto-fill.
- `doNotClaimNotes` are now preserved by schema normalization and included in prompt context as hard limits.
- The Do Not Claim placeholder now reads as generic examples rather than personal rules.

**Files changed:** `settings/settings.js`, `settings/settings.html`, `modules/schema.js`, `modules/profile.js`

---

# Session 6 additions (2026-05-14)

**Branch:** `main`

---

### 45. Dashboard Style card polish

Small layout refinements in the Style card:

- Added extra vertical spacing between the Accent row and Spacing row using `.layout-spacing-group`.
- Fixed the Tone row label alignment so the "Tone" label sits on the same horizontal plane as the "Formal" slider label instead of aligning against the slider plus descriptor block.

**Files changed:** `dashboard/dashboard.html`, `dashboard/dashboard.css`

---

### 46. Custom profile switcher menu

Replaced the native browser `<select>` used for the dashboard profile switcher with an app-styled menu so the profile dropdown matches the dashboard's visual system instead of using the OS/browser default dropdown.

**How it works:**

- `#profile-switcher` is now a button with `aria-haspopup="listbox"` and `aria-expanded`.
- `#profile-menu-list` renders profile options as `.profile-menu-option` buttons.
- `populateProfileStrip()` now fills the menu, marks the active option, and updates the closed button label.
- `switchToProfile(profileId)` keeps the existing `switchProfile()` behavior and repopulates the menu after a switch.
- Keyboard support: `Enter` / `Space` / `ArrowDown` open the menu, arrow keys move between options, `Escape` closes it.
- Clicking outside the profile strip closes the menu.

**Files changed:** `dashboard/dashboard.html`, `dashboard/dashboard.css`, `dashboard/dashboard.js`

---

# Session 5 additions (2026-05-13)

**Branch:** `feature/inline-editing` (merged to `main`)

---

### 44. Inline draft editing

Users can now directly edit the generated resume or cover letter text inside the preview iframe before saving as PDF. This addresses the lack of DOCX export — users can make final tweaks in the preview pane instead of needing to edit a downloaded file.

**How it works:**

- A small "✏ Edit" pill button (`.btn-edit-toggle`) sits in a centered `.preview-edit-bar` positioned absolutely near the top of each draft wrapper (`draft-resume-content`, `draft-cl-content`). The bar is only visible when a draft exists (the wrapper is unhidden on generation).
- Clicking "✏ Edit" calls `toggleEditMode(tab)` which:
  1. Injects a `<style id="edit-mode-style">` into the iframe document to override `.page-preview { overflow: visible !important; }` (the renderer sets `overflow: hidden` which would clip edited content)
  2. Sets `contentEditable = 'true'` on the `.page-preview` div inside the iframe
  3. Focuses the element so the user can start typing immediately
  4. Attaches a `{ once: true }` `input` listener that sets `state.hasEdits[tab] = true` on first keystroke
  5. Changes the button label to "Done" and applies the `.editing` class (teal filled style)
- Clicking "Done" calls `toggleEditMode(tab)` again which:
  1. Removes `contenteditable` attribute from `.page-preview`
  2. Removes the injected `edit-mode-style` (overflow goes back to hidden)
  3. Resets the button to "✏ Edit"
  4. `state.hasEdits[tab]` remains `true` if any input was received

**Print/save pipeline (critical — read before touching `printDraft`):**

The existing pipeline calls `renderDocument()` from `state.drafts` JSON, which would wipe out any inline edits. The fix is:
- `printDraft()` checks `state.hasEdits[tab]` for each tab being printed
- If edits exist, it calls `getIframeHtml(iframe)` which returns `'<!DOCTYPE html>\n' + iframe.contentDocument.documentElement.outerHTML`
- This captures the full HTML including all embedded CSS and print media styles already baked into the rendered document by `renderDocument()`, so print quality is identical to the non-edited path
- The merged print (`btn-print-merged`) always re-renders from state — no edit integration for merged (kept simple)

**Edit state reset:**

- `clearEditState(tab)` resets `state.editMode[tab]`, `state.hasEdits[tab]`, and the button UI
- `updatePreviews()` calls `clearEditState` for resume and cover-letter tabs before injecting new HTML (so template changes, revisions, and re-generations all clear any previous edits)
- `clearSession()` calls `clearEditState` for both tabs

**New state fields:**
```js
editMode: { resume: false, 'cover-letter': false },
hasEdits: { resume: false, 'cover-letter': false },
```

**New DOM refs:** `btnEditResume` (`#btn-edit-resume`), `btnEditCL` (`#btn-edit-cl`)

**New functions:** `toggleEditMode(tab)`, `getIframeHtml(iframe)`, `clearEditState(tab)`

**Files changed:**
| File | Change |
|---|---|
| `dashboard/dashboard.html` | Added `.preview-edit-bar` + `#btn-edit-resume` inside `#draft-resume-content`; same for `#btn-edit-cl` inside `#draft-cl-content` |
| `dashboard/dashboard.css` | Added `.preview-edit-bar` (absolute, top-right, z-index 10), `.btn-edit-toggle` (pill button, muted style), `.btn-edit-toggle:hover` (accent border/color), `.btn-edit-toggle.editing` (teal fill) |
| `dashboard/dashboard.js` | `editMode`/`hasEdits` state, DOM refs, event listeners, `toggleEditMode()`, `getIframeHtml()`, `clearEditState()`, modified `updatePreviews()`, modified `printDraft()` (uses iframe HTML when edits exist), modified `clearSession()` |

---

## Next steps for Session 5

- Load the extension on `feature/inline-editing` branch and test:
  1. Generate a draft → "✏ Edit" button appears in top-right of preview
  2. Click Edit → button turns teal "Done", text in preview is editable
  3. Make a change → click Done
  4. Click "Resume + Cover Letter" save button → print dialog should show the edited version
  5. Verify template changes / revisions clear edits and reset button
  6. Verify "New Draft" clears edit state
- Merged `feature/inline-editing` → `main` after user confirmation and moved "In-line draft editing" to Completed in ROADMAP.md.
- If not working, switch back to `main` (the branch has no changes to any shared module — only dashboard files)

---

# Session 4 additions (2026-05-13)

---

### 31. Cover Letter Length Control

Three pill buttons (Short / Standard / Detailed) appear inside the style card under a "Writing" section label. Selection sets `state.clLength` and is passed to `generateCoverLetter()`. A `clLengthInstruction()` helper in `modules/drafting.js` maps each value to a prompt instruction controlling paragraph count.

**Files changed:** `dashboard/dashboard.html`, `dashboard/dashboard.css`, `dashboard/dashboard.js`, `modules/drafting.js`

---

### 32. Style card section labels (Layout / Writing)

The style card now has two labelled sub-sections: **Layout** (template, accent colour, spacing) and **Writing** (tone slider + descriptor, cover letter length). Implemented with `.ctrl-section-label` dividers (10px uppercase muted text with a bottom border).

**Files changed:** `dashboard/dashboard.html`, `dashboard/dashboard.css`

---

### 33. Tone descriptor moved under slider

The dynamic tone label (Formal / Professional / Balanced / Conversational / Casual) was relocated from beside the slider to directly below it, using a `.tone-slider-col` flex-column wrapper. Labels for Layout and Writing blocks are now left-aligned, matching each other.

**Files changed:** `dashboard/dashboard.html`, `dashboard/dashboard.css`

---

### 34. ATS keyword scan

A new "ATS Check" card (step between Style and Generate) lets users scan the job description for missing keywords.

**Flow:**
1. User clicks "Scan for Keywords" → `extractAtsKeywords()` calls the AI with a prompt requesting 10–15 critical keywords as JSON
2. All missing keywords are rendered as selectable chips (all pre-selected)
3. User deselects any they don't want to add
4. "Apply to Refine" injects a pre-built prompt into the Refine textarea: "Please naturally incorporate the following keywords: …"

**New exports in `modules/drafting.js`:** `extractAtsKeywords(jobDescription, settings, signal)` — returns `string[]`  
**New mock in `modules/mock.js`:** `mockExtractAtsKeywords()` — 12 hardcoded keywords  
**New JS in `dashboard.js`:** `runAtsCheck()`, `renderAtsResults()`, `updateAtsApplyButton()`, `applyAtsKeywords()`  
**New CSS:** `.ats-chip--missing`, `.ats-chip--deselected`, `.ats-apply-row`

---

### 35. Apply Changes button animation fix

Previously, clicking "Apply Changes" triggered the Generate section spinner. Fixed: the spinner is now a CSS `::before` pseudo-element on the button itself using a `.btn--loading` class, keeping it visually attached to the button regardless of scroll position.

**Files changed:** `dashboard/dashboard.css`, `dashboard/dashboard.js`

---

### 36. Reset → Revert with snapshot restore

The "Reset" button in the Refine card was renamed "↩ Revert" and no longer calls `runGeneration()` (which would make an API call). Instead, it restores from `state.originalDrafts` — a deep copy (`JSON.parse(JSON.stringify())`) taken immediately after every successful generation. No API call, instant restore.

**Files changed:** `dashboard/dashboard.js`

---

### 37. Location field removed from Job Info

The Location field was removed from the Job Info card. Location was not used in any AI prompts and added form friction with no benefit.

**Files changed:** `dashboard/dashboard.html`, `dashboard/dashboard.js`

---

### 38. Dark/light mode toggle

A sun/moon toggle button (`#btn-theme`) was added between the tour and support buttons. Clicking calls `toggleTheme()` which cycles between `dark` and `light`, stores the choice in `chrome.storage.local` as `{ theme }`, and applies `data-theme` attribute to `document.documentElement`.

**CSS pattern:**
- Light default: `:root { ... }` tokens
- OS dark: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }`
- Manual dark: `:root[data-theme="dark"] { ... }`

**Files changed:** `dashboard/dashboard.html`, `dashboard/dashboard.css`, `dashboard/dashboard.js`

---

### 39. Multiple saved profiles (multi-profile rewrite)

`modules/profile.js` was fully rewritten to support multiple profiles. Each profile lives in its own `chrome.storage.sync` key (`profile_{id}`) for the full 8 KB per-item budget. An `profileIndex` array in sync storage tracks all profiles (id + name + optional metadata).

**Key exports:** `loadProfiles()`, `loadProfile()`, `saveProfile()`, `switchProfile()`, `createProfile()`, `renameProfile()`, `updateProfileMeta()`, `deleteProfile()`, `profileToPromptText()`

**Migration:** `migrateIfNeeded()` runs on first load — if no `profileIndex` exists, wraps any existing `userProfile` data into a new profile called "General".

**Dashboard:** A profile strip above the left column shows a `<select>` of all profiles. Switching auto-saves the current profile first, then loads the selected one.

**Settings (Profiles section):** A new "Profiles" nav section lists all profiles as rows with Switch / Rename / Delete buttons. Rename is inline (span → input → blur commits). New Profile auto-switches and navigates to "My Profile" for data entry.

**Files changed:** `modules/profile.js` (full rewrite), `dashboard/dashboard.html`, `dashboard/dashboard.css`, `dashboard/dashboard.js`, `settings/settings.html`, `settings/settings.css`, `settings/settings.js`

---

### 40. Filename per-profile tracking

After a successful resume upload, `updateProfileMeta(activeId, { sourceResumeName: file.name })` stores the filename in the profile index entry (sync storage). The Profiles list renders this as a subtitle under the profile name (`📄 filename.pdf`), truncated with ellipsis and a title tooltip for long names.

**Files changed:** `settings/settings.js`, `settings/settings.css`

---

### 41. Sticky Save/Clear profile buttons

The `.profile-actions` container (Save Profile + Clear All) in the My Profile section now has `position: sticky; bottom: 0` with a canvas background and border-top so the buttons are always visible regardless of scroll position within the settings panel.

**Files changed:** `settings/settings.css`

---

### 42. Settings dark/light mode fix

The settings page was not responding to the manual dark/light toggle because it had no `data-theme` awareness.

**Fixes:**
- `settings.css`: Dark media query changed from `:root` to `:root:not([data-theme="light"])`. Added `:root[data-theme="dark"]` block with identical dark tokens.
- `settings.js` `init()`: Reads `chrome.storage.local.get(['theme'])` and applies `data-theme` attribute before first paint.

**Files changed:** `settings/settings.css`, `settings/settings.js`

---

### 43. Settings nav height fix (align-content + font-family)

Two related bugs caused the settings nav bar to change height when switching sections.

**Bug 1 — Grid stretch:** In embedded mode the settings grid has `min-height: 100vh`. When a section's content is shorter than the iframe height (AI Provider, Documents, Profiles), CSS Grid's default `align-content: stretch` distributed the leftover space equally between the nav row and section row, inflating the nav row by 60–100px. Fix: `align-content: start` on `body.embedded .settings-main`.

**Bug 2 — Font metric shift:** `.nav-btn.active` changed `font-family` from Inter to Plus Jakarta Sans. Different font metrics caused the active button to render slightly taller. Fix: removed `font-family: var(--font-display)` from `.nav-btn.active`. Added explicit `line-height: 1.4` to `.nav-btn` for consistency.

**Files changed:** `settings/settings.css`

---

## Files changed in Session 4

| File | Nature of change |
|---|---|
| `dashboard/dashboard.html` | Profile strip, ATS card, tone layout, length pills, revert button, location field removal, theme button |
| `dashboard/dashboard.css` | Section labels, tone column, length pills, ATS chips, btn--loading spinner, profile strip |
| `dashboard/dashboard.js` | clLength state, originalDrafts snapshot, applyRevision animation, resetToOriginal, ATS scan, theme toggle, profile strip |
| `modules/drafting.js` | clLengthInstruction(), extractAtsKeywords() |
| `modules/mock.js` | mockExtractAtsKeywords() |
| `modules/profile.js` | Full rewrite — multi-profile, updateProfileMeta |
| `settings/settings.html` | Profiles nav + section |
| `settings/settings.css` | Profile rows, sticky save bar, profile-row-file, dark theme data-theme, align-content fix, nav font fix |
| `settings/settings.js` | updateProfileMeta import, filename tracking, renderProfilesList with filename, theme loading |
| `history/history.html` | New — application history viewer |
| `history/history.css` | New — history page styles |
| `history/history.js` | New — history page controller |

---

# Session 2 additions (2026-05-13)

All items below were added or fixed after the original SESSION_HANDOVER was written. The earlier session's work is preserved below this block.

---

### 14. Scan page button

Added a "Scan page" pill button (`#btn-scan-page`) inside the Job Info card header (`.card-header-right` wrapper). Clicking it calls `scanCurrentPage()` which sends a `scanJobPage` message to the active tab's content script. On success, `applyExtractedData()` repopulates the job fields. Falls back to `chrome.scripting.executeScript` if the content script is not already injected.

**Files changed:** `dashboard/dashboard.html`, `dashboard/dashboard.css`, `dashboard/dashboard.js`

---

### 15. "Resume + Cover Letter" mode badge removed

The `<span id="mode-badge">` element and its `.mode-badge` CSS rule were removed from the dashboard header. The header is now cleaner with just the app name and action buttons.

---

### 16. OpenRouter added as fourth AI provider

OpenRouter is an API gateway that gives access to Claude, GPT-4, Gemini, Llama, DeepSeek and more through one key.

**Changes:**
- `settings.html`: added `<option value="openrouter">OpenRouter (multi-model)</option>`
- `settings.js`: added `PROVIDER_MODELS.openrouter` (8 curated models), `DEFAULT_MODELS.openrouter`, `PROVIDER_API_LINKS.openrouter`
- `modules/provider.js`: added `case 'openrouter'` and `callOpenRouter()` using OpenAI-compatible endpoint `https://openrouter.ai/api/v1/chat/completions` with `X-Title: Job Application Assistant` header
- `modules/errorMapper.js`: OpenRouter errors routed through the same OpenAI error handler (same response shape)

Model list (as of session): `anthropic/claude-3.5-haiku`, `anthropic/claude-3.5-sonnet`, `anthropic/claude-3-opus`, `openai/gpt-4o-mini`, `openai/gpt-4o`, `google/gemini-2.0-flash-001`, `meta-llama/llama-3.3-70b-instruct`, `deepseek/deepseek-chat`

Note: Free-tier model IDs (`:free` suffix) are not in the list — they returned 404. Use the paid model IDs above.

---

### 17. Mock mode hidden from UI

The Mock option is kept in the `<select>` DOM (`style="display:none"`) so JS that references `p === 'mock'` does not break, but it no longer appears in the visible dropdown. Users in production never see it.

---

### 18. Save confirmation feedback on all save buttons

All three save buttons now show "✓ Saved" for 2 seconds with `disabled: true` before reverting. Buttons: `btn-save-provider`, `btn-save-documents`, `btn-save-profile`. A toast fires simultaneously.

---

### 19. "Open Settings" error button navigates to the correct section

Previously the button always opened Settings to the default section. Now `showError()` sets `dom.btnErrorSettings.dataset.section` to the relevant section string (`'provider'` for API key errors, `'profile'` for missing profile). The click handler reads that value and navigates the Settings iframe directly.

**Files changed:** `dashboard/dashboard.js`, `modules/errorMapper.js`

---

### 20. Clickable API key links per provider

A hint line with a hyperlink now appears below the API key field whenever a provider with a known key-creation URL is selected. Links:

| Provider | URL |
|---|---|
| OpenAI | `platform.openai.com/api-keys` |
| Gemini | `aistudio.google.com/app/apikey` |
| OpenRouter | `openrouter.ai/keys` |
| Ollama | No link (no key needed) |

Implemented via `PROVIDER_API_LINKS` map in `settings.js` and `#hint-api-link` paragraph in `settings.html`.

---

### 21. Ollama CORS error messaging fix

Previously a CORS 403 from Ollama showed "The API key appears to be missing or invalid" (the generic 401/403 message). Fixed by adding an Ollama-specific check in `errorMapper.js` that fires before the generic 401/403 block. The Ollama check inspects `msg.includes('ollama error')` first.

See TROUBLESHOOTING.md entry 8 for full detail.

---

### 22. Ollama Setup Guide modal

A full in-app guide modal (`#ollama-help-overlay`) triggered by a "Setup guide →" link next to the Ollama endpoint field. Covers:

- Step 1: Setting `OLLAMA_ORIGINS=chrome-extension://*` (Windows and macOS instructions with exact steps)
- Step 2: Downloading a model (`ollama pull llama3`, `qwen2.5:3b`, `mistral`)
- Step 3: Verifying Ollama is running at `http://localhost:11434`
- Troubleshooting section: CORS blocked, model not found, could not reach Ollama

**Files changed:** `settings/settings.html`, `settings/settings.css`, `settings/settings.js`

---

### 23. 9-step settings feature tour

A full highlight tour for the Settings page, triggered by a `?` button in the nav bar.

**Steps:** Settings nav → Provider selector → Model selector → Test connection → Save AI Settings → Filename chip builder → Upload resume → Personal details → Save profile

**Implementation mirrors the dashboard tour:** full-screen overlay, spotlight via box-shadow cutout, tooltip positions below/above/centre depending on space. Keyboard: `→`/`←` to navigate, `Escape` to exit. Uses instant `scrollIntoView` + `requestAnimationFrame × 2` to avoid race conditions with layout shifts.

**Files changed:** `settings/settings.html`, `settings/settings.css`, `settings/settings.js`

---

### 24. Settings overlay iframe clip bug fix

The Settings overlay (iframe inside the dashboard) was clipping the bottom of the page — the "Save Profile" button was not visible or reachable via scroll. Root cause: `.overlay-content { height: 100% }` gave the content area the full overlay height while `.overlay-header` consumed some of that space from the top, pushing content below the visible area.

**Fix:** `.settings-overlay { display: flex; flex-direction: column }` + `.overlay-content { flex: 1; min-height: 0 }`. This lets the content area fill only the remaining height after the header, with proper overflow scrolling.

**File changed:** `dashboard/dashboard.css`

---

### 25. Custom confirmation dialog

Replaced native `confirm()` for the "Clear All" profile action with a styled promise-based dialog. Uses `#confirm-overlay` / `.confirm-modal` in settings HTML/CSS. `showConfirmDialog(title, body, confirmLabel)` returns `Promise<boolean>`. Backdrop click and Cancel button both resolve `false`.

**Files changed:** `settings/settings.html`, `settings/settings.css`, `settings/settings.js`

---

### 26. Per-provider API config storage

Switching between providers now restores the previously saved credentials for that provider — the user does not need to retype their API key each time.

**Storage format:**
```js
{
  activeProvider: 'openai',
  configs: {
    openai:      { apiKey, modelName, endpoint },
    gemini:      { apiKey, modelName, endpoint },
    openrouter:  { apiKey, modelName, endpoint },
    ollama:      { apiKey, modelName, endpoint },
  },
  simulateFailure: 'none'
}
```

**Backward compatibility:** `migrateSettings(raw)` detects the old flat format (`{ provider, apiKey, modelName }`) and wraps it into the new structure on first load. No data loss.

`loadSettings()` in `dashboard.js` flattens back to the old shape for the generation pipeline (which only needs the active provider's key).

**Files changed:** `settings/settings.js`, `dashboard/dashboard.js`

---

### 27. API key Show/Hide toggle and partial mask hint

The API key field now follows industry-standard password field conventions:

- **`type="password"` by default** — key is masked with dots even when a saved value is loaded
- **Show / Hide button** — sits inside the right edge of the input field. Toggles between `type="password"` and `type="text"`. Resets to "Show" whenever the provider changes.
- **Saved key hint** — a small monospace line below the input shows `Saved: sk-ab••••••••cdef` (first 4 chars + 8 dots + last 4 chars) when a saved key exists. This confirms at a glance that a key is stored and roughly which one it is, without exposing it. Hides when the user starts typing a new key.

**Files changed:** `settings/settings.html`, `settings/settings.css`, `settings/settings.js`

---

### 28. Permission narrowing for Chrome Web Store (Session 3 — 2026-05-13)

Removed broad permissions ahead of Chrome Web Store submission.

**Manifest changes:**
- `content_scripts` block removed entirely — `content.js` is no longer auto-injected on every page load
- `host_permissions` replaced `<all_urls>` with five specific entries: `https://api.openai.com/*`, `https://generativelanguage.googleapis.com/*`, `https://openrouter.ai/*`, `http://localhost/*`, `http://127.0.0.1/*`. Chrome match patterns do not accept `localhost:*`; `http://localhost/*` is the publishable pattern that still matches any localhost port for Ollama.
- `web_accessible_resources` block removed — no module currently imports `lib/docxtemplater.js`, and extension pages can always load their own resources without this declaration

**`lib/docxtemplater.js` note:** This file is present in the repo but is not imported by any current module (`renderer.js`, `drafting.js`, `extraction.js`, etc. all use native JS). If docxtemplater is ever needed in the future, add back `web_accessible_resources` — but only if a content script needs to expose the file to a web page. Extension pages do not require it. Do not add `<all_urls>` back as the match; use the narrowest match that covers only the pages that genuinely need it.

**`content.js` changes:** Added `window.__jpdaContentInjected` guard to prevent duplicate `onMessage` listeners if `executeScript` is called more than once on the same tab. Updated header comment to make clear page content is only read after an explicit user action.

**`background.js` changes:** Added `isRestrictedUrl()` helper and `captureTab()` helper. Context menu handler now checks for restricted pages first (returns a user-friendly error object), then always injects `content.js` then sends `CAPTURE_CONTENT` — replacing the old try-send-catch-inject-retry pattern. Removed `allFrames: true` (main frame only is correct).

**`dashboard.js` changes:** Added `isRestrictedUrl()` helper. `scanCurrentPage()` now checks the URL before attempting injection, shows specific error messages for restricted pages vs injection failures vs null responses.

**Ollama help modal update:** Added a fourth troubleshooting bullet explaining that only `localhost` / `127.0.0.1` Ollama endpoints are supported — remote/LAN Ollama endpoints are blocked by Chrome because the extension's host permissions do not cover arbitrary IPs.

**Files changed:** `manifest.json`, `content.js`, `background.js`, `dashboard/dashboard.js`, `settings/settings.html`

---

### 29. Apply Changes button disabled until text is entered (Session 3 — 2026-05-13)

The "Apply Changes" button in the Refine card was always visually active once a draft existed, even with an empty textarea. This was a false affordance.

**Fix:** `refreshRevisionButton()` now controls the button state. It disables the button unless both conditions are true: (a) a draft exists for the current tab, and (b) the revision textarea contains non-whitespace text. An `input` listener on `#field-revision` calls `refreshRevisionButton()` on every keystroke so the button activates and deactivates in real time. After a successful `applyRevision()` the textarea is cleared and `refreshRevisionButton()` is called to re-disable the button immediately.

**Files changed:** `dashboard/dashboard.js`

---

### 30. Overwrite confirmation before generation (Session 3 — 2026-05-13)

If the user clicks a generation button (Resume, Cover Letter, or Both) while a draft already exists for the targeted document type, a confirmation dialog now appears before the generation runs, preventing accidental overwrites.

**Implementation:** `confirmOverwrite(mode)` checks `state.drafts` for the relevant type(s). If a draft is found, it calls native `window.confirm()` with a clear message. The generation only proceeds if the user confirms. The three generation button handlers in `bindEvents()` were updated to use this guard.

**Files changed:** `dashboard/dashboard.js`

---

## Files changed in Session 2

| File | Nature of change |
|---|---|
| `dashboard/dashboard.html` | Scan page button, removed mode badge |
| `dashboard/dashboard.css` | Overlay clip fix, scan button styles |
| `dashboard/dashboard.js` | Scan page, error button navigation, loadSettings() migration |
| `settings/settings.html` | OpenRouter option, Ollama guide link, API key toggle, saved key hint, tour button, Ollama help modal, confirm dialog, tour overlay |
| `settings/settings.css` | Key input wrap, toggle button, hint-saved-key, link-btn, tour styles, help modal styles, confirm dialog styles, tour btn embedded fix |
| `settings/settings.js` | OpenRouter models, per-provider storage, migration, save feedback, API links, Ollama help modal, settings tour (9 steps), confirm dialog, maskKey, updateSavedKeyHint |
| `modules/provider.js` | Added callOpenRouter() |
| `modules/errorMapper.js` | Ollama-specific error check, settingsSection field on all action:'settings' returns |
| `ROADMAP.md` | Created |
| `TROUBLESHOOTING.md` | Entries 7–12 added |

---

# Session 1 (original)

**Session type:** Design audit + full redesign + feature development + bug fixes

This document covers everything built or changed in this session. Read it before starting any new work to avoid duplication.

---

## What was done

### 1. Full UI/Design redesign (impeccable skill)

The entire UI was audited (scored 19/40 on Nielsen heuristics) and fully redesigned. Every CSS file was rewritten from scratch.

**Design system established:**
- North star: "The Quiet Advisor" — warm parchment light mode, cool-tinted dark mode
- Primary accent: "Slate Tide" — `oklch(46% 0.10 195)` / approx `#2e7585`
- Typography: Plus Jakarta Sans (headings) + Inter (body)
- Colour strategy: Restrained — one accent ≤10%, never decorative
- Full OKLCH token system in `:root` with `@media (prefers-color-scheme: dark)` overrides
- `prefers-reduced-motion` support
- System files created: `PRODUCT.md`, `DESIGN.md`, `DESIGN.json`

**Files fully rewritten:** `dashboard/dashboard.css`, `settings/settings.css`

**Files targeted-edited:** `dashboard/dashboard.html`, `settings/settings.html`

**Banned patterns removed:** gradient logo, gradient buttons, glow shadows, bounce easing, `transition: all`, side-stripe borders, undefined CSS variable references

---

### 2. Bug fixes during/after redesign

See `TROUBLESHOOTING.md` for full details on each. Summary:

- **Settings page crash** — `id="provider-test-area"` had been removed from the HTML; JS crashed on init. Re-added.
- **Gemini 404** — stale model list included deprecated models. Updated `PROVIDER_MODELS.gemini` and `DEFAULT_MODELS.gemini`.
- **Broken CSS variables** — inline styles referenced `var(--error)`, `var(--bg)`, `var(--muted)` which no longer existed. Replaced with semantic classes.

---

### 3. Autofill improvements (settings/settings.js)

**Problem:** AI autofill after resume upload was checking `settings.provider` (saved state) rather than current form values, so it silently failed if the user hadn't explicitly saved their provider settings.

**Changes made:**
- Added `getEffectiveSettings()` — reads current form values first, falls back to saved settings (mirrors `testConnection` pattern)
- Added `attemptAutofill(statusEl)` — single entry point for autofill, uses `getEffectiveSettings()`
- Added `renderNoProviderStatus(statusEl)` — shows "Go to AI Provider" nav button + "Retry Auto-fill" button when no provider configured
- Added `renderSuccessStatus(statusEl)` — shows success message + "Re-run Auto-fill" button
- Added `renderErrorStatus(statusEl, message)` — shows error + "Retry Auto-fill" button
- Updated `populateSourceStatus()` — shows "Resume on file" + "Retry Auto-fill" on page load if resume already stored
- Updated `handleSourceResumeUpload` — calls `attemptAutofill(statusEl)` instead of inline logic
- Autofill now **auto-saves** profile after successful extraction (no manual save needed)
- Added **spinner animation** (`.autofill-spinner`) during AI processing
- Added `.btn-sm` utility class for inline buttons in the status area

**CSS additions in settings.css:** `.autofill-status` flex layout, `.autofill-spinner` keyframe animation, `.btn-sm`, `.profile-actions`, `.btn-danger-ghost`

---

### 4. Clear Profile button (settings)

Added a "Clear All" button alongside the "Save Profile" button at the bottom of the Profile section. Wrapped in `.profile-actions` flex container. Uses `.btn-danger-ghost` styling (neutral at rest, red on hover). Calls `clearProfile()` which empties all profile fields, saves the empty profile, and shows a toast.

---

### 5. Filename pattern chip builder (settings)

Replaced the plain text input for the filename pattern with an interactive chip builder:

- **Chip track** — draggable, removable chips representing active variables
- **Palette** — available variables shown as dashed "add" buttons below the track
- **Separator input** — configurable separator (defaults to ` - `)
- Drag and drop uses HTML5 native drag API
- Hidden `<input type="hidden" id="inp-filename-pattern">` is kept for backward compatibility — `saveDocuments()` and `updateFilenamePreview()` still read from it
- Existing saved patterns are parsed back into chips on load via `initChipBuilder()`

**New JS:** `ALL_CHIPS`, `activeChips`, `initChipBuilder()`, `syncPatternInput()`, `renderChipBuilder()`

**New CSS in settings.css:** `.chip-builder`, `.chip-track`, `.chip`, `.chip-remove`, `.chip-separator-row`, `.chip-palette`, `.chip-add`, `.chip-palette-label`

---

### 6. Console error pollution fix (dashboard.js)

`showError()` was using `console.error()` for all errors including expected validation messages ("no provider configured", "no job description"). Chrome's extension error panel captures all `console.error` calls.

Fixed: `showError()` now only calls `console.error` for genuine runtime errors where `err instanceof Error && mapped.action === 'retry'`. Validation messages use `console.warn` or are silent.

---

### 7. Stop/cancel button during generation

When the user clicks a Generate button, that button now transforms into a "■ Stop" button for the duration of generation. The other two generate buttons are disabled.

**Implementation:**
- `AbortController` created at the start of `runGeneration()`, stored in `currentAbortController`
- `signal` threaded through: `runGeneration` → `generateResume`/`generateCoverLetter` (drafting.js) → `callAI` (provider.js) → each provider's `fetch()` call
- `AbortError` caught in `runGeneration` catch block — shows "Generation stopped." toast, not an error
- `setGenerating()` transformed: in "on" state, the active button gets `data-original-text` stored, text changed to "■ Stop", `.btn-stop` class added; in "off" state all buttons restore
- Button click handlers check for `.btn-stop` class to decide stop vs. generate
- Added `stopGeneration()` function
- Added `.btn-stop` CSS (danger-subtle background, danger text/border, deeper danger on hover)

**Files changed:** `dashboard/dashboard.js`, `dashboard/dashboard.css`, `modules/drafting.js`, `modules/provider.js`

---

### 8. Quick Download removed

The "Quick Download" section (html2pdf-based direct PDF download) was removed because output quality was unreliable.

**Removed:**
- `btn-save-resume` and `btn-save-cl` buttons and hint from `dashboard.html`
- `savePdf()` function from `dashboard.js`
- `loadPdfLib()` function and `_pdfLibLoaded` state
- `dom.btnSaveResume` and `dom.btnSaveCL` refs
- `buildFilename`/`downloadBlob` import (now unused)
- `.export-divider` CSS

**Renamed:** Card heading "Export" → "Save as PDF". Buttons simplified to "Resume + Cover Letter", "Cover Letter Only", "Merged Document" — the card heading now carries the "Save as PDF" context instead of each button.

---

### 9. Draft persistence across panel close/reopen

Generated drafts previously vanished when the side panel was closed. Now they persist.

**How it works:**
- After each successful generation, `chrome.storage.local.set({ savedDraft: { drafts, jobData, lastRunMode, templateId, accentColor, spacingMode } })` is called
- On `init()`, `chrome.storage.local.get(['savedDraft'])` is checked before `loadSession()`. If a saved draft exists, `restoreSavedDraft()` repopulates all fields, restores style controls, shows merged tab if applicable, and re-renders previews via `updatePreviews()`
- The "New" button calls `clearSession()` which removes `savedDraft` from storage and resets all UI state
- If new job page data arrives via context menu (`loadSession`), the job fields update but the old draft remains visible until the user generates or clicks New — this is intentional

**New functions:** `restoreSavedDraft(saved)`, `clearSession()`

---

### 10. "New" button added to header

A "New" button was added to the dashboard header (left of the ? and ⚙ buttons). Muted styling at rest (transparent border, grey text), turns red on hover to signal destructive intent.

**Final header button order (left to right):** `[New] [?] [⚙]`

Rationale: ⚙ rightmost is universal convention. New is a recurring workflow action. ? is a one-time onboarding tool.

---

### 11. Feature tour (9-step)

A guided highlight tour was added triggered by the "?" button in the header.

**Steps (in order):**
1. `#card-job-info` — Job Info
2. `#card-job-desc` — Job Description
3. `#card-template` — Style
4. `#card-generate` — Generate
5. `#card-drafts` — Preview
6. `#card-revision` — Refine
7. `#card-save` — Save as PDF
8. `#btn-settings` — Settings
9. `#btn-new-draft` — New Draft

**Implementation:**
- Full-screen overlay (`z-index: 10000`) blocks page interaction
- Spotlight div (`z-index: 10001`, `pointer-events: none`) uses `box-shadow: 0 0 0 9999px oklch(0% 0 0 / 0.62)` to darken everything except the target, with a teal outline matching the accent
- Tooltip card (`z-index: 10002`) positions below target by default, above if no room below, clamped to viewport edges
- `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` runs before positioning, with a 320ms settle delay
- `borderRadius` of spotlight is taken from `getComputedStyle(targetEl).borderRadius` for accurate matching
- Keyboard: `→`/`←` to navigate, `Escape` to exit
- Settings overlay is closed if open when tour starts

**New HTML:** `#tour-overlay`, `#tour-spotlight`, `#tour-tooltip`, `#tour-btn-skip/prev/next`, `#btn-tour`

**New CSS:** `.tour-overlay`, `.tour-spotlight`, `.tour-tooltip`, `.tour-step-count`, `.tour-title`, `.tour-body`, `.tour-nav`, `.tour-btn-*`, `.header-tour-btn`

**New JS:** `TOUR_STEPS`, `tourIndex`, `startTour()`, `showTourStep()`, `positionTourElements()`, `endTour()`, `tourKeyHandler()`

---

### 12. Icon and branding rename

**App name changed:** legacy names were replaced with "Job Application Assistant" everywhere:
- `manifest.json` — `name` and `action.default_title`
- `dashboard/dashboard.html` — `<title>` and `.app-name` span
- `settings/settings.html` — `<title>` and `.page-subtitle`

**Logo mark changed:** The "DA" text div in both HTML files was replaced with `<img src="../icons/icon48.png" class="logo-mark" ...>`. CSS `.logo-mark` was stripped of background/text/flex styles and simplified to width + height + border-radius + `object-fit: cover`.

**Action required (not yet done by agent):** The user needs to replace the three files in `icons/` with their new icon exported at 16×16, 48×48, and 128×128 px. The manifest already references the correct paths — only the image files need replacing.

---

### 13. Back arrow alignment fix (settings overlay)

The `←` glyph in the "← Dashboard" back button was sitting slightly low relative to the "Dashboard" text due to the arrow character's font metrics.

**Fix:** `.back-btn span { line-height: 1; position: relative; top: -1px; }` in `dashboard.css`.

---

### 14. Welcome onboarding now drives AI setup

The first-run welcome modal is now a 2-step flow:

1. Welcome/value message under the app name **Job Application Assistant**
2. AI setup explanation with direct actions for AI Provider Settings and Demo Mode

The old support/donate CTA was removed from the modal. "Maybe later" only closes the modal for the current view. Persistent completion is controlled by `chrome.storage.local.aiProviderSetupSaved`, which is set when:
- the user saves AI settings
- existing non-mock provider settings are detected (`ollama` or a cloud provider with an API key)
- the user types a non-empty API key in AI Provider settings

Demo Mode remains available but secondary. Generation/revision/ATS actions now show a setup-required prompt with "Open AI Provider Settings" and "Use Demo Mode" when no provider is configured.

---

### 15. Help & Feedback settings section

Added a new Settings nav item: **Help & Feedback**.

It contains a no-backend feedback form that opens the user's email app through `mailto:mwake.dev@gmail.com` with a prefilled subject/body. Fields:
- Type: Bug report, Feature request, General feedback
- Message
- Optional contact email
- Optional safe diagnostics

Diagnostics include app version, provider name, Demo Mode status, active settings page, and browser user agent. They do not include API keys, resumes, profile content, generated drafts, or job descriptions.

---

### 16. Settings tour split by active page

The Settings `?` button now loads a tour based on the active settings section instead of running one long cross-page tour.

Tour groups:
- `provider` - AI provider, model, connection test, save settings
- `documents` - default document mode, filename chips, preview, save
- `profiles` - manage profiles, active profile, add profile, jump to My Profile
- `profile` - upload/manual setup, contact details, skills, experience, Do Not Claim, save
- `feedback` - feedback type, message, reply email, diagnostics, open email

This keeps tours focused and prevents the Settings tour from feeling overwhelming.

---

### 17. Dashboard tour blur polish

The main dashboard feature tour now uses four `tour-blur-panel` elements around the spotlight. The target element remains clear while the surrounding UI is softly blurred and dimmed. The existing spotlight, tooltip positioning, keyboard controls, and tour copy remain unchanged.

---

### 18. Final branding cleanup

The remaining packaged legacy name references were removed. Notably:
- `background.js` context menu title is now **Job Application Assistant**
- `README.md`, `DESIGN.md`, `DESIGN.json`, CSS comments, and handover text no longer contain the old app name

`manifest.json` was already correct. If Chrome Web Store still shows the old name after uploading a fresh zip, check the Web Store listing metadata in the Developer Dashboard.

---

### 19. Chrome Web Store localhost permission fix

Chrome Web Store rejected the old localhost host permission patterns because Chrome match patterns do not accept `http://localhost:*/*` or `http://127.0.0.1:*/*`.

Updated `manifest.json` to use:
- `http://localhost/*`
- `http://127.0.0.1/*`

This remains compatible with local Ollama at `http://localhost:11434`, because Chrome treats `http://localhost/*` as matching any localhost port.

---

### 20. Ollama model detection in AI Provider settings

Added a small Ollama-only control in Settings -> AI Provider:
- Button: **Detect installed models**
- Calls the local Ollama `/api/tags` endpoint using the configured endpoint, defaulting to `http://localhost:11434`
- Populates the model dropdown with installed local models
- Selects the existing model if found, otherwise selects the first detected model
- Shows clear inline messages for no models, blocked access, or unreachable Ollama

The Ollama setup guide and provider tour copy now mention detection as the preferred path before falling back to manually typing the exact `ollama list` model name.

---

### 21. Ollama JSON reliability tuning

Updated `modules/provider.js` so Ollama requests are more suitable for the app's structured drafting workflow:
- Sends `think: false` to avoid Qwen-style thinking responses returning empty `message.content`
- Uses lower temperature for prompts that ask for JSON objects
- Sends Ollama `format: "json"` when the prompt expects a JSON object

This should reduce failures like "AI returned invalid content format for cover-letter" from small local models, while leaving cloud providers unchanged.

---

### 22. Draft JSON normalization before rendering

Added dashboard-side normalization for AI draft JSON before it is saved to `state.drafts` or rendered:
- Resume drafts now default missing list fields (`experience`, `education`, `skills`, `projects`, etc.) to arrays
- Cover letter drafts now accept either the direct cover-letter shape or a nested `content` object
- Cover letter body strings are converted into paragraph arrays when possible
- Badly shaped cover-letter output now fails with the existing friendly invalid-format error instead of crashing template rendering with errors like `Cannot read properties of undefined (reading 'length')`
- The same normalization is applied to revision responses

---

### 23. Ollama long-running generation status messages

Added provider-aware waiting messages for dashboard generation. Cloud providers still use the concise default messages. When the active provider is Ollama, the status text now updates if a stage takes longer:
- immediate: tailoring resume / writing cover letter
- after 15 seconds: explains local AI is working and Ollama can take a minute or two
- after 45 seconds: reassures that larger inputs and local models can take longer
- after 90 seconds: reminds the user they can stop the run and try a smaller model

Timers are cleared whenever a stage finishes, the run stops, or an error is shown.

---

### 24. Dashboard left-column scrollbar/layout polish

Adjusted the dashboard left column so the scrollbar no longer sits directly on top of card edges:
- Added right padding, bottom padding, hidden horizontal overflow, and `scrollbar-gutter: stable`
- Let the Job Info header wrap its scan/clear controls onto their own row inside the card
- Truncated the source indicator so the Scan page and Clear buttons remain visible at wider side-panel sizes

---

### 25. Save as PDF success-button tone

Reviewed the Save as PDF section against the design system. Green is intentional for terminal export/save actions (`--color-success`), but the previous implementation made every export button solid green, which over-weighted the section visually.

Updated `.btn-confirm` to use a success-subtle background with success text/border by default, then fill solid green on hover/focus interaction. This preserves the export-ready semantic while keeping the section consistent with the quieter dashboard tone.

---

### 26. Dashboard right-column scrollbar/layout polish

Mirrored the left-column scrollbar treatment on the dashboard right column:
- Added right padding, bottom padding, hidden horizontal overflow, and `scrollbar-gutter: stable`
- Added `scrollbar-gutter: stable` to the document preview scroller so the preview scrollbar does not crowd the card edge

---

### 27. Ollama resume auto-fill reliability fixes

Investigated a user-reported DOCX import / AI auto-fill failure with local Ollama:
- Machine had Ollama running at `http://localhost:11434`
- Installed model was `qwen2.5:3b`
- Small `/api/chat` requests succeeded, but long resume-style prompts could run for several minutes or fail with Ollama 500s

Changes applied:
- `modules/extraction.js` now shortens resume text for Ollama profile extraction to a bounded head/tail excerpt (`OLLAMA_RESUME_TEXT_LIMIT = 9000`) instead of sending the entire extracted resume text to a small local model.
- `modules/provider.js` now reads Ollama error response bodies and includes the actual model/server error instead of only `Internal Server Error`.
- `modules/errorMapper.js` now maps Ollama memory/context errors to clearer user-facing messages.
- `settings/settings.js` now maps auto-fill errors through `mapError()` and shows long-running Ollama auto-fill status updates at 15/45/90 seconds.

Verified with `node --check` on changed JS files and a real local Ollama smoke test returning `Connected`.

---

### 28. Dashboard profile navigation promoted to header

Moved profile access from the left-column workflow area into the dashboard header:
- Active profile chooser is now a header control labeled **Profile Select**
- **Manage Profiles** and **My Profile** are direct header buttons
- Removed the old left-column profile strip and the ambiguous **Manage** button
- Dashboard Settings overlay title now changes based on section (`AI Provider`, `Manage Profiles`, `My Profile`, etc.)
- Generation error recovery now uses clearer button labels such as **Open My Profile**
- Dashboard tour copy was updated for the new profile controls

Product rationale: profile selection and profile editing are prerequisites for generation, so they should be accessible from the main dashboard, not hidden behind a settings/manage button.

---

### 29. Ollama settings friction and setup guide updates

Reduced setup friction in Settings -> AI Provider for Ollama:
- Local Endpoint field now visibly defaults to `http://localhost:11434` instead of using placeholder-only text
- Helper copy explains that this is the common default and should only be changed for a different local configuration
- Ollama Setup Guide now starts with **Step 1 - Download and install Ollama**
- Added official download link: `https://ollama.com/download`
- Existing CORS/model/verification steps were renumbered
- Troubleshooting CORS copy now points back to the new CORS step

---

### 30. Settings section tours now auto-run once per section

Settings tours now behave per section:
- Each section (`provider`, `documents`, `profiles`, `profile`, `feedback`) auto-runs the first time the user enters it
- Works when reached through Settings nav or dashboard buttons such as **Manage Profiles** and **My Profile**
- Seen flags are stored in `chrome.storage.local` under `settingsTourSeenSections`, so browser/app/computer restarts do not replay completed auto tours
- Manual `?` help still always replays the current section tour
- Each section tour gets a final step pointing at the `?` help icon with copy explaining that the page tour can be rerun there
- A request guard prevents a stale tour from starting if the user changes Settings sections quickly

Important detail: a section is marked seen when its tour starts, not only when it completes. If a user skips the tour, it still will not auto-run again.

---

### 31. Dashboard tone slider thumb fix

Fixed the Writing -> Tone range slider so the thumb visually reaches both ends of the track:
- Added explicit WebKit and Firefox track/thumb CSS
- Increased range input hit height while keeping the visual track 4px
- Used a negative WebKit thumb margin to center the thumb on the true track endpoints

---

### 32. Naming consistency for profiles

Standardized profile-management copy:
- Dashboard button: **Manage Profiles**
- Settings nav: **Manage Profiles**
- Settings section heading: **Manage Profiles**
- Dashboard active chooser label: **Profile Select**
- Tour and overlay copy updated to use the same language

---

## Files changed this session

| File | Nature of change |
|---|---|
| `dashboard/dashboard.html` | Targeted edits throughout |
| `dashboard/dashboard.css` | Full rewrite + additions throughout session |
| `dashboard/dashboard.js` | Major additions: tour, persistence, stop button, error fix |
| `settings/settings.html` | Targeted edits throughout |
| `settings/settings.css` | Full rewrite + additions throughout session |
| `settings/settings.js` | Autofill refactor, chip builder, clear profile, Gemini model fix, Ollama endpoint default, per-section one-time tours |
| `modules/provider.js` | Added `signal` parameter to `callAI` and all provider fetch calls; added Ollama error-body reporting |
| `modules/extraction.js` | Added Ollama resume-text shortening for local auto-fill reliability |
| `modules/errorMapper.js` | Added clearer Ollama memory/context errors and updated missing-profile recovery copy |
| `modules/drafting.js` | Added `signal` parameter to `generateResume`, `generateCoverLetter`, `reviseDraft` |
| `manifest.json` | Name and default_title updated |
| `PRODUCT.md` | Created (impeccable teach flow) |
| `DESIGN.md` | Created (impeccable document flow) |
| `DESIGN.json` | Created (Google Stitch format sidecar) |
| `AGENT.md` | Created this session |
| `TROUBLESHOOTING.md` | Created this session |
| `SESSION_HANDOVER.md` | This file |

## Pending / not yet done

- **Icon image replacement** — user has the new icon image but needs to export it at 16/48/128px and drop into `icons/` directory, overwriting `icon16.png`, `icon48.png`, `icon128.png`
