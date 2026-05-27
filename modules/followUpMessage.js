// modules/followUpMessage.js
// AI prompt construction for status-aware follow-up messages from saved jobs.

import { callAI } from './provider.js';
import { profileToPromptText } from './profile.js';
import { generateMockFollowUpMessage } from './mock.js';

const isMock = settings => settings?.provider === 'mock';
const MAX_FOLLOW_UP_JOB_DESCRIPTION_CHARS = 8000;
const MAX_FOLLOW_UP_SOURCE_RESUME_CHARS = 15000;
const TRUNCATION_MARKER = '\n\n[Truncated: text exceeded follow-up message prompt cap]';

const FOLLOW_UP_GUARD = `CRITICAL RULES - GROUNDED FOLLOW-UP MESSAGE:
Do NOT claim an interview, phone screen, referral, mutual connection, prior contact, or recruiter invitation under any status.
Only claim the user formally applied when the job status is exactly "applied".
If status is saved, needs_review, or ready_to_apply, the message must not say or imply the user applied.
Do NOT invent, assume, or imply qualifications, certifications, credentials, work authorization, salary expectations, availability, or experience.
Do NOT pressure, sound desperate, or make entitled demands.
Nothing is sent automatically. The user reviews before sending.
Use only facts explicitly present in the user profile.
If a useful fact is missing, write a concise generic sentence instead of filling the gap.`;

const JSON_OUTPUT_INSTRUCTION = `OUTPUT FORMAT:
Return valid JSON only. No markdown code blocks, no preamble, no trailing text.`;

const FOLLOW_UP_MESSAGE_SCHEMA = {
  subject: "string subject line for email-style follow-up, or null for LinkedIn/networking style",
  messageBody: "string - concise plain-text follow-up message",
  warnings: ["string - caution notes for the user to review"],
  notes: ["string - optional non-warning review notes"]
};

const SYSTEM_PROMPT = [
  'You are a professional career communications assistant.',
  FOLLOW_UP_GUARD,
  '',
  'TASK: Draft a short, professional follow-up message for a job the user has saved or applied to.',
  '',
  'STYLE:',
  '- Friendly, concise, and professional.',
  '- 60 to 110 words unless the context clearly needs less.',
  '- Grounded in the provided profile and job posting.',
  '- No pressure tactics, no exaggerated claims, no invented relationship context.',
  '',
  'CONTENT RULES:',
  '1. Mention the target role and company when available.',
  '2. Follow the STATUS INSTRUCTION provided in the user prompt exactly — it governs what you may or may not claim.',
  '3. Include one relevant strength only if explicitly supported by the profile.',
  '4. Ask for a brief update or next step without demanding or implying entitlement.',
  '5. Return warnings only for facts the user should review before sending.',
  '',
  JSON_OUTPUT_INSTRUCTION,
  JSON.stringify(FOLLOW_UP_MESSAGE_SCHEMA, null, 2),
].join('\n');

function capText(value, maxChars) {
  const text = String(value || '').trim();
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - TRUNCATION_MARKER.length)).trimEnd() + TRUNCATION_MARKER;
}

function statusInstruction(status) {
  if (status === 'applied') {
    return 'The user has formally applied for this role. You may mention that they applied. Ask politely about the timeline or next steps. Do NOT claim any interview, phone screen, or recruiter invitation was scheduled or offered.';
  }
  if (status === 'rejected') {
    return 'The user previously applied and was not selected. Write a gracious, brief message thanking the team for their time and expressing continued interest in the company or future opportunities. Do NOT ask them to reconsider. Do NOT claim any interview or prior contact beyond the application itself.';
  }
  return 'The user has saved this role but has NOT formally applied. The message must not say or imply the user applied. Express continued interest in the role. Use phrasing like "remains interested" or "wanted to follow up on my interest in" rather than implying an application was submitted.';
}

function buildTruthBlock(profile, sourceResumeText = '') {
  const profileText = profileToPromptText(profile);
  const lines = [
    '=== SOURCE RESUME / PROFILE TRUTH BLOCK ===',
    profileText,
  ];

  const resumeText = capText(sourceResumeText, MAX_FOLLOW_UP_SOURCE_RESUME_CHARS);
  if (resumeText) {
    lines.push('');
    lines.push('--- Source Resume Text ---');
    lines.push(resumeText);
  }

  lines.push('=== END SOURCE RESUME / PROFILE TRUTH BLOCK ===');
  return lines.join('\n');
}

function buildUserPrompt(jobData, profile, sourceResumeText = '') {
  const jobDescription = capText(
    jobData?.description || jobData?.cleanDescription || '',
    MAX_FOLLOW_UP_JOB_DESCRIPTION_CHARS
  );

  const status = jobData?.status || 'saved';

  return [
    `JOB TITLE: ${jobData?.jobTitle || jobData?.title || 'Unknown'}`,
    `COMPANY: ${jobData?.company || 'Unknown'}`,
    `JOB URL: ${jobData?.sourceUrl || 'Not provided'}`,
    `JOB STATUS: ${status}`,
    '',
    `FOLLOW-UP CONTEXT: ${statusInstruction(status)}`,
    '',
    '=== JOB POSTING TEXT EXCERPT ===',
    jobDescription || '(no job description provided)',
    '=== END JOB POSTING TEXT EXCERPT ===',
    '',
    buildTruthBlock(profile, sourceResumeText),
    '',
    'Return JSON only. Do not include markdown.',
  ].join('\n');
}

export async function generateFollowUpMessage(jobData, profile, settings, signal, sourceResumeText = '') {
  if (isMock(settings)) {
    return generateMockFollowUpMessage(jobData, profile);
  }

  const userPrompt = buildUserPrompt(jobData, profile, sourceResumeText);
  return callAI(SYSTEM_PROMPT, userPrompt, settings, signal);
}
