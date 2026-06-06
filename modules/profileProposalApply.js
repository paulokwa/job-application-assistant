import { validateProfileUpdateProposal } from './jobChat.js';
import { normalizeCertificationEntry, normalizeResumeContent } from './schema.js';

const SUPPORTED_ACTIONS = {
  skills: new Set(['add']),
  summary: new Set(['update']),
  certifications: new Set(['add']),
  experience: new Set(['add']),
};

const APPLY_SUPPORTED_SECTIONS = {
  skills: new Set(['add']),
  summary: new Set(['update']),
  certifications: new Set(['add']),
};

export function isApplySectionSupported(section, action) {
  return Boolean(APPLY_SUPPORTED_SECTIONS[section]?.has(action));
}

const ALLOWED_PROPOSAL_KEYS = new Set([
  'type',
  'proposalVersion',
  'section',
  'action',
  'confidence',
  'requiresConfirmation',
  'summary',
  'target',
  'proposedValue',
  'warnings',
  'sensitiveFields',
  'sourceUserMessage',
  'targetProfileId',
  'createdAt',
  'baseProfileFingerprint',
  'baseProfileHash',
]);

const BLOCKED_KEYS = new Set([
  'metadata',
  'lockedsections',
  'profileindex',
  'activeprofileid',
  'sourceresumetext',
  'sourceresumename',
  'storage',
  'storagekey',
  'storagekeys',
  'chrome.storage',
  'saveprofile',
  'generateddrafts',
  'saveddraft',
  'saveddrafts',
  'drafts',
]);

const VALUE_KEYS = {
  summary: new Set(['text']),
  certifications: new Set(['name', 'issuer', 'year']),
  experience: new Set([
    'jobTitle',
    'title',
    'employer',
    'company',
    'location',
    'dates',
    'startDate',
    'endDate',
    'bulletPoints',
    'responsibilities',
    'description',
  ]),
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function result({
  ok = false,
  blocked = !ok,
  needsConfirmation = false,
  reasons = [],
  warnings = [],
  beforeProfile = null,
  afterProfile = null,
  patchSummary = null,
  section = '',
  action = '',
} = {}) {
  return {
    ok,
    blocked,
    needsConfirmation,
    reasons: [...new Set(reasons.filter(Boolean))],
    warnings: [...new Set(warnings.filter(Boolean))],
    beforeProfile,
    afterProfile,
    patchSummary,
    section,
    action,
  };
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function profileProposalFingerprint(profile) {
  if (!profile) return '';
  const text = stableSerialize(profile);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fp_${(hash >>> 0).toString(16)}`;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeKeyParts(parts = []) {
  return parts.map(normalizeText).join('|');
}

function walkKeys(value, visit) {
  if (Array.isArray(value)) {
    value.forEach(item => walkKeys(item, visit));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.entries(value).forEach(([key, item]) => {
    visit(key);
    walkKeys(item, visit);
  });
}

function blockedKeyIn(value) {
  let blockedKey = '';
  walkKeys(value, key => {
    if (!blockedKey && BLOCKED_KEYS.has(String(key).toLowerCase())) {
      blockedKey = String(key);
    }
  });
  return blockedKey;
}

function unknownProposalKeys(proposal = {}) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return [];
  return Object.keys(proposal).filter(key => !ALLOWED_PROPOSAL_KEYS.has(key));
}

function lockedSectionForProposal(section) {
  return section === 'summary' ? 'summaries' : section;
}

function isSectionLocked(profile, section) {
  return Boolean(profile?.metadata?.lockedSections?.[lockedSectionForProposal(section)]);
}

function unsupportedReason(proposal = {}) {
  const actions = SUPPORTED_ACTIONS[proposal.section];
  if (!actions) return `Unsupported section: ${proposal.section || 'unknown'}.`;
  if (!actions.has(proposal.action)) return `Unsupported action for ${proposal.section}: ${proposal.action || 'unknown'}.`;
  return '';
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function unknownProposedValueKeys(section, value) {
  const allowed = VALUE_KEYS[section];
  if (!allowed) return [];
  const object = objectValue(value);
  if (!object) return [];
  return Object.keys(object).filter(key => !allowed.has(key));
}

function normalizeSkillList(value) {
  if (typeof value === 'string') {
    const skill = value.trim();
    return skill ? [skill] : [];
  }
  if (!Array.isArray(value)) return null;
  if (!value.every(item => typeof item === 'string')) return null;
  return value.map(item => item.trim()).filter(Boolean);
}

function normalizeSummaryValue(value) {
  if (typeof value === 'string') return value.trim();
  const object = objectValue(value);
  if (!object || Object.keys(object).some(key => key !== 'text')) return null;
  return String(object.text || '').trim();
}

function normalizeCertificationValue(value) {
  const object = objectValue(value);
  if (!object) return null;
  if (Object.keys(object).some(key => !VALUE_KEYS.certifications.has(key))) return null;
  const cert = {
    name: String(object.name || '').trim(),
    issuer: String(object.issuer || '').trim(),
    year: String(object.year || '').trim(),
  };
  return cert.name ? cert : null;
}

function normalizeBulletPoints(value) {
  const uniquePoints = (points) => {
    const seen = new Set();
    return points.filter(point => {
      const key = normalizeText(point);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  if (Array.isArray(value)) {
    return uniquePoints(value.map(item => String(item || '').trim()).filter(Boolean));
  }
  if (typeof value === 'string') {
    return uniquePoints(value
      .split(/\r?\n/)
      .map(item => item.trim().replace(/^[\u2022\-\*]\s*/, ''))
      .filter(Boolean));
  }
  return [];
}

function normalizeExperienceValue(value) {
  const object = objectValue(value);
  if (!object) return null;
  if (Object.keys(object).some(key => !VALUE_KEYS.experience.has(key))) return null;

  const bulletPoints = normalizeBulletPoints(object.bulletPoints ?? object.responsibilities);
  const description = String(object.description || '').trim();
  if (description && !bulletPoints.some(point => normalizeText(point) === normalizeText(description))) {
    bulletPoints.push(description);
  }

  const experience = {
    jobTitle: String(object.jobTitle || object.title || '').trim(),
    employer: String(object.employer || object.company || '').trim(),
    location: String(object.location || '').trim(),
    dates: String(object.dates || '').trim(),
    startDate: String(object.startDate || '').trim(),
    endDate: String(object.endDate || '').trim(),
    bulletPoints,
  };
  return experience;
}

function dateRangeKey(value = {}) {
  const dates = String(value.dates || '').trim();
  if (dates) return normalizeText(dates);
  return normalizeText([value.startDate || '', value.endDate || ''].filter(Boolean).join(' - '));
}

function certificationKey(value = {}) {
  const cert = normalizeCertificationEntry(value);
  return normalizeKeyParts([cert.name, cert.issuer, cert.year]);
}

function hasDuplicateSkills(profile, skills) {
  const existing = new Set((profile.skills || []).map(normalizeText));
  return skills.some(skill => existing.has(normalizeText(skill)));
}

function hasDuplicateProposedSkills(skills) {
  const seen = new Set();
  return skills.some(skill => {
    const key = normalizeText(skill);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

function hasDuplicateCertification(profile, cert) {
  const key = certificationKey(cert);
  return (profile.certifications || []).some(existing => certificationKey(existing) === key);
}

function hasDuplicateExperience(profile, experience) {
  const key = normalizeKeyParts([experience.jobTitle, experience.employer, dateRangeKey(experience)]);
  return (profile.experience || []).some(existing =>
    normalizeKeyParts([existing.jobTitle, existing.employer, dateRangeKey(existing)]) === key
  );
}

function applySkillsAdd(profile, proposal) {
  const skills = normalizeSkillList(proposal.proposedValue);
  if (!skills?.length) return { reason: 'Skills add requires at least one skill.' };
  if (hasDuplicateProposedSkills(skills)) return { reason: 'Duplicate skills inside the proposal are blocked.' };
  if (hasDuplicateSkills(profile, skills)) return { reason: 'Duplicate skill proposals are blocked.' };

  const afterProfile = normalizeResumeContent({
    ...profile,
    skills: [...(profile.skills || []), ...skills],
  });

  return {
    afterProfile,
    patchSummary: {
      section: 'skills',
      action: 'add',
      addedSkills: skills,
    },
  };
}

function applySummaryUpdate(profile, proposal) {
  const text = normalizeSummaryValue(proposal.proposedValue);
  if (!text) return { reason: 'Summary update requires non-empty text.' };

  const afterProfile = normalizeResumeContent({
    ...profile,
    summary: text,
    summaries: profile.summaries || [],
  });

  return {
    afterProfile,
    patchSummary: {
      section: 'summary',
      action: 'update',
      before: profile.summary || '',
      after: text,
    },
  };
}

function applyCertificationAdd(profile, proposal) {
  const certification = normalizeCertificationValue(proposal.proposedValue);
  if (!certification) return { reason: 'Certification add requires a name and supported fields only.' };
  if (hasDuplicateCertification(profile, certification)) return { reason: 'Duplicate certification proposals are blocked.' };

  const afterProfile = normalizeResumeContent({
    ...profile,
    certifications: [...(profile.certifications || []), certification],
  });

  return {
    afterProfile,
    patchSummary: {
      section: 'certifications',
      action: 'add',
      certification,
    },
  };
}

function applyExperienceAdd(profile, proposal) {
  const experience = normalizeExperienceValue(proposal.proposedValue);
  if (!experience) return { reason: 'Experience add requires a supported object value.' };
  if (!experience.jobTitle || !experience.employer) return { reason: 'Experience add requires jobTitle and employer.' };

  const hasDetail = Boolean(
    experience.location ||
    experience.dates ||
    experience.startDate ||
    experience.endDate ||
    experience.bulletPoints.length
  );
  if (!hasDetail) return { reason: 'Incomplete experience proposals are blocked.' };
  if (hasDuplicateExperience(profile, experience)) return { reason: 'Duplicate experience proposals are blocked.' };

  const afterProfile = normalizeResumeContent({
    ...profile,
    experience: [...(profile.experience || []), experience],
  });

  return {
    afterProfile,
    patchSummary: {
      section: 'experience',
      action: 'add',
      experience,
    },
  };
}

function applySupportedPatch(profile, proposal) {
  if (proposal.section === 'skills') return applySkillsAdd(profile, proposal);
  if (proposal.section === 'summary') return applySummaryUpdate(profile, proposal);
  if (proposal.section === 'certifications') return applyCertificationAdd(profile, proposal);
  if (proposal.section === 'experience') return applyExperienceAdd(profile, proposal);
  return { reason: `Unsupported section: ${proposal.section || 'unknown'}.` };
}

export function validateAndApplyProfileProposal({
  profile,
  proposal,
  activeProfileId,
  confirmedSensitive = false,
} = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return result({ reasons: ['Profile is required.'] });
  }
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    return result({ reasons: ['Proposal is required.'] });
  }

  const beforeProfile = normalizeResumeContent(clone(profile));
  const currentFingerprint = profileProposalFingerprint(beforeProfile);
  const section = String(proposal.section || '');
  const action = String(proposal.action || '');
  const reasons = [];

  const blockedKey = blockedKeyIn(proposal);
  if (blockedKey) reasons.push(`Blocked proposal key: ${blockedKey}.`);

  unknownProposalKeys(proposal).forEach(key => reasons.push(`Unknown proposal key: ${key}.`));
  unknownProposedValueKeys(section, proposal.proposedValue)
    .forEach(key => reasons.push(`Unknown proposedValue key: ${key}.`));

  if (proposal.targetProfileId && String(proposal.targetProfileId) !== String(activeProfileId || '')) {
    reasons.push('Proposal targetProfileId does not match the active profile.');
  }

  const expectedFingerprint = String(proposal.baseProfileFingerprint || proposal.baseProfileHash || '').trim();
  if (expectedFingerprint && expectedFingerprint !== currentFingerprint) {
    reasons.push('Current profile no longer matches the proposal base fingerprint.');
  }

  const unsupported = unsupportedReason(proposal);
  if (unsupported) reasons.push(unsupported);

  if (isSectionLocked(beforeProfile, section)) {
    reasons.push('This profile section is locked.');
  }

  if (reasons.length) {
    return result({ reasons, beforeProfile, section, action });
  }

  const validated = validateProfileUpdateProposal(proposal, proposal.sourceUserMessage || '', {
    profile: beforeProfile,
    activeProfileId,
  });
  if (!validated) {
    return result({
      reasons: ['Proposal failed profile update validation.'],
      beforeProfile,
      section,
      action,
    });
  }

  if (validated.sensitiveFields?.length && !confirmedSensitive) {
    return result({
      blocked: false,
      needsConfirmation: true,
      reasons: ['Sensitive proposal requires explicit confirmation.'],
      warnings: validated.warnings,
      beforeProfile,
      section: validated.section,
      action: validated.action,
    });
  }

  const patch = applySupportedPatch(beforeProfile, validated);
  if (patch.reason) {
    return result({
      reasons: [patch.reason],
      warnings: validated.warnings,
      beforeProfile,
      section: validated.section,
      action: validated.action,
    });
  }

  return result({
    ok: true,
    blocked: false,
    warnings: validated.warnings,
    beforeProfile,
    afterProfile: patch.afterProfile,
    patchSummary: patch.patchSummary,
    section: validated.section,
    action: validated.action,
  });
}
