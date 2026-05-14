// history/history.js — Job History page controller
// Entries are written by dashboard.js when the user saves a document as PDF.

// ── Helpers ───────────────────────────────────────────────────────────────

function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function typeBadgeClass(docType) {
  if (docType === 'Cover Letter') return 'type-badge type-cover-letter';
  if (docType === 'Merged')       return 'type-badge type-merged';
  return 'type-badge'; // Resume + Cover Letter / Resume
}

function generationModeForEntry(entry) {
  if (entry.docType === 'Cover Letter') return 'cover-letter';
  if (entry.docType === 'Resume') return 'resume';
  return 'both';
}

// ── Storage ───────────────────────────────────────────────────────────────

async function loadHistory() {
  const { jobHistory = [] } = await chrome.storage.local.get('jobHistory');
  return jobHistory;
}

async function saveHistory(entries) {
  await chrome.storage.local.set({ jobHistory: entries });
}

// ── Render ────────────────────────────────────────────────────────────────

function render(entries) {
  const table  = document.getElementById('history-table');
  const empty  = document.getElementById('empty-state');
  const tbody  = document.getElementById('history-body');
  const btnClear = document.getElementById('btn-clear-all');

  if (!entries.length) {
    table.classList.add('hidden');
    empty.classList.remove('hidden');
    btnClear.disabled = true;
    btnClear.style.opacity = '0.4';
    return;
  }

  empty.classList.add('hidden');
  table.classList.remove('hidden');
  btnClear.disabled = false;
  btnClear.style.opacity = '';

  tbody.innerHTML = '';

  for (const entry of entries) {
    const tr = document.createElement('tr');
    const canRegenerate = !!entry.jobData?.description;
    const openBtn = entry.sourceUrl
      ? `<button class="action-btn" data-action="open" data-url="${escAttr(entry.sourceUrl)}" title="Open original job posting">Open URL</button>`
      : '';
    const regenerateTitle = canRegenerate
      ? 'Reload this job in the dashboard and regenerate'
      : 'This older history entry does not include the job description needed to regenerate';

    tr.innerHTML = `
      <td class="col-date">
        <span class="date-primary">${escHtml(formatDate(entry.date))}</span>
        <span class="date-secondary">${escHtml(formatTime(entry.date))}</span>
      </td>
      <td class="col-title">${escHtml(entry.jobTitle || '—')}</td>
      <td class="col-company">${escHtml(entry.company || '—')}</td>
      <td class="col-type"><span class="${typeBadgeClass(entry.docType)}">${escHtml(entry.docType)}</span></td>
      <td class="col-actions">
        <div class="history-actions">
          <button class="action-btn" data-action="regenerate" data-id="${entry.id}" title="${escAttr(regenerateTitle)}" ${canRegenerate ? '' : 'disabled'}>Regenerate</button>
          ${openBtn}
          <button class="action-btn action-btn--danger" data-action="delete" data-id="${entry.id}" title="Remove from history">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// ── Confirm dialog ────────────────────────────────────────────────────────

function showConfirm(title, body, confirmLabel) {
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

// ── Actions ───────────────────────────────────────────────────────────────

async function deleteEntry(id) {
  const entries = await loadHistory();
  const updated = entries.filter(e => e.id !== id);
  await saveHistory(updated);
  render(updated);
}

async function clearAll() {
  await saveHistory([]);
  render([]);
}

async function regenerateEntry(id) {
  const entries = await loadHistory();
  const entry = entries.find(e => e.id === id);
  const jobData = entry?.jobData;
  if (!jobData?.description) return;

  const sourceUrl = jobData.sourceUrl || entry.sourceUrl || '';
  const mode = generationModeForEntry(entry);

  await chrome.storage.session.set({
    extractedData: {
      pageText: jobData.description,
      jobTitle: jobData.jobTitle || entry.jobTitle || '',
      company: jobData.company || entry.company || '',
      url: sourceUrl,
    },
    sourceUrl,
    sourceTitle: [jobData.jobTitle || entry.jobTitle, jobData.company || entry.company].filter(Boolean).join(' - '),
    pendingMode: mode,
    regenerateRequested: {
      id: entry.id,
      requestedAt: new Date().toISOString(),
    },
  });
}

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  const { theme } = await chrome.storage.local.get(['theme']);
  applyTheme(theme || 'system');

  const entries = await loadHistory();
  render(entries);

  // Table row actions via event delegation
  document.getElementById('history-body').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'open') {
      window.open(btn.dataset.url, '_blank', 'noopener');
    }

    if (btn.dataset.action === 'regenerate') {
      await regenerateEntry(Number(btn.dataset.id));
    }

    if (btn.dataset.action === 'delete') {
      const ok = await showConfirm(
        'Remove this entry?',
        'It will be removed from your history.',
        'Delete'
      );
      if (ok) deleteEntry(Number(btn.dataset.id));
    }
  });

  // Clear all button
  document.getElementById('btn-clear-all').addEventListener('click', async () => {
    const ok = await showConfirm(
      'Clear all history?',
      'All saved entries will be removed. This cannot be undone.',
      'Clear all'
    );
    if (ok) clearAll();
  });

  // Auto-refresh when a new entry is saved from the dashboard
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.theme) {
      applyTheme(changes.theme.newValue || 'system');
    }

    if (area === 'local' && changes.jobHistory) {
      render(changes.jobHistory.newValue || []);
    }
  });
}

init();
