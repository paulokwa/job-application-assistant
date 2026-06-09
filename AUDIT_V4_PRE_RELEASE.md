# AUDIT_V4_PRE_RELEASE.md
**Job Application Assistant Chrome Extension — v4 Pre-Release Audit**
*Audit branch: `audit/v4-pre-release-readonly` · Date: 2026-06-09 · Auditor: Claude Sonnet 4.6*

---

## 1. Executive Summary

### Overall Release Readiness

The codebase is in good shape. The core v4 feature (tab-scoped sessions + profile proposal apply pipeline) is well-designed and the safety instrumentation — hallucination guards, sensitive field detection, proposal fingerprinting, and local-only storage — is thoughtful. The extension is close to v4-ready.

However, there are a small number of issues that need resolving before shipping:

1. **The manifest version has not been bumped** — it still reads `3.0.0`. This is required to publish as v4.
2. **A "use new information" instruction in `reviseDraft` directly contradicts the hallucination guard** — AI may invent qualifications during a non-ATS revision.
3. **`reviseDraft` does not pass an abort signal** — the generation cancel button does nothing during a Refine operation.
4. **Three critical session constants are duplicated between `background.js` and `dashboard.js`** — a divergence would silently break tab-scoped state routing.
5. **The Gemini API key is embedded in the request URL** — it is visible in DevTools and potentially in server-side access logs.

Everything else ranges from high-priority cleanups to medium maintainability improvements. None of those are blocking on their own, but several are worth addressing before v4 goes out.

### Top 5 things to fix before release

| # | What | File(s) | Why it blocks |
|---|------|---------|---------------|
| 1 | Bump manifest version to `4.0.0` | `manifest.json` | CWS will reject a v4 zip that still says `3.0.0` |
| 2 | Remove "use new information" loophole from `reviseDraft` system prompt | `modules/drafting.js:251` | AI may invent qualifications during any revision, contradicting the core product promise |
| 3 | Pass `signal` to `callAI` in `reviseDraft` | `modules/drafting.js:268` | Cancel button is broken for all Refine operations |
| 4 | De-duplicate the three session constants | `background.js:6-8` / `dashboard.js:47-69` | Silent breakage if they diverge during future edits |
| 5 | Document/warn users about Gemini URL key exposure | `modules/provider.js:92` | Privacy expectation mismatch; key appears in network logs |

### Safe to release?
**Conditionally yes** — fixes 1–3 are small and surgical. Fix 4 is medium-effort but low risk. Fix 5 can be a note in the UI rather than an architecture change. Address those five and v4 is safe to submit.

---

## 2. Findings Table

### A — Release Blockers

| ID | Severity | Category | File(s) | Description | User Impact | Code Evidence | Recommendation | Code Change? | Owner |
|----|----------|----------|---------|-------------|-------------|---------------|----------------|-------------|-------|
| A-01 | **Blocker** | Bug | `manifest.json:4` | Version still `"3.0.0"` — must be `"4.0.0"` for v4 release. The checklist explicitly lists this as `[WAITING]`. | CWS will reject the zip or overwrite the existing v3 listing unexpectedly. | `"version": "3.0.0"` | Bump to `4.0.0` before packaging. | Yes | Codex |
| A-02 | **Blocker** | Bug | `modules/drafting.js:251` | `reviseDraft` system prompt ends with: *"IMPORTANT: Use any new information provided in the revision request even if not in the profile."* This instruction directly contradicts `HALLUCINATION_GUARD` for non-ATS revisions. A user typing "add 10 years of management experience" could receive output claiming that experience. | AI may produce resume content that invents qualifications the user never had. Core product promise ("no invention") is violated. | `systemPromptParts.push('IMPORTANT: Use any new information provided in the revision request even if not in the profile.');` — line 251 | Scope this instruction to ATS-revision mode only (`isAtsRevision === true`), or reframe it to say: "Use any *factual corrections* the user explicitly provides about their own history." | Yes | Codex |
| A-03 | **Blocker** | Bug | `modules/drafting.js:268` | `reviseDraft` calls `callAI(systemPrompt, userPrompt, settings)` — no `signal` parameter. Every other AI call passes `signal` for abort support. | Clicking the cancel/stop button during a Refine operation does nothing. The request runs to completion regardless. | Line 268: `return callAI(systemPrompt, userPrompt, settings);` vs. all other calls which pass `signal`. | Add a `signal` parameter to `reviseDraft` and pass it through. | Yes | Codex |
| A-04 | **Blocker** | Architecture | `background.js:6-8` + `dashboard.js:47-69` | Three constants are duplicated verbatim across both files: `JOB_SESSIONS_BY_TAB_KEY = 'jobSessionsByTab'`, `SESSION_SCAN_TEXT_CAP_CHARS = 60000`, `SESSION_SCAN_TRUNCATION_MARKER`. The tab-scoped routing in v4 depends on these matching exactly. | A future edit to one file that misses the other causes silent mis-routing of session data between tabs. | `background.js` lines 6-8 are exact copies of `dashboard.js` lines 47-69. | Move to a shared `constants.js` module (or a `lib/` file importable by both), or add a code comment explicitly cross-referencing both locations and a matching `// MUST MATCH background.js` guard. | Yes | Codex |

---

### B — High Priority

| ID | Severity | Category | File(s) | Description | User Impact | Code Evidence | Recommendation | Code Change? | Owner |
|----|----------|----------|---------|-------------|-------------|---------------|----------------|-------------|-------|
| B-01 | **High** | Security/Privacy | `modules/provider.js:92` | Gemini API key is embedded in the fetch URL as a query string parameter: `?key=${apiKey}`. This is required by Google's current Gemini API, but the key appears in: browser DevTools Network tab (full URL shown), potentially in access/proxy logs on shared networks, and in Gemini 404 recovery code which fires a *second* request with the key (lines 111-113). | Advanced users or IT admins on shared networks may inadvertently expose the key. No warning is given. | `const url = \`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}\`` | Cannot change the Google API format, but: (1) add a note in the Gemini settings UI: "Note: Gemini keys are passed in the request URL, which is visible in browser DevTools. Use on trusted networks."; (2) consider removing the 404-recovery secondary request that re-exposes the key (it's a nice-to-have, not a core need). | Partial | Human decision + Codex |
| B-02 | **High** | Bug/Privacy | `modules/profile.js:132-206` | `profileToPromptText` sends full contact info (name, email, phone, LinkedIn, portfolio) to the AI provider on every generation, revision, fit-check, and chat request. There is no way for a user to suppress personal contact info from AI prompts. This means a user's email and phone number go to OpenAI/Gemini/OpenRouter on every single AI call. | Users who don't want their PII sent to the AI provider cannot opt out without deleting the data from their profile. | Lines 138-140: `lines.push(\`Email: ${p.email || '(not provided)'}\`); lines.push(\`Phone: ${p.phone || '(not provided)'}\`)` | For v4, add a note in the privacy section of Settings that "personal contact details are included in AI prompts." As a v5 enhancement, add an option to mask personal info from prompts. | No (v4: doc only) | Human decision |
| B-03 | **High** | Bug | `modules/drafting.js:236-238` | `reviseDraft` in ATS mode (`isAtsRevision = true`) replaces `HALLUCINATION_GUARD` with a `KEYWORD MODE` rule that says: "Add skill names, tools, and descriptive terms exactly as provided, placed naturally into existing bullet points." This is intentional, but the instruction says "Do not fabricate specific metrics, dates, or credentials not in the profile" — it does not prevent adding a skill that was never in the profile. A user who checks 5 keywords and applies them will get those exact words inserted into bullets regardless of actual experience. | Resume output may contain keywords the user was never actually proficient in. Could be seen as resume inflation or misrepresentation. | `honestyRule = isAtsRevision ? 'KEYWORD MODE: ... Add skill names, tools, and descriptive terms exactly as provided...'` | Add UI copy before the "Apply keywords" button: "Applying these keywords will insert them into your draft exactly as written. Only keep keywords that reflect your actual experience." Consider a confirmation dialog on Apply. | Code change + UX | Human decision + Codex |
| B-04 | **High** | Bug | `content.js:461` | `getLabelText` handles `aria-labelledby` by taking only the **first** ID: `labelledBy.trim().split(/\s+/)[0]`. ARIA spec allows `aria-labelledby` to reference multiple IDs (e.g. `aria-labelledby="label1 label2"`). This misses composite labels used by some ATS forms (e.g. Greenhouse, Lever) that split field labels across elements. | Autofill matcher may miss or misidentify fields that use multi-element labels, leading to wrong or empty matches. | Line 461: `const ref = document.getElementById(labelledBy.trim().split(/\s+/)[0]);` | Concatenate all referenced elements: `labelledBy.trim().split(/\s+/).map(id => document.getElementById(id)?.textContent.trim()).filter(Boolean).join(' ')` | Yes | Codex |
| B-05 | **High** | Bug | `modules/autofillMatcher.js:143` vs `modules/schema.js:158` | Date splitting is inconsistent: `autofillMatcher.js` uses `/\s*\p{Dash}\s*/u` (dash only), while `schema.js` `splitDateRange` uses `/\s*(?:\p{Dash}|\bto\b)\s*/u` (dash **or** "to"). Profile dates normalized via `schema.js` with "to" as separator will store `startDate`/`endDate` correctly, but `autofillMatcher.js`'s `splitDates` will fail to split them, causing empty date fills. | Autofill silently misses start/end date fields when the user's stored dates use "to" as a separator. No error is shown. | `autofillMatcher.js:143`: `const parts = datesStr.split(/\s*\p{Dash}\s*/u);` vs `schema.js:158`: `const parts = String(dates || '').split(/\s*(?:\p{Dash}|\bto\b)\s*/u);` | Make `splitDates` in `autofillMatcher.js` match `splitDateRange` in `schema.js` by adding the `|\bto\b` alternative. | Yes | Codex |
| B-06 | **High** | Architecture | `modules/profileProposalApply.js:4-16` | `SUPPORTED_ACTIONS` and `APPLY_SUPPORTED_SECTIONS` are two identical objects defined one after the other. Only `APPLY_SUPPORTED_SECTIONS` is exported and used. `SUPPORTED_ACTIONS` is dead code. | No user impact, but adds confusion about which constant governs apply gating. | Lines 4-8 (`SUPPORTED_ACTIONS`) and lines 11-16 (`APPLY_SUPPORTED_SECTIONS`) are character-for-character identical. | Remove `SUPPORTED_ACTIONS` — it is unused. | Yes | Codex |
| B-07 | **High** | Bug | `modules/fitAnalysis.js:53-70` + `modules/jobInfoExtraction.js:9-26` | `parseJsonObject` is **identically duplicated** in both files, each 18 lines of the exact same logic. This is a copy-paste duplication. | No direct user impact but the logic diverges silently if one copy is fixed and the other is not (e.g. adding a size limit). | `fitAnalysis.js:53-70` and `jobInfoExtraction.js:9-26` are byte-for-byte identical. | Extract to a shared utility module (e.g. `modules/jsonUtils.js` or add to `schema.js`). | Yes | Codex |
| B-08 | **High** | UX | `dashboard.js:255-272` | 13 module-level `AbortController` variables are declared as top-level `let` bindings. Managing 13 independent cancel handles is error-prone — future features may forget to reset one, causing stale controllers that block correct cancellation. | A stale `currentXyzController` could prevent cancellation of the correct running request. | Lines 255-272: `let currentAbortController`, `let currentJobChatController`, `let currentFitAnalysisController`, `let currentJobInfoController`, `let currentAiMatchController`, `let currentEmailController`, `let currentRecruiterController`, `let currentFollowUpController`, `let currentAppAnswersController` + 4 more | Consolidate into a single controllers Map keyed by operation name. Not a v4 blocker but increases fragility with each new feature. | No (defer to post-v4) | Codex |
| B-09 | **High** | UX/Product | `modules/drafting.js:197-206` | `generateCoverLetter` constructs the cover letter schema with `signOff: profile.personalInfo.fullName` in the JavaScript template literal itself, not in the user prompt. This means if `profile.personalInfo.fullName` is empty, the AI receives `"signOff": ""` in the JSON schema and may leave the sign-off blank or use a placeholder. | Cover letters generated with no profile name have an empty sign-off. | `signOff: profile.personalInfo.fullName` embedded directly in `coverLetterSchema` object at line 205. | Either add a fallback `|| '[Your Name]'` or prompt the user to provide their name before generating. | Yes | Codex |

---

### C — Medium Priority (Code Quality / Maintainability)

| ID | Severity | Category | File(s) | Description | Recommendation |
|----|----------|----------|---------|-------------|----------------|
| C-01 | Medium | Maintainability | `modules/errorMapper.js:89,99` | Duplicate comment numbering: both "Billing" and "Unauthorized" blocks are labeled `// 2. ...`. Comments go `// 1.`, `// 2.`, `// 2.`, `// 3.`, `// 4.`... | Renumber comments. Small but confusing when debugging error flows. |
| C-02 | Medium | Bug | `modules/provider.js:47-50` | `callMock` in `provider.js` returns only `'[Mock Mode] Simulated AI response.'` — it ignores `systemPrompt` and `userPrompt` entirely. Mock generators in `mock.js` are more useful and use profile data. This is only reached if a module calls `callAI` directly with mock settings rather than using the exported mock generators, but it is inconsistent. | Clarify when `callMock` is expected to be reached vs. when mock generators are used; add a comment or route mock calls to the right generator where possible. |
| C-03 | Medium | Bug | `modules/provider.js:111-123` | Gemini 404 recovery makes a **second fetch** with the API key to list available models. While useful, this secondary request (a) exposes the key again in the URL, (b) adds latency on error paths, and (c) can fail and is silently swallowed. The recovered model list is appended to the error message string, which is then thrown — there is no guarantee the user ever reads it. | Consider removing the recovery request from the error path. Instead, display valid Gemini models as a static list in Settings UI, updated only when the user clicks a "Test connection" button. |
| C-04 | Medium | Maintainability | `dashboard.js:41` | `SUPPORT_URL = 'https://ko-fi.com/mwakelabs'` is a personal URL hardcoded in production JS. If the URL changes, a code update is required. | No immediate fix needed; just document that changing this URL requires a code + release cycle. |
| C-05 | Medium | Accessibility | `dashboard/dashboard.html:38` | The theme toggle button uses a raw emoji `🖥️` as its visible label with no fallback text. Screen readers will vocalize the emoji description ("desktop computer"), which may not clearly convey "toggle theme". `btn-theme` has an `aria-label` of "Switch to light mode" which is good, but the label is not dynamically updated when the theme is currently light (it would still say "Switch to light mode" even if the current mode is already light). | Update the `aria-label` dynamically when theme changes: if current theme is light, say "Switch to dark mode"; if dark, say "Switch to light mode." |
| C-06 | Medium | Accessibility | `dashboard/dashboard.html` + `content.js` | The Fit Check card injected by `content.js` into the host page uses Shadow DOM, which is good isolation. However, if the host page has custom CSS that overrides `:host` properties or if the user has a browser zoom level above 150%, the card layout may break. | Add a `min-width: 320px` guard on the Shadow DOM container and test at 150% zoom. |
| C-07 | Medium | Performance | `modules/autofillMatcher.js:65-74` | The `combined(field)` function joins 6 field properties on **every single matcher test** in a double loop (fields × matchers). For a form with 50 fields × 30 matchers = 1500 calls. While each call is cheap, memoizing `combined(field)` per field would halve the work. | Memoize `combined(field)` in `buildAutofillMatches` before the inner loop. |
| C-08 | Medium | Maintainability | `settings/settings.js:32` | `FEEDBACK_EMAIL = 'mwake.dev@gmail.com'` is a personal email address hardcoded in production JS that ships in the extension bundle. This isn't a security issue per se, but it means the personal email is indexable by anyone who unpacks the extension. | Consider using a support email alias (e.g. via a form or a generic address) rather than a personal Gmail. |
| C-09 | Medium | Maintainability | Multiple files | Magic number comments are missing for: `SESSION_SCAN_TEXT_CAP_CHARS = 60000` (why 60k?), `MAX_EDITED_HTML_CHARS = 500000` (why 500k?), `CHAT_REFINE_REPLY_CHAR_LIMIT = 2000` (why 2k?), `MAX_SYNC_HISTORY_SUMMARIES = 12`, `EMPLOYMENT_GAP_THRESHOLD = 4`. These limits are reasonable but unexplained. | Add inline comments explaining the rationale (e.g. "60k chars ≈ 15k tokens, fits in typical context window while preventing storage bloat"). |
| C-10 | Medium | Maintainability | `modules/mock.js:450-460` | `mockExtractExperience` contains a hardcoded test string `if (/sun life/i.test(phrase)...` — this is a specific-company test case that should never appear in production code. | Remove this block; it was likely a debugging artefact from a specific test message. |
| C-11 | Medium | Maintainability | `settings/settings.js` | `PROVIDER_MODELS` object lists models including `'gemini-2.0-flash-lite'` (not a real Gemini model name; the correct name is `gemini-2.0-flash-lite-001` or `gemini-2.0-flash-lite` depending on API version). Outdated model lists cause user confusion when the list doesn't match what's available. | Review model list against current provider documentation before v4 ships. Mark the list with a comment indicating it was last verified on a specific date. |
| C-12 | Medium | Accessibility | `dashboard/dashboard.html:34` | The Job Chat button is labelled "Chat" with no tooltip describing that this is job-specific AI discussion. New users may confuse it with a general support chat. | Update `title` and `aria-label` to "Discuss this job with AI" (already done on the icon-btn but the button text is just "Chat"). Consider adding a label under the icon on first use. |
| C-13 | Low | Maintainability | `modules/mock.js:537` | Mock `reviseDraft` mutates the object received by reference (parses `currentDraft`, modifies it, returns JSON). If the caller passes an already-parsed object, the original is not mutated (because `parsed` is a new parse). Fine in practice but subtle. | Minor: add `clone()` to make the intent explicit, or add a comment. |

---

### D — Product / UX Audit

| ID | Severity | Category | Description | Recommendation |
|----|----------|----------|-------------|----------------|
| D-01 | High | Product | **Terminology inconsistency: "Application Helper" vs "Autofill" vs "Application Form."** The section card header says "Application Form," the toggle button in code references `autofillTools`, the RELEASE checklist calls it "Autofill," and some settings text says "Application Helper." A normal user reading the dashboard will not connect these three names. | Decide on one name (recommendation: "Application Helper") and apply it consistently to: the card heading, the button label, settings references, the tour step, and code variable names. |
| D-02 | High | Product | **No in-app explanation of the 5-step workflow.** First-time users land in the dashboard with no indication that the intended flow is: Scan → Fit Check → Generate → Refine → Export. The only guidance is a tour (which has to be explicitly started). | Add a subtle workflow indicator or persistent helper text above the job fields section, visible until the user generates their first draft. The tour can remain for power users. |
| D-03 | High | UX | **"doNotClaimNotes" field is powerful but invisible.** The profile field that prevents the AI from claiming certain things is a critical safety feature, but there is no prompt or nudge in the dashboard to use it. Most users will never find it. | Add a hint in the Refine/Chat section: "Want to prevent the AI from mentioning specific things? Add a 'Do Not Claim' note in My Profile." |
| D-04 | High | UX | **ATS keyword apply has no user education before application.** When a user clicks "Apply keywords to draft," the system relaxes the hallucination guard and inserts keywords regardless of whether the user actually has those skills. There is no warning or preview before the keywords are written into the document. | Add a pre-apply message: "These keywords will be inserted into your draft. Only keep keywords that genuinely reflect your experience — do not add skills you cannot support in an interview." |
| D-05 | Medium | UX | **The "Generate Resume," "Generate Cover Letter," and "Generate Both" buttons are always visible and active even when there is no job description.** Clicking them before entering any job data jumps straight to an AI call that fails with a validation error. | Disable or visually dim generation buttons until both a job description and a profile summary exist. Show inline helper text explaining what's needed. |
| D-06 | Medium | UX | **Profile change "stale notice" is accurate but generic.** The notice says "Your profile was updated. Existing resume, cover letter may not reflect the latest profile." — but it doesn't tell the user what changed or whether it's safe to ignore. | Add specificity: "Your profile was updated (skill added: X). The current resume draft was generated before this change." |
| D-07 | Medium | Product | **Fit Check runs per job, but "AI Fit Check" and "Inline Fit Check card" are two separate surfaces** with no explanation of the difference. The inline card on the job page and the fit analysis in the dashboard may show different results (different profile snapshots, different job text). | Document the difference explicitly. In the dashboard Fit Check section, add a note: "This analysis uses the job description currently loaded in the dashboard." |
| D-08 | Medium | UX | **Mock mode warning is shown only as a banner.** Users who have not opened the dashboard in a while may not notice the mock banner and think real AI was used. | Add the mock mode state to the generation result card itself: "Generated in Demo Mode — no real AI was used." The banner alone is easy to miss in a cluttered panel. |
| D-09 | Medium | UX | **Error state for "Profile has changed since the proposal was created" (`guardedProfileApply`) is shown as a toast with a generic message.** The user sees "Profile has changed. Please review and try again" but has no way to know what changed or what to do. | When this error fires, also display the profile diff or at minimum state which field changed ("Profile was edited: new skill was added"). |
| D-10 | Low | UX | **The "Undo profile update" button does not indicate a time limit.** The 15-minute TTL is invisible to users. After 15 minutes, clicking Undo silently does nothing (the snapshot is gone). | Add a timer hint: "Undo available for ~15 min." or simply remove the undo button from the UI when the snapshot expires. |
| D-11 | Low | UX | **"Full page" button in the header is `hidden disabled` by default** — users who open the full-page mode directly never see the button in panel mode that would take them back to context. The transition path between full-page and panel mode is confusing. | Ensure the full-page launch path is discoverable in the panel header tooltip. |
| D-12 | Low | Product | **`generateCoverLetter` schema sends `signOff: profile.personalInfo.fullName` as part of the JSON schema.** If the name is blank, the AI receives an explicit `"signOff": ""` in the schema example. Some models may fill this with a common name (e.g., "John Smith") rather than leaving it blank. | Validated in B-09 above — same fix applies. |

---

## 3. Release-Blocker Section

These must be resolved before v4 is submitted to the Chrome Web Store:

| ID | Description | File | Estimated Effort |
|----|-------------|------|-----------------|
| **A-01** | Bump `manifest.json` version from `3.0.0` to `4.0.0` | `manifest.json:4` | 1 line |
| **A-02** | Remove or scope "use new information" instruction in `reviseDraft` | `modules/drafting.js:251` | ~3 lines |
| **A-03** | Pass `signal` to `callAI` in `reviseDraft` | `modules/drafting.js:268` | ~2 lines |
| **A-04** | De-duplicate three session constants shared between background and dashboard | `background.js` / `dashboard.js` | ~20 min |

**B-01** (Gemini URL key warning) and **B-05** (date splitter inconsistency) are strongly recommended before v4 but are not hard blockers if timeline is tight.

---

## 4. Quick Wins Section

Small changes that improve polish with minimal risk, suitable for a final pass before packaging:

| ID | Change | File | Risk |
|----|--------|------|------|
| B-05 | Add `\bto\b` to `splitDates` regex in autofillMatcher.js | `autofillMatcher.js:143` | Very low |
| B-06 | Remove dead `SUPPORTED_ACTIONS` constant | `profileProposalApply.js:4-8` | None |
| B-07 | Extract shared `parseJsonObject` to a utils module | `fitAnalysis.js` + `jobInfoExtraction.js` | Low |
| B-09 | Add fallback `|| '[Your Name]'` to `signOff` in cover letter schema | `drafting.js:205` | None |
| C-01 | Fix duplicate `// 2.` comment numbering in errorMapper | `errorMapper.js` | None |
| C-05 | Dynamically update theme button aria-label | `dashboard.js` | Very low |
| C-10 | Remove hardcoded "sun life" test phrase from mock.js | `modules/mock.js:450` | None |
| B-04 | Fix single-element aria-labelledby in getLabelText | `content.js:461` | Low |

---

## 5. Product/UX Recommendations

### Naming
- Standardize on **"Application Helper"** as the user-facing section name. "Autofill" is too narrow (the section does matching, scanning, and review, not just autofill). "Application Form" sounds like the form itself.

### First-time experience
- Add a one-time "Getting Started" callout card above the job fields that explains: (1) scan a job, (2) check your fit, (3) generate your documents, (4) refine and export. Dismiss on first generation.

### Fit Check
- Clarify the difference between the inline Fit Check card (on the job page) and the dashboard Fit Check (within the workspace). They can show different results and users don't understand why.
- Consider naming the inline card **"Quick Fit Check"** and the dashboard one **"Full Fit Analysis"** to distinguish them.

### Drafting warnings
- Before "Apply ATS Keywords," add a one-sentence note: *"These keywords will be added to your draft. Remove any that don't reflect your real experience."* This keeps the workflow fast while protecting the user from accidental misrepresentation.

### Profile
- Surface the **"Do Not Claim"** field more prominently. It's one of the most powerful anti-hallucination tools in the product. A small prompt in the Chat panel like *"Want to prevent specific claims? Add a 'Do Not Claim' note."* would help.

### Privacy prompting
- Add a small one-time "AI Privacy Note" banner at first AI use explaining: *"Your job description and profile details are sent to your configured AI provider to generate documents. API keys are stored locally only and never shared with us."* This is already documented in PRIVACY.md but users rarely read that.

---

## 6. Security/Privacy Notes

| ID | Concern | Severity | Status |
|----|---------|----------|--------|
| **SP-01** | Gemini API key exposed in request URL (browser DevTools, potentially proxy logs) | High | By design (Google API requirement) — needs UI disclosure |
| **SP-02** | All provider API keys stored in `chrome.storage.local` — correct and local-only | ✅ Good | Correctly not using `storage.sync` |
| **SP-03** | Personal contact info (email, phone) sent to AI on every call via `profileToPromptText` | Medium | By design — needs disclosure |
| **SP-04** | No Content-Security-Policy in `manifest.json` for extension pages | Medium | MV3 extension pages have default CSP but no `content_scripts` CSP header; low risk given no eval/dynamic scripts used |
| **SP-05** | `FEEDBACK_EMAIL = 'mwake.dev@gmail.com'` hardcoded in production JS | Low | Personal email shipped in the extension bundle; consider alias |
| **SP-06** | Job description content sent to AI provider — disclosed in dashboard | ✅ Good | Privacy notice exists in dashboard |
| **SP-07** | Mock mode does not make any external calls | ✅ Good | Verified in `callMock` and mock generators |
| **SP-08** | `validateOllamaEndpoint` correctly blocks non-localhost Ollama endpoints | ✅ Good | `url.js:43-47` enforces localhost/127.0.0.1 only |
| **SP-09** | No API keys in console logs — error messages use `err?.error?.message` not raw request objects | ✅ Good | Verified across all provider handlers |
| **SP-10** | Source URLs opened via `openSafeHttpUrl` which validates HTTP/HTTPS only | ✅ Good | `url.js` blocks `javascript:`, `data:`, etc. |
| **SP-11** | Gemini 404 recovery fires a second API key–bearing URL request | Low-Medium | Consider removing (see C-03) |

---

## 7. Technical Debt Map

These are not urgent but should be cleaned up over time:

| Area | Issue | Priority |
|------|-------|----------|
| Constant sharing | 3 session constants duplicated between `background.js` and `dashboard.js` | High (fix in v4 per A-04) |
| JSON parsing utility | `parseJsonObject` duplicated in `fitAnalysis.js` and `jobInfoExtraction.js` | Medium |
| AbortController management | 13 module-level controller variables in `dashboard.js` | Medium (post-v4) |
| Date parsing consistency | Two different date-splitting regexes (`autofillMatcher.js` vs `schema.js`) | High (fix in v4 per B-05) |
| Model list staleness | `PROVIDER_MODELS` in `settings.js` has no version date and will grow stale | Low |
| `callMock` stub | Returns generic string instead of routing to proper mock generators | Medium |
| Dead code in profileProposalApply | `SUPPORTED_ACTIONS` constant unused | Low |
| Hardcoded test string | `sun life` pattern in `mock.js` mock experience extractor | Low |
| Personal email in bundle | `FEEDBACK_EMAIL` in `settings.js` | Low |
| Magic numbers without comments | 5+ unexplained numeric/string constants across files | Low |
| Error message numbering | Duplicate `// 2.` in `errorMapper.js` | Trivial |
| Profile apply gating | `update` and `remove` actions unsupported but no clear roadmap date | Medium (v5 scope) |

---

## 8. Suggested Phased Fix Plan

### Must fix before v4 (Release Blockers)
- A-01: Bump manifest version to `4.0.0`
- A-02: Scope "use new information" instruction to ATS mode only
- A-03: Pass abort signal to `reviseDraft`'s `callAI` call
- A-04: De-duplicate three session constants

### Should fix before v4 (Strongly Recommended)
- B-01: Add Gemini URL key disclosure note in Settings UI
- B-04: Fix `aria-labelledby` multi-ID handling in `getLabelText`
- B-05: Align `splitDates` regex with `schema.js` date separator
- B-06: Remove dead `SUPPORTED_ACTIONS` constant
- B-09: Add name fallback to cover letter sign-off
- C-10: Remove hardcoded `sun life` test string from mock.js
- D-04: Add pre-apply warning for ATS keyword insertion

### Should fix soon after v4
- B-07: Extract shared `parseJsonObject` utility
- B-02: Document contact-info-in-prompts behaviour; consider an opt-out
- B-03: Add confirmation dialog / UX note before ATS keyword apply
- C-01 through C-06: Small code quality fixes
- D-01: Standardize "Application Helper" naming
- D-02: Add first-time workflow indicator
- D-03: Surface "Do Not Claim" field more prominently
- D-05: Disable generation buttons when no job description exists

### Later cleanup (Post-v4 / v5)
- B-08: Consolidate 13 AbortController variables to a controllers Map
- C-03: Remove secondary Gemini 404 recovery fetch
- C-08: Replace personal email with support alias
- C-09: Add rationale comments to all magic constants
- SP-04: Explicitly configure extension page CSP headers
- Full profile apply scope (update/remove actions, all sections) per ROADMAP.md

### Product experiments (Future cycles)
- D-06: Stale notice with specific change description
- D-07: "Quick Fit Check" vs "Full Fit Analysis" naming differentiation
- D-09: Profile fingerprint diff display in guarded apply error
- D-10: Undo button timer countdown UI
- SP-03: Contact-info opt-out for AI prompts

---

## 9. Suggested Follow-up Prompts

### Codex: Fix only release blockers

```
Fix the four release-blocking issues in the Job Application Assistant Chrome extension on the `audit/v4-pre-release-readonly` branch (or a new branch from main).

DO NOT modify any other code.

Issue 1 — manifest.json version:
File: manifest.json line 4
Change "version": "3.0.0" to "version": "4.0.0"

Issue 2 — reviseDraft hallucination loophole:
File: modules/drafting.js line 251
The line `systemPromptParts.push('IMPORTANT: Use any new information provided in the revision request even if not in the profile.');`
should only appear when isAtsRevision === true. Wrap this push in an if block:
if (!isAtsRevision) {
  // do NOT add the "use new information" line
} else {
  systemPromptParts.push('IMPORTANT: ...');
}
Or move the line inside the existing isAtsRevision block (lines 246-250).

Issue 3 — reviseDraft missing abort signal:
File: modules/drafting.js
The function signature on line 230 is: async function reviseDraft(currentDraft, revisionRequest, docType, jobData, profile, settings, isAtsRevision = false)
Add a signal parameter: async function reviseDraft(currentDraft, revisionRequest, docType, jobData, profile, settings, isAtsRevision = false, signal)
Pass signal to callAI on line 268: return callAI(systemPrompt, userPrompt, settings, signal);
Also update every call site to pass the signal where available.

Issue 4 — duplicated constants:
Files: background.js lines 6-8 and dashboard/dashboard.js lines 47-69
The constants JOB_SESSIONS_BY_TAB_KEY, SESSION_SCAN_TEXT_CAP_CHARS, and SESSION_SCAN_TRUNCATION_MARKER are defined identically in both files. 
Create a new file lib/constants.js that exports all three. Import them in background.js and dashboard.js and remove the local definitions.
Verify this does not break any existing logic.
```

---

### Claude: Review UX/product recommendations

```
You are reviewing product and UX recommendations for the Job Application Assistant Chrome extension, a tool that helps job seekers complete job applications without leaving the browser.

The app's core workflow: scan a job page → run an AI Fit Check → generate a tailored resume and cover letter → refine with chat/ATS keywords → export via print.

Please review the following UX recommendations from a pre-release audit and give your opinion on each one — specifically:
- Whether the recommendation is correct given the product context
- Whether the proposed solution is the right level of friction (not too heavy, not too invisible)
- Any alternative approaches worth considering
- Whether you'd prioritize it before v4 release or defer it

Recommendations to review:
1. Add a first-time "Getting Started" callout showing the 5-step workflow
2. Standardize feature name to "Application Helper" (currently inconsistent with "autofill", "Application Form")
3. Add a pre-apply ATS keyword warning: "Only keep keywords you can genuinely support in an interview"
4. Surface the "Do Not Claim" profile field more prominently in the Chat panel
5. Clarify the difference between the inline Fit Check card (on-page) and the dashboard Fit Check
6. Add a "AI Privacy Note" banner at first AI use explaining what data is sent to the AI provider
7. Disable generation buttons when no job description exists (show inline help instead)
8. Update theme toggle button aria-label dynamically (currently always says "Switch to light mode")
9. The undo button for profile changes has a 15-minute TTL but users are never told this — add a timer hint
10. The stale notice after profile changes is generic — make it specific about what changed

Context: the app ships as a Chrome side panel extension and does not collect analytics. The user base is job seekers, some technical, many not.
```

---

### Codex: Implement quick wins

```
Implement the following low-risk code quality improvements in the Job Application Assistant Chrome extension. Make each change surgical — do NOT refactor anything else.

1. Fix aria-labelledby multi-element labels (modules/content.js, getLabelText function, line 461):
   Change: const ref = document.getElementById(labelledBy.trim().split(/\s+/)[0]);
           if (ref) return ref.textContent.trim();
   To: return labelledBy.trim().split(/\s+/).map(id => document.getElementById(id)?.textContent.trim()).filter(Boolean).join(' ');

2. Align splitDates regex with schema.js (modules/autofillMatcher.js, splitDates function, line 143):
   Change: const parts = datesStr.split(/\s*\p{Dash}\s*/u);
   To: const parts = datesStr.split(/\s*(?:\p{Dash}|\bto\b)\s*/u);

3. Remove dead SUPPORTED_ACTIONS constant (modules/profileProposalApply.js, lines 4-8):
   Delete the SUPPORTED_ACTIONS object (it is identical to APPLY_SUPPORTED_SECTIONS and unused).

4. Add cover letter sign-off name fallback (modules/drafting.js, line 205):
   Change: signOff: profile.personalInfo.fullName
   To: signOff: profile.personalInfo.fullName || '[Your Name]'

5. Remove hardcoded test string from mock.js (modules/mock.js, the if block containing /sun life/i around lines 450-460):
   Delete the sun life specific branch entirely. The fallback path already handles this correctly.

6. Fix duplicate comment numbering in errorMapper.js (modules/errorMapper.js):
   The billing block is labeled "// 2. Billing" and the unauthorized block below it is also labeled "// 2. Unauthorized". Renumber so billing is 2, unauthorized is 3, and all subsequent comments increment correctly.

After each change, verify the surrounding logic is still correct and no imports are broken.
```

---

### Codex: Security and privacy hardening pass

```
Perform a targeted security and privacy hardening pass on the Job Application Assistant Chrome extension. Focus only on these specific areas — do NOT modify unrelated code:

1. Gemini URL key disclosure (modules/provider.js, callGemini function):
   In the Settings UI for Gemini (settings/settings.js or settings/settings.html), find where the Gemini provider is described and add a note near the API key field:
   "Note: Gemini keys are passed in the request URL. This key is visible in browser DevTools network requests. Do not use Gemini on shared or monitored networks."
   Do NOT change the API call itself (the URL format is required by Google's API).

2. Remove secondary Gemini 404 recovery fetch (modules/provider.js, lines 110-123):
   The 404 recovery block makes a second fetch with the API key to list models. Remove this block entirely. The error message should instead say:
   "Gemini error 404: Model not found. Check the model name in Settings → AI Provider. Valid models include: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash."
   This removes the additional key exposure without degrading the user's ability to diagnose the error.

3. Add privacy context for contact-info-in-prompts (modules/profile.js, profileToPromptText function):
   Add a comment above the email and phone lines noting that this data is included in AI prompts:
   // Contact info is included in AI prompts for cover letter personalization.
   // Users wishing to keep contact details private from their AI provider should leave these fields blank.
   No code change needed — this is documentation only.

4. Verify no API keys in error message strings:
   Review all three provider error handlers (callOpenAI, callGemini, callOpenRouter, callOllama) and confirm that the error messages constructed and thrown do NOT contain the apiKey variable. Confirm and report — do not change unless you find an actual key leak.
```

---

*End of AUDIT_V4_PRE_RELEASE.md*
*Generated: 2026-06-09 on branch audit/v4-pre-release-readonly*
*Files inspected: manifest.json, background.js, content.js, dashboard/dashboard.js, dashboard/dashboard.html, settings/settings.js, modules/provider.js, modules/providerSettings.js, modules/drafting.js, modules/emailDrafting.js, modules/extraction.js, modules/jobInfoExtraction.js, modules/jobChat.js, modules/autofillMatcher.js, modules/applicationAnswers.js, modules/fitAnalysis.js, modules/followUpMessage.js, modules/recruiterMessage.js, modules/profile.js, modules/profileProposalApply.js, modules/profileRoundTrip.js, modules/mock.js, modules/schema.js, modules/storageLimits.js, modules/template.js, modules/renderer.js, modules/html.js, modules/url.js, modules/errorMapper.js, templates/ (all 4), RELEASE_V4_CHECKLIST.md*
