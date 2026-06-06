// settings/settings.js — Settings page controller (Redesigned for HTML-First System)

import { extractProfileFromResume, extractTextFromDocx, extractTextFromPdf, scorePdfExtraction, fileToArrayBuffer } from '../modules/extraction.js';
import { loadProfile, saveProfile, loadProfiles, createProfile, renameProfile, deleteProfile, clearProfileData, switchProfile, updateProfileMeta } from '../modules/profile.js';
import { loadProviderSettings, saveProviderSettings } from '../modules/providerSettings.js';
import {
  STORAGE_LIMITS,
  isStorageQuotaError,
  storageQuotaMessage,
  truncateText,
  wasTruncated,
} from '../modules/storageLimits.js';
import { callAI } from '../modules/provider.js';
import { mapError } from '../modules/errorMapper.js';
import { validateOllamaEndpoint } from '../modules/url.js';
import { esc } from '../modules/html.js';
import { normalizeCertificationEntry, normalizeResumeContent } from '../modules/schema.js';
import { mergeProfileFormData } from '../modules/profileRoundTrip.js';

// ── State ─────────────────────────────────────────────────────────────────
let profile = null;
let settings = {};
let docSettings = {};
let profileDirty = false;
let autofillStatusTimers = [];

const ALL_CHIPS = ['{docType}', '{company}', '{jobTitle}', '{name}', '{date}'];
let activeChips = ['{docType}', '{company}', '{jobTitle}'];
const MAX_SOURCE_RESUME_BYTES = 10 * 1024 * 1024;
const AI_PROVIDER_SETUP_SAVED_KEY = 'aiProviderSetupSaved';
const FEEDBACK_EMAIL = 'mwake.dev@gmail.com';
const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
const SETTINGS_TOUR_SEEN_KEY = 'settingsTourSeenSections';

const SECTION_LABELS = {
  personalInfo:   'Personal Details',
  summaries:      'Professional Summaries',
  skills:         'Skills',
  experience:     'Work Experience',
  education:      'Education',
  certifications: 'Certifications',
  customSections: 'Additional Background',
};
const LOCKABLE_SECTIONS = Object.keys(SECTION_LABELS);

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

let detectedOllamaModels = new Set();

// ── CustomSelect ──────────────────────────────────────────────────────────
class CustomSelect {
  constructor(wrapperId) {
    this._wrap    = document.getElementById(wrapperId);
    this._trigger = this._wrap.querySelector('.csel-trigger');
    this._list    = this._wrap.querySelector('.csel-list');
    this._hidden  = this._wrap.querySelector('input[type="hidden"]');
    this._bind();
  }

  get value() { return this._hidden.value; }

  setValue(v, { silent = false } = {}) {
    this._hidden.value = v;
    const opt = this._list.querySelector(`[data-value=${JSON.stringify(v)}]`);
    this._trigger.textContent = opt ? opt.textContent : (v || '—');
    this._list.querySelectorAll('.csel-option').forEach(o => {
      const sel = o.dataset.value === v;
      o.classList.toggle('active', sel);
      o.setAttribute('aria-selected', String(sel));
    });
    if (!silent) this._hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // items: flat [{value, label}] or grouped [{label, items:[{value,label}]}]
  setOptions(items, selectedValue) {
    this._list.innerHTML = '';
    const allFlat = [];
    items.forEach(item => {
      if (item.items) {
        const hdr = document.createElement('div');
        hdr.className = 'csel-group-label';
        hdr.textContent = item.label;
        hdr.setAttribute('role', 'presentation');
        this._list.appendChild(hdr);
        item.items.forEach(i => { allFlat.push(i); this._appendOpt(i.value, i.label); });
      } else {
        allFlat.push(item);
        this._appendOpt(item.value, item.label);
      }
    });
    const sel = selectedValue !== undefined ? selectedValue : this._hidden.value;
    const exists = allFlat.some(i => i.value === sel);
    this.setValue(exists ? sel : (allFlat[0]?.value ?? ''), { silent: true });
  }

  _appendOpt(value, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'csel-option';
    btn.dataset.value = value;
    btn.textContent = label;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', 'false');
    this._list.appendChild(btn);
  }

  open()   { this._list.classList.remove('hidden'); this._trigger.setAttribute('aria-expanded', 'true'); }
  close()  { this._list.classList.add('hidden');    this._trigger.setAttribute('aria-expanded', 'false'); }
  toggle() { this._list.classList.contains('hidden') ? this.open() : this.close(); }

  _bind() {
    this._trigger.addEventListener('click', () => this.toggle());
    this._list.addEventListener('click', e => {
      const opt = e.target.closest('.csel-option');
      if (!opt) return;
      this.setValue(opt.dataset.value);
      this.close();
    });
    this._trigger.addEventListener('keydown', e => {
      if (['ArrowDown', 'Enter', ' '].includes(e.key)) {
        e.preventDefault(); this.open();
        this._list.querySelector('.csel-option')?.focus();
      }
    });
    this._list.addEventListener('keydown', e => {
      const opts = [...this._list.querySelectorAll('.csel-option')];
      const idx  = opts.indexOf(document.activeElement);
      if (e.key === 'Escape')    { this.close(); this._trigger.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); opts[Math.min(idx + 1, opts.length - 1)]?.focus(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); opts[Math.max(idx - 1, 0)]?.focus(); }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const opt = document.activeElement.closest('.csel-option');
        if (opt) { this.setValue(opt.dataset.value); this.close(); }
      }
    });
    document.addEventListener('click', e => { if (!this._wrap.contains(e.target)) this.close(); });
  }
}

let providerSelect, modelSelect, defaultTypeSelect, feedbackTypeSelect;

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
  const isEmbedded = urlParams.get('embed') === 'true';
  if (isEmbedded) document.body.classList.add('embedded');

  // Custom selects must be instantiated before populateProviderSection runs
  providerSelect    = new CustomSelect('csel-provider');
  modelSelect       = new CustomSelect('csel-model');
  defaultTypeSelect = new CustomSelect('csel-default-type');
  feedbackTypeSelect = new CustomSelect('csel-feedback-type');

  // Apply stored theme before page renders to prevent flash
  const { theme } = await chrome.storage.local.get(['theme']);
  applyTheme(theme || 'system');

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.theme) {
      applyTheme(changes.theme.newValue || 'system');
    }
  });

  // Load saved data
  const [providerSettings, stored] = await Promise.all([
    loadProviderSettings(),
    chrome.storage.sync.get(['docSettings']),
  ]);
  settings = providerSettings;
  docSettings = stored.docSettings || { templateMode: 'smart' };
  profile = await loadProfile();
  if (hasExistingAiProviderSetup(settings)) {
    chrome.storage.local.set({ [AI_PROVIDER_SETUP_SAVED_KEY]: true });
  }

  // Populate sections
  populateProviderSection(settings);
  populateDocSection(docSettings);
  populateProfile(profile);
  setProfileDirty(false);
  await populateSourceStatus();
  await populateProfilesSection();

  // Navigation
  document.querySelectorAll('.nav-btn[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      activateSettingsSection(btn.dataset.section);
    });
  });

  // Wiring
  $('btn-save-provider').addEventListener('click', saveProvider);
  $('btn-save-documents').addEventListener('click', saveDocuments);
  $('btn-save-profile').addEventListener('click', saveProfileData);
  $('btn-clear-profile').addEventListener('click', clearProfile);
  $('btn-remove-source-resume').addEventListener('click', removeSourceResume);
  $('feedback-form').addEventListener('submit', openFeedbackEmail);

  // Tour
  $('btn-settings-tour').addEventListener('click', () => startSettingsTour());
  $('settings-tour-btn-skip').addEventListener('click', endSettingsTour);
  $('settings-tour-btn-prev').addEventListener('click', () => { if (settingsTourIndex > 0) showSettingsTourStep(settingsTourIndex - 1); });
  $('settings-tour-btn-next').addEventListener('click', () => {
    if (settingsTourIndex < currentSettingsTourSteps.length - 1) showSettingsTourStep(settingsTourIndex + 1);
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
  $('inp-apikey').addEventListener('input', () => {
    $('hint-saved-key').classList.add('hidden');
    if ($('inp-apikey').value.trim()) markAiProviderSetupAcknowledged();
  });

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
  $('btn-detect-ollama-models').addEventListener('click', detectOllamaModels);
  $('inp-source-resume').addEventListener('change', handleSourceResumeUpload);

  // Dynamic lists
  $('btn-add-exp').addEventListener('click',  () => { addExperienceEntry(); setProfileDirty(true); });
  $('btn-add-edu').addEventListener('click',  () => { addEducationEntry(); setProfileDirty(true); });
  $('btn-add-cert').addEventListener('click', () => { addCertEntry(); setProfileDirty(true); });
  $('btn-add-summary').addEventListener('click', () => { addSummaryEntry(); setProfileDirty(true); });
  $('btn-add-custom-section').addEventListener('click', () => { addCustomSectionEntry(); setProfileDirty(true); });

  // Profile dirty tracking — any field edit or row removal lights up the Save button
  $('section-profile').addEventListener('input', () => setProfileDirty(true));
  $('section-profile').addEventListener('click', e => {
    const removeBtn = e.target.closest('.btn-remove[data-remove-entry]');
    if (!removeBtn) return;
    const entry = removeBtn.closest('.summary-entry, .exp-entry, .edu-entry, .cert-entry, .custom-section-entry');
    if (!entry) return;
    entry.remove();
    setProfileDirty(true);
  });

  // Section lock toggles — save immediately on change, does not dirty the profile form
  $('section-profile').addEventListener('click', async e => {
    const btn = e.target.closest('.section-lock-btn');
    if (!btn) return;
    const key = btn.dataset.section;
    const locked = btn.getAttribute('aria-pressed') !== 'true';
    if (!profile.metadata) profile.metadata = {};
    if (!profile.metadata.lockedSections) profile.metadata.lockedSections = {};
    profile.metadata.lockedSections[key] = locked;
    syncLockToggles(profile.metadata.lockedSections);
    await saveProfile(profile);
    showToast(locked ? `${SECTION_LABELS[key]} locked from AI import` : `${SECTION_LABELS[key]} unlocked`);
  });

  $('btn-add-profile').addEventListener('click', handleAddProfile);
  $('btn-go-to-profile').addEventListener('click', () => {
    document.querySelector('.nav-btn[data-section="profile"]').click();
  });

  updateFilenamePreview();

  if (!isEmbedded) {
    scheduleSettingsTourIfFirstVisit('provider');
  }
}

function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
}

// ── Provider Section ──────────────────────────────────────────────────────

function activateSettingsSection(section, { autoTour = true } = {}) {
  const navBtn = document.querySelector(`.nav-btn[data-section="${section}"]`);
  const sectionEl = $(`section-${section}`);
  if (!navBtn || !sectionEl) return;

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
  navBtn.classList.add('active');
  sectionEl.classList.add('active');

  if (autoTour) scheduleSettingsTourIfFirstVisit(section);
}

function hasExistingAiProviderSetup(s) {
  const provider = s?.activeProvider || '';
  if (!provider || provider === 'mock') return false;
  if (provider === 'ollama') return true;
  return !!(s.configs || {})[provider]?.apiKey?.trim();
}

async function markAiProviderSetupAcknowledged() {
  await chrome.storage.local.set({ [AI_PROVIDER_SETUP_SAVED_KEY]: true });
}

function populateProviderSection(s) {
  const provider = s.activeProvider || '';
  if (provider) providerSelect.setValue(provider, { silent: true });
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
  $('inp-endpoint').value = p === 'ollama'
    ? (config.endpoint || DEFAULT_OLLAMA_ENDPOINT)
    : (config.endpoint || '');
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
  $('ollama-model-tools').classList.toggle('hidden', p !== 'ollama');
  $('ollama-model-status').textContent = '';
  $('ollama-model-status').className = 'test-result';
  updateModelDropdown(p);
}

function updateModelDropdown(provider, preferredModel = '') {
  if (!provider) return;
  const storedModel = (settings.configs || {})[provider]?.modelName;
  const currentVal  = preferredModel || storedModel || DEFAULT_MODELS[provider] || '';
  const allModels   = PROVIDER_MODELS[provider] || [];
  const isCustom    = Boolean(currentVal && !allModels.includes(currentVal));

  let items;
  if (provider === 'ollama' && detectedOllamaModels.size > 0) {
    const installed = allModels.filter(m => detectedOllamaModels.has(m));
    const others    = allModels.filter(m => !detectedOllamaModels.has(m));
    items = [];
    if (installed.length) items.push({ label: 'Installed on this machine', items: installed.map(m => ({ value: m, label: m })) });
    if (others.length)    items.push({ label: 'Other models', items: others.map(m => ({ value: m, label: m })) });
    items.push({ value: 'custom', label: 'Custom...' });
  } else {
    items = [...allModels.map(m => ({ value: m, label: m })), { value: 'custom', label: 'Custom...' }];
  }

  modelSelect.setOptions(items, isCustom ? 'custom' : currentVal);

  if (isCustom) {
    $('inp-custom-model').value = currentVal;
    $('inp-custom-model').classList.remove('hidden');
  } else {
    $('inp-custom-model').classList.add('hidden');
  }
}

function getOllamaEndpoint() {
  return ($('inp-endpoint').value.trim() || DEFAULT_OLLAMA_ENDPOINT).replace(/\/$/, '');
}

async function detectOllamaModels() {
  if ($('sel-provider').value !== 'ollama') return;

  const btn = $('btn-detect-ollama-models');
  const status = $('ollama-model-status');
  const endpoint = getOllamaEndpoint();

  btn.disabled = true;
  status.className = 'test-result';
  status.textContent = 'Checking Ollama...';

  try {
    const safeBase = validateOllamaEndpoint(endpoint);
    const response = await fetch(`${safeBase}/api/tags`);
    if (response.status === 403) {
      throw new Error('Ollama blocked the request. Check OLLAMA_ORIGINS and restart Ollama.');
    }
    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}. Make sure it is running at ${safeBase}.`);
    }

    const data = await response.json();
    const detectedModels = Array.isArray(data.models)
      ? data.models.map(model => model.name || model.model).filter(Boolean)
      : [];

    if (!detectedModels.length) {
      status.className = 'test-result test-fail';
      status.textContent = 'Ollama is running, but no models were found. Run ollama pull llama3.';
      return;
    }

    const currentModel = $('sel-model').value === 'custom'
      ? $('inp-custom-model').value.trim()
      : $('sel-model').value;
    const knownModels = PROVIDER_MODELS.ollama || [];
    PROVIDER_MODELS.ollama = Array.from(new Set([...detectedModels, ...knownModels]));
    detectedOllamaModels = new Set(detectedModels);

    const selectedModel = detectedModels.includes(currentModel) ? currentModel : detectedModels[0];
    $('inp-endpoint').value = endpoint;
    updateModelDropdown('ollama', selectedModel);

    status.className = 'test-result test-ok';
    status.textContent = `${detectedModels.length} model${detectedModels.length === 1 ? '' : 's'} found. Pick one and save.`;
  } catch (error) {
    status.className = 'test-result test-fail';
    status.textContent = error.message === 'Failed to fetch'
      ? 'Could not reach Ollama. Make sure it is running, extension access is allowed, and Ollama was restarted.'
      : (error.message || 'Could not reach Ollama. Make sure it is running and extension access is allowed.');
  } finally {
    btn.disabled = false;
  }
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
  await saveProviderSettings(settings);
  await markAiProviderSetupAcknowledged();

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
  startAutofillStatusMessages(loadingMsg, effectiveSettings);

  try {
    const locks = profile.metadata?.lockedSections ?? {};
    const extractedData = await extractProfileFromResume(plainText, effectiveSettings);
    const extractedPersonal = normalizeAutofillPersonalInfo(extractedData.personalInfo || extractedData.personal || {});
    const skippedSections = [];

    profile = {
      ...profile,
      personalInfo: locks.personalInfo
        ? profile.personalInfo
        : { ...profile.personalInfo, ...extractedPersonal },
      summaries: locks.summaries
        ? profile.summaries
        : mergeAutofillArray(extractedData.summaries, profile.summaries),
      skills: locks.skills
        ? profile.skills
        : (extractedData.skills || profile.skills),
      experience: locks.experience
        ? profile.experience
        : (extractedData.experience || profile.experience),
      education: locks.education
        ? profile.education
        : (extractedData.education || profile.education),
      certifications: locks.certifications
        ? profile.certifications
        : (extractedData.certifications || profile.certifications),
      customSections: locks.customSections
        ? profile.customSections
        : mergeAutofillArray(extractedData.customSections || extractedData.customFields || extractedData.additionalSections, profile.customSections),
    };

    for (const key of LOCKABLE_SECTIONS) {
      if (locks[key]) skippedSections.push(SECTION_LABELS[key]);
    }

    profile = normalizeResumeContent(profile);
    populateProfile(profile);
    await saveProfile(profile);
    renderSuccessStatus(statusEl, skippedSections);
  } catch (e) {
    renderErrorStatus(statusEl, mapError(e).message);
  } finally {
    clearAutofillStatusMessages();
  }
}

function startAutofillStatusMessages(target, effectiveSettings) {
  clearAutofillStatusMessages();
  if (effectiveSettings.provider !== 'ollama') return;

  const messages = [
    { delay: 15000, text: 'Local AI is analyzing your resume. Ollama can take a minute or two on this computer.' },
    { delay: 45000, text: 'Still working. Larger resumes take longer with local models.' },
    { delay: 90000, text: 'Still working. If this fails, try closing other apps or using a shorter source resume.' },
  ];

  autofillStatusTimers = messages.map(({ delay, text }) => setTimeout(() => {
    target.textContent = text;
  }, delay));
}

function clearAutofillStatusMessages() {
  autofillStatusTimers.forEach(timerId => clearTimeout(timerId));
  autofillStatusTimers = [];
}

function mergeAutofillArray(nextValue, fallbackValue) {
  return Array.isArray(nextValue) && nextValue.length ? nextValue : (fallbackValue || []);
}

function normalizeAutofillPersonalInfo(data = {}) {
  return {
    ...data,
    cityProvince: data.cityProvince || data.address || '',
  };
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

function renderSuccessStatus(statusEl, skippedSections = []) {
  statusEl.textContent = '';

  const msg = document.createElement('span');
  msg.textContent = skippedSections.length
    ? `✨ Profile updated from resume. Locked and preserved: ${skippedSections.join(', ')}.`
    : '✨ Profile saved from your resume. You can review and edit any field.';
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
  if (d.defaultType) defaultTypeSelect.setValue(d.defaultType, { silent: true });
  initChipBuilder(d.filenamePattern || '{docType} - {company} - {jobTitle}');
}

function updateFilenamePreview() {
  const pattern = $('inp-filename-pattern').value || '{docType} - {company} - {jobTitle}';
  const today = new Date().toISOString().slice(0, 10);
  const profileName = ($('p-name')?.value || '').trim() || 'Your Name';
  const sub = (t, docType) => t
    .replace(/\{jobTitle\}/gi, 'Role')
    .replace(/\{company\}/gi,  'Company')
    .replace(/\{name\}/gi,     profileName)
    .replace(/\{date\}/gi,     today)
    .replace(/\{docType\}/gi,  docType)
    + '.pdf';
  $('filename-preview-1').textContent = sub(pattern, 'Resume');
  $('filename-preview-2').textContent = sub(pattern, 'Cover Letter');
}

async function saveDocuments() {
  docSettings.defaultType = $('sel-default-type').value;
  docSettings.filenamePattern = truncateText(
    $('inp-filename-pattern').value.trim(),
    STORAGE_LIMITS.docSettingsFilenamePatternChars
  );
  delete docSettings.autoFitCheck;
  try {
    await chrome.storage.sync.set({ docSettings });
  } catch (err) {
    console.warn('Could not save document settings:', err?.message || err);
    showToast(isStorageQuotaError(err)
      ? 'Could not save document settings because Chrome sync storage is full.'
      : 'Could not save document settings.');
    return;
  }

  const btn = $('btn-save-documents');
  const original = btn.textContent;
  btn.textContent = '✓ Saved';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
  showToast('✅ Document settings saved');
}

// ── Source Resume & Profile ───────────────────────────────────────────────
function clearSourceResumeUI() {
  $('source-upload-text').textContent = 'Click to upload your source resume (.docx or text-based .pdf, max 10 MB)';
  $('source-resume-active-label').textContent = '';
  $('source-resume-active-bar').classList.add('hidden');
  $('profile-autofill-status').textContent = '';
  $('profile-autofill-status').classList.add('hidden');
  $('inp-source-resume').value = '';
  hidePdfUI();
}

async function removeSourceResume() {
  await chrome.storage.local.remove(['sourceResumeText', 'sourceResumeName']);
  clearSourceResumeUI();
  showToast('Source resume removed.');
}

async function populateSourceStatus() {
  const localData = await chrome.storage.local.get(['sourceResumeName']);
  if (!localData.sourceResumeName) return;

  $('source-upload-text').textContent = `${localData.sourceResumeName} uploaded ✓`;
  $('source-resume-active-label').textContent = `📄 Active Source: ${localData.sourceResumeName}`;
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

// ── PDF quality UI helpers ────────────────────────────────────────────────

function showPdfQualityWarning(level, charCount) {
  const el = $('pdf-quality-warning');
  if (!el) return;
  if (level === 'poor') {
    el.textContent = `⚠️ Limited text extracted from this PDF (${charCount} characters). `
      + 'Complex layouts, sidebars, or non-standard fonts can reduce extraction quality. '
      + 'The auto-filled fields below may be incomplete. '
      + 'For best results, upload a .docx version or review the extracted text below.';
    el.className = 'pdf-quality-warning pdf-quality-warning--poor';
    el.classList.remove('hidden');
  } else if (level === 'partial') {
    el.textContent = '📄 PDF imported. Some content may have been missed due to the visual layout. '
      + 'Please review the profile fields below before generating.';
    el.className = 'pdf-quality-warning pdf-quality-warning--partial';
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function showPdfTextPreview(text) {
  const preview = $('pdf-text-preview');
  const content = $('pdf-text-content');
  if (!preview || !content) return;
  content.value = text;
  preview.classList.remove('hidden');
  preview.removeAttribute('open');
}

function hidePdfUI() {
  const warning = $('pdf-quality-warning');
  const preview = $('pdf-text-preview');
  if (warning) { warning.classList.add('hidden'); warning.textContent = ''; }
  if (preview) { preview.classList.add('hidden'); }
}

async function handleSourceResumeUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const statusEl = $('profile-autofill-status');
  statusEl.classList.remove('hidden');
  hidePdfUI();

  if (file.size > MAX_SOURCE_RESUME_BYTES) {
    statusEl.textContent = '❌ Error: File is too large. Please upload a .docx or text-based .pdf under 10 MB.';
    event.target.value = '';
    showToast('❌ Upload failed');
    return;
  }

  statusEl.textContent = '📄 Reading file...';

  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  const isDocx = file.name.toLowerCase().endsWith('.docx');

  try {
    let plainText = '';

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
      throw new Error(isPdf
        ? "We couldn't read enough text from this PDF. It may be scanned, password-protected, image-based, or use a complex layout. Try uploading a .docx version, a simpler text-based PDF, or paste your resume text manually."
        : 'Could not extract enough text from the file. Please try a different format.');
    }

    // PDF quality assessment — show preview and warning before auto-fill runs
    let qualityLevel = 'good';
    if (isPdf) {
      const quality = scorePdfExtraction(plainText);
      qualityLevel = quality.level;
      showPdfTextPreview(plainText);
      showPdfQualityWarning(quality.level, quality.charCount);
    }

    const savedResumeText = truncateText(plainText, STORAGE_LIMITS.sourceResumeTextChars);
    const sourceResumeWasTruncated = wasTruncated(plainText, savedResumeText);

    await chrome.storage.local.set({
      sourceResumeText: savedResumeText,
      sourceResumeName: file.name
    });

    const { activeId } = await loadProfiles();
    if (activeId) await updateProfileMeta(activeId, { sourceResumeName: file.name, isCleared: false });

    $('source-upload-text').textContent = `${file.name} uploaded ✓`;
    $('source-resume-active-label').textContent = `📄 Active Source: ${file.name}`;
    $('source-resume-active-bar').classList.remove('hidden');

    if (sourceResumeWasTruncated) {
      showToast('Resume text was very large, so only the first portion was saved for AI context.');
    } else if (isPdf && qualityLevel !== 'good') {
      showToast('📄 PDF imported — please review the profile fields before generating.');
    }

    // Pre-flight lock check — show warning if any sections are locked
    const lockedSections = profile?.metadata?.lockedSections ?? {};
    const lockedKeys = LOCKABLE_SECTIONS.filter(k => lockedSections[k] === true);
    if (lockedKeys.length > 0) {
      const choice = await showLockWarningModal(lockedKeys.map(k => SECTION_LABELS[k]));
      if (choice === 'cancel') {
        statusEl.textContent = 'AI import cancelled. Resume saved. Use Retry Auto-fill to analyse when ready.';
        event.target.value = '';
        return;
      }
      if (choice === 'manage') {
        statusEl.textContent = 'AI import paused. Adjust locks above and use Retry Auto-fill when ready.';
        event.target.value = '';
        return;
      }
      // 'continue' — fall through to run auto-fill with locks enforced
    } else {
      showToast('✅ Resume uploaded. Starting AI auto-fill...');
    }

    await attemptAutofill(statusEl);
  } catch (e) {
    const message = isStorageQuotaError(e) ? storageQuotaMessage('sourceResume') : e.message;
    statusEl.textContent = `❌ Error: ${message}`;
    showToast(isStorageQuotaError(e) ? message : '❌ Upload failed');
    // Reset input so the user can retry the same file (change event won't fire otherwise)
    event.target.value = '';
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
  $('custom-sections-list').innerHTML = '';
  (p.customSections || []).forEach(section => addCustomSectionEntry(section));
  syncLockToggles(p.metadata?.lockedSections);
}

function syncLockToggles(lockedSections = {}) {
  for (const key of LOCKABLE_SECTIONS) {
    const btn = document.getElementById('lock-btn-' + key);
    if (!btn) continue;
    const locked = !!lockedSections[key];
    const label = SECTION_LABELS[key];
    btn.setAttribute('aria-pressed', String(locked));
    btn.setAttribute('title', locked ? `Unlock ${label} for AI import` : `Lock ${label} from AI import`);
    btn.classList.toggle('is-locked', locked);
    btn.querySelector('.lock-icon').textContent = locked ? '🔒' : '🔓';
    btn.querySelector('.lock-label').textContent = locked ? 'Locked from AI import' : 'Lock from AI import';
  }
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
    <input type="text" class="summary-label-input" value="${esc(data.label || 'Summary')}" placeholder="Style (e.g. Modern)" style="width:140px; font-weight:600" />
    <textarea class="summary-text-input" rows="3" style="flex:1" placeholder="Paste summary text here...">${esc(data.text || '')}</textarea>
    <button type="button" class="btn-remove" data-remove-entry aria-label="Remove summary">✕</button>
  `;
  container.appendChild(row);
}

function addExperienceEntry(data = {}) {
  const div = document.createElement('div');
  div.className = 'exp-entry card';
  div.style.marginBottom = '12px';
  const roleTitle = data.jobTitle || data.title || '';
  const employer = data.employer || data.company || '';
  const location = data.location || '';
  const dates = data.dates || (data.startDate ? `${data.startDate} - ${data.endDate || ''}` : '');
  const bullets = Array.isArray(data.bulletPoints) ? data.bulletPoints.join('\n') : (data.bullets || '');

  div.innerHTML = `
    <div style="display:flex; justify-content:space-between; margin-bottom:8px">
      <input type="text" class="exp-title" value="${esc(roleTitle)}" placeholder="Job Title" style="font-weight:bold" />
      <button type="button" class="btn-remove" data-remove-entry aria-label="Remove work experience">✕</button>
    </div>
    <div class="form-grid-2">
      <input type="text" class="exp-company" value="${esc(employer)}" placeholder="Company" />
      <input type="text" class="exp-dates" value="${esc(dates)}" placeholder="Dates" />
    </div>
    <input type="text" class="exp-location" value="${esc(location)}" placeholder="Location (e.g. Halifax, NS)" style="margin-top:8px" />
    <textarea class="exp-bullets" rows="3" placeholder="Bullets" style="margin-top:8px">${esc(bullets)}</textarea>
  `;
  $('experience-list').appendChild(div);
}

function addEducationEntry(data = {}) {
  const div = document.createElement('div');
  div.className = 'edu-entry card';
  div.style.marginBottom = '12px';
  const degree = data.credential || data.degree || '';
  const school = data.institution || data.school || '';
  const dates  = data.dates || data.year || '';

  div.innerHTML = `
    <div style="display:flex; justify-content:space-between">
      <input type="text" class="edu-degree" value="${esc(degree)}" placeholder="Degree" style="font-weight:bold" />
      <button type="button" class="btn-remove" data-remove-entry aria-label="Remove education">✕</button>
    </div>
    <div class="form-grid-2">
      <input type="text" class="edu-school" value="${esc(school)}" placeholder="School" />
      <input type="text" class="edu-dates" value="${esc(dates)}" placeholder="Dates (e.g. 2020 - 2022)" />
    </div>
  `;
  $('education-list').appendChild(div);
}

function addCertEntry(data = {}) {
  const cert = normalizeCertificationEntry(data);
  const div = document.createElement('div');
  div.className = 'cert-entry card';
  div.style.marginBottom = '12px';
  div.innerHTML = `
    <div style="display:flex; justify-content:space-between">
      <input type="text" class="cert-name" value="${esc(cert.name)}" placeholder="Cert Name" style="font-weight:bold" />
      <button type="button" class="btn-remove" data-remove-entry aria-label="Remove certification">✕</button>
    </div>
    <input type="text" class="cert-issuer" value="${esc(cert.issuer)}" placeholder="Issuer" />
  `;
  $('certifications-list').appendChild(div);
}

function addCustomSectionEntry(data = {}) {
  const div = document.createElement('div');
  div.className = 'custom-section-entry';
  div.style.marginBottom = '12px';

  div.innerHTML = `
    <div style="display:flex; justify-content:space-between; gap:8px">
      <input type="text" class="custom-section-label" value="${esc(data.label || data.name || data.title || '')}" placeholder="Section label" style="font-weight:bold" />
      <button type="button" class="btn-remove" data-remove-entry aria-label="Remove additional background section">✕</button>
    </div>
    <textarea class="custom-section-text" rows="3" placeholder="Details the AI can use when relevant">${esc(data.text || data.value || data.content || '')}</textarea>
  `;
  $('custom-sections-list').appendChild(div);
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
      jobTitle:     el.querySelector('.exp-title').value,
      employer:     el.querySelector('.exp-company').value,
      location:     el.querySelector('.exp-location')?.value || '',
      dates:        el.querySelector('.exp-dates').value,
      bulletPoints: el.querySelector('.exp-bullets').value.split('\n').filter(Boolean),
    })),
    education: readList('.edu-entry', el => ({
      credential:  el.querySelector('.edu-degree').value,
      institution: el.querySelector('.edu-school').value,
      dates:       el.querySelector('.edu-dates').value,
    })),
    certifications: readList('.cert-entry', el => ({
      name:   el.querySelector('.cert-name').value,
      issuer: el.querySelector('.cert-issuer').value
    })),
    customSections: readList('.custom-section-entry', el => ({
      label: el.querySelector('.custom-section-label').value,
      text:  el.querySelector('.custom-section-text').value
    })).filter(section => section.label.trim() || section.text.trim()),
    doNotClaimNotes: $('p-do-not-claim').value
  };
}

async function saveProfileData() {
  profile = normalizeResumeContent(mergeProfileFormData(profile, collectProfileFromForm()));
  populateProfile(profile);
  await saveProfile(profile);
  const { activeId } = await loadProfiles();
  if (activeId && hasProfileContent(profile)) {
    await updateProfileMeta(activeId, { isCleared: false });
  }
  setProfileDirty(false);

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
    'This will remove your personal details, experience, education, and skills. Your uploaded source resume will remain active — use the Remove button in the Source Resume section to delete it separately.',
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
    customSections: [],
    doNotClaimNotes: '',
    metadata: profile?.metadata,
  };
  populateProfile(profile);
  setProfileDirty(false);
  await saveProfile(profile);
  showToast('Profile cleared');
}

// Helpers
function setProfileDirty(dirty) {
  profileDirty = dirty;
  $('btn-save-profile').classList.toggle('is-muted', !dirty);
}

let toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show'); t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── API Key Mask ──────────────────────────────────────────────────────────
function providerLabel(provider) {
  const labels = {
    mock: 'Demo Mode',
    openai: 'OpenAI',
    gemini: 'Google Gemini',
    openrouter: 'OpenRouter',
    ollama: 'Ollama',
  };
  return labels[provider] || provider || 'Not configured';
}

function buildFeedbackDiagnostics() {
  const provider = settings?.activeProvider || '';
  const manifest = chrome.runtime.getManifest();
  return [
    `App version: ${manifest.version || 'Unknown'}`,
    `Provider: ${providerLabel(provider)}`,
    `Demo Mode: ${provider === 'mock' ? 'Yes' : 'No'}`,
    `Settings page: ${document.querySelector('.nav-btn.active')?.textContent?.trim() || 'Unknown'}`,
    `Browser: ${navigator.userAgent}`,
  ].join('\n');
}

function openFeedbackEmail(event) {
  event.preventDefault();

  const type = $('feedback-type').value;
  const message = $('feedback-message').value.trim();
  const replyTo = $('feedback-email').value.trim();
  const includeDiagnostics = $('feedback-include-diagnostics').checked;
  const status = $('feedback-status');

  if (!message) {
    status.textContent = 'Please add a message first.';
    $('feedback-message').focus();
    return;
  }

  const bodyParts = [
    `Type: ${type}`,
    '',
    'Message:',
    message,
  ];

  if (replyTo) {
    bodyParts.push('', 'Contact:', replyTo);
  }

  if (includeDiagnostics) {
    bodyParts.push('', 'Diagnostics:', buildFeedbackDiagnostics());
  }

  const subject = `Job Application Assistant feedback: ${type}`;
  const mailtoUrl = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyParts.join('\n'))}`;

  window.location.href = mailtoUrl;
  status.textContent = 'Opening your email app...';
}

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

// ── Lock Warning Modal ────────────────────────────────────────────────────
function showLockWarningModal(lockedNames) {
  return new Promise(resolve => {
    const list = $('lock-warning-list');
    list.innerHTML = lockedNames.map(n => `<li>${esc(n)}</li>`).join('');
    $('lock-warning-overlay').classList.remove('hidden');
    $('btn-lock-warning-cancel').focus();

    const cleanup = result => {
      $('lock-warning-overlay').classList.add('hidden');
      $('lock-warning-overlay').removeEventListener('click', onBackdrop);
      $('btn-lock-warning-continue').removeEventListener('click', onContinue);
      $('btn-lock-warning-manage').removeEventListener('click', onManage);
      $('btn-lock-warning-cancel').removeEventListener('click', onCancel);
      resolve(result);
    };

    const onContinue = () => cleanup('continue');
    const onManage   = () => cleanup('manage');
    const onCancel   = () => cleanup('cancel');
    const onBackdrop = e => { if (e.target === $('lock-warning-overlay')) cleanup('cancel'); };

    $('btn-lock-warning-continue').addEventListener('click', onContinue);
    $('btn-lock-warning-manage').addEventListener('click', onManage);
    $('btn-lock-warning-cancel').addEventListener('click', onCancel);
    $('lock-warning-overlay').addEventListener('click', onBackdrop);
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
let settingsTourIndex = 0;
let currentSettingsTourSteps = [];
let pendingSettingsTourTimer = null;
let settingsTourRequestId = 0;

const SETTINGS_TOURS = {
  provider: [
    {
      targetId: 'csel-provider-trigger',
      title: 'Choose the AI provider',
      body: 'Pick what will power real draft generation. Ollama runs locally on your computer, while OpenAI, Gemini, and OpenRouter use your own cloud API key.'
    },
    {
      targetId: 'group-model',
      title: 'Choose the model',
      body: 'Select the model you want this provider to use. For Ollama, use Detect installed models or enter the exact name from ollama list.'
    },
    {
      targetId: 'provider-test-area',
      title: 'Test before relying on it',
      body: 'Use Test Connection to confirm the provider can be reached. For cloud providers this checks the key; for Ollama it checks the local endpoint.'
    },
    {
      targetId: 'btn-save-provider',
      title: 'Save AI settings',
      body: 'Save after choosing a provider, model, and key or endpoint. Saving also tells onboarding that you understand AI setup.'
    },
  ],
  documents: [
    {
      targetId: 'csel-default-type-trigger',
      title: 'Default document mode',
      body: 'Choose what the app should create by default when a workflow starts: resume, cover letter, or both.'
    },
    {
      targetId: 'chip-builder',
      title: 'Build file names',
      body: 'Use chips to control the file names Chrome suggests in the Save as PDF dialog. Add useful parts like company, job title, document type, and date.'
    },
    {
      targetId: 'filename-preview-1',
      title: 'Check the preview',
      body: 'The examples update as you change the pattern, so you can confirm the file names will be clear before saving.'
    },
    {
      targetId: 'btn-save-documents',
      title: 'Save document settings',
      body: 'Save these settings when the default mode and file naming pattern look right.'
    },
  ],
  profiles: [
    {
      targetId: 'profiles-list',
      title: 'Manage profiles',
      body: 'Manage Profiles lets you keep separate background details and fit-scoring preferences for different career paths or application styles.'
    },
    {
      targetId: 'profiles-list',
      title: 'Switch the active profile',
      body: 'The active profile is the one the dashboard uses for new drafts. Switch profiles here before generating for a different context.'
    },
    {
      targetId: 'btn-add-profile',
      title: 'Create another profile',
      body: 'Add a profile when you want a clean set of saved details, such as one profile for support roles and another for marketing roles.'
    },
    {
      targetId: 'btn-go-to-profile',
      title: 'Edit profile details',
      body: 'Manage Profiles controls which profile is active. My Profile is where you edit the actual details inside the active profile.'
    },
  ],
  profile: [
    {
      targetId: 'source-upload-area',
      title: 'Upload for faster setup',
      body: 'Uploading a source resume can auto-fill profile details. It is optional; you can also fill everything in manually.'
    },
    {
      targetId: 'card-personal-details',
      title: 'Add contact details',
      body: 'These details appear in generated documents when the selected template needs them. Keep them current before exporting.'
    },
    {
      targetId: 'p-skills',
      title: 'List reusable skills',
      body: 'Add one skill per line. The assistant uses these saved details to tailor each draft to the job posting.'
    },
    {
      targetId: 'btn-add-exp',
      title: 'Add work history',
      body: 'Add roles, achievements, and responsibilities you want the assistant to draw from. Specific details produce stronger drafts.'
    },
    {
      targetId: 'lock-btn-experience',
      title: 'Protect reviewed sections',
      body: 'Lock a section when you do not want future AI resume imports to overwrite details you have already reviewed.'
    },
    {
      targetId: 'p-do-not-claim',
      title: 'Set hard limits',
      body: 'Use Do Not Claim for anything the assistant must avoid, such as licenses, tools, or experience you do not have.'
    },
    {
      targetId: 'btn-save-profile',
      title: 'Save profile changes',
      body: 'Profile edits are not saved automatically. Save after changes so future drafts use the updated details.'
    },
  ],
  feedback: [
    {
      targetId: 'csel-feedback-type-trigger',
      title: 'Choose the kind of note',
      body: 'Pick Bug report, Feature request, or General feedback so the email subject is easy to scan.'
    },
    {
      targetId: 'feedback-message',
      title: 'Describe the issue or idea',
      body: 'Write what happened, what you expected, or what would improve the app. Avoid pasting private resume, profile, or job-posting text.'
    },
    {
      targetId: 'feedback-email',
      title: 'Add a reply address',
      body: 'This is optional. Add your email only if you are comfortable being contacted about the feedback.'
    },
    {
      targetId: 'feedback-include-diagnostics',
      title: 'Include safe diagnostics',
      body: 'Diagnostics help reproduce issues. They include version and provider name only, never API keys, resumes, drafts, or job descriptions.'
    },
    {
      targetId: 'btn-open-feedback-email',
      title: 'Open your email app',
      body: 'This creates a prefilled email draft. You can review or edit everything before sending.'
    },
  ],
};

function getSettingsTourSteps(section) {
  const steps = SETTINGS_TOURS[section] || SETTINGS_TOURS.provider;
  return [
    ...steps,
    {
      targetId: 'btn-settings-tour',
      title: 'Run this help again',
      body: 'You can replay this page tour anytime by clicking the ? help icon in Settings.',
    },
  ];
}

async function scheduleSettingsTourIfFirstVisit(section) {
  clearTimeout(pendingSettingsTourTimer);
  const requestId = ++settingsTourRequestId;
  if (!SETTINGS_TOURS[section] || !$('settings-tour-overlay').classList.contains('hidden')) return;

  const data = await chrome.storage.local.get([SETTINGS_TOUR_SEEN_KEY]);
  if (requestId !== settingsTourRequestId) return;
  const seen = data[SETTINGS_TOUR_SEEN_KEY] || {};
  if (seen[section]) return;

  const delay = document.body.classList.contains('embedded') ? 260 : 120;
  pendingSettingsTourTimer = setTimeout(() => {
    startSettingsTour({ section });
  }, delay);
}

async function markSettingsTourSeen(section) {
  const data = await chrome.storage.local.get([SETTINGS_TOUR_SEEN_KEY]);
  const seen = data[SETTINGS_TOUR_SEEN_KEY] || {};
  await chrome.storage.local.set({
    [SETTINGS_TOUR_SEEN_KEY]: { ...seen, [section]: true },
  });
}

function startSettingsTour({ section = null } = {}) {
  clearTimeout(pendingSettingsTourTimer);
  settingsTourRequestId++;
  const activeSection = section || document.querySelector('.nav-btn.active')?.dataset.section || 'provider';
  if (section && !document.querySelector(`.nav-btn[data-section="${section}"]`)?.classList.contains('active')) {
    activateSettingsSection(section, { autoTour: false });
  }
  currentSettingsTourSteps = getSettingsTourSteps(activeSection);
  markSettingsTourSeen(activeSection);
  settingsTourIndex = 0;
  $('settings-tour-overlay').classList.remove('hidden');
  document.addEventListener('keydown', settingsTourKeyHandler);
  showSettingsTourStep(0);
}

function showSettingsTourStep(index) {
  settingsTourIndex = index;
  const step = currentSettingsTourSteps[index];
  if (!step) return endSettingsTour();
  const overlay = $('settings-tour-overlay');
  const spotlight = $('settings-tour-spotlight');
  const tooltip = $('settings-tour-tooltip');

  $('settings-tour-step-count').textContent = `${index + 1} of ${currentSettingsTourSteps.length}`;
  $('settings-tour-title').textContent = step.title;
  $('settings-tour-body').textContent = step.body;
  $('settings-tour-btn-prev').style.visibility = index === 0 ? 'hidden' : '';
  $('settings-tour-btn-next').textContent = index === currentSettingsTourSteps.length - 1 ? 'Done' : 'Next →';

  // Navigate to the correct section first
  if (step.section) {
    const nav = document.querySelector(`.nav-btn[data-section="${step.section}"]`);
    if (nav && !nav.classList.contains('active')) {
      activateSettingsSection(step.section, { autoTour: false });
    }
  }

  const settle = step.section ? 80 : 0;
  setTimeout(() => {
    const targetEl = $(step.targetId);
    if (!targetEl) return;
    // Instant scroll — smooth scroll causes a race with the position timer
    targetEl.scrollIntoView({ block: 'nearest' });
    // Use center if the element lands under sticky nav or near the viewport edge.
    const r = targetEl.getBoundingClientRect();
    const stickyNav = document.body.classList.contains('embedded') ? $('settings-nav') : null;
    const topGuard = (stickyNav?.getBoundingClientRect().bottom || 0) + 12;
    if (r.top < topGuard || r.bottom > window.innerHeight - 60) {
      targetEl.scrollIntoView({ block: 'center' });
    }
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
  if (e.key === 'ArrowRight' && settingsTourIndex < currentSettingsTourSteps.length - 1) showSettingsTourStep(settingsTourIndex + 1);
  if (e.key === 'ArrowLeft'  && settingsTourIndex > 0) showSettingsTourStep(settingsTourIndex - 1);
}

// ── Profiles Section ──────────────────────────────────────────────────────

async function populateProfilesSection() {
  const { profiles, activeId } = await loadProfiles();
  const hideOnlyProfile = await shouldHideOnlyProfileShell(profiles);
  const visibleProfiles = hideOnlyProfile ? [] : profiles;
  renderProfilesList(visibleProfiles, activeId);
  $('profiles-edit-active-note')?.classList.toggle('hidden', hideOnlyProfile);
}

async function shouldHideOnlyProfileShell(profiles) {
  if (profiles.length !== 1 || !profiles[0]?.isCleared) return false;
  const currentProfile = await loadProfile();
  const localData = await chrome.storage.local.get(['sourceResumeText', 'sourceResumeName']);
  return !hasProfileContent(currentProfile) && !localData.sourceResumeText && !localData.sourceResumeName;
}

function hasProfileContent(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasProfileContent);
  if (typeof value === 'object') return Object.values(value).some(hasProfileContent);
  return Boolean(value);
}

function renderProfilesList(profiles, activeId) {
  const list = $('profiles-list');
  list.innerHTML = '';

  profiles.forEach(p => {
    const isActive = p.id === activeId;
    const row = document.createElement('div');
    row.className = 'profile-row' + (isActive ? ' profile-row--active' : '');
    row.dataset.id = p.id;

    const mode = p.fitInferenceMode || 'transferable';
    row.innerHTML = `
      <div class="profile-row-left">
        <div class="profile-row-name-wrap">
          <span class="profile-row-name">${esc(p.name)}</span>
          ${p.sourceResumeName ? `<span class="profile-row-file" title="${esc(p.sourceResumeName)}">📄 ${esc(p.sourceResumeName)}</span>` : ''}
        </div>
        ${isActive ? '<span class="profile-row-badge">Active</span>' : ''}
      </div>
      <div class="profile-row-actions">
        <span class="profile-mode-toggle" title="Fit Analysis mode: controls how the AI scores job matches for this profile">
          <button class="profile-mode-btn${mode === 'transferable' ? ' profile-mode-btn--active' : ''}" data-action="fit-inference-mode" data-id="${p.id}" data-mode="transferable" type="button" aria-pressed="${mode === 'transferable'}">Transferable</button><button class="profile-mode-btn${mode === 'exact' ? ' profile-mode-btn--active' : ''}" data-action="fit-inference-mode" data-id="${p.id}" data-mode="exact" type="button" aria-pressed="${mode === 'exact'}">Exact</button>
        </span>
        ${!isActive ? `<button class="profile-row-btn" data-action="switch" data-id="${p.id}" type="button">Switch</button>` : ''}
        <button class="profile-row-btn" data-action="rename" data-id="${p.id}" type="button">Rename</button>
        <button class="profile-row-btn profile-row-btn--danger" data-action="delete" data-id="${p.id}" type="button">Delete</button>
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
    await saveProfile(mergeProfileFormData(profile, collectProfileFromForm()));
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

  if (action === 'fit-inference-mode') {
    const newMode = btn.dataset.mode;
    await updateProfileMeta(id, { fitInferenceMode: newMode });
    await populateProfilesSection();
    return;
  }

  if (action === 'delete') {
    const { profiles } = await loadProfiles();
    const p = profiles.find(p => p.id === id);
    if (profiles.length <= 1) {
      const ok = await showConfirmDialog(
        'Clear profile?',
        'This will remove the profile details and uploaded source resume. You can add a new profile anytime.',
        'Clear Profile'
      );
      if (!ok) return;
      await clearProfileData(id);
      await chrome.storage.local.remove(['sourceResumeText', 'sourceResumeName']);
      clearSourceResumeUI();
      profile = await loadProfile();
      populateProfile(profile);
      await populateProfilesSection();
      showToast('Profile cleared.');
      return;
    }

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
  if (await shouldHideOnlyProfileShell(profiles)) {
    const id = profiles[0].id;
    await renameProfile(id, 'Profile 1');
    await updateProfileMeta(id, { isCleared: false });
    await switchProfile(id);
    profile = await loadProfile();
    populateProfile(profile);
    clearSourceResumeUI();
    await populateProfilesSection();
    const newBtn = $('profiles-list').querySelector(`[data-action="rename"][data-id="${id}"]`);
    if (newBtn) newBtn.click();
    document.querySelector('.nav-btn[data-section="profile"]').click();
    return;
  }

  const name = `Profile ${profiles.length + 1}`;
  const id   = await createProfile(name);
  await saveProfile(mergeProfileFormData(profile, collectProfileFromForm()));
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

init().catch(err => console.error(err?.message || err));
