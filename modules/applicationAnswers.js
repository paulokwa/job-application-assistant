// modules/applicationAnswers.js
// AI prompt construction for short application answers from saved jobs.

import { callAI } from './provider.js';
import { profileToPromptText } from './profile.js';
import { generateMockApplicationAnswers } from './mock.js';

const isMock = settings => settings?.provider === 'mock';
const MAX_APP_ANSWERS_JOB_DESCRIPTION_CHARS = 8000;
const MAX_APP_ANSWERS_SOURCE_RESUME_CHARS = 15000;
const TRUNCATION_MARKER = '\n\n[Truncated: text exceeded application answers prompt cap]';

export const PRESET_QUESTIONS = [
  'Why are you interested in this role?',
  'What relevant experience do you have?',
  'Why are you a good fit?',
  'Tell us about yourself.',
  'Is there anything else you want us to know?',
];

const APPLICATION_ANSWERS_GUARD = `CRITICAL RULES — GROUNDED APPLICATION ANSWERS:
Only use facts explicitly present in the user profile or source resume below.
Do NOT invent, assume, or imply:
- specific work examples, projects, achievements, or metrics not in the profile
- qualifications, certifications, credentials, or education not listed
- salary expectations, availability, start date, work authorization, or location flexibility
- years of experience beyond what the profile states
- software, tools, or skills not listed in the profile
- any experience, responsibility, or accomplishment not explicitly described

Do NOT answer questions about sensitive personal information: salary expectations,
immigration or work authorization status, demographic details, or legal history.
For those questions, set needsUserInput to true and explain in inputNeeded.

If a question can be partially answered but is missing one specific detail,
write the answer with [Please confirm: <detail>] in place of the missing item.

If a question cannot be answered safely from the profile, set needsUserInput to true,
set answer to null, and describe what is missing in inputNeeded.

The user's "Do Not Claim" notes (if present in the profile) are hard constraints — never override them.
Be conservative: when in doubt about whether the profile supports a claim, set needsUserInput to true.`;

const JSON_OUTPUT_INSTRUCTION = `OUTPUT FORMAT:
Return valid JSON only. No markdown code blocks, no preamble, no trailing text.`;

const ANSWER_SCHEMA = {
  question: 'string — the question text exactly as provided',
  answer: 'string — 2 to 4 sentence answer draft, or null if needsUserInput is true',
  needsUserInput: false,
  inputNeeded: 'string — what the user must supply or confirm, or null',
  warnings: ['string — per-question caution notes'],
};

const FULL_SCHEMA = {
  answers: [ANSWER_SCHEMA],
  notes: ['string — general notes for the user'],
  warnings: ['string — general warnings about missing profile information'],
};

const SYSTEM_PROMPT = [
  'You are a professional job application assistant.',
  APPLICATION_ANSWERS_GUARD,
  '',
  'TASK: Draft short, professional answers to common application questions.',
  '',
  'STYLE:',
  '- 2 to 4 sentences per answer.',
  '- Plain text only — no markdown, no bullet points in the answer text.',
  '- Grounded in the profile and job posting provided.',
  '- Do not write generic filler — if the profile does not support a specific claim, do not make it.',
  '',
  'INSTRUCTIONS:',
  '1. Answer every question in the provided list.',
  '2. For each answer, set needsUserInput: true if safe factual support is missing or insufficient.',
  '3. When needsUserInput is true, set answer to null — do not write a polished answer that could be mistaken for verified truth.',
  '4. Use [Please confirm: <detail>] inline only when one specific piece of a mostly-answerable response is missing.',
  '5. Return per-question warnings for facts the user should verify before using.',
  '6. Return top-level warnings if the profile is significantly incomplete for multiple answers.',
  '',
  JSON_OUTPUT_INSTRUCTION,
  JSON.stringify(FULL_SCHEMA, null, 2),
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

  const resumeText = capText(sourceResumeText, MAX_APP_ANSWERS_SOURCE_RESUME_CHARS);
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
    MAX_APP_ANSWERS_JOB_DESCRIPTION_CHARS
  );

  const questionList = PRESET_QUESTIONS
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n');

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
    'QUESTIONS TO ANSWER:',
    questionList,
    '',
    'Return JSON only. Do not include markdown.',
  ].join('\n');
}

export async function generateApplicationAnswers(jobData, profile, settings, signal, sourceResumeText = '') {
  if (isMock(settings)) {
    return generateMockApplicationAnswers(jobData, profile);
  }

  const userPrompt = buildUserPrompt(jobData, profile, sourceResumeText);
  return callAI(SYSTEM_PROMPT, userPrompt, settings, signal);
}
