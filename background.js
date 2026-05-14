// background.js — Service Worker
// Registers context menu and routes messages between content script and dashboard.
// content.js is never injected automatically — only on explicit user action.

// ── Setup ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Disable side panel globally so it only shows on specific tabs when requested
  chrome.sidePanel.setOptions({ enabled: false }).catch((error) => console.error(error));

  // Clear any existing menu items first
  chrome.contextMenus.removeAll(() => {
    // Create main menu item
    chrome.contextMenus.create({
      id: 'jpda-main',
      title: 'Job Page Draft Assistant',
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

// Injects content.js into a tab and asks it to capture page content.
// content.js guards against duplicate injection, so this is safe to call repeatedly.
async function captureTab(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  return chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_CONTENT' });
}

// ── Action Icon Click ───────────────────────────────────────────────────────

// If the user clicks the toolbar icon, enable and open for current tab
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'dashboard/dashboard.html',
    enabled: true
  });
  chrome.sidePanel.open({ tabId: tab.id }).catch(err => console.error('Failed to open side panel via action:', err));
});

// ── Context Menu Click ─────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'jpda-main') return;

  // 1. OPEN SIDE PANEL IMMEDIATELY (must be synchronous inside the user gesture handler)
  chrome.sidePanel.setOptions({ tabId: tab.id, path: 'dashboard/dashboard.html', enabled: true });
  chrome.sidePanel.open({ tabId: tab.id }).catch(err => console.error('Failed to open side panel via context menu:', err));

  // 2. SCAN PAGE IN BACKGROUND — user triggered this action, so we read content now
  (async () => {
    await chrome.storage.session.set({ pendingMode: 'both' });

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

    await chrome.storage.session.set({
      extractedData: response,
      sourceUrl: tab.url,
      sourceTitle: tab.title,
    });

    // Tell any already-open dashboard to reload session data
    chrome.runtime.sendMessage({ type: 'SESSION_UPDATED' }).catch(() => { });
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
    chrome.storage.session.get(null).then(data => sendResponse(data));
    return true; // async
  }

  if (message.type === 'CLEAR_SESSION') {
    chrome.storage.session.clear().then(() => sendResponse({ ok: true }));
    return true;
  }
});
