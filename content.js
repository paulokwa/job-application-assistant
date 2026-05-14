// content.js — Injected on demand after a user action (context menu or Scan Page button).
// Page content is only read when the user explicitly triggers a scan — never automatically.

// Guard against duplicate listeners if executeScript is called more than once on the same tab.
if (typeof window.__jpdaContentInjected === 'undefined') {
  window.__jpdaContentInjected = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'CAPTURE_CONTENT') return;

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

    return true; // keep channel open for async sendResponse
  });
}
