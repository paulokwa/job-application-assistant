// dashboard/dashboard.js — Main dashboard controller (Redesigned for HTML/PDF System)

import { extractJobFields } from '../modules/extraction.js';
import { generateResume, generateCoverLetter, reviseDraft, extractAtsKeywords } from '../modules/drafting.js';
import { loadProfile, loadProfiles, switchProfile } from '../modules/profile.js';
import { renderDocument, renderMergedDocument } from '../modules/renderer.js';
import { mapError } from '../modules/errorMapper.js';

// ── Config ─────────────────────────────────────────────────────────────────
// Support/Ko-fi URL — used by the header button and the first-run welcome modal.
// Change this one line to update both places at once.
const SUPPORT_URL = 'https://ko-fi.com/mwakelabs';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  jobData: {
    jobTitle: '', company: '', sourceUrl: '', description: '',
  },
  currentTab: 'resume',     // 'resume' | 'cover-letter'
  drafts:         { resume: null, 'cover-letter': null },
  originalDrafts: { resume: null, 'cover-letter': null },

  // UI customization
  templateId: 'classic',
  accentColor: '#2563eb',
  spacingMode: 'standard',
  tone: 30,
  clLength: 'standard',

  settings: null,
  profile: null,
  sourceResumeText: '',
  lastRunMode: null
};

let currentAbortController = null;

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  sourceIndicator:    $('source-indicator'),
  selectionNotice:    $('selection-notice'),
  fieldTitle:         $('field-job-title'),
  fieldCompany:       $('field-company'),
  fieldUrl:           $('field-url'),
  fieldDesc:          $('field-job-desc'),
  
  btnGenResume:       $('btn-gen-resume'),
  btnGenCL:           $('btn-gen-cover-letter'),
  btnGenBoth:         $('btn-gen-both'),
  
  genStatus:          $('gen-status'),
  genStatusText:      $('gen-status-text'),
  genError:           $('gen-error'),
  genErrorMessage:    $('gen-error-message'),
  btnErrorRetry:      $('btn-error-retry'),
  btnErrorSettings:   $('btn-error-settings'),
  
  tabBtns:            document.querySelectorAll('.tab-btn'),
  tabPanels:          document.querySelectorAll('.tab-panel'),
  
  templateOptions:    document.querySelectorAll('.template-option'),
  colorDots:          document.querySelectorAll('.color-dot'),
  selectSpacing:      $('select-spacing'),
  rangeTone:          $('range-tone'),
  toneDescriptor:     $('tone-descriptor'),
  lengthPills:        document.querySelectorAll('.length-pill'),
  
  previewResumeFrame: $('preview-resume-frame'),
  previewCLFrame:     $('preview-cl-frame'),
  previewMergedFrame: $('preview-merged-frame'),
  draftResumeEmpty:   $('draft-resume-empty'),
  draftResumeContent: $('draft-resume-content'),
  draftCLEmpty:       $('draft-cl-empty'),
  draftCLContent:     $('draft-cl-content'),
  draftMergedEmpty:   $('draft-merged-empty'),
  draftMergedContent: $('draft-merged-content'),
  tabBtnMerged:       $('tab-btn-merged'),
  
  fieldRevision:      $('field-revision'),
  btnApplyChanges:    $('btn-apply-changes'),
  btnRegenerate:      $('btn-regenerate'),
  
  btnPrintBoth:       $('btn-print-both'),
  btnPrintCL:         $('btn-print-cl'),
  btnPrintMerged:     $('btn-print-merged'),

  btnAtsScan:         $('btn-ats-scan'),
  atsEmpty:           $('ats-empty'),
  atsStatus:          $('ats-status'),
  atsResults:         $('ats-results'),
  atsScore:           $('ats-score'),
  atsMatchedGroup:    $('ats-matched-group'),
  atsMissingGroup:    $('ats-missing-group'),
  atsMatchedChips:    $('ats-matched-chips'),
  atsMissingChips:    $('ats-missing-chips'),
  atsApplyRow:        $('ats-apply-row'),
  btnAtsApply:        $('btn-ats-apply'),
  
  toast:              $('toast'),
  btnTheme:           $('btn-theme'),
  btnHistory:         $('btn-history'),
  profileSwitcher:    $('profile-switcher'),
  btnManageProfiles:  $('btn-manage-profiles'),
  historyView:        $('history-view'),
  btnCloseHistory:    $('btn-close-history'),
  btnSupport:         $('btn-support'),
  btnSettings:        $('btn-settings'),
  mockBanner:         $('mock-mode-banner'),
  settingsView:       $('settings-view'),
  btnCloseSettings:   $('btn-close-settings'),
  btnNewDraft:        $('btn-new-draft'),
  btnTour:            $('btn-tour'),
  btnScan:            $('btn-scan-page'),
  settingsFrame:      $('settings-frame'),
};

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  state.settings = await loadSettings();
  state.profile  = await loadProfile();
  await populateProfileStrip();

  const localData = await chrome.storage.local.get(['sourceResumeText', 'savedDraft', 'welcomeSeen', 'theme']);
  applyTheme(localData.theme || 'system');
  state.sourceResumeText = localData.sourceResumeText || '';

  if (state.settings?.provider === 'mock') {
    dom.mockBanner.classList.remove('hidden');
  }

  bindEvents();

  // Restore any previously generated draft before loading session data
  if (localData.savedDraft) {
    restoreSavedDraft(localData.savedDraft);
  } else {
    switchTab('resume');
  }

  // Load session data (may overwrite job fields if a new job page was captured)
  loadSession();

  // Listen for data written by background script (context menu extraction)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'session' && (changes.extractedData || changes.pendingMode)) {
      loadSession();
    }
  });

  // Show welcome modal on first run (non-blocking — all core setup is already done)
  if (!localData.welcomeSeen) showWelcomeModal();
}

function loadSession() {
  chrome.storage.session.get(null).then(applySession);
}

function applyExtractedData(raw, url, usedSelection) {
  if (raw.error) {
    showToast(`⚠️ ${raw.error}`);
    return;
  }

  const text = raw.selectedText || raw.pageText || '';

  if (usedSelection) {
    dom.selectionNotice.classList.remove('hidden');
    dom.sourceIndicator.textContent = '✦ From your selection';
    dom.sourceIndicator.className = 'card-hint source-selection';
  } else {
    dom.selectionNotice.classList.add('hidden');
    dom.sourceIndicator.textContent = '✦ From page content';
    dom.sourceIndicator.className = 'card-hint source-page';
  }

  const fields = extractJobFields(text, url);
  dom.fieldTitle.value   = fields.jobTitle;
  dom.fieldCompany.value = fields.company;
  dom.fieldUrl.value     = url;
  dom.fieldDesc.value    = text;

  state.jobData = { jobTitle: fields.jobTitle, company: fields.company, sourceUrl: url, description: text };
}

function applySession(session) {
  if (!session || !session.extractedData) {
    console.log('[JPDA] applySession: No data yet.');
    return;
  }

  const raw = session.extractedData;
  const url = session.sourceUrl || raw.url || '';
  applyExtractedData(raw, url, !!raw.selectedText);

  if (session.pendingMode) {
    state.lastRunMode = session.pendingMode;
  }
}

// Returns true for pages where Chrome blocks script injection.
function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('data:') ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://chromewebstore.google.com')
  );
}

async function scanCurrentPage() {
  const btn = dom.btnScan;
  btn.disabled = true;
  btn.textContent = 'Scanning…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      showToast('⚠️ No active tab found.');
      return;
    }

    if (isRestrictedUrl(tab.url)) {
      showToast('⚠️ Cannot scan this page — open a job posting in a normal browser tab first.');
      return;
    }

    // Inject content.js on demand (user triggered this action).
    // The guard in content.js prevents duplicate listeners on repeated scans.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch (injectErr) {
      console.warn('[JPDA] Could not inject content script:', injectErr.message);
      showToast('⚠️ Cannot scan this page — Chrome blocks scripts here (e.g. PDFs, restricted sites).');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_CONTENT' });

    if (!response) {
      showToast('⚠️ No response from page. Try right-clicking and using the context menu instead.');
      return;
    }

    if (response.error) {
      showToast(`⚠️ ${response.error}`);
      return;
    }

    applyExtractedData(response, tab.url || '', !!response.selectedText);
    showToast('✦ Page scanned');
  } catch (err) {
    console.warn('[JPDA] scanCurrentPage error:', err);
    showToast('⚠️ Could not scan the page. Try the context menu instead.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan page';
  }
}

// ── Events ────────────────────────────────────────────────────────────────
function bindEvents() {
  // Feature tour
  dom.btnTour.addEventListener('click', startTour);
  $('tour-btn-skip').addEventListener('click', endTour);
  $('tour-btn-prev').addEventListener('click', () => { if (tourIndex > 0) showTourStep(tourIndex - 1); });
  $('tour-btn-next').addEventListener('click', () => {
    if (tourIndex < TOUR_STEPS.length - 1) showTourStep(tourIndex + 1);
    else endTour();
  });

  // Scan page
  dom.btnScan.addEventListener('click', scanCurrentPage);

  // New draft
  dom.btnNewDraft.addEventListener('click', clearSession);

  // Profile strip
  dom.profileSwitcher.addEventListener('change', async () => {
    state.profile = await switchProfile(dom.profileSwitcher.value);
    showToast('✦ Profile switched.');
  });
  dom.btnManageProfiles.addEventListener('click', () => {
    dom.settingsView.classList.add('visible');
    setTimeout(() => {
      const nav = dom.settingsFrame.contentDocument?.querySelector('.nav-btn[data-section="profiles"]');
      if (nav) nav.click();
    }, 100);
  });

  // Theme toggle
  dom.btnTheme.addEventListener('click', toggleTheme);

  // History
  dom.btnHistory.addEventListener('click', () => dom.historyView.classList.add('visible'));
  dom.btnCloseHistory.addEventListener('click', () => dom.historyView.classList.remove('visible'));

  // Support
  dom.btnSupport.addEventListener('click', () => window.open(SUPPORT_URL, '_blank', 'noopener'));

  // Settings
  dom.btnSettings.addEventListener('click', () => dom.settingsView.classList.add('visible'));
  dom.btnCloseSettings.addEventListener('click', async () => {
    dom.settingsView.classList.remove('visible');
    state.settings = await loadSettings();
    state.profile  = await loadProfile();
    dom.mockBanner.classList.toggle('hidden', state.settings?.provider !== 'mock');
    await populateProfileStrip();
  });

  // Tabs
  dom.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Template Selection
  dom.templateOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      dom.templateOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      state.templateId = opt.dataset.template;
      updatePreviews();
    });
  });

  // Accent Color
  dom.colorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      dom.colorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      state.accentColor = dot.dataset.color;
      updatePreviews();
    });
  });

  // Spacing
  dom.selectSpacing.addEventListener('change', () => {
    state.spacingMode = dom.selectSpacing.value;
    updatePreviews();
  });

  // Cover letter length pills
  dom.lengthPills.forEach(pill => {
    pill.addEventListener('click', () => {
      dom.lengthPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.clLength = pill.dataset.length;
    });
  });

  // Tone slider
  dom.rangeTone.addEventListener('input', () => {
    state.tone = Number(dom.rangeTone.value);
    dom.toneDescriptor.textContent = toneLabel(state.tone);
  });

  // Generation — same handler doubles as Stop when in generating state.
  // Shows a confirmation before overwriting an existing draft.
  dom.btnGenResume.addEventListener('click', async () => {
    if (dom.btnGenResume.classList.contains('btn-stop')) { stopGeneration(); return; }
    if (await confirmOverwrite('resume')) runGeneration('resume');
  });
  dom.btnGenCL.addEventListener('click', async () => {
    if (dom.btnGenCL.classList.contains('btn-stop')) { stopGeneration(); return; }
    if (await confirmOverwrite('cover-letter')) runGeneration('cover-letter');
  });
  dom.btnGenBoth.addEventListener('click', async () => {
    if (dom.btnGenBoth.classList.contains('btn-stop')) { stopGeneration(); return; }
    if (await confirmOverwrite('both')) runGeneration('both');
  });

  // Revision — button stays disabled until the user has typed something
  dom.fieldRevision.addEventListener('input', refreshRevisionButton);
  dom.btnApplyChanges.addEventListener('click', applyRevision);
  dom.btnRegenerate.addEventListener('click', resetToOriginal);

  // ATS Check
  dom.btnAtsScan.addEventListener('click', runAtsCheck);
  dom.btnAtsApply.addEventListener('click', applyAtsKeywords);

  // Save as PDF (via print dialog)
  dom.btnPrintBoth.addEventListener('click', () => printDraft('resume', 'cover-letter'));
  dom.btnPrintCL.addEventListener('click', () => printDraft('cover-letter'));
  dom.btnPrintMerged.addEventListener('click', () => printDraft('merged'));

  // Error Retry
  dom.btnErrorRetry.addEventListener('click', () => {
    if (state.lastRunMode) runGeneration(state.lastRunMode);
  });

  // Error → Open Settings (navigate iframe to the relevant section)
  dom.btnErrorSettings.addEventListener('click', () => {
    dom.settingsView.classList.add('visible');
    const section = dom.btnErrorSettings.dataset.section || 'provider';
    const nav = dom.settingsFrame.contentDocument?.querySelector(`.nav-btn[data-section="${section}"]`);
    if (nav) nav.click();
  });

  // Sync inputs
  dom.fieldTitle.addEventListener('input', () => state.jobData.jobTitle = dom.fieldTitle.value);
  dom.fieldCompany.addEventListener('input', () => state.jobData.company = dom.fieldCompany.value);
  dom.fieldDesc.addEventListener('input', () => state.jobData.description = dom.fieldDesc.value);
}

// ── Core Logic ────────────────────────────────────────────────────────────

async function runGeneration(mode) {
  if (!await validateForGeneration(mode)) return;

  currentAbortController = new AbortController();
  const { signal } = currentAbortController;

  state.lastRunMode = mode;
  setGenerating(true);
  hideError();

  const toGenerate = mode === 'both' ? ['resume', 'cover-letter'] : [mode];

  try {
    for (const type of toGenerate) {
      dom.genStatusText.textContent = `Tailoring ${type === 'resume' ? 'resume' : 'cover letter'}...`;

      let raw;
      if (type === 'resume') {
        raw = await generateResume(state.jobData, state.profile, state.settings, state.sourceResumeText, signal, state.tone);
      } else {
        raw = await generateCoverLetter(state.jobData, state.profile, state.settings, state.sourceResumeText, signal, state.tone, state.clLength);
      }

      const parsed = tryParseJson(raw);
      if (parsed) {
        state.drafts[type] = parsed;
      } else {
        throw new Error(`AI returned invalid content format for ${type}.`);
      }
    }

    updatePreviews();
    state.originalDrafts = JSON.parse(JSON.stringify(state.drafts));

    if (mode === 'both') {
      dom.tabBtnMerged.classList.remove('hidden');
      dom.btnPrintMerged.classList.remove('hidden');
    } else {
      dom.tabBtnMerged.classList.add('hidden');
      dom.btnPrintMerged.classList.add('hidden');
    }

    switchTab(toGenerate[0]);
    showToast('✨ Drafts ready!');

    // Persist so draft survives the panel being closed and reopened
    chrome.storage.local.set({
      savedDraft: {
        drafts:         state.drafts,
        originalDrafts: state.originalDrafts,
        jobData:        state.jobData,
        lastRunMode:    state.lastRunMode,
        templateId:     state.templateId,
        accentColor:    state.accentColor,
        spacingMode:    state.spacingMode,
        tone:           state.tone,
        clLength:       state.clLength,
      }
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      showToast('Generation stopped.');
    } else {
      showError(e);
    }
  } finally {
    currentAbortController = null;
    setGenerating(false);
  }
}

function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
}

// ── Job History ───────────────────────────────────────────────────────────

async function appendJobHistory(targets) {
  const docType = targets.includes('merged') || (targets.includes('resume') && targets.includes('cover-letter'))
    ? 'Resume + Cover Letter'
    : targets.includes('cover-letter') ? 'Cover Letter'
    : 'Resume';

  const entry = {
    id:        Date.now(),
    jobTitle:  state.jobData.jobTitle  || '(untitled)',
    company:   state.jobData.company   || '',
    sourceUrl: state.jobData.sourceUrl || '',
    docType,
    date:      new Date().toISOString(),
  };

  const { jobHistory = [] } = await chrome.storage.local.get('jobHistory');
  jobHistory.unshift(entry);
  if (jobHistory.length > 100) jobHistory.splice(100);
  chrome.storage.local.set({ jobHistory });
}

// ── Welcome Modal ─────────────────────────────────────────────────────────

function showWelcomeModal() {
  const overlay   = document.getElementById('welcome-overlay');
  const btnStart  = document.getElementById('welcome-btn-start');
  const btnDonate = document.getElementById('welcome-btn-donate');
  const btnSkip   = document.getElementById('welcome-btn-skip');

  // Show the donate button only when a URL is configured
  if (!SUPPORT_URL || SUPPORT_URL === '#') {
    btnDonate.classList.add('hidden');
  }

  overlay.classList.remove('hidden');
  btnStart.focus();

  const dismiss = () => {
    chrome.storage.local.set({ welcomeSeen: true });
    overlay.classList.add('hidden');
  };

  btnStart.addEventListener('click', dismiss, { once: true });
  btnSkip.addEventListener('click', dismiss, { once: true });
  btnDonate.addEventListener('click', () => {
    window.open(SUPPORT_URL, '_blank', 'noopener');
    dismiss();
  }, { once: true });
}

// ── Confirm Dialog ────────────────────────────────────────────────────────

function showConfirmDialog(title, body, confirmLabel = 'Continue') {
  return new Promise(resolve => {
    const overlay   = document.getElementById('confirm-overlay');
    const btnOk     = document.getElementById('confirm-btn-ok');
    const btnCancel = document.getElementById('confirm-btn-cancel');

    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent  = body;
    btnOk.textContent = confirmLabel;
    overlay.classList.remove('hidden');
    btnCancel.focus();

    const cleanup = result => {
      overlay.classList.add('hidden');
      overlay.removeEventListener('click', onBackdrop);
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      resolve(result);
    };

    const onOk       = () => cleanup(true);
    const onCancel   = () => cleanup(false);
    const onBackdrop = e => { if (e.target === overlay) cleanup(false); };

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
  });
}

async function confirmOverwrite(mode) {
  const hasResume = !!state.drafts.resume;
  const hasCL    = !!state.drafts['cover-letter'];
  const affected  = mode === 'both'   ? (hasResume || hasCL)
                  : mode === 'resume' ? hasResume
                  : hasCL;

  if (!affected) return true;

  const label = mode === 'both'   ? 'resume and cover letter'
              : mode === 'resume' ? 'resume'
              :                     'cover letter';

  return showConfirmDialog(
    'Replace existing draft?',
    `You already have a ${label} draft. Generating a new one will replace it.`,
    'Replace'
  );
}

function resetToOriginal() {
  const docType = state.currentTab;
  if (!state.originalDrafts?.[docType]) return;

  state.drafts[docType] = JSON.parse(JSON.stringify(state.originalDrafts[docType]));
  updatePreviews();
  dom.fieldRevision.value = '';
  refreshRevisionButton();
  showToast('↩ Draft reset to original.');
}

async function applyRevision() {
  const request = dom.fieldRevision.value.trim();
  if (!request) return;

  const docType = state.currentTab;
  if (!state.drafts[docType]) return;

  dom.btnApplyChanges.disabled = true;
  dom.btnApplyChanges.textContent = 'Applying…';
  dom.btnApplyChanges.classList.add('btn--loading');
  dom.btnRegenerate.disabled = true;

  try {
    const raw = await reviseDraft(state.drafts[docType], request, docType, state.jobData, state.profile, state.settings);
    const parsed = tryParseJson(raw);
    if (parsed) {
      state.drafts[docType] = parsed;
      updatePreviews();
      dom.fieldRevision.value = '';
      showToast('✅ Changes applied!');
    } else {
      showToast('⚠️ Could not apply changes — try rephrasing your request.');
    }
  } catch (e) {
    showToast(`⚠️ ${mapError(e).message}`);
  } finally {
    dom.btnApplyChanges.classList.remove('btn--loading');
    dom.btnApplyChanges.textContent = 'Apply Changes';
    refreshRevisionButton();
    dom.btnRegenerate.disabled = !state.originalDrafts?.[docType];
  }
}

function updatePreviews() {
  const options = {
    accentColor: state.accentColor,
    spacingMode: state.spacingMode
  };

  if (state.drafts.resume) {
    dom.draftResumeEmpty.classList.add('hidden');
    dom.draftResumeContent.classList.remove('hidden');
    const resumeData = {
      ...state.drafts.resume,
      personalInfo: state.profile.personalInfo
    };
    const html = renderDocument(state.templateId, 'resume', resumeData, options);
    injectToIframe(dom.previewResumeFrame, html);
    refreshExportButtons();
  }

  if (state.drafts['cover-letter']) {
    dom.draftCLEmpty.classList.add('hidden');
    dom.draftCLContent.classList.remove('hidden');
    // Map the draft to the expected format for cover letters
    const clData = {
      personalInfo: state.profile.personalInfo,
      content: state.drafts['cover-letter']
    };
    const html = renderDocument(state.templateId, 'cover-letter', clData, options);
    injectToIframe(dom.previewCLFrame, html);
  }

  if (state.drafts.resume && state.drafts['cover-letter']) {
    dom.draftMergedEmpty.classList.add('hidden');
    dom.draftMergedContent.classList.remove('hidden');
    const resumeData = {
      ...state.drafts.resume,
      personalInfo: state.profile.personalInfo
    };
    const clData = {
      personalInfo: state.profile.personalInfo,
      content: state.drafts['cover-letter']
    };
    const html = renderMergedDocument(state.templateId, resumeData, clData, options);
    injectToIframe(dom.previewMergedFrame, html);
  }

  refreshExportButtons();
}

function injectToIframe(iframe, html) {
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}


function printDraft(...types) {
  // If no types specified, default to the currently active tab
  const targets = types.length ? types : [state.currentTab];

  // Validate we have content to print
  if (targets.includes('merged')) {
    if (!state.drafts.resume || !state.drafts['cover-letter']) {
      showToast('⚠️ Both resume and cover letter must be ready.');
      return;
    }
  } else {
    const validTargets = targets.filter(tab => !!state.drafts[tab]);
    if (!validTargets.length) {
      showToast(`⚠️ No content to print yet.`);
      return;
    }
  }

  // User is saving as PDF — record to history as a signal of a completed application
  appendJobHistory(targets);

  const options = {
    accentColor: state.accentColor,
    spacingMode: state.spacingMode
  };

  if (targets.includes('merged')) {
    const resumeData = { ...state.drafts.resume, personalInfo: state.profile.personalInfo };
    const clData = { personalInfo: state.profile.personalInfo, content: state.drafts['cover-letter'] };
    const html = renderMergedDocument(state.templateId, resumeData, clData, options);
    const printWin = window.open('', '_blank');
    if (!printWin) {
      showToast('❌ Pop-up blocked! Please allow pop-ups for this extension.');
      return;
    }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    showToast('🖨️ Opening print preview — choose "Save as PDF" for best results.');
    printWin.onload = () => {
      printWin.focus();
      setTimeout(() => { printWin.print(); }, 300);
    };
    return;
  }

  for (const tab of targets.filter(t => !!state.drafts[t])) {
    const draft = state.drafts[tab];
    const data = tab === 'resume'
      ? { ...draft, personalInfo: state.profile.personalInfo }
      : { personalInfo: state.profile.personalInfo, content: draft };

    const html = renderDocument(state.templateId, tab, data, options);

    const printWin = window.open('', '_blank');
    if (!printWin) {
      showToast('❌ Pop-up blocked! Please allow pop-ups for this extension.');
      return;
    }

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();

    showToast('🖨️ Opening print preview — choose "Save as PDF" for best results.');

    printWin.onload = () => {
      printWin.focus();
      setTimeout(() => {
        printWin.print();
      }, 300);
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

// ── Draft Persistence ─────────────────────────────────────────────────────

function restoreSavedDraft(saved) {
  state.drafts         = saved.drafts         || { resume: null, 'cover-letter': null };
  state.originalDrafts = saved.originalDrafts || { resume: null, 'cover-letter': null };
  state.jobData        = saved.jobData        || state.jobData;
  state.lastRunMode = saved.lastRunMode || null;
  state.templateId  = saved.templateId  || 'classic';
  state.accentColor = saved.accentColor || '#2563eb';
  state.spacingMode = saved.spacingMode || 'standard';
  state.tone        = saved.tone        ?? 30;
  state.clLength    = saved.clLength    || 'standard';

  // Restore form fields
  dom.fieldTitle.value   = state.jobData.jobTitle  || '';
  dom.fieldCompany.value = state.jobData.company   || '';
  dom.fieldUrl.value     = state.jobData.sourceUrl || '';
  dom.fieldDesc.value     = state.jobData.description || '';

  // Restore style controls
  dom.templateOptions.forEach(o => o.classList.toggle('active', o.dataset.template === state.templateId));
  dom.colorDots.forEach(d => d.classList.toggle('active', d.dataset.color === state.accentColor));
  dom.selectSpacing.value  = state.spacingMode;
  dom.rangeTone.value      = state.tone;
  dom.toneDescriptor.textContent = toneLabel(state.tone);
  dom.lengthPills.forEach(p => p.classList.toggle('active', p.dataset.length === state.clLength));

  // Restore merged tab
  if (state.lastRunMode === 'both') {
    dom.tabBtnMerged.classList.remove('hidden');
    dom.btnPrintMerged.classList.remove('hidden');
  }

  if (state.drafts.resume || state.drafts['cover-letter']) {
    updatePreviews();
  }

  switchTab(state.drafts.resume ? 'resume' : 'cover-letter');
}

async function clearSession() {
  await chrome.storage.local.remove(['savedDraft']);

  state.drafts      = { resume: null, 'cover-letter': null };
  state.jobData     = { jobTitle: '', company: '', sourceUrl: '', description: '' };
  state.lastRunMode = null;

  dom.fieldTitle.value = '';
  dom.fieldCompany.value = '';
  dom.fieldUrl.value = '';
  dom.fieldDesc.value = '';
  dom.selectionNotice.classList.add('hidden');
  dom.sourceIndicator.textContent = '';

  dom.draftResumeEmpty.classList.remove('hidden');
  dom.draftResumeContent.classList.add('hidden');
  dom.draftCLEmpty.classList.remove('hidden');
  dom.draftCLContent.classList.add('hidden');
  dom.draftMergedEmpty.classList.remove('hidden');
  dom.draftMergedContent.classList.add('hidden');
  dom.tabBtnMerged.classList.add('hidden');
  dom.btnPrintMerged.classList.add('hidden');

  refreshExportButtons();
  switchTab('resume');
  showToast('Draft cleared.');
}

function refreshRevisionButton() {
  dom.btnApplyChanges.disabled = !state.drafts[state.currentTab] || !dom.fieldRevision.value.trim();
}

function switchTab(tab) {
  state.currentTab = tab;
  dom.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  dom.tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  refreshRevisionButton();
  dom.btnRegenerate.disabled = !state.originalDrafts?.[tab];
  refreshExportButtons();
}

async function validateForGeneration(mode) {
  if (!state.settings?.provider) {
    showError('AI provider not configured. Go to Settings.');
    return false;
  }
  if (!dom.fieldDesc.value.trim()) {
    showError(new Error('no_job_desc'));
    return false;
  }
  if (state.settings?.provider !== 'mock' && !state.profile?.personalInfo?.fullName) {
    showError(new Error('no_profile'));
    return false;
  }
  return true;
}

function setGenerating(on) {
  dom.genStatus.classList.toggle('hidden', !on);

  const allGenBtns = [dom.btnGenBoth, dom.btnGenResume, dom.btnGenCL];
  const modeMap = { both: dom.btnGenBoth, resume: dom.btnGenResume, 'cover-letter': dom.btnGenCL };
  const activeBtn = modeMap[state.lastRunMode];

  if (on) {
    allGenBtns.forEach(b => {
      if (b === activeBtn) {
        b.dataset.originalText = b.textContent;
        b.textContent = '■ Stop';
        b.classList.add('btn-stop');
        b.disabled = false;
      } else {
        b.disabled = true;
      }
    });
  } else {
    allGenBtns.forEach(b => {
      b.disabled = false;
      b.classList.remove('btn-stop');
      if (b.dataset.originalText) {
        b.textContent = b.dataset.originalText;
        delete b.dataset.originalText;
      }
    });
  }
}

function showError(err) {
  const mapped = mapError(err);
  // Only log to console.error for unexpected runtime errors, not validation messages
  if (err instanceof Error && mapped.action === 'retry') console.error('[JPDA]', err);
  else if (mapped.action !== 'settings') console.warn('[JPDA]', mapped.message);
  dom.genErrorMessage.textContent = `⚠️ ${mapped.message}`;
  dom.btnErrorRetry.classList.toggle('hidden', mapped.action !== 'retry');
  dom.btnErrorSettings.classList.toggle('hidden', mapped.action !== 'settings');
  dom.btnErrorSettings.dataset.section = mapped.settingsSection || 'provider';
  dom.genError.classList.remove('hidden');
  setGenerating(false);
}

function hideError() { dom.genError.classList.add('hidden'); }

function refreshExportButtons() {
  const hasResume = !!state.drafts.resume;
  const hasCL = !!state.drafts['cover-letter'];
  dom.btnPrintBoth.disabled = !hasResume;
  dom.btnPrintCL.disabled = !hasCL;
  dom.btnPrintMerged.disabled = !(hasResume && hasCL);
  dom.btnAtsScan.disabled = !hasResume || !state.jobData.description;
}

// ── ATS Check ─────────────────────────────────────────────────────────────

async function runAtsCheck() {
  if (!state.drafts.resume || !state.jobData.description) return;

  dom.atsStatus.classList.remove('hidden');
  dom.atsResults.classList.add('hidden');
  dom.atsEmpty.classList.add('hidden');
  dom.btnAtsScan.disabled = true;

  try {
    const keywords = await extractAtsKeywords(state.jobData.description, state.settings);
    if (!keywords.length) {
      showToast('⚠️ Could not extract keywords from job description.');
      dom.atsEmpty.classList.remove('hidden');
      return;
    }

    const resumeText = JSON.stringify(state.drafts.resume).toLowerCase();
    const matched = keywords.filter(k => resumeText.includes(k.toLowerCase()));
    const missing  = keywords.filter(k => !resumeText.includes(k.toLowerCase()));
    renderAtsResults(matched, missing, keywords.length);
  } catch {
    showToast('⚠️ ATS scan failed.');
    dom.atsEmpty.classList.remove('hidden');
  } finally {
    dom.atsStatus.classList.add('hidden');
    dom.btnAtsScan.disabled = !state.drafts.resume || !state.jobData.description;
  }
}

function renderAtsResults(matched, missing, total) {
  dom.atsResults.classList.remove('hidden');
  dom.atsScore.textContent = `${matched.length} of ${total} keywords matched`;

  // Matched — display only
  if (matched.length) {
    dom.atsMatchedGroup.classList.remove('hidden');
    dom.atsMatchedChips.innerHTML = matched.map(k => {
      const span = document.createElement('span');
      span.className = 'ats-chip ats-chip--matched';
      span.textContent = k;
      return span.outerHTML;
    }).join('');
  } else {
    dom.atsMatchedGroup.classList.add('hidden');
  }

  // Missing — interactive buttons, all pre-selected by default
  if (missing.length) {
    dom.atsMissingGroup.classList.remove('hidden');
    dom.atsMissingChips.innerHTML = '';
    missing.forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'ats-chip ats-chip--missing';
      btn.type = 'button';
      btn.textContent = k;
      btn.addEventListener('click', () => {
        btn.classList.toggle('ats-chip--deselected');
        updateAtsApplyButton();
      });
      dom.atsMissingChips.appendChild(btn);
    });
    dom.atsApplyRow.classList.remove('hidden');
    updateAtsApplyButton();
  } else {
    dom.atsMissingGroup.classList.add('hidden');
    dom.atsApplyRow.classList.add('hidden');
  }
}

function updateAtsApplyButton() {
  const count = dom.atsMissingChips.querySelectorAll('.ats-chip--missing:not(.ats-chip--deselected)').length;
  dom.btnAtsApply.textContent = `Apply ${count} keyword${count !== 1 ? 's' : ''} to resume`;
  dom.btnAtsApply.disabled = count === 0;
}

function applyAtsKeywords() {
  const selected = Array.from(
    dom.atsMissingChips.querySelectorAll('.ats-chip--missing:not(.ats-chip--deselected)')
  ).map(el => el.textContent.trim());

  if (!selected.length) return;

  dom.fieldRevision.value = `Naturally incorporate the following keywords into the resume where they genuinely apply to my experience: ${selected.join(', ')}`;
  refreshRevisionButton();
  document.getElementById('card-revision').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  dom.fieldRevision.focus();
  showToast('✦ Keywords added to Refine — review and click Apply Changes.');
}

let toastTimer;
function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.remove('hidden');
  // Small delay to allow 'hidden' removal to take effect before adding 'show' for transition
  requestAnimationFrame(() => {
    dom.toast.classList.add('show');
  });

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
    // Wait for transition to finish before hiding
    setTimeout(() => {
      if (!dom.toast.classList.contains('show')) {
        dom.toast.classList.add('hidden');
      }
    }, 400);
  }, 3000);
}

async function loadSettings() {
  const data = await chrome.storage.sync.get(['providerSettings']);
  const raw = data.providerSettings || null;
  if (!raw) return null;
  // Old flat format — return as-is
  if (!raw.configs) return raw;
  // New per-provider format — flatten active provider config for callAI
  const provider = raw.activeProvider || '';
  const config = (raw.configs || {})[provider] || {};
  return {
    provider,
    apiKey:          config.apiKey    || '',
    modelName:       config.modelName || '',
    endpoint:        config.endpoint  || '',
    simulateFailure: raw.simulateFailure || 'none',
  };
}

async function populateProfileStrip() {
  const { profiles, activeId } = await loadProfiles();
  dom.profileSwitcher.innerHTML = '';
  profiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === activeId) opt.selected = true;
    dom.profileSwitcher.appendChild(opt);
  });
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark')  root.dataset.theme = 'dark';
  else if (theme === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;

  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  dom.btnTheme.textContent   = isDark ? '☀' : '🌙';
  dom.btnTheme.title         = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  dom.btnTheme.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const isDark  = current === 'dark' ||
    (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDark ? 'light' : 'dark';
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
}

function toneLabel(value) {
  if (value <= 20) return 'Formal';
  if (value <= 40) return 'Professional';
  if (value <= 60) return 'Balanced';
  if (value <= 80) return 'Conversational';
  return 'Casual';
}

function tryParseJson(str) {
  try {
    // Robust parsing: find the first { and last }
    const start = str.indexOf('{');
    const end = str.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(str.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ── Feature Tour ──────────────────────────────────────────────────────────

const TOUR_STEPS = [
  {
    target: '#card-job-info',
    title: 'Step 1 — Job Info',
    body: 'Start here. Fill in the job title, employer, and location. If you right-clicked a job posting and used the context menu, these auto-fill from the page.',
  },
  {
    target: '#card-job-desc',
    title: 'Step 2 — Job Description',
    body: 'Paste the full job posting here. The more detail the AI has, the more precisely it tailors your documents to this specific role.',
  },
  {
    target: '#card-template',
    title: 'Step 3 — Style',
    body: 'Choose a document layout, accent colour, and spacing. Changes update the preview instantly — try a few before generating.',
  },
  {
    target: '#card-generate',
    title: 'Step 4 — Generate',
    body: 'Generate a tailored resume, cover letter, or both with one click. A Stop button replaces this while the AI is working, in case you need to cancel.',
  },
  {
    target: '#card-drafts',
    title: 'Preview',
    body: 'Your tailored documents appear here. Switch between the Resume and Cover Letter tabs to review each one before saving.',
  },
  {
    target: '#card-revision',
    title: 'Refine',
    body: 'Not quite right? Type what you\'d like changed — "more confident tone" or "emphasise leadership" — and the AI revises the current document.',
  },
  {
    target: '#card-save',
    title: 'Save as PDF',
    body: 'When you\'re happy, open the browser print dialog to save your documents as PDF. Choose "Save as PDF" as the destination.',
  },
  {
    target: '#btn-settings',
    title: 'Settings',
    body: 'Set up your AI provider and API key here. Fill in your profile too — the AI uses your background details in every application.',
  },
  {
    target: '#btn-new-draft',
    title: 'New Draft',
    body: 'Clear everything and start fresh for a new job. Your current draft is saved automatically, so closing the panel never loses your work.',
  },
];

let tourIndex = 0;

function startTour() {
  dom.settingsView.classList.remove('visible');
  tourIndex = 0;
  $('tour-overlay').classList.remove('hidden');
  showTourStep(0);

  document.addEventListener('keydown', tourKeyHandler);
}

function showTourStep(index) {
  tourIndex = index;
  const step = TOUR_STEPS[index];
  const targetEl = document.querySelector(step.target);
  if (!targetEl) { endTour(); return; }

  $('tour-step-count').textContent = `${index + 1} of ${TOUR_STEPS.length}`;
  $('tour-title').textContent = step.title;
  $('tour-body').textContent = step.body;
  $('tour-btn-prev').style.visibility = index === 0 ? 'hidden' : 'visible';
  $('tour-btn-next').textContent = index === TOUR_STEPS.length - 1 ? 'Finish' : 'Next →';

  // Scroll to element, then position once scroll settles
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => positionTourElements(targetEl), 320);
}

function positionTourElements(targetEl) {
  const rect = targetEl.getBoundingClientRect();
  const spotlight = $('tour-spotlight');
  const tooltip   = $('tour-tooltip');
  const pad = 6;
  const gap = 12;

  spotlight.style.top    = (rect.top    - pad) + 'px';
  spotlight.style.left   = (rect.left   - pad) + 'px';
  spotlight.style.width  = (rect.width  + pad * 2) + 'px';
  spotlight.style.height = (rect.height + pad * 2) + 'px';
  spotlight.style.borderRadius = getComputedStyle(targetEl).borderRadius;

  const viewH    = window.innerHeight;
  const viewW    = window.innerWidth;
  const tipW     = tooltip.offsetWidth  || 288;
  const tipH     = tooltip.offsetHeight || 160;

  // Prefer below, fall back to above, then centre vertically if neither fits
  let top;
  if (rect.bottom + pad + gap + tipH <= viewH - 8) {
    top = rect.bottom + pad + gap;
  } else if (rect.top - pad - gap - tipH >= 8) {
    top = rect.top - pad - gap - tipH;
  } else {
    top = Math.max(8, (viewH - tipH) / 2);
  }

  let left = rect.left + rect.width / 2 - tipW / 2;
  left = Math.max(8, Math.min(left, viewW - tipW - 8));

  tooltip.style.top  = top  + 'px';
  tooltip.style.left = left + 'px';
}

function endTour() {
  $('tour-overlay').classList.add('hidden');
  document.removeEventListener('keydown', tourKeyHandler);
}

function tourKeyHandler(e) {
  if (e.key === 'Escape') endTour();
  if (e.key === 'ArrowRight' && tourIndex < TOUR_STEPS.length - 1) showTourStep(tourIndex + 1);
  if (e.key === 'ArrowLeft'  && tourIndex > 0) showTourStep(tourIndex - 1);
}

// Start app
init();
