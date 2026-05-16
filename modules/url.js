// modules/url.js
// Shared URL opening guard for user-provided or stored source URLs.

export function getSafeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch (_) {
    // Invalid or relative URLs are intentionally blocked.
  }

  return '';
}

export function openSafeHttpUrl(value) {
  const url = getSafeHttpUrl(value);
  if (!url) {
    console.warn('[JPDA] Blocked unsafe or invalid URL.');
    return false;
  }

  window.open(url, '_blank', 'noopener');
  return true;
}
