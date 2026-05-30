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

export function validateOllamaEndpoint(raw) {
  let parsed;
  try {
    parsed = new URL(String(raw || '').trim());
  } catch {
    throw new Error('Invalid Ollama endpoint. Use a local address like http://localhost:11434.');
  }

  if (parsed.protocol !== 'http:') {
    throw new Error(
      `Ollama endpoint must use http://. "${parsed.protocol.replace(':', '')}" is not supported.`
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      `Ollama must run on this computer. Use http://localhost or http://127.0.0.1 — not "${host}".`
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error('Ollama endpoint must not include credentials. Check your endpoint setting.');
  }

  return `${parsed.protocol}//${parsed.host}`;
}
