// modules/recruiterMessage.js
// AI prompt construction for short recruiter outreach messages.

import { callAI } from './provider.js';
import { profileToPromptText } from './profile.js';
import { generateMockRecruiterMessage } from './mock.js';

const isMock = settings => settings?.provider === 'mock';
const MAX_RECRUITER_JOB_DESCRIPTION_CHARS = 12000;
const MAX_RECRUITER_SOURCE_RESUME_CHARS = 20000;
const TRUNCATION_MARKER = '\n\n[Truncated: text exceeded recruiter message prompt cap]';

const RECRUITER_MESSAGE_GUARD = `CRITICAL RULES - GROUNDED INITIAL OUTREACH:
This is an initial outreach message only.
Do NOT claim the user already applied.
Do NOT claim prior contact, a referral, a mutual connection, or that the recipient invited outreach.
Do NOT invent, assume, or imply qualifications, certifications, credentials, work authorization, salary expectations, availability, or experience.
Use only facts explicitly present in the user profile.
If a useful fact is missing, write a concise generic sentence instead of filling the gap.`;

const JSON_OUTPUT_INSTRUCTION = `OUTPUT FORMAT:
Return valid JSON only. No markdown code blocks, no preamble, no trailing text.`;

const RECRUITER_MESSAGE_SCHEMA = {
  subject: "string subject line for email-style outreach, or null for LinkedIn/networking style",
  messageBody: "string - concise plain-text outreach message",
  warnings: ["string - caution notes for the user to review"],
  notes: ["string - optional non-warning review notes"]
};

const SYSTEM_PROMPT = [
  'You are a professional career communications assistant.',
  RECRUITER_MESSAGE_GUARD,
  '',
  'TASK: Draft a short, professional initial outreach message for a recruiter, hiring manager, LinkedIn contact, or networking contact.',
  '',
  'STYLE:',
  '- Friendly, concise, and professional.',
  '- 80 to 130 words unless the job context clearly needs less.',
  '- Grounded in the provided profile and job posting.',
  '- No pressure tactics, no exaggerated claims, no invented relationship context.',
  '',
  'CONTENT RULES:',
  '1. Mention the target role and company when available.',
  '2. Include one or two relevant strengths only if explicitly supported by the profile.',
  '3. Ask for a conversation, guidance, or the right contact path without implying an existing relationship.',
  '4. If returning warnings, focus on facts the user should review before sending.',
  '',
  JSON_OUTPUT_INSTRUCTION,
  JSON.stringify(RECRUITER_MESSAGE_SCHEMA, null, 2),
].join('\n');

function capText(value, maxChars) {
  const text = String(value || '').trim();
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - TRUNCATION_MARKER.length)).trimEnd() + TRUNCATION_MARKER;
}

function buildTruthBlock(profile, sourceResumeText = '') {
  const profileText = profileToPromptText(profile);
  const lines = [
    '=== SOURCE RESUME / PROFILE TRUTH BLOCK ===',
    profileText,
  ];

  const resumeText = capText(sourceResumeText, MAX_RECRUITER_SOURCE_RESUME_CHARS);
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
    MAX_RECRUITER_JOB_DESCRIPTION_CHARS
  );

  return [
    `JOB TITLE: ${jobData?.jobTitle || jobData?.title || 'Unknown'}`,
    `COMPANY: ${jobData?.company || 'Unknown'}`,
    `JOB URL: ${jobData?.sourceUrl || 'Not provided'}`,
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

export async function generateRecruiterMessage(jobData, profile, settings, signal, sourceResumeText = '') {
  if (isMock(settings)) {
    return generateMockRecruiterMessage(jobData, profile);
  }

  const userPrompt = buildUserPrompt(jobData, profile, sourceResumeText);
  return callAI(SYSTEM_PROMPT, userPrompt, settings, signal);
}
