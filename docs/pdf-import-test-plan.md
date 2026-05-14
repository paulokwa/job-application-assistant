# PDF Import — Manual Test Plan

No automated test framework is set up. Run these checks in a Chrome extension dev session
(`chrome://extensions` → Load unpacked) after any change to the PDF pipeline.

---

## 1. DOCX still works (regression check)

**File:** any `.docx` resume  
**Steps:**
1. Open Settings → My Profile → upload the DOCX file.
2. Confirm the status bar shows "Loading DOCX parser…" then "✓ Saved".
3. Confirm the profile fields are populated with name, email, experience, etc.
4. Confirm the PDF quality warning and preview panel are NOT shown.
5. Switch to Dashboard → Generate → check the draft uses real profile data.

**Pass criteria:** DOCX behaviour unchanged. No PDF-specific UI elements appear.

---

## 2. PDF with a normal (single-column) layout

**File:** a standard one-column PDF resume exported from Word or Google Docs  
**Steps:**
1. Upload the PDF in Settings → My Profile.
2. Confirm the "Review extracted PDF text" preview appears.
3. Open the preview — confirm the text looks like the resume (names, job titles, dates).
4. Check the quality signal:
   - If score is 'good': no warning banner shown, toast says "Starting AI auto-fill…"
   - If score is 'partial': amber banner shown, toast says "please review before generating"
5. After auto-fill, confirm profile fields are reasonably populated.

**Pass criteria:** Meaningful text extracted, preview shows recognisable resume content, no error thrown.

---

## 3. PDF with a complex visual layout (sidebar / two-column)

**File:** a designed PDF resume with a sidebar or two-column grid  
**Steps:**
1. Upload the PDF in Settings → My Profile.
2. Open the "Review extracted PDF text" preview.
3. Confirm **some** text is present — ideally names, email, section headings, job titles.
4. Confirm the quality warning appears (partial or poor, depending on content).
5. After auto-fill, review the profile form — it may be incomplete; this is expected.

**Pass criteria:**
- App does not silently fail or throw an error.
- Extracted character count is higher than with the old byte scanner (compare against the old extraction by checking `sourceResumeText` in `chrome.storage.local` via DevTools).
- Warning is shown — user is not misled.

---

## 4. PDF with near-empty / failed extraction

**File:** a scanned-image PDF resume (no selectable text)  
**Steps:**
1. Upload the PDF.
2. Confirm the error message reads: "We couldn't read enough text from this PDF…"
3. Confirm no profile fields are changed.
4. Confirm no partial/corrupt data is stored.

**Pass criteria:** Error shown, nothing stored, user directed to try .docx.

---

## 5. Quality scorer unit-level check (run in DevTools console)

Open Settings page, open DevTools console, paste and run:

```js
// Import is not available from console, so test the logic inline:
function scoreTest(text) {
  const t = text.toLowerCase();
  const charCount = text.trim().length;
  let score = 0;
  if (charCount >= 800) score += 3;
  else if (charCount >= 300) score += 2;
  else if (charCount >= 100) score += 1;
  if (/@[a-z0-9.-]+\.[a-z]{2,}/.test(t)) score += 2;
  if (/\b\d{3}[\s.\-]\d{3}[\s.\-]\d{4}|\(\d{3}\)\s*\d{3}/.test(text)) score += 1;
  if (/linkedin/.test(t)) score += 1;
  const headings = ['experience','education','skills','summary','objective','certifications','projects','work history','employment'];
  score += Math.min(headings.filter(h => t.includes(h)).length * 2, 4);
  return { score, level: score >= 8 ? 'good' : score >= 4 ? 'partial' : 'poor' };
}

console.assert(scoreTest('').score === 0, 'empty → 0');
console.assert(scoreTest('john@example.com\nExperience\nEducation\nSkills\n' + 'x'.repeat(800)).level === 'good', 'rich text → good');
console.assert(scoreTest('john@example.com').level === 'poor', 'contact only → poor');
console.log('Score tests passed');
```

**Pass criteria:** No assertion errors in console.

---

## 6. "S K I L L S" normalization check

Paste into console on the Settings page:

```js
const text = 'S K I L L S\nE D U C A T I O N\nHello World';
// Apply the normalization regex from normalizePdfText:
const normalized = text.replace(/\b([A-Z](?: [A-Z]){2,})\b/g, m => m.replace(/ /g, ''));
console.assert(normalized.includes('SKILLS'), 'SKILLS collapsed');
console.assert(normalized.includes('EDUCATION'), 'EDUCATION collapsed');
console.assert(normalized.includes('Hello World'), 'normal text unchanged');
console.log('Normalization test passed:', normalized);
```

**Pass criteria:** Spaced-out headings collapsed, normal words unchanged.

---

## 7. Remove source resume hides PDF UI

1. Upload any PDF — confirm preview and/or warning appear.
2. Click "Remove" in the Active Source bar.
3. Confirm preview and warning are both hidden.

**Pass criteria:** No stale PDF UI elements visible after removal.
