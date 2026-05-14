// modules/html.js
// Shared HTML escaping for user-provided and AI-provided text.

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeHtmlStrings(value) {
  if (typeof value === 'string') return esc(value);
  if (Array.isArray(value)) return value.map(escapeHtmlStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, escapeHtmlStrings(entry)])
    );
  }
  return value;
}
