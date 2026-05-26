// modules/template.js
// Utility functions for file handling and naming.

/**
 * Triggers a browser download of a Blob.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

/**
 * Builds a filename from a pattern + job context.
 * Supported variables: {jobTitle}, {company}, {date}, {docType}
 */
export function buildFilename(pattern, { jobTitle, company, date, docType, name }) {
  const today = date || new Date().toISOString().slice(0, 10);
  const sanitizedJob = sanitize(jobTitle) || 'Role';
  const sanitizedCompany = sanitize(company) || 'Company';
  const sanitizedDocType = sanitize(docType) || 'Document';
  const sanitizedName = sanitize(name) || 'Name';

  return (pattern || '{docType} - {company} - {jobTitle}')
    .replace(/\{jobTitle\}/gi, sanitizedJob)
    .replace(/\{company\}/gi,  sanitizedCompany)
    .replace(/\{date\}/gi,     today)
    .replace(/\{docType\}/gi,  sanitizedDocType)
    .replace(/\{name\}/gi,     sanitizedName);
}

function sanitize(str) {
  return (str || '').replace(/[<>:"/\\|?*]/g, '').trim();
}
