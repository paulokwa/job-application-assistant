# Session Handover — Job Application Assistant

**Last updated:** 2026-05-13 (Session 4 — Dashboard features, multi-profile, settings polish)

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
- `host_permissions` replaced `<all_urls>` with five specific entries: `https://api.openai.com/*`, `https://generativelanguage.googleapis.com/*`, `https://openrouter.ai/*`, `http://localhost:*/*`, `http://127.0.0.1:*/*`
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

**App name changed:** "Draft Assistant" / "Job Page Draft Assistant" → "Job Application Assistant" everywhere:
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

## Files changed this session

| File | Nature of change |
|---|---|
| `dashboard/dashboard.html` | Targeted edits throughout |
| `dashboard/dashboard.css` | Full rewrite + additions throughout session |
| `dashboard/dashboard.js` | Major additions: tour, persistence, stop button, error fix |
| `settings/settings.html` | Targeted edits throughout |
| `settings/settings.css` | Full rewrite + additions throughout session |
| `settings/settings.js` | Autofill refactor, chip builder, clear profile, Gemini model fix |
| `modules/provider.js` | Added `signal` parameter to `callAI` and all provider fetch calls |
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
