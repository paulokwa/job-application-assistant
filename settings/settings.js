// settings/settings.js — Settings page controller (Redesigned for HTML-First System)

import { extractProfileFromResume, extractTextFromDocx, fileToArrayBuffer } from '../modules/extraction.js';
import { loadProfile, saveProfile, loadProfiles, createProfile, renameProfile, deleteProfile, switchProfile, updateProfileMeta } from '../modules/profile.js';
import { callAI } from '../modules/provider.js';
import { mapError } from '../modules/errorMapper.js';

// ── State ─────────────────────────────────────────────────────────────────
let profile = null;
let settings = {};
let docSettings = {};

const ALL_CHIPS = ['{docType}', '{company}', '{jobTitle}', '{date}'];
let activeChips = ['{docType}', '{company}', '{jobTitle}'];

const PROVIDER_MODELS = {
  mock: ['mock-basic'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
  openrouter: [
    'anthropic/claude-3.5-haiku',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3-opus',
    'openai/gpt-4o-mini',
    'openai/gpt-4o',
    'google/gemini-2.0-flash-001',
    'meta-llama/llama-3.3-70b-instruct',
    'deepseek/deepseek-chat',
  ],
  ollama: ['llama3', 'mistral', 'gemma', 'phi3']
};

const DEFAULT_MODELS = {
  mock: 'mock-basic',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
  openrouter: 'anthropic/claude-3.5-haiku',
  ollama: 'llama3'
};

const PROVIDER_API_LINKS = {
  openai:      { label: 'Get your OpenAI API key at platform.openai.com/api-keys', url: 'https://platform.openai.com/api-keys' },
  gemini:      { label: 'Get your Gemini API key at aistudio.google.com/app/apikey', url: 'https://aistudio.google.com/app/apikey' },
  openrouter:  { label: 'Get your OpenRouter key at openrouter.ai/keys — one key for Claude, GPT-4, Gemini, Llama and more', url: 'https://openrouter.ai/keys' },
};

const $ = id => document.getElementById(id);

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('embed') === 'true') document.body.classList.add('embedded');

  // Apply stored theme before page renders to prevent flash
  const { theme } = await chrome.storage.local.get(['theme']);
  applyTheme(theme || 'system');

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.theme) {
      applyTheme(changes.theme.newValue || 'system');
    }
  });

  // Load saved data
  const stored = await chrome.storage.sync.get(['providerSettings', 'docSettings']);
  settings = migrateSettings(stored.providerSettings);
  docSettings = stored.docSettings || { templateMode: 'smart' };
  profile = await loadProfile();

  // Populate sections
  populateProviderSection(settings);
  populateDocSection(docSettings);
  populateProfile(profile);
  await populateSourceStatus();
  await populateProfilesSection();

  // Navigation
  document.querySelectorAll('.nav-btn[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      $(`section-${btn.dataset.section}`).classList.add('active');
    });
  });

  // Wiring
  $('btn-save-provider').addEventListener('click', saveProvider);
  $('btn-save-documents').addEventListener('click', saveDocuments);
  $('btn-save-profile').addEventListener('click', saveProfileData);
  $('btn-clear-profile').addEventListener('click', clearProfile);

  // Tour
  $('btn-settings-tour').addEventListener('click', startSettingsTour);
  $('settings-tour-btn-skip').addEventListener('click', endSettingsTour);
  $('settings-tour-btn-prev').addEventListener('click', () => { if (settingsTourIndex > 0) showSettingsTourStep(settingsTourIndex - 1); });
  $('settings-tour-btn-next').addEventListener('click', () => {
    if (settingsTourIndex < SETTINGS_TOUR_STEPS.length - 1) showSettingsTourStep(settingsTourIndex + 1);
    else endSettingsTour();
  });

  // API key toggle
  $('btn-toggle-key').addEventListener('click', () => {
    const inp = $('inp-apikey');
    const btn = $('btn-toggle-key');
    const revealing = inp.type === 'password';
    inp.type = revealing ? 'text' : 'password';
    btn.textContent = revealing ? 'Hide' : 'Show';
    btn.setAttribute('aria-label', revealing ? 'Hide API key' : 'Show API key');
  });
  $('inp-apikey').addEventListener('input', () => $('hint-saved-key').classList.add('hidden'));

  // Ollama help modal
  $('btn-ollama-help').addEventListener('click', showOllamaHelp);
  $('btn-close-ollama-help').addEventListener('click', hideOllamaHelp);
  $('ollama-help-overlay').addEventListener('click', e => { if (e.target === $('ollama-help-overlay')) hideOllamaHelp(); });
  
  $('sel-provider').addEventListener('change', () => updateProviderVisibility(true));
  $('sel-model').addEventListener('change', () => {
    $('inp-custom-model').classList.toggle('hidden', $('sel-model').value !== 'custom');
  });
  
  $('inp-separator').addEventListener('input', syncPatternInput);
  $('btn-test-provider').addEventListener('click', testConnection);
  $('inp-source-resume').addEventListener('change', handleSourceResumeUpload);

  // Dynamic lists
  $('btn-add-exp').addEventListener('click',  () => addExperienceEntry());
  $('btn-add-edu').addEventListener('click',  () => addEducationEntry());
  $('btn-add-cert').addEventListener('click', () => addCertEntry());
  $('btn-add-summary').addEventListener('click', () => addSummaryEntry());

  $('btn-add-profile').addEventListener('click', handleAddProfile);
  $('btn-go-to-profile').addEventListener('click', () => {
    document.querySelector('.nav-btn[data-section="profile"]').click();
  });

  updateFilenamePreview();
}

function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
}

// ── Provider Section ──────────────────────────────────────────────────────

// Migrate old flat format { provider, apiKey, ... } to per-provider configs format
function migrateSettings(raw) {
  if (!raw) return { activeProvider: '', configs: {}, simulateFailure: 'none' };
  if (raw.configs !== undefined) return raw; // already new format
  const provider = raw.provider || '';
  const configs = {};
  if (provider) {
    configs[provider] = {
      apiKey:    raw.apiKey    || '',
      modelName: raw.modelName || '',
      endpoint:  raw.endpoint  || '',
    };
  }
  return { activeProvider: provider, configs, simulateFailure: raw.simulateFailure || 'none' };
}

function populateProviderSection(s) {
  const provider = s.activeProvider || '';
  if (provider) $('sel-provider').value = provider;
  if (s.simulateFailure) $('sel-simulate-failure').value = s.simulateFailure;
  updateProviderVisibility(false);
}

function updateProviderVisibility(providerChanged = false) {
  const p = $('sel-provider').value;
  const isMock = p === 'mock';
  $('group-apikey').classList.toggle('hidden', isMock || p === 'ollama' || !p);
  $('group-endpoint').classList.toggle('hidden', p !== 'ollama');

  // Restore saved config for this provider when switching
  const config = (settings.configs || {})[p] || {};
  $('inp-apikey').value   = config.apiKey   || '';
  $('inp-endpoint').value = config.endpoint || '';
  // Reset toggle to masked state and update saved-key hint
  $('inp-apikey').type = 'password';
  $('btn-toggle-key').textContent = 'Show';
  $('btn-toggle-key').setAttribute('aria-label', 'Show API key');
  updateSavedKeyHint(config.apiKey || '');

  const linkData = PROVIDER_API_LINKS[p];
  const hintEl = $('hint-api-link');
  hintEl.textContent = '';
  if (linkData) {
    const a = document.createElement('a');
    a.href = linkData.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = linkData.label;
    hintEl.appendChild(a);
    hintEl.classList.remove('hidden');
  } else {
    hintEl.classList.add('hidden');
  }
  $('provider-test-area').style.display = isMock ? 'none' : '';
  updateModelDropdown(p);
}

function updateModelDropdown(provider) {
  if (!provider) return;
  const selModel = $('sel-model');
  const storedModel = (settings.configs || {})[provider]?.modelName;
  const currentVal = storedModel || DEFAULT_MODELS[provider] || '';

  selModel.innerHTML = '';
  (PROVIDER_MODELS[provider] || []).forEach(m => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = m;
    if (m === currentVal) opt.selected = true;
    selModel.appendChild(opt);
  });

  const customOpt = document.createElement('option');
  customOpt.value = 'custom'; customOpt.textContent = 'Custom...';
  if (!PROVIDER_MODELS[provider]?.includes(currentVal) && currentVal) {
    customOpt.selected = true;
    $('inp-custom-model').value = currentVal;
    $('inp-custom-model').classList.remove('hidden');
  } else {
    $('inp-custom-model').classList.add('hidden');
  }
  selModel.appendChild(customOpt);
}

async function saveProvider() {
  const provider = $('sel-provider').value;
  const modelVal = $('sel-model').value;
  const modelName = modelVal === 'custom' ? $('inp-custom-model').value.trim() : modelVal;

  const configs = { ...(settings.configs || {}) };
  configs[provider] = {
    apiKey:    $('inp-apikey').value.trim(),
    modelName,
    endpoint:  $('inp-endpoint').value.trim(),
  };

  settings = { ...settings, activeProvider: provider, configs, simulateFailure: $('sel-simulate-failure').value };
  await chrome.storage.sync.set({ providerSettings: settings });

  const btn = $('btn-save-provider');
  const original = btn.textContent;
  btn.textContent = '✓ Saved';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
  showToast('✅ AI settings saved');
}

async function testConnection() {
  const result = $('test-result');
  const provider = $('sel-provider').value;
  if (provider === 'mock') {
    result.textContent = '✅ Demo Mode — no API key needed!';
    return;
  }
  result.textContent = '⏳ Testing…';

  // Use current form values for testing, not just saved ones
  const modelVal = $('sel-model').value;
  const testSettings = {
    provider,
    apiKey: $('inp-apikey').value.trim(),
    modelName: modelVal === 'custom' ? $('inp-custom-model').value.trim() : modelVal,
    endpoint:  $('inp-endpoint').value.trim()
  };

  try {
    const response = await callAI('You are a test assistant.', 'Reply with: "Connected"', testSettings);
    result.textContent = response ? '✅ Connected!' : '❌ Empty response';
  } catch (e) {
    result.textContent = `❌ Failed: ${mapError(e).message}`;
  }
}

// ── Autofill Helpers ──────────────────────────────────────────────────────
function getEffectiveSettings() {
  const provider = $('sel-provider').value || settings.activeProvider;
  if (!provider) return { provider: '', apiKey: '', modelName: '', endpoint: '' };
  const storedConfig = (settings.configs || {})[provider] || {};
  const modelVal = $('sel-model').value;
  return {
    provider,
    apiKey:    $('inp-apikey').value.trim()   || storedConfig.apiKey    || '',
    modelName: modelVal === 'custom'
      ? ($('inp-custom-model').value.trim()   || storedConfig.modelName || '')
      : (modelVal                             || storedConfig.modelName || ''),
    endpoint:  $('inp-endpoint').value.trim() || storedConfig.endpoint  || '',
    simulateFailure: $('sel-simulate-failure').value || settings.simulateFailure || 'none',
  };
}

async function attemptAutofill(statusEl) {
  const effectiveSettings = getEffectiveSettings();

  if (!effectiveSettings.provider || effectiveSettings.provider === 'mock') {
    renderNoProviderStatus(statusEl);
    return;
  }

  const localData = await chrome.storage.local.get(['sourceResumeText']);
  const plainText = localData.sourceResumeText;
  if (!plainText) {
    statusEl.textContent = 'No resume text found. Please re-upload your resume.';
    return;
  }

  statusEl.textContent = '';
  const spinner = document.createElement('div');
  spinner.className = 'autofill-spinner';
  const loadingMsg = document.createElement('span');
  loadingMsg.textContent = 'AI is analyzing your resume…';
  statusEl.appendChild(spinner);
  statusEl.appendChild(loadingMsg);

  try {
    const extractedData = await extractProfileFromResume(plainText, effectiveSettings);
    profile = {
      ...profile,
      personalInfo: { ...profile.personalInfo, ...(extractedData.personalInfo || extractedData.personal || {}) },
      skills: extractedData.skills || profile.skills,
      experience: extractedData.experience || profile.experience,
      education: extractedData.education || profile.education,
      certifications: extractedData.certifications || profile.certifications,
    };
    populateProfile(profile);
    await saveProfile(profile);
    renderSuccessStatus(statusEl);
  } catch (e) {
    renderErrorStatus(statusEl, e.message);
  }
}

function renderNoProviderStatus(statusEl) {
  statusEl.textContent = '';

  const msg = document.createElement('span');
  msg.textContent = 'Resume saved. Add an AI provider to enable auto-fill.';
  statusEl.appendChild(msg);

  const goBtn = document.createElement('button');
  goBtn.className = 'btn-secondary btn-sm';
  goBtn.type = 'button';
  goBtn.textContent = 'Go to AI Provider';
  goBtn.addEventListener('click', () => {
    document.querySelector('.nav-btn[data-section="provider"]').click();
  });
  statusEl.appendChild(goBtn);

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn-secondary btn-sm';
  retryBtn.type = 'button';
  retryBtn.textContent = 'Retry Auto-fill';
  retryBtn.addEventListener('click', () => attemptAutofill(statusEl));
  statusEl.appendChild(retryBtn);
}

function renderSuccessStatus(statusEl) {
  statusEl.textContent = '';

  const msg = document.createElement('span');
  msg.textContent = '✨ Profile saved from your resume. You can review and edit any field.';
  statusEl.appendChild(msg);

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn-secondary btn-sm';
  retryBtn.type = 'button';
  retryBtn.textContent = 'Re-run Auto-fill';
  retryBtn.addEventListener('click', () => attemptAutofill(statusEl));
  statusEl.appendChild(retryBtn);
}

function renderErrorStatus(statusEl, message) {
  statusEl.textContent = '';

  const msg = document.createElement('span');
  msg.textContent = `❌ Auto-fill failed: ${message}`;
  statusEl.appendChild(msg);

  const goBtn = document.createElement('button');
  goBtn.className = 'btn-secondary btn-sm';
  goBtn.type = 'button';
  goBtn.textContent = 'Go to AI Provider';
  goBtn.addEventListener('click', () => {
    document.querySelector('.nav-btn[data-section="provider"]').click();
  });
  statusEl.appendChild(goBtn);

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn-secondary btn-sm';
  retryBtn.type = 'button';
  retryBtn.textContent = 'Retry Auto-fill';
  retryBtn.addEventListener('click', () => attemptAutofill(statusEl));
  statusEl.appendChild(retryBtn);
}

// ── Chip Builder ──────────────────────────────────────────────────────────
function initChipBuilder(patternString) {
  const found = [...patternString.matchAll(/\{[^}]+\}/g)].map(m => m[0]);
  activeChips = found.filter(c => ALL_CHIPS.includes(c));
  if (activeChips.length === 0) activeChips = ['{docType}', '{company}', '{jobTitle}'];

  let sep = ' - ';
  if (found.length >= 2) {
    const idx1 = patternString.indexOf(found[0]) + found[0].length;
    const idx2 = patternString.indexOf(found[1]);
    if (idx1 < idx2) sep = patternString.slice(idx1, idx2);
  }
  $('inp-separator').value = sep;

  renderChipBuilder();
  syncPatternInput();
}

function syncPatternInput() {
  $('inp-filename-pattern').value = activeChips.join($('inp-separator').value);
  updateFilenamePreview();
}

function renderChipBuilder() {
  const track = $('chip-track');
  const palette = $('chip-palette');

  track.innerHTML = '';
  if (activeChips.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'chip-track-empty';
    empty.textContent = 'No parts — add a variable below';
    track.appendChild(empty);
  } else {
    activeChips.forEach((chip, idx) => {
      const el = document.createElement('div');
      el.className = 'chip';
      el.draggable = true;
      el.dataset.index = idx;
      el.setAttribute('role', 'listitem');

      const label = document.createElement('span');
      label.textContent = chip;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'chip-remove';
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `Remove ${chip}`);
      removeBtn.addEventListener('click', () => {
        activeChips.splice(idx, 1);
        renderChipBuilder();
        syncPatternInput();
      });

      el.appendChild(label);
      el.appendChild(removeBtn);

      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', String(idx));
        e.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(() => el.classList.add('dragging'));
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        track.querySelectorAll('.chip').forEach(c => c.classList.remove('drag-over'));
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', e => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx = parseInt(el.dataset.index, 10);
        if (fromIdx !== toIdx) {
          const [moved] = activeChips.splice(fromIdx, 1);
          activeChips.splice(toIdx, 0, moved);
          renderChipBuilder();
          syncPatternInput();
        }
      });

      track.appendChild(el);
    });
  }

  const available = ALL_CHIPS.filter(c => !activeChips.includes(c));
  palette.innerHTML = '';
  if (available.length === 0) { palette.style.display = 'none'; return; }
  palette.style.display = '';

  const paletteLabel = document.createElement('span');
  paletteLabel.className = 'chip-palette-label';
  paletteLabel.textContent = 'Add variable:';
  palette.appendChild(paletteLabel);

  available.forEach(chip => {
    const btn = document.createElement('button');
    btn.className = 'chip-add';
    btn.type = 'button';
    btn.textContent = `+ ${chip}`;
    btn.setAttribute('aria-label', `Add ${chip}`);
    btn.addEventListener('click', () => {
      activeChips.push(chip);
      renderChipBuilder();
      syncPatternInput();
    });
    palette.appendChild(btn);
  });
}

// ── Document Section ──────────────────────────────────────────────────────
function populateDocSection(d) {
  if (d.defaultType) $('sel-default-type').value = d.defaultType;
  initChipBuilder(d.filenamePattern || '{docType} - {company} - {jobTitle}');
}

function updateFilenamePreview() {
  const pattern = $('inp-filename-pattern').value || '{docType} - {company} - {jobTitle}';
  const today = new Date().toISOString().slice(0, 10);
  const sub = (t, docType) => t
    .replace(/\{jobTitle\}/gi, 'Role')
    .replace(/\{company\}/gi,  'Company')
    .replace(/\{date\}/gi,     today)
    .replace(/\{docType\}/gi,  docType)
    + '.pdf';
  $('filename-preview-1').textContent = sub(pattern, 'Resume');
  $('filename-preview-2').textContent = sub(pattern, 'Cover Letter');
}

async function saveDocuments() {
  docSettings.defaultType = $('sel-default-type').value;
  docSettings.filenamePattern = $('inp-filename-pattern').value.trim();
  await chrome.storage.sync.set({ docSettings });

  const btn = $('btn-save-documents');
  const original = btn.textContent;
  btn.textContent = '✓ Saved';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
  showToast('✅ Document settings saved');
}

// ── Source Resume & Profile ───────────────────────────────────────────────
function clearSourceResumeUI() {
  $('source-upload-text').textContent = 'Click to upload your source resume (.docx or .pdf)';
  $('source-resume-active-bar').textContent = '';
  $('source-resume-active-bar').classList.add('hidden');
  $('profile-autofill-status').textContent = '';
  $('profile-autofill-status').classList.add('hidden');
  $('inp-source-resume').value = '';
}

async function populateSourceStatus() {
  const localData = await chrome.storage.local.get(['sourceResumeName']);
  if (!localData.sourceResumeName) return;

  $('source-upload-text').textContent = `${localData.sourceResumeName} uploaded ✓`;
  $('source-resume-active-bar').textContent = `📄 Active Source: ${localData.sourceResumeName}`;
  $('source-resume-active-bar').classList.remove('hidden');

  const statusEl = $('profile-autofill-status');
  statusEl.textContent = '';

  const msg = document.createElement('span');
  msg.textContent = `Resume on file: ${localData.sourceResumeName}`;
  statusEl.appendChild(msg);

  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn-secondary btn-sm';
  retryBtn.type = 'button';
  retryBtn.textContent = 'Retry Auto-fill';
  retryBtn.addEventListener('click', () => attemptAutofill(statusEl));
  statusEl.appendChild(retryBtn);

  statusEl.classList.remove('hidden');
}

// Dynamically loads pizzip.js as a global script (needed for DOCX parsing)
function loadPizZip() {
  if (typeof PizZip !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '../lib/pizzip.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load PizZip library.'));
    document.head.appendChild(s);
  });
}

// Reads a PDF file's text content using FileReader (works for text-based PDFs)
function extractTextFromPdf(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const bytes = new Uint8Array(e.target.result);
      // Pull raw text strings from PDF bytes (basic approach — good enough for AI parsing)
      let text = '';
      for (let i = 0; i < bytes.length - 1; i++) {
        const c = bytes[i];
        if (c >= 32 && c < 127) {
          text += String.fromCharCode(c);
        } else if (c === 10 || c === 13) {
          text += '\n';
        }
      }
      // Filter out short/garbage lines of PDF binary noise
      const cleaned = text.split('\n')
        .filter(line => line.trim().length > 3)
        .join('\n');
      resolve(cleaned);
    };
    reader.onerror = () => reject(new Error('Failed to read PDF file.'));
    reader.readAsArrayBuffer(file);
  });
}

async function handleSourceResumeUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const statusEl = $('profile-autofill-status');
  statusEl.textContent = '📄 Reading file...';
  statusEl.classList.remove('hidden');

  try {
    let plainText = '';
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const isDocx = file.name.toLowerCase().endsWith('.docx');

    if (isDocx) {
      statusEl.textContent = '📄 Loading DOCX parser...';
      await loadPizZip();
      const ab = await fileToArrayBuffer(file);
      plainText = await extractTextFromDocx(ab);
    } else if (isPdf) {
      statusEl.textContent = '📄 Reading PDF...';
      plainText = await extractTextFromPdf(file);
    } else {
      throw new Error('Unsupported file type. Please upload a .docx or .pdf file.');
    }

    if (!plainText || plainText.trim().length < 50) {
      throw new Error('Could not extract enough text from the file. Please try a different format.');
    }

    await chrome.storage.local.set({
      sourceResumeText: plainText,
      sourceResumeName: file.name
    });

    const { activeId } = await loadProfiles();
    if (activeId) await updateProfileMeta(activeId, { sourceResumeName: file.name });

    $('source-upload-text').textContent = `${file.name} uploaded ✓`;
    $('source-resume-active-bar').textContent = `📄 Active Source: ${file.name}`;
    $('source-resume-active-bar').classList.remove('hidden');

    showToast('✅ Resume uploaded. Starting AI auto-fill...');
    await attemptAutofill(statusEl);
  } catch (e) {
    statusEl.textContent = `❌ Error: ${e.message}`;
    showToast('❌ Upload failed');
  }
}


function populateProfile(p) {
  $('p-name').value      = p.personalInfo?.fullName  || '';
  $('p-email').value     = p.personalInfo?.email     || '';
  $('p-phone').value     = p.personalInfo?.phone     || '';
  $('p-address').value   = p.personalInfo?.cityProvince || '';
  $('p-linkedin').value  = p.personalInfo?.linkedin  || '';
  $('p-portfolio').value = p.personalInfo?.portfolio || '';
  $('p-skills').value    = (p.skills || []).join('\n');
  $('p-do-not-claim').value = p.doNotClaimNotes || '';

  renderSummaries(p.summaries || []);
  $('experience-list').innerHTML = '';
  (p.experience || []).forEach(exp => addExperienceEntry(exp));
  $('education-list').innerHTML = '';
  (p.education || []).forEach(edu => addEducationEntry(edu));
  $('certifications-list').innerHTML = '';
  (p.certifications || []).forEach(cert => addCertEntry(cert));
}

// Summaries / Experience / Education Helpers (Simplified)
function renderSummaries(summaries) {
  const container = $('summaries-list');
  container.innerHTML = '';
  summaries.forEach(s => addSummaryEntry(s));
}

function addSummaryEntry(data = {}) {
  const container = $('summaries-list');
  const row = document.createElement('div');
  row.className = 'summary-entry';
  row.style.marginBottom = '12px';
  row.innerHTML = `
    <input type="text" class="summary-label-input" value="${escHtml(data.label || 'Summary')}" placeholder="Style (e.g. Modern)" style="width:140px; font-weight:600" /> 
    <textarea class="summary-text-input" rows="3" style="flex:1" placeholder="Paste summary text here...">${escHtml(data.text || '')}</textarea> 
    <button onclick="this.parentElement.remove()" class="btn-remove">✕</button>
  `;
  container.appendChild(row);
}

function addExperienceEntry(data = {}) {
  const div = document.createElement('div');
  div.className = 'exp-entry card';
  div.style.marginBottom = '12px';
  const roleTitle = data.jobTitle || data.title || '';
  const employer = data.employer || data.company || '';
  const dates = data.dates || (data.startDate ? `${data.startDate} - ${data.endDate || ''}` : '');
  const bullets = Array.isArray(data.bulletPoints) ? data.bulletPoints.join('\n') : (data.bullets || '');

  div.innerHTML = `
    <div style="display:flex; justify-content:space-between; margin-bottom:8px">
      <input type="text" class="exp-title" value="${escHtml(roleTitle)}" placeholder="Job Title" style="font-weight:bold" />
      <button onclick="this.closest('.exp-entry').remove()" class="btn-remove">✕</button>
    </div>
    <div class="form-grid-2">
      <input type="text" class="exp-company" value="${escHtml(employer)}" placeholder="Company" />
      <input type="text" class="exp-dates" value="${escHtml(dates)}" placeholder="Dates" />
    </div>
    <textarea class="exp-bullets" rows="3" placeholder="Bullets" style="margin-top:8px">${escHtml(bullets)}</textarea>
  `;
  $('experience-list').appendChild(div);
}

function addEducationEntry(data = {}) {
  const div = document.createElement('div');
  div.className = 'edu-entry card';
  div.style.marginBottom = '12px';
  const degree = data.credential || data.degree || '';
  const school = data.institution || data.school || '';

  div.innerHTML = `
    <div style="display:flex; justify-content:space-between">
      <input type="text" class="edu-degree" value="${escHtml(degree)}" placeholder="Degree" style="font-weight:bold" />
      <button onclick="this.closest('.edu-entry').remove()" class="btn-remove">✕</button>
    </div>
    <input type="text" class="edu-school" value="${escHtml(school)}" placeholder="School" />
  `;
  $('education-list').appendChild(div);
}

function addCertEntry(data = {}) {
  const div = document.createElement('div');
  div.className = 'cert-entry card';
  div.style.marginBottom = '12px';
  div.innerHTML = `
    <div style="display:flex; justify-content:space-between">
      <input type="text" class="cert-name" value="${escHtml(data.name)}" placeholder="Cert Name" style="font-weight:bold" />
      <button onclick="this.closest('.cert-entry').remove()" class="btn-remove">✕</button>
    </div>
    <input type="text" class="cert-issuer" value="${escHtml(data.issuer)}" placeholder="Issuer" />
  `;
  $('certifications-list').appendChild(div);
}

function collectProfileFromForm() {
  const readList = (sel, mapFn) => [...document.querySelectorAll(sel)].map(mapFn);
  return {
    personalInfo: {
      fullName:     $('p-name').value,
      email:        $('p-email').value,
      phone:        $('p-phone').value,
      cityProvince: $('p-address').value,
      linkedin:     $('p-linkedin').value,
      portfolio:    $('p-portfolio').value
    },
    summaries: readList('.summary-label-input', (el, i) => ({ label: el.value, text: document.querySelectorAll('.summary-text-input')[i].value })),
    skills: $('p-skills').value.split('\n').filter(Boolean),
    experience: readList('.exp-entry', el => ({
      jobTitle: el.querySelector('.exp-title').value,
      employer: el.querySelector('.exp-company').value,
      dates:    el.querySelector('.exp-dates').value,
      bulletPoints: el.querySelector('.exp-bullets').value.split('\n').filter(Boolean)
    })),
    education: readList('.edu-entry', el => ({
      credential:  el.querySelector('.edu-degree').value,
      institution: el.querySelector('.edu-school').value
    })),
    certifications: readList('.cert-entry', el => ({
      name:   el.querySelector('.cert-name').value,
      issuer: el.querySelector('.cert-issuer').value
    })),
    doNotClaimNotes: $('p-do-not-claim').value
  };
}

async function saveProfileData() {
  profile = collectProfileFromForm();
  await saveProfile(profile);

  const btn = $('btn-save-profile');
  const original = btn.textContent;
  btn.textContent = '✓ Saved';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
  showToast('✅ Profile saved');
}

async function clearProfile() {
  const confirmed = await showConfirmDialog(
    'Clear all profile information?',
    'This will remove your personal details, experience, education, and skills. It cannot be undone.',
    'Clear All'
  );
  if (!confirmed) return;
  profile = {
    personalInfo: {},
    summaries: [],
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    doNotClaimNotes: ''
  };
  populateProfile(profile);
  await saveProfile(profile);
  showToast('Profile cleared');
}

// Helpers
let toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show'); t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── API Key Mask ──────────────────────────────────────────────────────────
function maskKey(key) {
  if (!key) return '';
  if (key.length < 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function updateSavedKeyHint(key) {
  const hint = $('hint-saved-key');
  if (!hint) return;
  if (key && key.length >= 4) {
    hint.textContent = `Saved: ${maskKey(key)}`;
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}

// ── Confirm Dialog ────────────────────────────────────────────────────────
function showConfirmDialog(title, body, confirmLabel = 'Confirm') {
  return new Promise(resolve => {
    $('confirm-title').textContent = title;
    $('confirm-body').textContent = body;
    $('confirm-btn-ok').textContent = confirmLabel;
    $('confirm-overlay').classList.remove('hidden');
    $('confirm-btn-cancel').focus();

    const cleanup = result => {
      $('confirm-overlay').classList.add('hidden');
      $('confirm-overlay').removeEventListener('click', onBackdrop);
      $('confirm-btn-ok').removeEventListener('click', onOk);
      $('confirm-btn-cancel').removeEventListener('click', onCancel);
      resolve(result);
    };

    const onOk      = () => cleanup(true);
    const onCancel  = () => cleanup(false);
    const onBackdrop = e => { if (e.target === $('confirm-overlay')) cleanup(false); };

    $('confirm-btn-ok').addEventListener('click', onOk);
    $('confirm-btn-cancel').addEventListener('click', onCancel);
    $('confirm-overlay').addEventListener('click', onBackdrop);
  });
}

// ── Ollama Help Modal ─────────────────────────────────────────────────────
function showOllamaHelp() {
  $('ollama-help-overlay').classList.remove('hidden');
  $('btn-close-ollama-help').focus();
}
function hideOllamaHelp() {
  $('ollama-help-overlay').classList.add('hidden');
}

// ── Settings Feature Tour ─────────────────────────────────────────────────
const SETTINGS_TOUR_STEPS = [
  {
    targetId: 'settings-nav',
    section: null,
    title: 'Three Settings Sections',
    body: 'Settings are split into AI Provider (which AI powers your drafts), Documents (how files are named), and My Profile (your professional details). Click any section to jump to it.'
  },
  {
    targetId: 'sel-provider',
    section: 'provider',
    title: 'Choose Your AI Provider',
    body: 'Select OpenAI, Google Gemini, OpenRouter, or Ollama (local AI). OpenRouter is great if you want access to many models from one key — Claude, GPT-4, Gemini, and more.'
  },
  {
    targetId: 'group-model',
    section: 'provider',
    title: 'Select a Model',
    body: 'Each provider offers different models. Choose from the list or select Custom to type any model name. For Ollama, the name must match exactly what you downloaded.'
  },
  {
    targetId: 'provider-test-area',
    section: 'provider',
    title: 'Test Your Connection',
    body: 'Always test before saving — this confirms your API key is valid and the AI is reachable. For Ollama, it also checks that the local endpoint is responding.'
  },
  {
    targetId: 'btn-save-provider',
    section: 'provider',
    title: 'Save AI Settings',
    body: 'Save your provider settings here. Your API key is stored locally in Chrome — it never leaves your device except to call the AI provider directly.'
  },
  {
    targetId: 'chip-builder',
    section: 'documents',
    title: 'Filename Pattern',
    body: 'Drag chips to set how your saved PDFs are named. Add or remove variables like job title, company, and date. The preview below updates live.'
  },
  {
    targetId: 'source-upload-area',
    section: 'profile',
    title: 'Upload Your Resume',
    body: 'Upload your current CV (.docx or .pdf) and the AI will auto-fill all the profile fields below — saving significant manual entry time.'
  },
  {
    targetId: 'card-personal-details',
    section: 'profile',
    title: 'Your Professional Details',
    body: 'Fill in as much as possible here. The AI draws on your skills, experience, and education to write tailored drafts for each job. More detail means better output.'
  },
  {
    targetId: 'btn-save-profile',
    section: 'profile',
    title: 'Save Your Profile',
    body: 'Click Save Profile after making any changes — it is not saved automatically. Your details persist across every future application until you update them.'
  },
];

let settingsTourIndex = 0;

function startSettingsTour() {
  settingsTourIndex = 0;
  $('settings-tour-overlay').classList.remove('hidden');
  document.addEventListener('keydown', settingsTourKeyHandler);
  showSettingsTourStep(0);
}

function showSettingsTourStep(index) {
  settingsTourIndex = index;
  const step = SETTINGS_TOUR_STEPS[index];
  const overlay = $('settings-tour-overlay');
  const spotlight = $('settings-tour-spotlight');
  const tooltip = $('settings-tour-tooltip');

  $('settings-tour-step-count').textContent = `${index + 1} of ${SETTINGS_TOUR_STEPS.length}`;
  $('settings-tour-title').textContent = step.title;
  $('settings-tour-body').textContent = step.body;
  $('settings-tour-btn-prev').style.visibility = index === 0 ? 'hidden' : '';
  $('settings-tour-btn-next').textContent = index === SETTINGS_TOUR_STEPS.length - 1 ? 'Done' : 'Next →';

  // Navigate to the correct section first
  if (step.section) {
    const nav = document.querySelector(`.nav-btn[data-section="${step.section}"]`);
    if (nav && !nav.classList.contains('active')) nav.click();
  }

  const settle = step.section ? 80 : 0;
  setTimeout(() => {
    const targetEl = $(step.targetId);
    if (!targetEl) return;
    // Instant scroll — smooth scroll causes a race with the position timer
    targetEl.scrollIntoView({ block: 'nearest' });
    // Use center if the element lands at the very bottom of the viewport
    const r = targetEl.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 60) targetEl.scrollIntoView({ block: 'center' });
    requestAnimationFrame(() => requestAnimationFrame(() =>
      positionSettingsTourElements(targetEl, spotlight, tooltip)
    ));
  }, settle);
}

function positionSettingsTourElements(targetEl, spotlight, tooltip) {
  const pad = 6;
  const gap = 12;
  const rect = targetEl.getBoundingClientRect();
  const computed = getComputedStyle(targetEl);

  spotlight.style.top    = `${rect.top - pad}px`;
  spotlight.style.left   = `${rect.left - pad}px`;
  spotlight.style.width  = `${rect.width + pad * 2}px`;
  spotlight.style.height = `${rect.height + pad * 2}px`;
  spotlight.style.borderRadius = computed.borderRadius || '8px';
  spotlight.style.boxShadow = `0 0 0 9999px oklch(0% 0 0 / 0.62), 0 0 0 2px var(--color-accent)`;

  const viewH = window.innerHeight;
  const viewW = window.innerWidth;

  // Measure actual tooltip size rather than guessing
  tooltip.style.visibility = 'hidden';
  tooltip.style.top = '0px';
  tooltip.style.left = '0px';
  const tipH = tooltip.getBoundingClientRect().height;
  const tipW = tooltip.getBoundingClientRect().width;
  tooltip.style.visibility = '';

  let top;
  if (rect.bottom + pad + gap + tipH <= viewH - 8) {
    top = rect.bottom + pad + gap;                      // fits below
  } else if (rect.top - pad - gap - tipH >= 8) {
    top = rect.top - pad - gap - tipH;                  // fits above
  } else {
    top = Math.max(8, (viewH - tipH) / 2);             // neither — centre vertically
  }

  // Align with element left, clamped so right edge stays in viewport
  let left = Math.max(8, rect.left);
  if (left + tipW > viewW - 8) left = viewW - tipW - 8;
  left = Math.max(8, left);

  tooltip.style.top  = `${top}px`;
  tooltip.style.left = `${left}px`;
}

function endSettingsTour() {
  $('settings-tour-overlay').classList.add('hidden');
  document.removeEventListener('keydown', settingsTourKeyHandler);
}

function settingsTourKeyHandler(e) {
  if (e.key === 'Escape') endSettingsTour();
  if (e.key === 'ArrowRight' && settingsTourIndex < SETTINGS_TOUR_STEPS.length - 1) showSettingsTourStep(settingsTourIndex + 1);
  if (e.key === 'ArrowLeft'  && settingsTourIndex > 0) showSettingsTourStep(settingsTourIndex - 1);
}

// ── Profiles Section ──────────────────────────────────────────────────────

async function populateProfilesSection() {
  const { profiles, activeId } = await loadProfiles();
  renderProfilesList(profiles, activeId);
}

function renderProfilesList(profiles, activeId) {
  const list = $('profiles-list');
  list.innerHTML = '';

  profiles.forEach(p => {
    const isActive = p.id === activeId;
    const row = document.createElement('div');
    row.className = 'profile-row' + (isActive ? ' profile-row--active' : '');
    row.dataset.id = p.id;

    row.innerHTML = `
      <div class="profile-row-left">
        <div class="profile-row-name-wrap">
          <span class="profile-row-name">${escHtml(p.name)}</span>
          ${p.sourceResumeName ? `<span class="profile-row-file" title="${escHtml(p.sourceResumeName)}">📄 ${escHtml(p.sourceResumeName)}</span>` : ''}
        </div>
        ${isActive ? '<span class="profile-row-badge">Active</span>' : ''}
      </div>
      <div class="profile-row-actions">
        ${!isActive ? `<button class="profile-row-btn" data-action="switch" data-id="${p.id}" type="button">Switch</button>` : ''}
        <button class="profile-row-btn" data-action="rename" data-id="${p.id}" type="button">Rename</button>
        ${profiles.length > 1 ? `<button class="profile-row-btn profile-row-btn--danger" data-action="delete" data-id="${p.id}" type="button">Delete</button>` : ''}
      </div>
    `;
    list.appendChild(row);
  });

  list.addEventListener('click', handleProfileRowAction);
}

async function handleProfileRowAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const id     = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'switch') {
    await saveProfile(collectProfileFromForm());
    await switchProfile(id);
    profile = await loadProfile();
    populateProfile(profile);
    clearSourceResumeUI();
    await populateProfilesSection();
    document.querySelector('.nav-btn[data-section="profile"]').click();
    showToast('✦ Profile saved and switched.');
  }

  if (action === 'rename') {
    const row      = btn.closest('.profile-row');
    const nameSpan = row.querySelector('.profile-row-name');
    const current  = nameSpan.textContent.trim();

    const input = document.createElement('input');
    input.type  = 'text';
    input.value = current;
    input.className = 'profile-rename-input';
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const commit = async () => {
      const newName = input.value.trim() || current;
      await renameProfile(id, newName);
      await populateProfilesSection();
    };
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = current; input.blur(); }
    });
  }

  if (action === 'delete') {
    const { profiles } = await loadProfiles();
    const p = profiles.find(p => p.id === id);
    const ok = await showConfirmDialog(
      'Delete profile?',
      `"${p?.name || 'This profile'}" and all its data will be permanently deleted.`,
      'Delete'
    );
    if (!ok) return;
    await deleteProfile(id);
    profile = await loadProfile();
    populateProfile(profile);
    await populateProfilesSection();
    showToast('Profile deleted.');
  }
}

async function handleAddProfile() {
  const { profiles } = await loadProfiles();
  const name = `Profile ${profiles.length + 1}`;
  const id   = await createProfile(name);
  await saveProfile(collectProfileFromForm());
  await switchProfile(id);
  profile = await loadProfile();
  populateProfile(profile);
  clearSourceResumeUI();
  await populateProfilesSection();
  // Trigger inline rename on the new row, then navigate to My Profile
  const newBtn = $('profiles-list').querySelector(`[data-action="rename"][data-id="${id}"]`);
  if (newBtn) newBtn.click();
  document.querySelector('.nav-btn[data-section="profile"]').click();
}

init().catch(console.error);
