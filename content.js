// content.js — Injected on demand after a user action (context menu or Scan Page button).
// Page content is only read when the user explicitly triggers a scan — never automatically.

// Guard against duplicate listeners if executeScript is called more than once on the same tab.
if (typeof window.__jpdaContentInjected === 'undefined') {
  window.__jpdaContentInjected = true;

  // ── Job detail container detection ──────────────────────────────────────
  // Scores visible DOM containers to find the most likely selected job detail
  // panel on split-view job boards (CareerBeacon, Indeed, etc.).
  // Returns { el, score, reason } when a confident candidate is found,
  // or null to trigger full-page fallback.

  function findBestJobDetailContainer(doc) {
    // Content patterns that appear in job detail panels
    const POSITIVE_PATTERNS = [
      /apply\s*(now|for\s+this)/i,
      /responsibilities/i,
      /qualifications/i,
      /requirements/i,
      /about\s+(the\s+)?(role|position|job)/i,
      /job\s+description/i,
      /key\s+responsibilities/i,
      /what\s+you('ll|\s+will)\s+(do|bring)/i,
      /employee\s+benefits/i,
      /employment\s+type/i,
      /full[- ]?time/i,
      /part[- ]?time/i,
      /compensation/i,
      /we\s+(are|'re)\s+looking/i,
      /minimum\s+qualifications/i,
      /preferred\s+qualifications/i,
    ];

    // Content patterns that appear in search result lists and sidebars
    const NEGATIVE_PATTERNS = [
      /sort\s+by/i,
      /filter\s+by/i,
      /refine\s+(your\s+)?search/i,
      /\d+\s+jobs?\s+(found|near|available|matching)/i,
      /save\s+this\s+search/i,
      /set\s+up\s+(a\s+)?job\s+alert/i,
      /create\s+(a\s+)?job\s+alert/i,
      /email\s+me\s+jobs/i,
      /next\s+page/i,
      /showing\s+\d+[\s–\-]+\d+\s+of\s+\d+/i,
    ];

    // id/class names that strongly suggest a job detail region
    const POSITIVE_ID_CLASS =
      /job[_-]?(detail|description|content|posting|view)|posting[_-]?(detail|content)|position[_-]?detail|job[_-]?info/i;

    // id/class names that strongly suggest navigation / list / sidebar
    const NEGATIVE_ID_CLASS =
      /\bsidebar\b|side[_-]bar|\bnav\b|filter|search[_-]?(result|list)|job[_-]?list|jobs[_-]?list|result[_-]?list/i;

    const candidateSet = new Set();

    // Semantic selectors — prioritised first pass
    const SEMANTIC_SELECTORS = [
      'main',
      '[role="main"]',
      'article',
      '[id*="job-detail"]', '[id*="jobdetail"]', '[id*="job_detail"]',
      '[id*="posting"]',
      '[id*="job-description"]', '[id*="job_description"]',
      '[id*="job-content"]',   '[id*="job_content"]',
      '[class*="job-detail"]', '[class*="jobDetail"]',
      '[class*="job-description"]', '[class*="jobDescription"]',
      '[class*="posting-detail"]', '[class*="postingDetail"]',
    ];
    for (const sel of SEMANTIC_SELECTORS) {
      try { doc.querySelectorAll(sel).forEach(el => candidateSet.add(el)); } catch (_) {}
    }

    // Block-level elements that are visible and large enough to be a detail panel
    try {
      doc.querySelectorAll('div, section').forEach(el => {
        try {
          const r = el.getBoundingClientRect();
          if (r.width >= 280 && r.height >= 200 && r.top < window.innerHeight * 2 && r.bottom > 0) {
            candidateSet.add(el);
          }
        } catch (_) {}
      });
    } catch (_) {}

    const fullBodyLen = (doc.body?.innerText || '').length || 1;

    let bestEl    = null;
    let bestScore = -Infinity;
    let bestReason = 'no_candidates';

    for (const el of candidateSet) {
      if (el === doc.body || el === doc.documentElement) continue;

      let text;
      try { text = el.innerText || ''; } catch (_) { continue; }

      const textLen = text.length;
      if (textLen < 200) continue;

      let score = 0;
      const reasons = [];

      // ── Structural / semantic signals ──────────────────────────────────
      const tag = el.tagName?.toLowerCase();
      if (tag === 'main' || tag === 'article') { score += 20; reasons.push('semantic_el'); }
      if (el.getAttribute('role') === 'main')  { score += 20; reasons.push('role_main'); }

      const idClass = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
      if (POSITIVE_ID_CLASS.test(idClass)) { score += 25; reasons.push('pos_id_class'); }
      if (NEGATIVE_ID_CLASS.test(idClass)) { score -= 25; reasons.push('neg_id_class'); }

      // ── Content signals ────────────────────────────────────────────────
      let posHits = 0;
      for (const re of POSITIVE_PATTERNS) { if (re.test(text)) posHits++; }
      score += posHits * 8;
      if (posHits > 0) reasons.push(`pos:${posHits}`);

      let negHits = 0;
      for (const re of NEGATIVE_PATTERNS) { if (re.test(text)) negHits++; }
      score -= negHits * 15;
      if (negHits > 0) reasons.push(`neg:${negHits}`);

      // ── Structural line-ratio heuristic ───────────────────────────────
      // Many short lines = job list noise; long lines = prose description
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length > 0) {
        const shortRatio = lines.filter(l => l.length < 60).length / lines.length;
        const longLines  = lines.filter(l => l.length > 100).length;

        if (shortRatio > 0.75) { score -= 20; reasons.push('high_short_ratio'); }
        const longBonus = Math.min(longLines * 3, 30);
        score += longBonus;
        if (longLines > 3) reasons.push(`long_lines:${longLines}`);
      }

      // ── Coverage penalty — only when combined with noise ───────────────
      // Do NOT reject broad candidates on simple single-job pages (no noise).
      const coverage = textLen / fullBodyLen;
      if (coverage > 0.9 && negHits > 0) { score -= 15; reasons.push('broad_with_noise'); }

      // ── Viewport position — weak bonus only ───────────────────────────
      // Right/center position suggests a detail panel on split-view boards.
      // Not required — centered or full-width single-job pages still pass.
      try {
        const r = el.getBoundingClientRect();
        if (r.left > window.innerWidth * 0.2) { score += 8; reasons.push('right_pos'); }
      } catch (_) {}

      if (score > bestScore) {
        bestScore  = score;
        bestEl     = el;
        bestReason = reasons.join(',') || 'scored';
      }
    }

    // Only use the container when it has cleared the confidence threshold.
    // Score < 20 falls back to full-page scan.
    if (bestEl && bestScore >= 20) {
      return { el: bestEl, score: bestScore, reason: bestReason };
    }
    return null;
  }

  function getIndeedSelectedJobKey(url) {
    try {
      const parsed = new URL(url);
      if (!/(\.|^)indeed\.com$/i.test(parsed.hostname)) return '';

      const jk = parsed.searchParams.get('jk') || parsed.searchParams.get('vjk');
      if (jk && /^[a-z0-9]+$/i.test(jk)) return jk;
    } catch (_) {}
    return '';
  }

  function cleanExtractedText(value) {
    return String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function getElementText(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script, style, svg, noscript').forEach(node => node.remove());
    return cleanExtractedText(clone.textContent || '');
  }

  function firstText(doc, selectors) {
    for (const sel of selectors) {
      const text = getElementText(doc.querySelector(sel));
      if (text) return text;
    }
    return '';
  }

  function getIndeedCompany(doc) {
    const container = doc.querySelector('[data-testid="inlineHeader-companyName"], [data-testid="jobsearch-CompanyInfoContainer"]');
    const link = container?.querySelector('a[aria-label], a');
    const label = link?.getAttribute('aria-label') || '';
    if (label) return cleanExtractedText(label.replace(/\s*\(opens in a new tab\)\s*$/i, ''));

    const text = getElementText(link || container);
    if (!text) return '';
    return text.split('\n').map(line => line.trim()).find(Boolean) || '';
  }

  async function fetchIndeedSelectedJob(url) {
    const jk = getIndeedSelectedJobKey(url);
    if (!jk) return null;

    let response;
    try {
      response = await fetch(`/viewjob?jk=${encodeURIComponent(jk)}`, { credentials: 'same-origin' });
    } catch (_) {
      return null;
    }

    if (!response?.ok) return null;

    const html = await response.text();
    const parsedDoc = new DOMParser().parseFromString(html, 'text/html');

    const jobTitle = firstText(parsedDoc, [
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      '.jobsearch-JobInfoHeader-title',
      'h1',
    ]).replace(/\s+-\s+job post\s*$/i, '').trim();

    const company = getIndeedCompany(parsedDoc);
    const locationText = firstText(parsedDoc, [
      '[data-testid="job-location"]',
      '[data-testid="inlineHeader-companyLocation"]',
      '#jobLocationText',
    ]);
    const detailsText = firstText(parsedDoc, [
      '#salaryInfoAndJobType',
    ]);
    const description = firstText(parsedDoc, [
      '#jobDescriptionText',
      '.jobsearch-JobComponent-description',
      '[data-testid="jobsearch-JobComponent-description"]',
    ]);

    if (description.length < 500 || (!jobTitle && !company)) return null;

    const pageText = [
      jobTitle ? `Job Title: ${jobTitle}` : '',
      company ? `Company: ${company}` : '',
      locationText ? `Location: ${locationText}` : '',
      detailsText ? `Job Details: ${detailsText}` : '',
      '',
      description,
    ].filter(Boolean).join('\n');

    return {
      pageText,
      jobTitle,
      company,
      url: response.url || `/viewjob?jk=${encodeURIComponent(jk)}`,
    };
  }

  // ── Message listener ──────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CAPTURE_CONTENT') {
      (async () => {
        try {
          const selectedText = window.getSelection().toString().trim();

          // Prefer the most focused job detail container over the full page dump.
          // selectedText from the user's text selection still wins downstream in
          // dashboard logic — this only affects the pageText fallback path.
          const indeedResult = selectedText ? null : await fetchIndeedSelectedJob(location.href);
          const detailResult = indeedResult ? null : findBestJobDetailContainer(document);
          const pageText = detailResult
            ? (detailResult.el.innerText || '')
            : indeedResult
              ? indeedResult.pageText
            : (document.body.innerText || '');

          const title = document.title || '';
          const url = indeedResult?.url || location.href;

          // Collect JSON-LD structured data for job-page detection.
          const structuredData = Array.from(
            document.querySelectorAll('script[type="application/ld+json"]')
          ).map(s => s.textContent || '').join('\n');

          sendResponse({
            selectedText: selectedText || null,
            pageText: pageText,
            title: title,
            url: url,
            jobTitle: indeedResult?.jobTitle || '',
            company: indeedResult?.company || '',
            usedSelection: selectedText.length > 0,
            structuredData: structuredData,
            // Diagnostic metadata — not displayed in V1 UI but useful for debugging.
            usedDetailContainer: Boolean(detailResult),
            detailContainerScore: detailResult?.score ?? null,
            detailContainerReason: detailResult?.reason ?? null,
            usedIndeedViewJobFetch: Boolean(indeedResult),
          });
        } catch (error) {
          sendResponse({ error: 'Failed to extract content.' });
        }
      })();
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

    if (message.type === 'SHOW_FIT_CHECK_CARD') {
      try {
        injectFitCheckCard(message);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ error: error.message });
      }
      return true;
    }

    if (message.type === 'REMOVE_FIT_CHECK_CARD') {
      document.getElementById('fit-check-root')?.remove();
      sendResponse({ ok: true });
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

  function getAtsPlatform() {
    return /(\.|^)(myworkdayjobs\.com|myworkday\.com)$/i.test(location.hostname)
      ? 'workday'
      : '';
  }

  function collectFormFields() {
    const elements = document.querySelectorAll('input, select, textarea');
    const fields = [];
    const atsPlatform = getAtsPlatform();

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
        atsPlatform,
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

  // ── Fit Check card ───────────────────────────────────────────────────────
  // Injected on demand after a successful scan. Uses Shadow DOM so page styles
  // cannot bleed in and the card's styles cannot pollute the job posting.

  function fcEscape(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function injectFitCheckCard({ profiles, activeProfileId, tabId, hasAiProvider, aiMatch, aiMatchError, aiLoading }) {
    // Remove any existing card before re-injecting (e.g. on re-scan or profile switch).
    const existing = document.getElementById('fit-check-root');
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = 'fit-check-root';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const profilesArr  = Array.isArray(profiles) && profiles.length > 1 ? profiles : [];

    let profileSelectorSection = '';
    if (profilesArr.length > 1) {
      const options = profilesArr.map(p =>
        `<option value="${fcEscape(p.id)}"${p.id === activeProfileId ? ' selected' : ''}>${fcEscape(p.name)}</option>`
      ).join('');
      profileSelectorSection = `
        <div class="profile-row">
          <label class="profile-label" for="fc-profile-sel">Profile used for AI review</label>
          <select id="fc-profile-sel" class="profile-sel">${options}</select>
        </div>`;
    }

    let aiSection = '';
    if (aiLoading) {
      aiSection = `
        <div class="ai-cta-row">
          <span class="ai-cta-hint">Checking fit with your selected AI provider…</span>
        </div>`;
    } else if (hasAiProvider) {
      if (aiMatch && typeof aiMatch === 'object') {
        const labelMap = {
          strong_match: 'Strong match', good_match: 'Good match', maybe: 'Possible match',
          weak_match: 'Weak match', not_recommended: 'Low fit',
        };
        const labelText = fcEscape(labelMap[aiMatch.label] || aiMatch.label || '');
        const aiScore = Math.max(0, Math.min(100, Math.round(Number(aiMatch.score) || 0)));
        const strongMatches = Array.isArray(aiMatch.strongMatches) ? aiMatch.strongMatches.slice(0, 3) : [];
        const possibleGaps  = Array.isArray(aiMatch.possibleGaps)  ? aiMatch.possibleGaps.slice(0, 3)  : [];
        const recommendation = aiMatch.recommendation ? fcEscape(String(aiMatch.recommendation)) : '';
        aiSection = `
          <div class="ai-section">
            <div class="ai-header">
              <span class="ai-label">AI review</span>
              <span class="ai-score-badge">${aiScore}% &middot; ${labelText}</span>
            </div>
            ${strongMatches.length > 0 ? `<div class="ai-subhead">Strengths</div><ul class="ai-list">${strongMatches.map(s => `<li>${fcEscape(String(s))}</li>`).join('')}</ul>` : ''}
            ${possibleGaps.length  > 0 ? `<div class="ai-subhead">Possible gaps</div><ul class="ai-list">${possibleGaps.map(g => `<li>${fcEscape(String(g))}</li>`).join('')}</ul>` : ''}
            ${recommendation ? `<div class="ai-recommendation">${recommendation}</div>` : ''}
          </div>`;
      } else if (aiMatchError) {
        aiSection = `
          <div class="ai-error-row">
            <span class="ai-error-text">${fcEscape(String(aiMatchError))}</span>
            <button class="btn-ai-retry" id="fc-btn-ai-retry">Try again</button>
          </div>`;
      } else {
        aiSection = `
          <div class="ai-cta-row">
            <button class="btn-ai-review" id="fc-btn-ai-review">Run AI Fit Check</button>
            <span class="ai-cta-hint">Uses your selected AI provider.</span>
          </div>`;
      }
    } else {
      aiSection = `
        <div class="ai-error-row">
          <span class="ai-error-text">Set up an AI provider in Job Application Assistant before running Fit Check.</span>
        </div>`;
    }

    shadow.innerHTML = `
      <style>
        :host { all: initial; display: block; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .card {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9000;
          width: 300px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.14);
          padding: 16px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
          color: #111827;
          line-height: 1.4;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .title {
          font-size: 13px;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.01em;
        }
        .title-dot { color: #2563eb; }
        .btn-dismiss {
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
          font-size: 15px;
          line-height: 1;
          padding: 2px 4px;
          border-radius: 4px;
          font-family: inherit;
        }
        .btn-dismiss:hover { color: #374151; background: #f3f4f6; }
        .profile-row { margin-bottom: 12px; }
        .profile-label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #6b7280;
          margin-bottom: 4px;
        }
        .profile-sel {
          width: 100%;
          font-size: 12px;
          font-family: inherit;
          color: #111827;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 4px 8px;
          cursor: pointer;
          outline: none;
          appearance: auto;
        }
        .profile-sel:focus { border-color: #2563eb; }
        .ai-cta-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
        }
        .btn-ai-review {
          font-size: 11px;
          font-family: inherit;
          font-weight: 600;
          color: #ffffff;
          background: #2563eb;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          padding: 5px 10px;
          white-space: nowrap;
        }
        .btn-ai-review:hover { background: #1d4ed8; }
        .btn-ai-review:disabled { background: #93c5fd; cursor: default; }
        .ai-cta-hint { font-size: 11px; color: #6b7280; }
        .ai-section {
          margin-top: 10px;
          padding: 8px 10px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
        }
        .ai-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          margin-bottom: 6px;
        }
        .ai-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #15803d;
        }
        .ai-score-badge { font-size: 11px; font-weight: 600; color: #15803d; }
        .ai-subhead {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #6b7280;
          margin-top: 6px;
          margin-bottom: 3px;
        }
        .ai-list { margin: 0; padding-left: 14px; }
        .ai-list li { font-size: 11px; color: #374151; margin-bottom: 2px; }
        .ai-recommendation { font-size: 11px; color: #374151; margin-top: 6px; font-style: italic; }
        .ai-error-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: 10px;
          padding: 7px 10px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
        }
        .ai-error-text { font-size: 11px; color: #dc2626; flex: 1; min-width: 0; }
        .btn-ai-retry {
          font-size: 11px;
          font-family: inherit;
          font-weight: 600;
          color: #dc2626;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          white-space: nowrap;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .btn-ai-retry:hover { color: #b91c1c; }
        .chat-row {
          margin-top: 12px;
          display: flex;
        }
        .btn-chat {
          width: 100%;
          font-size: 12px;
          font-family: inherit;
          font-weight: 700;
          color: #ffffff;
          background: #111827;
          border: none;
          border-radius: 7px;
          cursor: pointer;
          padding: 7px 10px;
        }
        .btn-chat:hover { background: #374151; }
        .divider { height: 1px; background: #f3f4f6; margin: 12px 0 10px; }
        .disclaimer {
          font-size: 11px;
          color: #9ca3af;
          font-style: italic;
          line-height: 1.5;
        }
      </style>
      <div class="card" role="complementary" aria-label="Fit Check result">
        <div class="header">
          <span class="title"><span class="title-dot">✦</span> AI Fit Check</span>
          <button class="btn-dismiss" id="fc-dismiss" aria-label="Dismiss Fit Check card">✕</button>
        </div>
        ${profileSelectorSection}
        ${aiSection}
        <div class="chat-row">
          <button class="btn-chat" id="fc-btn-chat">Discuss this job</button>
        </div>
        <div class="divider"></div>
        <div class="disclaimer">AI Fit Check is guidance, not a verdict. Review the result before deciding whether to apply.</div>
      </div>
    `;

    shadow.getElementById('fc-dismiss').addEventListener('click', () => host.remove());

    const profileSel = shadow.getElementById('fc-profile-sel');
    if (profileSel) {
      profileSel.addEventListener('change', () => {
        try {
          chrome.runtime.sendMessage({
            type: 'FIT_CHECK_PROFILE_CHANGED',
            profileId: profileSel.value,
            tabId,
          });
        } catch (_) {}
      });
    }

    const btnAiReview = shadow.getElementById('fc-btn-ai-review');
    if (btnAiReview) {
      btnAiReview.addEventListener('click', () => {
        btnAiReview.disabled = true;
        btnAiReview.textContent = 'Checking…';
        try {
          chrome.runtime.sendMessage({
            type: 'RUN_FIT_CHECK_AI',
            profileId: activeProfileId,
            tabId,
          });
        } catch (_) {}
      });
    }

    const btnAiRetry = shadow.getElementById('fc-btn-ai-retry');
    if (btnAiRetry) {
      btnAiRetry.addEventListener('click', () => {
        try {
          chrome.runtime.sendMessage({
            type: 'RUN_FIT_CHECK_AI',
            profileId: activeProfileId,
            tabId,
          });
        } catch (_) {}
      });
    }

    const btnChat = shadow.getElementById('fc-btn-chat');
    if (btnChat) {
      btnChat.addEventListener('click', () => {
        try {
          chrome.runtime.sendMessage({
            type: 'OPEN_JOB_CHAT_FROM_FIT_CHECK',
            tabId,
          });
        } catch (_) {}
      });
    }
  }

  // ── Month abbreviations where starts-with matching is safe (e.g. "Jan" → "January").
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
