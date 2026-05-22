// content.js — Injected on demand after a user action (context menu or Scan Page button).
// Page content is only read when the user explicitly triggers a scan — never automatically.

// Guard against duplicate listeners if executeScript is called more than once on the same tab.
if (typeof window.__jpdaContentInjected === 'undefined') {
  window.__jpdaContentInjected = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CAPTURE_CONTENT') {
      try {
        const selectedText = window.getSelection().toString().trim();
        const pageText = document.body.innerText || '';
        const title = document.title || '';
        const url = location.href;

        sendResponse({
          selectedText: selectedText || null,
          pageText: pageText,
          title: title,
          url: url,
          usedSelection: selectedText.length > 0,
        });
      } catch (error) {
        sendResponse({ error: 'Failed to extract content.' });
      }
      return true;
    }

    if (message.type === 'SCAN_FORM_FIELDS') {
      try {
        sendResponse({ fields: collectFormFields() });
      } catch (error) {
        sendResponse({ error: 'Failed to scan form fields.' });
      }
      return true;
    }

    if (message.type === 'FILL_FORM_FIELDS') {
      try {
        sendResponse(fillFormFields(message.fills || []));
      } catch (error) {
        sendResponse({ filled: 0, failed: 0, results: [], error: error.message });
      }
      return true;
    }
  });

  // ── Form field collection ─────────────────────────────────────────────────

  const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

  // Patterns that indicate a field should not be auto-filled by the assistant.
  const SENSITIVE_PATTERNS = [
    // Compensation
    /\bsalary\b/i, /\bcompensation\b/i, /\bwage\b/i, /\bhourly\s+rate\b/i,
    /\bpay\s+(rate|expectation|desired|required|current)\b/i,
    // Work authorisation
    /\bwork\s*authoriz/i, /\bvisa\b/i, /\bsponsorship\b/i, /\bwork\s*permit\b/i,
    /\beligib\w+\s+(to\s+)?work\b/i,
    // Criminal history
    /\bcriminal\b/i, /\bconviction\b/i, /\bfelony\b/i,
    // Protected characteristics
    /\bdisabilit/i, /\bveteran\b/i, /\bethnicit/i, /\b(race|racial)\b/i,
    /\bgender\b/i, /\bpronoun\b/i,
    /\bdate\s*of\s*birth\b/i, /\bd\.?o\.?b\b/i,
    // Identity documents
    /\bss[ni]\b/i, /\bsocial\s*(insurance|security)\s*number\b/i,
    /\bnational\s*id\b/i, /\btax\s*id\b/i,
    // Equal opportunity monitoring
    /\beeo\b/i, /\bequal\s*opportunit/i,
    // References
    /\breference\b/i,
    // Consent / declarations
    /\bconsent\b/i, /\bdeclaration\b/i, /\blegal\s*agreement\b/i,
    // Payment
    /\bcredit\s*card\b/i, /\bcard\s*number\b/i, /\bcvv\b/i, /\bcvc\b/i, /\bbilling\b/i,
    // Captcha
    /\bcaptcha\b/i,
  ];

  function detectSensitive(signals, type) {
    if (type === 'password') return { isSensitive: true, skipReason: 'Password field — skipped' };
    if (type === 'file')     return { isSensitive: true, skipReason: 'File upload — handle manually' };
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(signals)) return { isSensitive: true, skipReason: 'Sensitive field — answer manually' };
    }
    return { isSensitive: false, skipReason: null };
  }

  function isElementVisible(el) {
    // checkVisibility is the most reliable API (Chrome 105+).
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true });
    }
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  function getLabelText(el) {
    // 1. aria-labelledby → first referenced element's text
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ref = document.getElementById(labelledBy.trim().split(/\s+/)[0]);
      if (ref) return ref.textContent.trim();
    }
    // 2. <label for="id">
    if (el.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) return label.textContent.trim();
      } catch (_) {}
    }
    // 3. Ancestor <label> — clone to strip the input's own contribution
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach(n => n.remove());
      return clone.textContent.trim();
    }
    return '';
  }

  function getNearbyText(el) {
    // Walk back through preceding siblings for a visible text node or label-like element.
    let prev = el.previousElementSibling;
    while (prev) {
      const tag = prev.tagName;
      if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA' && tag !== 'BUTTON') {
        const text = prev.textContent.trim();
        if (text && text.length <= 120) return text;
      }
      prev = prev.previousElementSibling;
    }
    // Parent container text minus form controls (catches wrapper-div patterns).
    const parent = el.parentElement;
    if (parent) {
      const clone = parent.cloneNode(true);
      clone.querySelectorAll('input, select, textarea, button').forEach(n => n.remove());
      const text = clone.textContent.trim();
      if (text && text.length <= 120) return text;
    }
    return '';
  }

  function collectFormFields() {
    const elements = document.querySelectorAll('input, select, textarea');
    const fields = [];

    elements.forEach((el, index) => {
      const tagName = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();

      // Skip non-interactive / structural input types.
      if (tagName === 'input' && SKIP_INPUT_TYPES.has(type)) return;

      // Skip elements that are not visible to the user.
      if (!isElementVisible(el)) return;

      const id           = el.id || '';
      const name         = el.name || '';
      const autocomplete = el.getAttribute('autocomplete') || '';
      const ariaLabel    = el.getAttribute('aria-label') || '';
      const placeholder  = el.placeholder || '';
      const labelText    = getLabelText(el);
      const nearbyText   = getNearbyText(el);

      const signals = [id, name, ariaLabel, placeholder, labelText, nearbyText].join(' ');
      const { isSensitive, skipReason } = detectSensitive(signals, type);

      const options = tagName === 'select'
        ? Array.from(el.options).map(o => o.text.trim()).filter(t => t.length > 0).slice(0, 25)
        : [];

      fields.push({
        fieldId:      id || name || `jpda-field-${index}`,
        fieldIndex:   index,
        tagName,
        type:         type || tagName,
        name,
        id,
        autocomplete,
        ariaLabel,
        placeholder,
        labelText,
        nearbyText,
        options,
        currentValue: el.value || '',
        isVisible:    true,
        isDisabled:   el.disabled,
        isReadOnly:   el.readOnly || false,
        isSensitive,
        skipReason,
      });
    });

    return fields;
  }

  // ── Form field filling ────────────────────────────────────────────────────
  // Called only when the user confirms in the Review Autofill overlay.
  // Fills each requested field and dispatches events so framework forms notice.

  // Cache native value setters once — required for React-controlled inputs.
  const nativeInputSetter    = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,    'value')?.set;
  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  const nativeSelectSetter   = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,   'value')?.set;

  function fillFormFields(fills) {
    const allElements = document.querySelectorAll('input, select, textarea');
    const results = [];
    let filled = 0;
    let failed = 0;

    for (const instruction of fills) {
      const { fieldIndex, value, id: scannedId, name: scannedName } = instruction;
      const el = allElements[fieldIndex];
      const result = { fieldIndex, success: false, reason: null };

      if (!el) {
        result.reason = 'Element not found — form may have changed since scanning';
        results.push(result);
        failed++;
        continue;
      }

      // Staleness check — if the original field had an id or name, verify it still matches.
      // Prevents filling the wrong field if the page re-rendered between scan and fill.
      if (scannedId || scannedName) {
        const idOk   = scannedId   && el.id   === scannedId;
        const nameOk = scannedName && el.name === scannedName;
        if (!idOk && !nameOk) {
          result.reason = 'Field changed after scan — scan again';
          results.push(result);
          failed++;
          continue;
        }
      }

      const elType = (el.getAttribute('type') || '').toLowerCase();
      const elTag  = el.tagName.toLowerCase();

      // Safety gate — never fill structural / unsafe types even if somehow included.
      if (elTag === 'input' && SKIP_INPUT_TYPES.has(elType)) {
        result.reason = `Unsafe input type "${elType}" — skipped`;
        results.push(result);
        failed++;
        continue;
      }
      if (el.disabled || el.readOnly) {
        result.reason = 'Field is disabled or read-only';
        results.push(result);
        failed++;
        continue;
      }

      // Sensitive re-check against current DOM state — guards against stale scan data.
      const liveSignals = [
        el.id || '', el.name || '',
        el.getAttribute('aria-label') || '',
        el.placeholder || '',
        getLabelText(el),
      ].join(' ');
      if (detectSensitive(liveSignals, elType).isSensitive) {
        result.reason = 'Field looks sensitive — skipped for safety';
        results.push(result);
        failed++;
        continue;
      }

      try {
        if (elTag === 'select') {
          const optionValue = findSelectOption(el, value);
          if (optionValue === null) {
            result.reason = `No matching option for "${value}"`;
            results.push(result);
            failed++;
            continue;
          }
          if (nativeSelectSetter) nativeSelectSetter.call(el, optionValue);
          else el.value = optionValue;
          // Dispatch both input and change — some frameworks listen to one, some to both.
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          // text / email / tel / textarea etc.
          const setter = elTag === 'textarea' ? nativeTextareaSetter : nativeInputSetter;
          if (setter) setter.call(el, value);
          else el.value = value;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        result.success = true;
        filled++;
      } catch (err) {
        result.reason = err.message || 'Unknown fill error';
        failed++;
      }

      results.push(result);
    }

    return { filled, failed, results };
  }

  // Month abbreviations where starts-with matching is safe (e.g. "Jan" → "January").
  // Starts-with is restricted to this set — wrong dropdown selection is worse than no fill.
  const MONTH_PREFIXES = new Set([
    'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug',
    'sep', 'sept', 'oct', 'nov', 'dec',
  ]);

  // Find the best-matching option value in a <select> for a given profile string.
  // Returns the option's .value attribute, or null if nothing acceptable is found.
  function findSelectOption(selectEl, value) {
    const target    = (value || '').trim();
    const targetLow = target.toLowerCase();
    const options   = Array.from(selectEl.options);

    // 1. Exact option .value match
    const byValue = options.find(o => o.value === target);
    if (byValue) return byValue.value;

    // 2. Exact option text match
    const byText = options.find(o => o.text.trim() === target);
    if (byText) return byText.value;

    // 3. Case-insensitive text match
    const byTextCI = options.find(o => o.text.trim().toLowerCase() === targetLow);
    if (byTextCI) return byTextCI.value;

    // 4. Starts-with — only for known month abbreviations (e.g. "jan" → "January").
    //    Intentionally skipped for country, province, yes/no, work-auth, and other dropdowns
    //    where a partial prefix match would likely pick the wrong option.
    if (MONTH_PREFIXES.has(targetLow)) {
      const byStart = options.find(o => o.text.trim().toLowerCase().startsWith(targetLow));
      if (byStart) return byStart.value;
    }

    return null;
  }
}
