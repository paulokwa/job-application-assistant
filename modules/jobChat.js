// modules/jobChat.js
// Job Discussion Chat — AI-powered application strategy advisor for the current job.
// Encodes the full conversation history into the user prompt so the existing
// callAI(systemPrompt, userPrompt, settings, signal) interface works unchanged.

import { callAI } from './provider.js';
import { profileToPromptText } from './profile.js';
import { generateMockJobChatReply } from './mock.js';

const SYSTEM_PROMPT = [
  'You are an application strategy advisor helping a job seeker decide how to approach a specific job posting.',
  'You have been given the candidate\'s saved profile, the job description, and (if available) Fit Check results.',
  'Everything in the provided context is information the candidate has already recorded about themselves.',
  '',
  'STRICT RULES — follow all of these exactly:',
  '- Use ONLY the provided profile, job description, Fit Check results, and draft status. Do not add information from outside the context.',
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

  // ── Fit Check (keyword score + matched/missing terms) ────────────────────
  if (context.fitScore != null) {
    lines.push('=== FIT CHECK — KEYWORD MATCH ===');
    lines.push(`Keyword match score: ${context.fitScore}%`);
    if (context.matchedKeywords?.length)
      lines.push(`Matched terms (candidate has these): ${context.matchedKeywords.slice(0, 15).join(', ')}`);
    if (context.missingKeywords?.length)
      lines.push(`Missing terms (in job, not in profile): ${context.missingKeywords.slice(0, 15).join(', ')}`);
    lines.push('=== END FIT CHECK ===', '');
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
  if (messages.length > 0) {
    lines.push('=== CONVERSATION SO FAR ===');
    for (const m of messages) {
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
