import { normalizeCertificationEntry, normalizeResumeContent } from './schema.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function splitDateRange(dates = '') {
  const parts = String(dates || '').split(/\s*\p{Dash}\s*/u);
  return [parts[0]?.trim() || '', parts[1]?.trim() || ''];
}

function displayExperienceDates(exp = {}) {
  if (exp.dates) return String(exp.dates);
  if (exp.startDate || exp.endDate) return [exp.startDate || '', exp.endDate || ''].join(' - ').trim();
  return '';
}

function mergeExperienceEntries(existingEntries = [], formEntries = []) {
  return asArray(formEntries).map((formEntry, index) => {
    const existingEntry = existingEntries[index] || {};
    const formDates = String(formEntry.dates || '');
    const existingDisplayDates = displayExperienceDates(existingEntry);
    const datesChanged = formDates !== existingDisplayDates;
    const [startDate, endDate] = datesChanged
      ? splitDateRange(formDates)
      : [existingEntry.startDate || '', existingEntry.endDate || ''];

    return {
      ...existingEntry,
      jobTitle: formEntry.jobTitle || '',
      employer: formEntry.employer || '',
      location: formEntry.location || '',
      dates: formDates,
      startDate,
      endDate,
      bulletPoints: asArray(formEntry.bulletPoints),
    };
  });
}

function mergeEducationEntries(existingEntries = [], formEntries = []) {
  return asArray(formEntries).map((formEntry, index) => {
    const existingEntry = existingEntries[index] || {};
    return {
      ...existingEntry,
      credential: formEntry.credential || '',
      institution: formEntry.institution || '',
      dates: formEntry.dates || '',
    };
  });
}

function mergeCertificationEntries(existingEntries = [], formEntries = []) {
  return asArray(formEntries)
    .map((formEntry, index) => {
      const existingEntry = normalizeCertificationEntry(existingEntries[index]);
      return {
        ...existingEntry,
        name: String(formEntry?.name || '').trim(),
        issuer: String(formEntry?.issuer || '').trim(),
      };
    })
    .filter(cert => cert.name || cert.issuer);
}

export function mergeProfileFormData(existingProfile = {}, formProfile = {}) {
  const existing = normalizeResumeContent(existingProfile);

  return {
    ...existing,
    personalInfo: {
      ...existing.personalInfo,
      ...(formProfile.personalInfo || {}),
    },
    summaries: asArray(formProfile.summaries),
    skills: asArray(formProfile.skills),
    experience: mergeExperienceEntries(existing.experience, formProfile.experience),
    education: mergeEducationEntries(existing.education, formProfile.education),
    certifications: mergeCertificationEntries(existing.certifications, formProfile.certifications),
    customSections: asArray(formProfile.customSections),
    doNotClaimNotes: formProfile.doNotClaimNotes || '',
    metadata: {
      ...existing.metadata,
      ...(formProfile.metadata || {}),
    },
  };
}
