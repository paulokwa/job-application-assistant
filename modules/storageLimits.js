// modules/storageLimits.js
// Central write-time storage guardrails for quota-sensitive extension data.

export const STORAGE_LIMITS = {
  sourceResumeTextChars: 250000,
  savedJobRawContentChars: 20000,
  savedJobCleanDescriptionChars: 40000,
  savedJobNotesChars: 4000,
  jobHistoryDescriptionChars: 30000,
  savedDraftDescriptionChars: 40000,
  docSettingsFilenamePatternChars: 160,
};

export function getByteSize(value) {
  return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
}

export function truncateText(value, maxChars) {
  const text = String(value || '');
  if (!Number.isFinite(maxChars) || maxChars < 0) return text;
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

export function wasTruncated(original, truncated) {
  return String(original || '') !== String(truncated || '');
}

export function compactSavedJob(job = {}) {
  return {
    ...job,
    rawContent: truncateText(job.rawContent, STORAGE_LIMITS.savedJobRawContentChars),
    cleanDescription: truncateText(job.cleanDescription, STORAGE_LIMITS.savedJobCleanDescriptionChars),
    notes: truncateText(job.notes, STORAGE_LIMITS.savedJobNotesChars),
  };
}

export function compactSavedJobs(jobs) {
  return Array.isArray(jobs) ? jobs.map(compactSavedJob) : [];
}

export function compactJobHistoryEntry(entry = {}) {
  const jobData = entry.jobData
    ? {
        ...entry.jobData,
        description: truncateText(entry.jobData.description, STORAGE_LIMITS.jobHistoryDescriptionChars),
      }
    : entry.jobData;

  return {
    ...entry,
    jobData,
  };
}

export function compactSavedDraft(savedDraft = {}) {
  const jobData = savedDraft.jobData
    ? {
        ...savedDraft.jobData,
        description: truncateText(savedDraft.jobData.description, STORAGE_LIMITS.savedDraftDescriptionChars),
      }
    : savedDraft.jobData;

  return {
    ...savedDraft,
    jobData,
  };
}

export function isStorageQuotaError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('quota') ||
    message.includes('storage') && message.includes('exceed') ||
    message.includes('maximum') && message.includes('storage');
}

export function storageQuotaMessage(context = 'storage') {
  const messages = {
    savedJobs: 'Could not save this job because local storage is full. Delete old saved jobs or history, or shorten the job description.',
    savedDraft: 'Draft is ready, but it was too large to save for reopening later. You can still export it now.',
    editedHtml: 'Manual edits are too large to auto-save, but export still uses the current preview.',
    sourceResume: 'Could not save the uploaded resume because local storage is full. Remove old saved jobs or history and try again.',
    jobHistory: 'Could not save this job to history because local storage is full.',
  };
  return messages[context] || 'Could not save because local storage is full. Delete older saved data or shorten the content and try again.';
}
