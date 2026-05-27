// jobs/jobs.js - Saved jobs and application queue controller

import { openSafeHttpUrl } from '../modules/url.js';
import { compactSavedJobs, isStorageQuotaError, storageQuotaMessage } from '../modules/storageLimits.js';

const SAVED_JOBS_KEY = 'savedJobs';
const GENERATION_MODES = new Set(['resume', 'cover-letter']);
const STATUSES = [
  ['needs_review', 'Needs review'],
  ['saved', 'Saved'],
  ['ready_to_apply', 'Ready to apply'],
  ['applied', 'Applied'],
  ['rejected', 'Rejected'],
];

let suppressNextSavedJobsRefresh = false;
let currentSort = 'created_desc';
const analyzingJobs = new Set();
const fitErrors = new Map();

function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function timeValue(iso) {
  const time = new Date(iso || '').getTime();
  return Number.isFinite(time) ? time : 0;
}

function statusLabel(value) {
  return STATUSES.find(([status]) => status === value)?.[1] || 'Saved';
}

function fitLabelText(value) {
  const labels = {
    strong_match: 'Strong match',
    good_match: 'Good match',
    maybe: 'Maybe',
    weak_match: 'Weak match',
    not_recommended: 'Not recommended',
  };
  return labels[value] || 'Fit analysis';
}

function fitScoreClass(score) {
  const number = Number(score) || 0;
  if (number >= 70) return 'fit-score fit-score--good';
  if (number >= 50) return 'fit-score fit-score--maybe';
  return 'fit-score fit-score--weak';
}

function numericFitScore(job) {
  const value = job?.fitAnalysis?.score;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function savedJobStats(jobs) {
  return jobs.reduce((stats, job) => {
    stats.total += 1;
    const score = numericFitScore(job);
    if (score !== null && score >= 75) {
      stats.strong += 1;
    } else if (score !== null && score >= 50) {
      stats.good += 1;
    } else {
      stats.developing += 1;
    }
    return stats;
  }, { total: 0, strong: 0, good: 0, developing: 0 });
}

function updateJobsStats(jobs) {
  const statsBar = document.getElementById('jobs-stats');
  if (!statsBar) return;

  if (!jobs.length) {
    statsBar.classList.add('hidden');
    return;
  }

  const stats = savedJobStats(jobs);
  document.getElementById('jobs-stat-total').textContent = String(stats.total);
  document.getElementById('jobs-stat-strong').textContent = String(stats.strong);
  document.getElementById('jobs-stat-good').textContent = String(stats.good);
  document.getElementById('jobs-stat-developing').textContent = String(stats.developing);
  statsBar.classList.remove('hidden');
}

function listItems(items) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) return '<li>No items returned.</li>';
  return values.map(item => `<li>${escHtml(item)}</li>`).join('');
}

function fitAnalysisHtml(job) {
  const error = fitErrors.get(job.id);
  const analysis = job.fitAnalysis;
  const errorHtml = error
    ? `<div class="fit-message fit-message--error" role="alert">${escHtml(error)}</div>`
    : '';

  if (!analysis) return errorHtml;

  const score = Number.isFinite(Number(analysis.score)) ? Math.round(Number(analysis.score)) : 0;
  const analyzedAt = formatDateTime(analysis.analyzedAt);

  return `
    ${errorHtml}
    <div class="fit-summary">
      <div class="${fitScoreClass(score)}" aria-label="Fit score ${score} out of 100">
        <span class="fit-score-number">${score}</span><span class="fit-score-denom">/100</span>
      </div>
      <div class="fit-summary-main">
        <div class="fit-summary-heading">
          <span class="fit-label">${escHtml(fitLabelText(analysis.label))}</span>
          ${analyzedAt ? `<span class="fit-time">Analyzed ${escHtml(analyzedAt)}</span>` : ''}
        </div>
        <p class="fit-recommendation">${escHtml(analysis.recommendation || 'No recommendation returned.')}</p>
      </div>
    </div>
    <details class="fit-details">
      <summary>Fit details</summary>
      <div class="fit-detail-grid">
        <section>
          <h3>Strong matches</h3>
          <ul>${listItems(analysis.strongMatches)}</ul>
        </section>
        <section>
          <h3>Possible gaps</h3>
          <ul>${listItems(analysis.possibleGaps)}</ul>
        </section>
        <section class="fit-angle">
          <h3>Suggested angle</h3>
          <p>${escHtml(analysis.suggestedAngle || 'No suggested angle returned.')}</p>
        </section>
      </div>
    </details>
  `;
}

function sortText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeGenerationMode(mode) {
  return GENERATION_MODES.has(mode) ? mode : '';
}

function normalizedFitText(value) {
  return String(value || '').trim();
}

function normalizedFitList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => normalizedFitText(item))
    .filter(Boolean)
    .slice(0, 5);
}

function loadedJobFitAnalysis(job) {
  const analysis = job?.fitAnalysis;
  if (!analysis) return null;

  const fitContext = {
    suggestedAngle: normalizedFitText(analysis.suggestedAngle),
    strongMatches: normalizedFitList(analysis.strongMatches),
    possibleGaps: normalizedFitList(analysis.possibleGaps),
  };

  if (!fitContext.suggestedAngle && !fitContext.strongMatches.length && !fitContext.possibleGaps.length) {
    return null;
  }
  return fitContext;
}

function sortSavedJobs(jobs) {
  const sorted = [...jobs];
  sorted.sort((a, b) => {
    if (currentSort === 'created_asc') {
      return timeValue(a.createdAt) - timeValue(b.createdAt);
    }
    if (currentSort === 'created_desc') {
      return timeValue(b.createdAt) - timeValue(a.createdAt);
    }
    if (currentSort === 'updated_desc') {
      return timeValue(b.updatedAt || b.createdAt) - timeValue(a.updatedAt || a.createdAt);
    }
    if (currentSort === 'status') {
      return statusLabel(a.status).localeCompare(statusLabel(b.status)) ||
        timeValue(b.updatedAt || b.createdAt) - timeValue(a.updatedAt || a.createdAt);
    }
    if (currentSort === 'company') {
      return sortText(a.company).localeCompare(sortText(b.company)) ||
        sortText(a.title).localeCompare(sortText(b.title)) ||
        timeValue(b.updatedAt || b.createdAt) - timeValue(a.updatedAt || a.createdAt);
    }
    return timeValue(b.createdAt) - timeValue(a.createdAt);
  });
  return sorted;
}

async function loadSavedJobs() {
  const data = await chrome.storage.local.get(SAVED_JOBS_KEY);
  return Array.isArray(data[SAVED_JOBS_KEY]) ? data[SAVED_JOBS_KEY] : [];
}

async function saveSavedJobs(jobs, options = {}) {
  if (options.silent) suppressNextSavedJobsRefresh = true;
  try {
    await chrome.storage.local.set({ [SAVED_JOBS_KEY]: compactSavedJobs(jobs) });
    return true;
  } catch (err) {
    suppressNextSavedJobsRefresh = false;
    console.warn('Could not save saved jobs:', err?.message || err);
    if (isStorageQuotaError(err)) {
      window.alert(storageQuotaMessage('savedJobs'));
    }
    return false;
  }
}

async function refreshJobs() {
  render(sortSavedJobs(await loadSavedJobs()));
}

function render(jobs) {
  const list = document.getElementById('jobs-list');
  const empty = document.getElementById('empty-state');
  updateJobsStats(jobs);

  if (!jobs.length) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    list.innerHTML = '';
    return;
  }

  empty.classList.add('hidden');
  list.classList.remove('hidden');
  list.innerHTML = '';

  for (const job of jobs) {
    const card = document.createElement('article');
    card.className = 'job-card';
    card.dataset.id = job.id;
    const date = formatDate(job.updatedAt || job.createdAt);
    const savedAt = formatDateTime(job.createdAt);
    const updatedAt = formatDateTime(job.updatedAt);
    const showUpdatedAt = updatedAt && updatedAt !== savedAt;
    const isAnalyzing = analyzingJobs.has(job.id);
    const openButton = job.sourceUrl
      ? `<button class="action-btn" data-action="open" data-url="${escAttr(job.sourceUrl)}" type="button">Open URL</button>`
      : '';
    const statusOptions = STATUSES.map(([value, label]) =>
      `<option value="${escAttr(value)}" ${job.status === value ? 'selected' : ''}>${escHtml(label)}</option>`
    ).join('');

    card.innerHTML = `
      <div class="job-card-main">
        <div class="job-card-heading">
          <h2 class="job-title">${escHtml(job.title || '(untitled job)')}</h2>
          <p class="job-company">${escHtml(job.company || 'Company not set')}</p>
        </div>
        <div class="job-meta">
          <span>${escHtml(statusLabel(job.status))}</span>
          ${date ? `<span>${escHtml(date)}</span>` : ''}
        </div>
      </div>

      <div class="job-timestamps">
        ${savedAt ? `<span>Saved ${escHtml(savedAt)}</span>` : ''}
        ${showUpdatedAt ? `<span>Updated ${escHtml(updatedAt)}</span>` : ''}
      </div>

      ${fitAnalysisHtml(job)}

      <div class="job-controls">
        <label>
          <span>Status</span>
          <select class="status-select" data-action="status" aria-label="Status for ${escAttr(job.title || 'saved job')}">
            ${statusOptions}
          </select>
        </label>
        <label>
          <span>Notes</span>
          <textarea class="job-notes" rows="2" placeholder="Notes for this application">${escHtml(job.notes || '')}</textarea>
        </label>
      </div>

      <div class="job-actions">
        <button class="action-btn" data-action="analyze" type="button" ${isAnalyzing ? 'disabled' : ''}>
          ${isAnalyzing ? 'Analyzing...' : job.fitAnalysis ? 'Re-analyze' : 'Analyze Fit'}
        </button>
        <button class="action-btn" data-action="generate-resume" type="button">Generate resume</button>
        <button class="action-btn" data-action="generate-cover-letter" type="button">Generate cover letter</button>
        <button class="action-btn" data-action="recruiter-message" type="button">Recruiter message</button>
        <button class="action-btn action-btn--primary" data-action="load" type="button">Load into generator</button>
        ${openButton}
        <button class="action-btn action-btn--danger" data-action="delete" type="button">Delete</button>
      </div>
    `;
    list.appendChild(card);
  }
}

function showConfirm(title, body, confirmLabel) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirm-overlay');
    const btnOk = document.getElementById('confirm-btn-ok');
    const btnCancel = document.getElementById('confirm-btn-cancel');

    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent = body;
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

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = e => { if (e.target === overlay) cleanup(false); };

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
  });
}

async function updateSavedJob(id, patch) {
  const jobs = await loadSavedJobs();
  const index = jobs.findIndex(job => job.id === id);
  if (index === -1) return;

  jobs[index] = {
    ...jobs[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await saveSavedJobs(jobs, { silent: true });
}

async function deleteSavedJob(id) {
  const jobs = await loadSavedJobs();
  await saveSavedJobs(jobs.filter(job => job.id !== id));
}

async function loadIntoGenerator(id, options = {}) {
  const jobs = await loadSavedJobs();
  const job = jobs.find(item => item.id === id);
  if (!job) return;

  const generationMode = normalizeGenerationMode(options.generationMode);
  const sessionPayload = {
    extractedData: {
      pageText: job.cleanDescription || '',
      jobTitle: job.title || '',
      company: job.company || '',
      url: job.sourceUrl || '',
      sourceType: job.sourceType || 'manual_entry',
      loadedFromSavedJob: true,
    },
    sourceUrl: job.sourceUrl || '',
    sourceTitle: [job.title, job.company].filter(Boolean).join(' - '),
    loadedSavedJob: {
      id: job.id,
      loadedAt: new Date().toISOString(),
    },
  };
  const fitContext = loadedJobFitAnalysis(job);
  if (fitContext) sessionPayload.loadedJobFitAnalysis = fitContext;
  if (generationMode) sessionPayload.pendingMode = generationMode;

  await chrome.storage.session.remove(['pendingMode', 'regenerateRequested', 'loadedJobFitAnalysis']);
  await chrome.storage.session.set(sessionPayload);

  window.parent?.postMessage({
    type: generationMode ? 'JPDA_SAVED_JOB_GENERATE_REQUESTED' : 'JPDA_SAVED_JOB_LOADED',
    id: job.id,
    mode: generationMode,
  }, window.location.origin);
}

async function requestFitAnalysis(id) {
  analyzingJobs.add(id);
  fitErrors.delete(id);
  await refreshJobs();
  window.parent?.postMessage({ type: 'JPDA_ANALYZE_FIT_REQUESTED', id }, window.location.origin);
}

function requestRecruiterMessage(id) {
  window.parent?.postMessage({ type: 'JPDA_RECRUITER_MESSAGE_REQUESTED', id }, window.location.origin);
}

async function init() {
  const { theme } = await chrome.storage.local.get(['theme']);
  applyTheme(theme || 'system');
  await refreshJobs();

  const list = document.getElementById('jobs-list');
  const sortSelect = document.getElementById('sort-jobs');
  sortSelect.value = currentSort;

  sortSelect.addEventListener('change', async () => {
    currentSort = sortSelect.value;
    await refreshJobs();
  });

  list.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const card = btn.closest('.job-card');
    const id = card?.dataset.id;
    if (!id) return;

    if (btn.dataset.action === 'open') {
      openSafeHttpUrl(btn.dataset.url);
    }

    if (btn.dataset.action === 'analyze') {
      await requestFitAnalysis(id);
    }

    if (btn.dataset.action === 'load') {
      await loadIntoGenerator(id);
    }

    if (btn.dataset.action === 'generate-resume') {
      await loadIntoGenerator(id, { generationMode: 'resume' });
    }

    if (btn.dataset.action === 'generate-cover-letter') {
      await loadIntoGenerator(id, { generationMode: 'cover-letter' });
    }

    if (btn.dataset.action === 'recruiter-message') {
      requestRecruiterMessage(id);
    }

    if (btn.dataset.action === 'delete') {
      const ok = await showConfirm(
        'Delete saved job?',
        'This removes it from Jobs. Generated history is not affected.',
        'Delete'
      );
      if (ok) {
        analyzingJobs.delete(id);
        fitErrors.delete(id);
        await deleteSavedJob(id);
        await refreshJobs();
      }
    }
  });

  list.addEventListener('change', async e => {
    const select = e.target.closest('.status-select');
    if (!select) return;

    const card = select.closest('.job-card');
    await updateSavedJob(card.dataset.id, { status: select.value });
    await refreshJobs();
  });

  list.addEventListener('blur', async e => {
    const notes = e.target.closest('.job-notes');
    if (!notes) return;

    const card = notes.closest('.job-card');
    await updateSavedJob(card.dataset.id, { notes: notes.value.trim() });
  }, true);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.theme) {
      applyTheme(changes.theme.newValue || 'system');
    }
    if (area === 'local' && changes[SAVED_JOBS_KEY]) {
      if (suppressNextSavedJobsRefresh) {
        suppressNextSavedJobsRefresh = false;
        return;
      }
      refreshJobs();
    }
  });

  window.addEventListener('message', async e => {
    if (e.origin !== window.location.origin) return;
    const { type, id, message } = e.data || {};
    if (!id) return;

    if (type === 'JPDA_ANALYZE_FIT_STARTED') {
      analyzingJobs.add(id);
      fitErrors.delete(id);
      await refreshJobs();
    }
    if (type === 'JPDA_ANALYZE_FIT_DONE') {
      analyzingJobs.delete(id);
      fitErrors.delete(id);
      await refreshJobs();
    }
    if (type === 'JPDA_ANALYZE_FIT_ERROR') {
      analyzingJobs.delete(id);
      fitErrors.set(id, message || 'Fit analysis failed. Please try again.');
      await refreshJobs();
    }
  });
}

init();
