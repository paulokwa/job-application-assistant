// modules/jobChat.js
// Job Discussion Chat — AI-powered application strategy advisor for the current job.
// Encodes the full conversation history into the user prompt so the existing
// callAI(systemPrompt, userPrompt, settings, signal) interface works unchanged.

import { callAI } from './provider.js';
import { profileToPromptText } from './profile.js';
import { generateMockJobChatProfileUpdateProposal, generateMockJobChatReply } from './mock.js';

const MAX_CHAT_HISTORY_MESSAGES = 20; // last 10 turns (user + assistant per pair)
const MAX_PROPOSAL_STRING_LENGTH = 4000;

const PROFILE_UPDATE_SECTIONS = new Set([
  'personalInfo',
  'headline',
  'summary',
  'summaries',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'customSections',
  'doNotClaimNotes',
  'coverLetterProfile',
]);

const PROFILE_UPDATE_ACTIONS = new Set(['add', 'update', 'remove']);

const BLOCKED_PROPOSAL_KEYS = new Set([
  'metadata',
  'lockedSections',
  'profileIndex',
  'activeProfileId',
  'sourceResumeText',
  'sourceResumeName',
  'storage',
  'storageKey',
  'storageKeys',
  'chrome.storage',
  'saveProfile',
  'generatedDrafts',
  'savedDraft',
  'savedDrafts',
  'drafts',
]);

const FULL_PROFILE_SECTION_KEYS = new Set([...PROFILE_UPDATE_SECTIONS, 'metadata']);

const PROFILE_UPDATE_INTENT_RE = /\b(add|append|include|insert|update|edit|change|improve|rewrite|revise|remove|delete|drop)\b/i;
const PROFILE_UPDATE_TARGET_RE = /\b(profile|my profile|saved profile|personal info|headline|summary|summaries|experience|work history|employment|education|skills?|projects?|certifications?|custom sections?|do not claim|cover letter profile)\b/i;
const PROFILE_SENSITIVE_RE = /\b(health|medical|diagnosis|disability|disabled|cancer|chemo(therapy)?|treatment|illness|therapy|medication|surgery|hospital|caregiving|caregiver|care support|race|racial|ethnicity|ethnic|age|date of birth|birthdate|immigration|visa|citizenship|work authorization|salary|compensation|legal|criminal|arrest|family|marital|married|children|childcare|pregnan(?:t|cy)|religion|religious|gender|sexual orientation|protected class)\b/i;

const HEALTH_SENSITIVE_RE = /\b(cancer|chemo(therapy)?|treatment|illness|medical|health|diagnosis|disability|disabled|therapy|medication|surgery|hospital|caregiving|caregiver|care support)\b/i;

const PROFILE_PROPOSAL_SYSTEM_PROMPT = [
  'You prepare read-only profile update suggestions for a job seeker.',
  'Return a single JSON object only. Do not include markdown, preamble, or commentary.',
  '',
  'Safety rules:',
  '- The suggestion is read-only. Never say the profile has been saved, changed, updated, applied, or deleted.',
  '- Use the candidate current message as the only authoritative source for new facts.',
  '- Do not treat the job description, previous assistant messages, or inferred context as facts for the profile.',
  '- If a fact is inferred rather than directly stated, include a warning and use lower confidence.',
  '- Do not propose metadata, lockedSections, profileIndex, activeProfileId, sourceResumeText, sourceResumeName, storage keys, or generated draft changes.',
  '- Do not output a full-profile replacement object.',
  '',
  'Allowed sections: personalInfo, headline, summary, summaries, experience, education, skills, projects, certifications, customSections, doNotClaimNotes, coverLetterProfile.',
  'Allowed actions: add, update, remove.',
  'Use only fields that belong to the selected section. For work experience, use jobTitle, employer, location, dates, startDate, endDate, and bulletPoints.',
  'For skills, proposedValue must be a string or array of strings. For headline, summary, and doNotClaimNotes, proposedValue must be text or { "text": "..." }.',
].join('\n');

const PROFILE_PROPOSAL_SCHEMA = {
  type: 'profile_update_proposal',
  proposalVersion: 1,
  section: 'experience',
  action: 'add',
  confidence: 'user_stated',
  requiresConfirmation: true,
  summary: 'Short plain-English summary of the suggested profile update',
  target: null,
  proposedValue: {},
  warnings: [],
  sensitiveFields: [],
  sourceUserMessage: 'Exact current user message',
};

export const INCOMPLETE_EXPERIENCE_WARNING = 'This suggestion is missing details such as responsibilities, dates, or location. Add more detail before using it in your profile.';
export const LOCKED_SECTION_WARNING = 'This profile section is locked. Unlock it in Settings before applying changes in a future version.';
export const TARGET_UNRESOLVED_WARNING = 'Target not resolved. This preview cannot identify the exact existing profile item that would change.';
export const DIFF_PREVIEW_NOTICE = 'This is a preview only. It has not changed your saved profile.';

const DUPLICATE_WARNINGS = {
  skills: 'This skill already appears in the active profile.',
  experience: 'A similar experience entry already appears in the active profile.',
  education: 'A similar education entry already appears in the active profile.',
  projects: 'A project with this name already appears in the active profile.',
  certifications: 'A similar certification already appears in the active profile.',
  summaries: 'A summary with this label already appears in the active profile.',
  customSections: 'A custom section with this label already appears in the active profile.',
};

const SECTION_SCHEMAS = {
  personalInfo: {
    actions: new Set(['update']),
    kind: 'object',
    allowedKeys: new Set(['fullName', 'email', 'phone', 'cityProvince', 'linkedin', 'portfolio', 'website']),
    requireAnyValue: true,
  },
  headline: {
    actions: new Set(['update', 'remove']),
    kind: 'text',
  },
  summary: {
    actions: new Set(['update', 'remove']),
    kind: 'text',
  },
  summaries: {
    actions: new Set(['add', 'update', 'remove']),
    kind: 'object',
    allowedKeys: new Set(['label', 'text']),
    addRequiredKeys: ['label', 'text'],
    targetRequiredFor: new Set(['update', 'remove']),
  },
  experience: {
    actions: new Set(['add', 'update', 'remove']),
    kind: 'object',
    allowedKeys: new Set(['jobTitle', 'title', 'employer', 'company', 'location', 'dates', 'startDate', 'endDate', 'bulletPoints', 'responsibilities', 'description']),
    addRequiresAny: ['jobTitle', 'title', 'employer', 'company'],
    targetRequiredFor: new Set(['update', 'remove']),
  },
  education: {
    actions: new Set(['add', 'update', 'remove']),
    kind: 'object',
    allowedKeys: new Set(['institution', 'credential', 'location', 'dates', 'notes']),
    addRequiresAny: ['institution', 'credential'],
    targetRequiredFor: new Set(['update', 'remove']),
  },
  skills: {
    actions: new Set(['add', 'update', 'remove']),
    kind: 'stringList',
    targetRequiredFor: new Set(['update']),
  },
  projects: {
    actions: new Set(['add', 'update', 'remove']),
    kind: 'object',
    allowedKeys: new Set(['name', 'role', 'description', 'technologies', 'link']),
    addRequiredKeys: ['name'],
    targetRequiredFor: new Set(['update', 'remove']),
  },
  certifications: {
    actions: new Set(['add', 'update', 'remove']),
    kind: 'object',
    allowedKeys: new Set(['name', 'issuer', 'year']),
    addRequiredKeys: ['name'],
    targetRequiredFor: new Set(['update', 'remove']),
  },
  customSections: {
    actions: new Set(['add', 'update', 'remove']),
    kind: 'object',
    allowedKeys: new Set(['label', 'text']),
    addRequiredKeys: ['label', 'text'],
    targetRequiredFor: new Set(['update', 'remove']),
  },
  doNotClaimNotes: {
    actions: new Set(['add', 'update', 'remove']),
    kind: 'text',
    removeRequiresTargetOrValue: true,
  },
  coverLetterProfile: {
    actions: new Set(['update']),
    kind: 'object',
    allowedKeys: new Set(['tone', 'strengths', 'targetRole', 'notableAchievements']),
    requireAnyValue: true,
  },
};

const SYSTEM_PROMPT = [
  'You are an application strategy advisor helping a job seeker decide how to approach a specific job posting.',
  'You have been given the candidate\'s saved profile, the job description, and (if available) AI Fit Check results.',
  'Everything in the provided context is information the candidate has already recorded about themselves.',
  '',
  'STRICT RULES — follow all of these exactly:',
  '- Use ONLY the provided profile, job description, AI Fit Check results, and draft status. Do not add information from outside the context.',
  '- Do NOT fabricate qualifications, certifications, legal eligibility, salary expectations, availability,',
  '  lived experience, direct Indigenous relations experience, or any credential not explicitly stated in the profile.',
  '- If something is not in the profile or context, say so clearly. Do not imply the candidate has it.',
  '- Be honest about genuine gaps. Do not minimize real missing requirements or invent bridging experience.',
  '- Help the candidate identify: transferable strengths, genuine gaps, resume angle, cover letter angle,',
  '  interview talking points, and safe honest wording.',
  '- If asked to claim or imply something not in the profile, decline, explain why, and suggest a safer alternative.',
  '- If context is incomplete (no job description, no profile), say what is missing and what you cannot reliably advise on.',
  '- When drafting application answers the candidate can copy and paste, always write in first person using "I" — never use the candidate\'s name.',
  '- For advisory responses (strategy, analysis, gaps), use second person ("you") to advise the candidate directly.',
  '- Never refer to the candidate in the third person by name in any response.',
  '- Keep responses concise and practical. Stay specific to this job and this candidate\'s actual profile.',
  '- If a question falls outside the provided context, say so rather than guessing.',
].join('\n');

export function hasExplicitProfileUpdateIntent(message = '') {
  const text = String(message || '').trim();
  if (!text) return false;
  return PROFILE_UPDATE_INTENT_RE.test(text) && PROFILE_UPDATE_TARGET_RE.test(text);
}

function extractJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (text.toUpperCase() === 'NONE') return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(v => String(v || '').trim()).filter(Boolean).slice(0, 12);
}

function walkProposalValues(value, visit, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkProposalValues(item, visit, [...path, String(index)]));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      visit(key, item, path);
      walkProposalValues(item, visit, [...path, key]);
    });
  }
}

function proposalContainsBlockedKey(value) {
  let blocked = false;
  walkProposalValues(value, (key) => {
    if (BLOCKED_PROPOSAL_KEYS.has(String(key))) blocked = true;
  });
  return blocked;
}

function proposalLooksLikeFullProfileReplacement(proposal) {
  const proposedValue = proposal?.proposedValue;
  if (!proposedValue || typeof proposedValue !== 'object' || Array.isArray(proposedValue)) return false;
  const profileSectionKeyCount = Object.keys(proposedValue)
    .filter(key => FULL_PROFILE_SECTION_KEYS.has(key))
    .length;
  return profileSectionKeyCount >= 2 || (profileSectionKeyCount === 1 && !FULL_PROFILE_SECTION_KEYS.has(proposal.section));
}

function collectProposalStrings(value, strings = []) {
  if (typeof value === 'string') {
    strings.push(value);
    return strings;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectProposalStrings(item, strings));
    return strings;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectProposalStrings(item, strings));
  }
  return strings;
}

function hasPlaceholderOrDemoValues(proposal) {
  return collectProposalStrings(proposal).some(value =>
    /\b(placeholder|demo value|sample value|example value|company name|job title|university name|certification 1|skill 1|project name)\b/i.test(value)
  );
}

function hasBlockedMutationText(proposal) {
  return collectProposalStrings(proposal).some(value =>
    /\b(saveProfile|chrome\.storage|profileIndex|activeProfileId|sourceResumeText|sourceResumeName|lockedSections|storage keys?|generated drafts?|saved drafts?|draft invalidation|fit analysis invalidation)\b/i.test(value)
  );
}

function hasTextValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeStringListValue(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? [text] : [];
  }
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  return null;
}

function normalizeProposalShape(proposal) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return proposal;
  const next = { ...proposal };
  const proposedValue = next.proposedValue;

  if (next.section === 'experience' && proposedValue && typeof proposedValue === 'object' && !Array.isArray(proposedValue)) {
    const normalized = { ...proposedValue };
    if (normalized.title) {
      if (!normalized.jobTitle) normalized.jobTitle = normalized.title;
      delete normalized.title;
    }
    if (normalized.company) {
      if (!normalized.employer) normalized.employer = normalized.company;
      delete normalized.company;
    }
    if (normalized.responsibilities) {
      if (!normalized.bulletPoints && !normalized.description) {
        normalized.bulletPoints = Array.isArray(normalized.responsibilities)
          ? normalized.responsibilities
          : [normalized.responsibilities];
      }
      delete normalized.responsibilities;
    }
    next.proposedValue = normalized;
  }

  if (next.section === 'education' && proposedValue && typeof proposedValue === 'object' && !Array.isArray(proposedValue)) {
    const normalized = { ...proposedValue };
    if (hasTextValue(normalized.notes)) normalized.notes = [normalized.notes];
    next.proposedValue = normalized;
  }

  return next;
}

function hasMeaningfulListValue(value) {
  return Array.isArray(value) && value.some(item => {
    if (typeof item === 'string') return item.trim().length > 0;
    if (item && typeof item === 'object') return collectProposalStrings(item).some(hasTextValue);
    return false;
  });
}

function hasObjectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function objectHasOnlyAllowedKeys(value, allowedKeys) {
  return Object.keys(value).every(key => allowedKeys.has(key));
}

function objectHasAnyValue(value) {
  return Object.values(value).some(item => {
    if (Array.isArray(item)) return hasMeaningfulListValue(item);
    return hasTextValue(item);
  });
}

function objectHasRequiredKeys(value, requiredKeys = []) {
  return requiredKeys.every(key => {
    const item = value?.[key];
    return Array.isArray(item) ? hasMeaningfulListValue(item) : hasTextValue(item);
  });
}

function objectHasAnyRequiredAlias(value, keys = []) {
  return keys.some(key => {
    const item = value?.[key];
    return Array.isArray(item) ? hasMeaningfulListValue(item) : hasTextValue(item);
  });
}

function hasTargetValue(target) {
  if (target == null) return false;
  if (typeof target === 'string') return target.trim().length > 0;
  if (Array.isArray(target)) return hasMeaningfulListValue(target);
  if (typeof target === 'object') return objectHasAnyValue(target);
  return Boolean(target);
}

function validateSectionSpecificShape(proposal) {
  const schema = SECTION_SCHEMAS[proposal.section];
  if (!schema || !schema.actions.has(proposal.action)) return false;

  const value = proposal.proposedValue;

  if (schema.targetRequiredFor?.has(proposal.action) && !hasTargetValue(proposal.target)) {
    if (!(proposal.section === 'skills' && proposal.action === 'remove' && normalizeStringListValue(value)?.length)) {
      return false;
    }
  }

  if (schema.removeRequiresTargetOrValue && proposal.action === 'remove' && !hasTargetValue(proposal.target) && !hasTextValue(value)) {
    return false;
  }

  if (schema.kind === 'stringList') {
    const list = normalizeStringListValue(value);
    if (!list) return false;
    if (proposal.action === 'add' && !list.length) return false;
    if (proposal.action === 'remove' && !hasTargetValue(proposal.target) && !list.length) return false;
    return true;
  }

  if (schema.kind === 'text') {
    if (typeof value === 'string') return proposal.action === 'remove' || value.trim().length > 0;
    if (!hasObjectValue(value)) return proposal.action === 'remove' && hasTargetValue(proposal.target);
    if (!objectHasOnlyAllowedKeys(value, new Set(['text']))) return false;
    return proposal.action === 'remove' || hasTextValue(value.text);
  }

  if (schema.kind === 'object') {
    if (!hasObjectValue(value)) return proposal.action === 'remove' && hasTargetValue(proposal.target);
    if (!objectHasOnlyAllowedKeys(value, schema.allowedKeys)) return false;
    if (schema.requireAnyValue && !objectHasAnyValue(value)) return false;
    if (proposal.action === 'add') {
      if (schema.addRequiredKeys && !objectHasRequiredKeys(value, schema.addRequiredKeys)) return false;
      if (schema.addRequiresAny && !objectHasAnyRequiredAlias(value, schema.addRequiresAny)) return false;
    }
    return true;
  }

  return false;
}

function isIncompleteExperienceAdd(proposal) {
  if (proposal.section !== 'experience' || proposal.action !== 'add') return false;
  const pv = proposal.proposedValue;
  if (!pv || typeof pv !== 'object' || Array.isArray(pv)) return false;
  const hasJobTitle = hasTextValue(pv.jobTitle);
  const hasEmployer = hasTextValue(pv.employer);
  if (!hasJobTitle || !hasEmployer) return false;
  return !(
    hasMeaningfulListValue(pv.bulletPoints) ||
    hasMeaningfulListValue(pv.responsibilities) ||
    hasTextValue(pv.responsibilities) ||
    hasTextValue(pv.description) ||
    hasTextValue(pv.dates) ||
    hasTextValue(pv.startDate) ||
    hasTextValue(pv.endDate) ||
    hasTextValue(pv.location)
  );
}

function claimsAlreadyChanged(proposal) {
  return collectProposalStrings({
    summary: proposal?.summary,
    warnings: proposal?.warnings,
  }).some(value =>
    /\b(profile|saved profile)\b.{0,40}\b(has been|was|is now|already)\b.{0,20}\b(saved|changed|updated|deleted|removed|applied)\b/i.test(value) ||
    /\b(i('|’)ve|i have)\s+(saved|changed|updated|deleted|removed|applied)\b/i.test(value)
  );
}

function detectSensitiveFields(proposal) {
  const sensitive = new Set(normalizeStringArray(proposal?.sensitiveFields));
  const texts = collectProposalStrings({
    summary: proposal?.summary,
    target: proposal?.target,
    proposedValue: proposal?.proposedValue,
  });
  let hasHealthTerm = false;
  texts.forEach(value => {
    if (PROFILE_SENSITIVE_RE.test(value)) {
      if (HEALTH_SENSITIVE_RE.test(value)) {
        hasHealthTerm = true;
      }
      sensitive.add('Possible sensitive personal detail');
    }
  });
  return { fields: [...sensitive], hasHealthTerm };
}

function trimProposalStrings(value) {
  if (typeof value === 'string') return value.trim().slice(0, MAX_PROPOSAL_STRING_LENGTH);
  if (Array.isArray(value)) return value.map(trimProposalStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trimProposalStrings(item)]));
  }
  return value ?? null;
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function profileFingerprint(profile) {
  if (!profile) return '';
  const text = stableSerialize(profile);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fp_${(hash >>> 0).toString(16)}`;
}

function lockedSectionForProposal(section) {
  if (section === 'summary') return 'summaries';
  return section;
}

function lockedWarningForProposal(proposal, context = {}) {
  const lockedSections = context.profile?.metadata?.lockedSections || {};
  return lockedSections[lockedSectionForProposal(proposal.section)] ? LOCKED_SECTION_WARNING : '';
}

function normalizeDateRange(value = {}) {
  if (hasTextValue(value.dates)) return normalizeText(value.dates);
  return normalizeText([value.startDate || '', value.endDate || ''].filter(Boolean).join(' - '));
}

function certificationKey(cert = {}) {
  if (typeof cert === 'string') return [cert, '', ''].map(normalizeText).join('|');
  return [cert.name, cert.issuer, cert.year].map(normalizeText).join('|');
}

function likelyDuplicateWarning(proposal, context = {}) {
  if (proposal.action !== 'add') return '';
  const profile = context.profile || {};
  const value = proposal.proposedValue;

  if (proposal.section === 'skills') {
    const proposed = normalizeStringListValue(value) || [];
    const existing = new Set((profile.skills || []).map(normalizeText));
    return proposed.some(skill => existing.has(normalizeText(skill))) ? DUPLICATE_WARNINGS.skills : '';
  }

  if (!hasObjectValue(value)) return '';

  if (proposal.section === 'experience') {
    const proposedKey = [value.jobTitle, value.employer, normalizeDateRange(value)].map(normalizeText).join('|');
    const existing = (profile.experience || []).some(exp =>
      [exp.jobTitle, exp.employer, normalizeDateRange(exp)].map(normalizeText).join('|') === proposedKey
    );
    return existing ? DUPLICATE_WARNINGS.experience : '';
  }

  if (proposal.section === 'education') {
    const proposedKey = [value.credential, value.institution].map(normalizeText).join('|');
    const existing = (profile.education || []).some(edu =>
      [edu.credential, edu.institution].map(normalizeText).join('|') === proposedKey
    );
    return existing ? DUPLICATE_WARNINGS.education : '';
  }

  if (proposal.section === 'projects') {
    const proposedName = normalizeText(value.name);
    return (profile.projects || []).some(project => normalizeText(project.name) === proposedName) ? DUPLICATE_WARNINGS.projects : '';
  }

  if (proposal.section === 'certifications') {
    const proposedKey = certificationKey(value);
    return (profile.certifications || []).some(cert => certificationKey(cert) === proposedKey) ? DUPLICATE_WARNINGS.certifications : '';
  }

  if (proposal.section === 'summaries') {
    const proposedLabel = normalizeText(value.label);
    return (profile.summaries || []).some(summary => normalizeText(summary.label) === proposedLabel) ? DUPLICATE_WARNINGS.summaries : '';
  }

  if (proposal.section === 'customSections') {
    const proposedLabel = normalizeText(value.label);
    return (profile.customSections || []).some(section => normalizeText(section.label) === proposedLabel) ? DUPLICATE_WARNINGS.customSections : '';
  }

  return '';
}

function targetTextSet(target) {
  if (target == null) return new Set();
  if (typeof target === 'string') return new Set([normalizeText(target)]);
  if (Array.isArray(target)) return new Set(target.map(normalizeText).filter(Boolean));
  if (typeof target === 'object') return new Set(collectProposalStrings(target).map(normalizeText).filter(Boolean));
  return new Set([normalizeText(target)]);
}

function objectMatchesTarget(item = {}, target) {
  if (!hasTargetValue(target)) return false;
  if (typeof target === 'object' && !Array.isArray(target)) {
    return Object.entries(target).every(([key, value]) => normalizeText(item?.[key]) === normalizeText(value));
  }
  const targetSet = targetTextSet(target);
  return collectProposalStrings(item).some(value => targetSet.has(normalizeText(value)));
}

function findSkill(profile = {}, proposal = {}) {
  const skills = profile.skills || [];
  const targets = targetTextSet(proposal.target);
  const proposed = new Set((normalizeStringListValue(proposal.proposedValue) || []).map(normalizeText));
  return skills.find(skill => targets.has(normalizeText(skill)) || proposed.has(normalizeText(skill))) || null;
}

function findExperience(profile = {}, proposal = {}) {
  const entries = profile.experience || [];
  const target = proposal.target;
  if (hasObjectValue(target)) {
    const targetKey = [target.jobTitle || target.title, target.employer || target.company, normalizeDateRange(target)].map(normalizeText).join('|');
    const keyed = entries.find(exp => [exp.jobTitle, exp.employer, normalizeDateRange(exp)].map(normalizeText).join('|') === targetKey);
    if (keyed) return keyed;
  }
  return entries.find(exp => objectMatchesTarget(exp, target)) || null;
}

function findEducation(profile = {}, proposal = {}) {
  const entries = profile.education || [];
  const target = proposal.target;
  if (hasObjectValue(target)) {
    const targetKey = [target.credential, target.institution].map(normalizeText).join('|');
    const keyed = entries.find(edu => [edu.credential, edu.institution].map(normalizeText).join('|') === targetKey);
    if (keyed) return keyed;
  }
  return entries.find(edu => objectMatchesTarget(edu, target)) || null;
}

function findCertification(profile = {}, proposal = {}) {
  const certs = profile.certifications || [];
  const target = proposal.target;
  if (hasObjectValue(target)) {
    const targetKey = certificationKey(target);
    const keyed = certs.find(cert => certificationKey(cert) === targetKey);
    if (keyed) return cert;
  }
  return certs.find(cert => objectMatchesTarget(cert, target)) || null;
}

function findByName(entries = [], proposal = {}, field = 'name') {
  const target = proposal.target;
  if (hasObjectValue(target) && hasTextValue(target[field])) {
    const targetValue = normalizeText(target[field]);
    const keyed = entries.find(entry => normalizeText(entry?.[field]) === targetValue);
    if (keyed) return keyed;
  }
  return entries.find(entry => objectMatchesTarget(entry, target)) || null;
}

function findByLabel(entries = [], proposal = {}) {
  return findByName(entries, proposal, 'label');
}

function resolveProfileProposalTarget(profile = {}, proposal = {}) {
  if (proposal.action === 'add') return null;
  if (proposal.section === 'headline') return profile.headline || '';
  if (proposal.section === 'summary') return profile.summary || '';
  if (proposal.section === 'doNotClaimNotes') return profile.doNotClaimNotes || '';
  if (proposal.section === 'coverLetterProfile') return profile.coverLetterProfile || {};
  if (proposal.section === 'personalInfo') return profile.personalInfo || {};
  if (proposal.section === 'skills') return findSkill(profile, proposal);
  if (proposal.section === 'experience') return findExperience(profile, proposal);
  if (proposal.section === 'education') return findEducation(profile, proposal);
  if (proposal.section === 'projects') return findByName(profile.projects || [], proposal);
  if (proposal.section === 'certifications') return findCertification(profile, proposal);
  if (proposal.section === 'summaries') return findByLabel(profile.summaries || [], proposal);
  if (proposal.section === 'customSections') return findByLabel(profile.customSections || [], proposal);
  return null;
}

function proposedTextValue(value) {
  if (typeof value === 'string') return value;
  if (hasObjectValue(value) && Object.keys(value).length === 1 && hasTextValue(value.text)) return value.text;
  return value;
}

function mergeAfterValue(before, proposal) {
  if (proposal.action === 'remove') return null;
  const proposed = proposedTextValue(proposal.proposedValue);
  if (proposal.action === 'add') return proposed;
  if (typeof before === 'string' && typeof proposed === 'string') return proposed;
  if (hasObjectValue(before) && hasObjectValue(proposed)) return { ...before, ...proposed };
  return proposed;
}

function diffFieldChanges(before, after) {
  if (before == null && after == null) return [];
  if (typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) {
    if (stableSerialize(before) === stableSerialize(after)) return [];
    return [{
      field: 'value',
      changeType: before == null ? 'added' : after == null ? 'removed' : 'changed',
      before,
      after,
    }];
  }
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter(key => stableSerialize(before?.[key]) !== stableSerialize(after?.[key])).map(key => ({
    field: key,
    changeType: before?.[key] == null || before?.[key] === '' ? 'added' : after?.[key] == null || after?.[key] === '' ? 'removed' : 'changed',
    before: before?.[key] ?? null,
    after: after?.[key] ?? null,
  }));
}

export function buildProfileProposalDiff(proposal, context = {}) {
  const profile = context.profile || {};
  const warnings = [...(proposal?.warnings || [])];
  const before = proposal.action === 'add' ? null : resolveProfileProposalTarget(profile, proposal);
  const targetResolved = proposal.action === 'add' || before != null;
  if (!targetResolved) warnings.push(TARGET_UNRESOLVED_WARNING);
  const after = targetResolved ? mergeAfterValue(before, proposal) : null;

  return {
    type: 'profile_update_diff_preview',
    section: proposal.section,
    sectionLabel: proposalSectionLabel(proposal.section),
    action: proposal.action,
    actionLabel: proposalActionLabel(proposal.action),
    profileName: context.profileName || '',
    targetResolved,
    beforeLabel: proposal.action === 'add' ? 'No existing entry selected.' : targetResolved ? 'Current value' : 'Target not resolved',
    afterLabel: proposal.action === 'remove' ? 'Would be removed' : 'Proposed value',
    before,
    after,
    fieldChanges: targetResolved ? diffFieldChanges(before, after) : [],
    warnings: [...new Set(warnings)],
    sensitiveFields: proposal.sensitiveFields || [],
    readOnlyNotice: DIFF_PREVIEW_NOTICE,
  };
}

export function validateProfileUpdateProposal(rawProposal, sourceUserMessage = '', context = {}) {
  const proposal = normalizeProposalShape(trimProposalStrings(rawProposal));
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return null;
  if (proposal.type !== 'profile_update_proposal') return null;
  if (proposal.proposalVersion !== 1) return null;
  if (!PROFILE_UPDATE_SECTIONS.has(proposal.section)) return null;
  if (!PROFILE_UPDATE_ACTIONS.has(proposal.action)) return null;
  if (proposalContainsBlockedKey(proposal)) return null;
  if (!validateSectionSpecificShape(proposal)) return null;
  if (proposalLooksLikeFullProfileReplacement(proposal)) return null;
  if (hasPlaceholderOrDemoValues(proposal)) return null;
  if (hasBlockedMutationText(proposal)) return null;
  if (claimsAlreadyChanged(proposal)) return null;

  const warnings = normalizeStringArray(proposal.warnings);
  if (isIncompleteExperienceAdd(proposal)) {
    warnings.push(INCOMPLETE_EXPERIENCE_WARNING);
  }
  if (proposal.action === 'remove') {
    warnings.push('Removal suggestions are read-only in this phase. Review the profile manually before deleting anything.');
  }
  const duplicateWarning = likelyDuplicateWarning(proposal, context);
  if (duplicateWarning) warnings.push(duplicateWarning);
  const lockedWarning = lockedWarningForProposal(proposal, context);
  if (lockedWarning) warnings.push(lockedWarning);
  const { fields: sensitiveFields, hasHealthTerm } = detectSensitiveFields(proposal);
  if (sensitiveFields.length) {
    warnings.push(
      hasHealthTerm
        ? 'This may include sensitive health-related information. Review carefully before adding it to job application materials.'
        : 'This suggestion may include sensitive personal information. Review carefully before using it in job application materials.'
    );
  }

  return {
    type: 'profile_update_proposal',
    proposalVersion: 1,
    section: proposal.section,
    action: proposal.action,
    confidence: String(proposal.confidence || 'needs_review').trim() || 'needs_review',
    requiresConfirmation: true,
    summary: String(proposal.summary || '').trim() || `${proposal.action} ${proposal.section}`,
    target: proposal.target ?? null,
    proposedValue: proposal.proposedValue ?? null,
    warnings: [...new Set(warnings)],
    sensitiveFields,
    sourceUserMessage: String(sourceUserMessage || proposal.sourceUserMessage || '').trim(),
    targetProfileId: String(proposal.targetProfileId || context.targetProfileId || context.activeProfileId || '').trim(),
    createdAt: proposal.createdAt || new Date().toISOString(),
    baseProfileFingerprint: String(proposal.baseProfileFingerprint || proposal.baseProfileHash || profileFingerprint(context.profile)).trim(),
  };
}

function proposalSectionLabel(section) {
  const labels = {
    personalInfo: 'Personal Info',
    headline: 'Headline',
    summary: 'Summary',
    summaries: 'Summaries',
    experience: 'Experience',
    education: 'Education',
    skills: 'Skills',
    projects: 'Projects',
    certifications: 'Certifications',
    customSections: 'Custom Sections',
    doNotClaimNotes: 'Do Not Claim Notes',
    coverLetterProfile: 'Cover Letter Profile',
  };
  return labels[section] || section || 'Profile';
}

function proposalActionLabel(action) {
  const labels = { add: 'Add', update: 'Update', remove: 'Remove' };
  return labels[action] || 'Review';
}

function formatProposalValueForText(value) {
  if (value == null || value === '') return 'No specific value provided.';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return 'No items provided.';
    return value.map(item => `- ${formatProposalValueForText(item).replace(/\n/g, '\n  ')}`).join('\n');
  }
  if (typeof value === 'object') {
    const lines = [];
    Object.entries(value).forEach(([key, item]) => {
      if (item == null || item === '' || (Array.isArray(item) && !item.length)) return;
      const formatted = formatProposalValueForText(item);
      lines.push(`${key}: ${formatted.includes('\n') ? `\n${formatted}` : formatted}`);
    });
    return lines.length ? lines.join('\n') : 'No specific value provided.';
  }
  return String(value);
}

export function formatProfileUpdateProposalForCopy(proposal) {
  const lines = [
    'Suggested Profile Update',
    `Section: ${proposalSectionLabel(proposal?.section)}`,
    `Action: ${proposalActionLabel(proposal?.action)}`,
    `Summary: ${proposal?.summary || 'Review suggested change'}`,
  ];
  if (proposal?.target) lines.push(`Target: ${formatProposalValueForText(proposal.target)}`);
  lines.push('', 'Proposed value:', formatProposalValueForText(proposal?.proposedValue));
  if (proposal?.warnings?.length) {
    lines.push('', 'Warnings:', ...proposal.warnings.map(w => `- ${w}`));
  }
  if (proposal?.sensitiveFields?.length) {
    lines.push('', 'Sensitive data review:', ...proposal.sensitiveFields.map(w => `- ${w}`));
  }
  lines.push('', 'This is only a suggestion. It has not changed your saved profile yet.');
  return lines.join('\n');
}

function buildProfileProposalPrompt(newMessage) {
  return [
    'Create a read-only Suggested Profile Update proposal from this current user message only.',
    'If the message does not clearly request a saved-profile change, return exactly: NONE',
    '',
    '=== CURRENT USER MESSAGE ===',
    String(newMessage || ''),
    '=== END CURRENT USER MESSAGE ===',
    '',
    'Use this JSON shape:',
    JSON.stringify(PROFILE_PROPOSAL_SCHEMA, null, 2),
  ].join('\n');
}

function safeProfileText(profile) {
  if (!profile) return '';
  try {
    return profileToPromptText(profile);
  } catch (_) {
    return '';
  }
}

function buildUserPrompt(context, messages, newMessage) {
  const lines = [];

  // ── Job context ──────────────────────────────────────────────────────────
  lines.push('=== CURRENT JOB ===');
  if (context.jobTitle)  lines.push(`Title: ${context.jobTitle}`);
  if (context.company)   lines.push(`Employer: ${context.company}`);
  if (context.sourceUrl) lines.push(`URL: ${context.sourceUrl}`);
  if (context.description) {
    const desc = context.description.length > 2500
      ? context.description.slice(0, 2500) + '\n[…job description truncated…]'
      : context.description;
    lines.push('', `Job Description:\n${desc}`);
  }
  lines.push('=== END JOB ===', '');

  // ── Profile context ──────────────────────────────────────────────────────
  const profileText = safeProfileText(context.profile);
  if (profileText) {
    lines.push('=== CANDIDATE PROFILE ===');
    if (context.profileName) lines.push(`Profile: ${context.profileName}`);
    lines.push(profileText);
    lines.push('=== END PROFILE ===', '');
  }

  // ── AI Fit Review ────────────────────────────────────────────────────────
  if (context.aiReview) {
    const r = context.aiReview;
    lines.push('=== AI FIT REVIEW ===');
    if (r.score != null)          lines.push(`Score: ${r.score}% (${r.label || ''})`);
    if (r.strongMatches?.length)  lines.push(`Strong matches: ${r.strongMatches.join('; ')}`);
    if (r.possibleGaps?.length)   lines.push(`Possible gaps: ${r.possibleGaps.join('; ')}`);
    if (r.suggestedAngle)         lines.push(`Suggested angle: ${r.suggestedAngle}`);
    if (r.recommendation)         lines.push(`Recommendation: ${r.recommendation}`);
    lines.push('=== END AI REVIEW ===', '');
  }

  // ── Draft status ─────────────────────────────────────────────────────────
  const drafts = [
    context.hasResumeDraft ? 'resume'       : '',
    context.hasCLDraft     ? 'cover letter' : '',
  ].filter(Boolean);
  if (drafts.length) lines.push(`Draft status: ${drafts.join(' and ')} already generated.`, '');

  // ── Conversation history ─────────────────────────────────────────────────
  const recentMessages = messages.slice(-MAX_CHAT_HISTORY_MESSAGES);
  if (recentMessages.length > 0) {
    lines.push('=== CONVERSATION SO FAR ===');
    for (const m of recentMessages) {
      lines.push(`${m.role === 'user' ? 'Candidate' : 'Advisor'}: ${m.content}`);
    }
    lines.push('=== END CONVERSATION ===', '');
  }

  // ── Current turn ─────────────────────────────────────────────────────────
  lines.push(`Candidate: ${newMessage}`, 'Advisor:');

  return lines.join('\n');
}

/**
 * Send one chat turn to the AI.
 * @param {object} context  — built by buildJobChatContext() in dashboard.js
 * @param {Array}  messages — prior turns [{role,content}, …] excluding newMessage
 * @param {string} newMessage — the user's current message text
 * @param {object} settings — AI provider settings
 * @param {AbortSignal} signal
 * @returns {Promise<string>} — the advisor's reply text
 */
export async function sendJobChatMessage(context, messages, newMessage, settings, signal) {
  if (!settings?.provider) throw new Error('no_provider');
  if (settings.provider === 'mock') {
    return generateMockJobChatReply(context, newMessage);
  }
  const userPrompt = buildUserPrompt(context, messages, newMessage);
  return callAI(SYSTEM_PROMPT, userPrompt, settings, signal);
}

export async function sendJobChatProfileUpdateProposal(context, newMessage, settings, signal) {
  if (!hasExplicitProfileUpdateIntent(newMessage)) return null;
  if (!settings?.provider) throw new Error('no_provider');
  if (settings.provider === 'mock') {
    return validateProfileUpdateProposal(
      generateMockJobChatProfileUpdateProposal(context, newMessage),
      newMessage,
      context
    );
  }

  const raw = await callAI(PROFILE_PROPOSAL_SYSTEM_PROMPT, buildProfileProposalPrompt(newMessage), settings, signal);
  const parsed = extractJsonObject(raw);
  return validateProfileUpdateProposal(parsed, newMessage, context);
}
