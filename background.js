// background.js — Service Worker
// Registers context menu and routes messages between content script and dashboard.
// content.js is never injected automatically — only on explicit user action.

const openSidePanelTabs = new Set();
const JOB_SESSIONS_BY_TAB_KEY = 'jobSessionsByTab';
const SESSION_SCAN_TEXT_CAP_CHARS = 60000;
const SESSION_SCAN_TRUNCATION_MARKER = '\n\n[Truncated: page text exceeded session storage cap]';

// ── Setup ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Disable side panel globally so it only shows on specific tabs when requested
  chrome.sidePanel.setOptions({ enabled: false }).catch(error => console.error(error?.message || error));

  // Clear any existing menu items first
  chrome.contextMenus.removeAll(() => {
    // Create main menu item
    chrome.contextMenus.create({
      id: 'jpda-main',
      title: 'Job Application Assistant',
      contexts: ['page', 'selection'],
    });
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

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

// Injects content.js into all frames and returns the best capture result.
// Cross-origin iframes (e.g. embedded ATS widgets) may contain the real job
// content while the top-level document only has nav/footer text. Sending
// CAPTURE_CONTENT to each frame individually and scoring the responses lets
// us pick the frame that actually has the job detail.
// Falls back to main-frame-only if allFrames injection is unavailable.
async function captureTab(tabId) {
  let targets;
  try {
    targets = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js'],
    });
  } catch (_) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_CONTENT' });
  }

  const frameIds = [...new Set(
    (targets || []).map(r => r.frameId).filter(id => id != null)
  )];
  if (frameIds.length === 0) {
    return { error: 'No frames available to capture.' };
  }

  const responses = await Promise.all(frameIds.map(frameId =>
    new Promise(resolve => {
      try {
        chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_CONTENT' }, { frameId }, response => {
          resolve(chrome.runtime.lastError ? null : response);
        });
      } catch (_) { resolve(null); }
    })
  ));

  let best = null;
  let bestScore = -Infinity;
  for (const r of responses) {
    const s = scoreCaptureResult(r);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return best || { error: 'Could not extract content from the page.' };
}

// Scores a CAPTURE_CONTENT response so the frame with real job content wins.
function scoreCaptureResult(result) {
  if (!result || result.error) return -Infinity;
  if (result.usedSelection) return 10000;
  if (result.usedIndeedViewJobFetch) return 5000;
  let score = 0;
  if (result.usedDetailContainer && result.detailContainerScore) {
    score += 1000 + (result.detailContainerScore || 0);
  }
  const text = result.pageText || '';
  if (/^job\s*title\s*[:\-]/im.test(text))                    score += 500;
  if (/\bresponsibilities\b/i.test(text))                      score += 100;
  if (/\b(?:qualifications?|requirements?)\b/i.test(text))     score += 100;
  if (/\b(?:full|part)[- ]?time\b/i.test(text))                score += 50;
  score += Math.min(200, text.length / 50);
  return score;
}

function capSessionScanText(value) {
  if (value === null || value === undefined) return value;
  const text = String(value);
  if (text.length <= SESSION_SCAN_TEXT_CAP_CHARS) return text;

  // Protect session storage from huge scanned pages while keeping enough text for normal generation.
  const keepChars = Math.max(0, SESSION_SCAN_TEXT_CAP_CHARS - SESSION_SCAN_TRUNCATION_MARKER.length);
  return text.slice(0, keepChars) + SESSION_SCAN_TRUNCATION_MARKER;
}

function capSessionScanPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  const capped = { ...payload };
  for (const field of ['pageText', 'selectedText', 'structuredData']) {
    if (field in capped) capped[field] = capSessionScanText(capped[field]);
  }
  return capped;
}

function normalizeSessionMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function saveJobSessionForTab(tabId, session) {
  if (!tabId) return;

  const key = String(tabId);
  const data = await chrome.storage.session.get([JOB_SESSIONS_BY_TAB_KEY]);
  const sessions = normalizeSessionMap(data[JOB_SESSIONS_BY_TAB_KEY]);
  await chrome.storage.session.set({
    [JOB_SESSIONS_BY_TAB_KEY]: {
      ...sessions,
      [key]: session,
    },
  });
}

async function removeJobSessionForTab(tabId) {
  if (!tabId) return;

  const key = String(tabId);
  const data = await chrome.storage.session.get([JOB_SESSIONS_BY_TAB_KEY]);
  const sessions = { ...normalizeSessionMap(data[JOB_SESSIONS_BY_TAB_KEY]) };
  delete sessions[key];
  await chrome.storage.session.set({ [JOB_SESSIONS_BY_TAB_KEY]: sessions });
}

function markSidePanelOpen(tabId, isOpen) {
  if (!tabId) return;

  const key = String(tabId);
  if (isOpen) openSidePanelTabs.add(key);
  else openSidePanelTabs.delete(key);
}

function isSidePanelOpen(tabId) {
  if (!tabId) return false;
  return openSidePanelTabs.has(String(tabId));
}

async function openSidePanelForTab(tab) {
  if (!tab?.id) return;

  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: `dashboard/dashboard.html?sourceTabId=${encodeURIComponent(String(tab.id))}`,
    enabled: true
  }).catch(error => console.error(error?.message || error));

  await chrome.sidePanel.open({ tabId: tab.id });
  markSidePanelOpen(tab.id, true);
}

async function toggleSidePanelForTab(tab) {
  if (!tab?.id) return;

  if (chrome.sidePanel.close && isSidePanelOpen(tab.id)) {
    try {
      await chrome.sidePanel.close({ tabId: tab.id });
      markSidePanelOpen(tab.id, false);
      return;
    } catch (err) {
      console.warn('[JPDA] Failed to close side panel via action:', err?.message || err);
      markSidePanelOpen(tab.id, false);
    }
  }

  await openSidePanelForTab(tab);
}

if (chrome.sidePanel.onOpened) {
  chrome.sidePanel.onOpened.addListener(info => {
    if (info?.tabId) markSidePanelOpen(info.tabId, true);
  });
}

if (chrome.sidePanel.onClosed) {
  chrome.sidePanel.onClosed.addListener(info => {
    if (info?.tabId) markSidePanelOpen(info.tabId, false);
  });
}

chrome.tabs.onRemoved.addListener(tabId => {
  markSidePanelOpen(tabId, false);
});

// Prevent the side panel from propagating to new tabs (e.g. the print window
// opened by window.open). New tabs only show the panel when explicitly opened.
chrome.tabs.onCreated.addListener(tab => {
  chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false }).catch(() => {});
});

// ── Action Icon Click ───────────────────────────────────────────────────────

// If the user clicks the toolbar icon, enable and open for current tab
chrome.action.onClicked.addListener((tab) => {
  toggleSidePanelForTab(tab).catch(err => console.error('Failed to toggle side panel via action:', err?.message || err));
});

// ── Context Menu Click ─────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'jpda-main') return;

  // 1. OPEN SIDE PANEL IMMEDIATELY (must be synchronous inside the user gesture handler)
  openSidePanelForTab(tab).catch(err => console.error('Failed to open side panel via context menu:', err?.message || err));

  // 2. SCAN PAGE IN BACKGROUND — user triggered this action, so we read content now
  (async () => {
    let response;

    if (isRestrictedUrl(tab.url)) {
      response = { error: 'Cannot read this page — open a job posting in a normal browser tab first.' };
    } else {
      try {
        // Inject content.js on demand, then request page content.
        // The guard in content.js prevents duplicate listeners on repeated scans.
        response = await captureTab(tab.id);
      } catch (err) {
        console.warn('[JPDA] Context menu scan failed:', err.message);
        response = { error: 'Could not read page content. This page may block extensions (e.g. PDFs, restricted sites).' };
      }
    }

    await saveJobSessionForTab(tab.id, {
      extractedData: capSessionScanPayload(response),
      sourceUrl: tab.url,
      sourceTitle: tab.title,
      sourceTabId: tab.id,
      pendingMode: 'both',
    });

    // Tell the dashboard for this tab to reload its own session data.
    chrome.runtime.sendMessage({ type: 'SESSION_UPDATED', sourceTabId: tab.id }).catch(() => { });
  })();
});

// ── Message Router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SETTINGS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_SESSION') {
    if (message.sourceTabId) {
      chrome.storage.session.get([JOB_SESSIONS_BY_TAB_KEY]).then(data => {
        const sessions = normalizeSessionMap(data[JOB_SESSIONS_BY_TAB_KEY]);
        sendResponse(sessions[String(message.sourceTabId)] || {});
      });
    } else {
      chrome.storage.session.get(null).then(data => sendResponse(data));
    }
    return true; // async
  }

  if (message.type === 'CLEAR_SESSION') {
    if (message.sourceTabId) {
      removeJobSessionForTab(message.sourceTabId).then(() => sendResponse({ ok: true }));
    } else {
      chrome.storage.session.clear().then(() => sendResponse({ ok: true }));
    }
    return true;
  }
});
