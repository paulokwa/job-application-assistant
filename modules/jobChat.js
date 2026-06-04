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

function hasInsufficientExperienceDetail(proposal) {
  if (proposal.section !== 'experience' || proposal.action !== 'add') return false;
  const pv = proposal.proposedValue;
  if (!pv || typeof pv !== 'object' || Array.isArray(pv)) return true;
  const hasJobTitle = typeof pv.jobTitle === 'string' && pv.jobTitle.trim().length > 0;
  const hasEmployer = typeof pv.employer === 'string' && pv.employer.trim().length > 0;
  return !hasJobTitle && !hasEmployer;
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

export function validateProfileUpdateProposal(rawProposal, sourceUserMessage = '') {
  const proposal = trimProposalStrings(rawProposal);
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return null;
  if (proposal.type !== 'profile_update_proposal') return null;
  if (proposal.proposalVersion !== 1) return null;
  if (!PROFILE_UPDATE_SECTIONS.has(proposal.section)) return null;
  if (!PROFILE_UPDATE_ACTIONS.has(proposal.action)) return null;
  if (proposalContainsBlockedKey(proposal)) return null;
  if (hasInsufficientExperienceDetail(proposal)) return null;
  if (proposalLooksLikeFullProfileReplacement(proposal)) return null;
  if (hasPlaceholderOrDemoValues(proposal)) return null;
  if (hasBlockedMutationText(proposal)) return null;
  if (claimsAlreadyChanged(proposal)) return null;

  const warnings = normalizeStringArray(proposal.warnings);
  if (proposal.action === 'remove') {
    warnings.push('Removal suggestions are read-only in this phase. Review the profile manually before deleting anything.');
  }
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
  };
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
      newMessage
    );
  }

  const raw = await callAI(PROFILE_PROPOSAL_SYSTEM_PROMPT, buildProfileProposalPrompt(newMessage), settings, signal);
  const parsed = extractJsonObject(raw);
  return validateProfileUpdateProposal(parsed, newMessage);
}
