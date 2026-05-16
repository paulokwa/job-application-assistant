// jobs/jobs.js - Saved jobs and application queue controller

const SAVED_JOBS_KEY = 'savedJobs';
const STATUSES = [
  ['needs_review', 'Needs review'],
  ['saved', 'Saved'],
  ['ready_to_apply', 'Ready to apply'],
  ['applied', 'Applied'],
  ['rejected', 'Rejected'],
];

let suppressNextSavedJobsRefresh = false;

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

function statusLabel(value) {
  return STATUSES.find(([status]) => status === value)?.[1] || 'Saved';
}

async function loadSavedJobs() {
  const data = await chrome.storage.local.get(SAVED_JOBS_KEY);
  return Array.isArray(data[SAVED_JOBS_KEY]) ? data[SAVED_JOBS_KEY] : [];
}

async function saveSavedJobs(jobs, options = {}) {
  if (options.silent) suppressNextSavedJobsRefresh = true;
  await chrome.storage.local.set({ [SAVED_JOBS_KEY]: jobs });
}

async function refreshJobs() {
  render(await loadSavedJobs());
}

function render(jobs) {
  const list = document.getElementById('jobs-list');
  const empty = document.getElementById('empty-state');

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

async function loadIntoGenerator(id) {
  const jobs = await loadSavedJobs();
  const job = jobs.find(item => item.id === id);
  if (!job) return;

  await chrome.storage.session.remove(['pendingMode', 'regenerateRequested']);
  await chrome.storage.session.set({
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
  });

  window.parent?.postMessage({ type: 'JPDA_SAVED_JOB_LOADED', id: job.id }, window.location.origin);
}

async function init() {
  const { theme } = await chrome.storage.local.get(['theme']);
  applyTheme(theme || 'system');
  await refreshJobs();

  const list = document.getElementById('jobs-list');

  list.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const card = btn.closest('.job-card');
    const id = card?.dataset.id;
    if (!id) return;

    if (btn.dataset.action === 'open') {
      window.open(btn.dataset.url, '_blank', 'noopener');
    }

    if (btn.dataset.action === 'load') {
      await loadIntoGenerator(id);
    }

    if (btn.dataset.action === 'delete') {
      const ok = await showConfirm(
        'Delete saved job?',
        'This removes it from Jobs. Generated history is not affected.',
        'Delete'
      );
      if (ok) {
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
    const statusMeta = card.querySelector('.job-meta span');
    if (statusMeta) statusMeta.textContent = statusLabel(select.value);
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
}

init();
