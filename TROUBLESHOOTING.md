# Troubleshooting — Job Application Assistant

Resolved technical issues that could recur. Features and intentional behaviour are not documented here.

---

## 1. Settings page crashes on load — nothing works

**Symptom:** Opening Settings shows blank sections. The model dropdown is empty, the Documents and Profile nav buttons do nothing, and the API key field never appears.

**Root cause:** `settings/settings.js` calls `$('provider-test-area').style.display = ...` near the top of `init()`. If an element with `id="provider-test-area"` does not exist in the DOM, this throws a TypeError that crashes the entire `init()` function — all subsequent wiring is skipped silently.

**Fix:** Ensure the div wrapping the Test Connection button has `id="provider-test-area"` in `settings/settings.html`:
```html
<div id="provider-test-area" class="test-area">
  <button id="btn-test-provider" ...>Test Connection</button>
  ...
</div>
```
Do not remove this ID. It is not purely visual — JS depends on it.

---

## 2. Gemini API returns 404 on generation

**Symptom:** Generation fails with `Gemini error 404` immediately after clicking Generate with a Gemini provider.

**Root cause:** The model name stored in settings references a deprecated or renamed Gemini model (e.g. `gemini-2.0-flash-001` which was deprecated for new API keys). The 404 response body from Google's API lists valid models for the key.

**Fix:** In `settings/settings.js`, `PROVIDER_MODELS.gemini` should only list currently available models. As of the last update, valid models are:
```js
gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']
```
The `DEFAULT_MODELS.gemini` default is `'gemini-2.5-flash'`. If users see 404, have them go to Settings → AI Provider, re-select Gemini, pick a model from the dropdown, and save.

Note: `provider.js` already has a 404 fallback that fetches the list of valid models from the API and appends them to the error message, helping users self-diagnose.

---

## 3. CSS variables undefined — UI shows broken colours

**Symptom:** Elements render with missing background, wrong colour, or invisible text. Usually affects the autofill status bar, error hints, or inline-styled elements in settings.

**Root cause:** Old inline styles or legacy class references used variable names that no longer exist after the CSS redesign. Common mismatches:

| Wrong (old) | Correct (current) |
|---|---|
| `var(--error)` | `var(--color-danger)` |
| `var(--bg)` | `var(--color-canvas)` or `var(--color-surface)` |
| `var(--bg-base)` | `var(--color-canvas)` |
| `var(--muted)` | `var(--color-ink-3)` |
| `var(--text-muted)` | `var(--color-ink-3)` |
| `var(--accent)` | `var(--color-accent)` |

**Fix:** Replace any inline `style="color: var(--error)"` etc. with semantic CSS classes. For danger/error text use `class="field-hint field-hint--danger"`. For the autofill status container use `class="autofill-status"`. Never add new inline styles referencing CSS variables — use classes defined in the relevant CSS file instead.

---

## 4. Chrome extension error panel shows "[JPDA] Error: AI provider not configured"

**Symptom:** Chrome's extension error panel (`chrome://extensions` → Errors) logs an error every time the user clicks Generate without a provider configured. This is not a crash — the dashboard UI shows the error correctly — but it pollutes the error panel.

**Root cause:** `showError()` in `dashboard/dashboard.js` was using `console.error()` for all errors including expected validation messages. Chrome's extension error monitor captures all `console.error` calls regardless of severity.

**Fix (already applied):** `showError()` now only calls `console.error` for genuine unexpected runtime errors (where `err instanceof Error` and `mapped.action === 'retry'`). Validation messages use `console.warn` or are silent. Do not revert this to a blanket `console.error`.

---

## 5. AI autofill does not trigger after resume upload despite a valid API key

**Symptom:** After uploading a source resume in Settings → My Profile, the status bar shows "Configure an AI provider to enable auto-fill" even though the API key has been tested and shows Connected.

**Root cause:** `handleSourceResumeUpload` was checking `settings.provider` — the module-level variable loaded from `chrome.storage.sync` at page init. If the user tested their key but had not yet clicked "Save AI Settings", `settings.provider` was still empty/stale and autofill was skipped.

**Fix (already applied):** Autofill now calls `getEffectiveSettings()` which reads the current form values first (same pattern as `testConnection`), falling back to the saved `settings` object. This means autofill works as soon as the provider is selected and a key is entered, without requiring an explicit save.

If this symptom recurs, check that `getEffectiveSettings()` is being called instead of `settings` being read directly in `attemptAutofill`.

---

## 6. Generated draft lost when extension panel is closed

**Symptom:** User generates a resume and cover letter, closes the side panel, reopens it — all generated content is gone and they must regenerate.

**Root cause:** The Chrome side panel tears down its DOM when closed. All in-memory state (`state.drafts`, `state.jobData`, etc.) is lost.

**Fix (already applied):** After each successful generation, `dashboard.js` saves a `savedDraft` object to `chrome.storage.local` containing the draft JSON, job data, and style choices. On `init()`, if `savedDraft` exists, `restoreSavedDraft()` is called to repopulate all fields and re-render the previews before `loadSession()` runs.

The "New" button in the header explicitly removes `savedDraft` from storage and resets all state. If persistence stops working, check that `chrome.storage.local.set({ savedDraft: { ... } })` is still being called inside `runGeneration` after `showToast('✨ Drafts ready!')`.

---

## 7. OpenRouter returns 404 for certain models

**Symptom:** Generation fails with `OpenRouter error 404: No endpoints found for <model-id>`.

**Root cause:** Free-tier OpenRouter models (IDs ending in `:free`, e.g. `meta-llama/llama-3.1-8b-instruct:free`) are periodically removed or rate-limited at the routing level and return a 404 with no stream.

**Fix (already applied):** The model list in `settings.js` `PROVIDER_MODELS.openrouter` uses only stable paid model IDs (no `:free` suffix). If a new 404 appears after an OpenRouter model change, replace the offending model ID with a current one from `openrouter.ai/models`. Do not add `:free` variants back to the list.

---

## 8. Ollama CORS error shows "API key appears to be missing or invalid"

**Symptom:** When Ollama is running but the `OLLAMA_ORIGINS` environment variable is not set, the extension shows "❌ Failed: The API key appears to be missing or invalid." This is the wrong message.

**Root cause:** `errorMapper.js` had a generic check for `msg.includes('403')` that caught Ollama's CORS 403 before the Ollama-specific handler. The generic handler mapped any 403 to the "invalid API key" message.

**Fix (already applied):** An Ollama-specific block runs before the generic 401/403 check. It detects `msg.includes('ollama error')` first, then branches on 403 (CORS), 404 (model not found), or generic Ollama error. The correct message is "Ollama blocked the request (CORS)..." with instructions to set `OLLAMA_ORIGINS=chrome-extension://*`.

If the wrong message reappears, verify the Ollama check comes before the generic `if (msg.includes('401') || msg.includes('403'))` block in `errorMapper.js`.

---

## 9. Settings tour tooltip goes off-screen on last step (or any bottom-anchored element)

**Symptom:** On step 9 of the settings tour (targeting `#btn-save-profile` near the bottom of the page), the tooltip renders partially or fully outside the visible viewport. Smooth scrolling was not finished before the tooltip was positioned.

**Root cause:** The tour used `scrollIntoView({ behavior: 'smooth' })` followed by a fixed 320ms delay. During smooth scroll animation, the element is still moving — `getBoundingClientRect()` returns a mid-animation position, so the tooltip is placed wrong.

**Fix (already applied):** Changed to instant scroll (`scrollIntoView({ block: 'nearest' })`) with a second pass using `{ block: 'center' }` if the element bottom is too close to the viewport edge. Positioning runs in `requestAnimationFrame(() => requestAnimationFrame(...))` (double rAF) to ensure the layout has fully committed before measuring.

If the issue recurs, verify the `requestAnimationFrame × 2` pattern is intact in `showSettingsTourStep()` and that `behavior: 'smooth'` has not been reintroduced.

---

## 10. Save Profile button invisible at bottom of settings overlay

**Symptom:** When Settings is opened as an overlay iframe from the dashboard, the page content is scrollable but the "Save Profile" button at the very bottom is never reachable — scrolling stops before it.

**Root cause:** `.overlay-content { height: 100% }` gave the iframe container 100% of the overlay height. But `.overlay-header` (the "← Dashboard" bar) sits above it and is not subtracted, so `.overlay-content` overflows the overlay by the header's height. The clipped region contains the Save Profile button.

**Fix (already applied):** Changed `.settings-overlay` to `display: flex; flex-direction: column` and `.overlay-content` to `flex: 1; min-height: 0`. The content area now fills only the remaining height after the header, regardless of header pixel size.

Do not revert `.overlay-content` back to `height: 100%` — this will break the scrollable area again.

---

## 11. Settings tour "?" button not right-aligned in embedded (overlay) mode

**Symptom:** In the dashboard's Settings overlay, the nav renders as a horizontal row. The "?" tour button appeared left-aligned with the other nav buttons instead of pushed to the right end.

**Root cause:** `.settings-tour-btn { margin-top: auto }` works to push a flex-child to the bottom of a column layout, but has no effect in a row layout (`margin-top: auto` does nothing in a row direction).

**Fix (already applied):** Added `body.embedded .settings-tour-btn { margin-top: 0; margin-left: auto; flex-shrink: 0; }` in `settings.css`. `margin-left: auto` pushes the button to the right end of a flex row.

---

## 12. Nav click handler fires on the tour "?" button and throws an error

**Symptom:** Clicking the "?" tour button in the settings nav caused a JS error: `Cannot read properties of null (reading 'classList')` from `$('section-undefined').classList.add('active')`.

**Root cause:** The nav event listener was bound to `.querySelectorAll('.nav-btn')`, which matched all elements with that class — including the tour button, which has no `data-section` attribute. The handler tried `$('section-' + undefined)` which returned null.

**Fix (already applied):** Changed the selector to `.querySelectorAll('.nav-btn[data-section]')` so only buttons with an explicit section attribute receive the click handler. Do not broaden this selector back to `.nav-btn` without adding a guard for missing `data-section`.

---

## 13. Ollama auto-fill fails with 500 or takes several minutes after DOCX import

**Symptom:** After uploading a DOCX resume and running profile auto-fill with Ollama, the UI shows an error like `Ollama error 500: Internal Server Error`, or appears to run for several minutes on a small local model such as `qwen2.5:3b`.

**Root cause:** The DOCX import could send the entire extracted resume text plus the full JSON schema to a local model with a small context window. On low-memory machines or small models, this can cause very slow generation, context pressure, memory pressure, or opaque Ollama 500 responses. The provider wrapper also discarded Ollama's response body, hiding useful details.

**Fix (already applied):**
- `modules/extraction.js` shortens resume text for Ollama auto-fill to a bounded head/tail excerpt.
- `modules/provider.js` reads the Ollama error response body before throwing.
- `modules/errorMapper.js` maps memory/context Ollama failures to clearer guidance.
- `settings/settings.js` shows long-running Ollama auto-fill status messages and maps auto-fill errors through `mapError()`.

If this recurs, verify `prepareResumeTextForProfileExtraction()` is still used before calling `callAI()` for resume auto-fill, and verify `readOllamaError()` is still called in `callOllama()` for non-OK responses.

---

## 14. Settings page tours auto-run more than once

**Symptom:** A Settings section tour auto-runs again after closing/reopening the extension, restarting Chrome, or rebooting the computer.

**Root cause:** The one-time section tour state should be stored persistently in `chrome.storage.local`, not in memory. If the storage key is renamed, cleared, or bypassed, the app will think the section has never been toured.

**Fix (already applied):** `settings.js` stores section tour flags under `settingsTourSeenSections` in `chrome.storage.local`. `scheduleSettingsTourIfFirstVisit(section)` reads that object before auto-starting a tour. `markSettingsTourSeen(section)` writes `{ [section]: true }` when a tour starts.

Expected behavior:
- Each Settings section auto-runs once only.
- Skipping a tour still counts as seen because the flag is set when the tour starts.
- Manual `?` help ignores the seen flag and can replay the current page tour anytime.

If this recurs, check for accidental removal of `SETTINGS_TOUR_SEEN_KEY`, `scheduleSettingsTourIfFirstVisit()`, or `markSettingsTourSeen()`.

---

## 16. Autofill fix for one ATS breaks another that was already working

**Symptom:** After fixing autofill for a new ATS (e.g. Lever, Greenhouse, iCIMS), a previously working platform — particularly Workday — stops correctly filling certain fields. Date fields, location fields, or multi-section grouping may regress.

**Root cause:** The fix modified a general matcher (a signal term list, a regex, or a grouping threshold) that is shared across all ATS platforms. The autofill matcher is purely signal-based — general matchers fire on any ATS whose DOM happens to match. Broadening a general matcher to handle site X can silently collide with signals from Workday or other already-working sites.

**The rule — must be followed for every ATS fix:**

> **New ATS quirks get their own specific matchers using that ATS's unique DOM signals (id fragments, unique placeholders, unique aria-label values). Never fix an ATS-specific problem by modifying an existing general matcher.**

Workday-specific matchers are the reference example: `datesectionmonth` and `datesectionyear` id fragments appear only in Workday's DOM. Those matchers will never fire on any other ATS. Each new platform should follow the same pattern — identify a signal that is unique to that ATS and write a scoped matcher for it. General matchers (start date, end date, employer, city, etc.) must stay general and must not be made more permissive to accommodate a specific ATS.

**How to identify an ATS-safe signal:**
1. Open the ATS form and inspect the failing field — look at `id`, `name`, `placeholder`, `aria-label`, and nearby label text.
2. Identify a string that is unique to that ATS (e.g. a product-specific id prefix or aria pattern).
3. Write a new matcher at the bottom of the relevant matcher group using `hasSignal(f, '<unique-signal>')`.
4. Confirm the new matcher's `test` function cannot fire on a standard field by checking it against the Workday test form (`tests/autofill-multi-employment.html`) and any other existing test fixtures.

**Files to review before any autofill matcher change:**
- `modules/autofillMatcher.js` — full matcher list; Workday-specific matchers are annotated
- `tests/autofill-multi-employment.html` — multi-section grouping test form

---

## 17. Cover letter PDF export — last paragraph has extra space before the closing block

**Symptom:** When downloading or printing the cover letter as PDF, the gap between the last body paragraph and the closing block ("Sincerely," / name) is noticeably larger than the spacing between body paragraphs. The classic template shows a moderate extra gap; sidebar was the worst. In some templates the closing text also appeared the wrong size or colour compared to the body.

**Root cause (two compounding issues):**

1. `<p>` tags in all four `renderCoverLetter` functions only set `margin-bottom` via inline style, leaving the browser-default `margin-top: 1em` in place. Chrome's PDF/print renderer does not always collapse adjacent margins the same way the live browser preview does — instead of `max(marginA, marginB)` you get `marginA + marginB`. The last `<p>` was worst-hit because its uncollapsed bottom margin added to the container's own `margin-bottom`, then the closing block's `margin-top` stacked on top as well.

2. Sidebar's `.main-content` uses `display: flex; flex-direction: column; gap: 20pt`. The flex `gap` adds to any `margin-top` on a flex child, so the closing block's `margin-top: 40pt` + `gap: 20pt` = 60pt total, versus 15pt between body paragraphs.

**Fix (applied `8639d41`):**
- All `<p>` tags changed to `margin: 0 0 Xpt 0` (reset top margin) and the last `<p>` gets `margin: 0`.
- Paragraphs container `margin-bottom` removed where present (classic).
- Closing block `margin-top` reduced per template to give ~1.3× inter-paragraph spacing. Sidebar set to `margin-top: 0` so only the flex gap provides the spacing.
- Compact's closing changed from `<strong>` to `<div>` (closing text was rendering bold).
- Modern and sidebar closing text given explicit `font-size: 10.5pt` and body text colour to match paragraphs.

**If this recurs:** Check whether the affected template's parent container uses a flex `gap` — if so, the closing block `margin-top` must account for it (or be set to 0 and rely on the gap alone).

---

## 18. New resume JSON field silently dropped after AI generation

**Symptom:** A new field is added to the resume schema and the AI prompt, the AI returns it correctly, but it never appears in the rendered template. The field is present in the raw AI response but missing from `state.drafts.resume`.

**Root cause:** `normalizeResumeDraft()` in `dashboard/dashboard.js` rebuilds the parsed AI response as an explicit object, listing only known fields. Any field not in that explicit list is silently discarded before the draft is stored or rendered. The `normalizeResumeContent()` function in `modules/schema.js` is not called in this path.

**Fix:** Add the new field to the `return { ... }` block inside `normalizeResumeDraft()` in `dashboard.js`. Example — `headline` was added as `headline: String(parsed.headline || '')`.

**Rule:** Every new top-level resume field must be explicitly listed in `normalizeResumeDraft`. This is the single gate all AI resume output passes through. Adding it to `schema.js` alone is not sufficient.

---

## 15. Dashboard tone slider thumb does not reach track ends

**Symptom:** The Tone slider's round thumb appears inset from the left and right ends even when set to Formal or Casual.

**Root cause:** Browser default range input styling reserves thumb space inside the control. With only a styled input background, the visible thumb does not align with the visual track endpoints.

**Fix (already applied):** `dashboard.css` now styles `#range-tone::-webkit-slider-runnable-track`, `#range-tone::-webkit-slider-thumb`, `#range-tone::-moz-range-track`, and `#range-tone::-moz-range-thumb` explicitly. The WebKit thumb uses `margin-top: -5px` so its center aligns with the 4px track.

---

## 19. Scan job page says Chrome blocks scripts on a normal job posting

**Symptom:** Clicking "Scan job page" on a normal HTTPS job posting, such as an Indeed listing, shows a script-injection failure message even though the page is not a PDF, browser settings page, or Chrome Web Store page.

**Root cause:** The extension intentionally uses Chrome's temporary `activeTab` access instead of permanent access to every website. Chrome can revoke that temporary access after an unpacked-extension reload, tab navigation, or reopening the side panel from a different tab. A failed `chrome.scripting.executeScript()` call on a normal web page does not necessarily mean the site permanently blocks extensions.

**Fix (already applied):**
- Known restricted page types keep the blocked-page message.
- Injection failures on ordinary web pages show a reconnect message: reload the job page, reopen the extension from the toolbar, and try again.
- The Job Info card keeps a persistent recovery notice with numbered steps, a "Try Again" button, a context-menu fallback, and reassurance that saved profile data is unaffected.

**Deferred option:** `ROADMAP.md` records an opt-in optional host-permission experiment for common job sites such as Indeed. Do not add broad standing website access by default.

---

## 20. Fit Check shows misleading low scores from everyday job-posting words

**Symptom:** The old local Fit Check reports words such as "care", "everyone", "bring", or "vision" as missing and produces a score that differs sharply from the contextual AI review.

**Root cause:** Keyword overlap is too shallow for a useful application-fit decision. Normal posting language, branding copy, and broad nouns can dominate the missing-term list without representing meaningful qualifications.

**Fix (applied on `main` and included in the submitted v3.0 package):**
- Removed local keyword scoring, matched/missing chips, best-profile ranking, and the supporting search/listing detector.
- Removed the automatic Fit Check Documents setting.
- Made Fit Check AI-only and explicit: scan prepares context, while the user chooses whether to run AI Fit Check.
- Added three choices after scanned AI details are suggested: Cancel, Apply, and Apply + Fit Check.

**Rule:** Do not reintroduce local keyword-overlap scoring as a fallback. If no AI provider is configured, explain that AI Fit Check requires provider setup.
