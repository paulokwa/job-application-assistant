// modules/emailDrafting.js
// AI prompt construction and generation for the Application Email Assistant.

import { callAI } from './provider.js';
import { profileToPromptText } from './profile.js';
import { generateMockApplicationEmail } from './mock.js';

const isMock = settings => settings?.provider === 'mock';

const EMAIL_HALLUCINATION_GUARD = `CRITICAL RULE — HONESTY:
You must only use information explicitly provided in the user profile below.
Do NOT invent, assume, or fabricate:
- qualifications, certifications, or licenses not listed
- work authorization status or immigration status
- salary expectations or salary history
- availability dates or start dates
- language abilities not stated
- years of experience beyond what is stated
- any factual claim not explicitly supported by the user profile

If a required piece of information is not in the profile, use this exact placeholder format:
[Please confirm: <what is needed>]

The user's "Do Not Claim" notes are hard constraints — never override them.`;

const JSON_OUTPUT_INSTRUCTION = `OUTPUT FORMAT:
Your final response must be valid JSON ONLY. No markdown code blocks, no preamble, no trailing text.
Follow the provided schema exactly.`;

const EMAIL_SCHEMA = {
  hasSpecialInstructions: false,
  applicationMethod: "email | website | unknown",
  recipientEmail: "string email address found in posting, or null",
  subject: "string — recommended email subject line",
  emailBody: "string — full plain-text email body ready to send",
  detectedInstructionsSummary: ["string — each detected special instruction"],
  requiredItems: ["string — each required action or document the applicant must include"],
  screeningQuestions: [
    {
      question: "string — question text from posting",
      suggestedAnswer: "string answer using profile data, or null if not safely known",
      needsUserConfirmation: true,
      reason: "string — why confirmation is needed, or what profile data was used"
    }
  ],
  attachmentsReminder: ["string — each document to attach or note about attachments"],
  warnings: ["string — unclear, conflicting, or missing instructions"],
  mailtoRecommended: false
};

const SYSTEM_PROMPT = [
  'You are a professional job application assistant.',
  EMAIL_HALLUCINATION_GUARD,
  '',
  'TASK: Prepare a professional application email draft based on the job posting and user profile.',
  '',
  'INSTRUCTIONS:',
  '1. Read the full job posting text carefully.',
  '2. Determine whether it contains special application instructions.',
  '3. If special instructions exist: set hasSpecialInstructions to true and follow them precisely in the email.',
  '4. If no special instructions exist: set hasSpecialInstructions to false and generate a concise generic professional email.',
  '5. Identify the application method (email, website, or unknown).',
  '6. If an email address for submitting applications is found, set recipientEmail to that address. If none is found, set it to null.',
  '7. List all required items the applicant must include or do.',
  '8. For each screening question found: attempt a suggested answer using only verified profile data. If not safely known, set suggestedAnswer to null and needsUserConfirmation to true.',
  '9. List any warnings for unclear, conflicting, or missing instructions.',
  '10. Set mailtoRecommended to true only if applicationMethod is "email" AND recipientEmail is not null.',
  '11. Return STRICT JSON ONLY. No markdown, no extra text outside the JSON object.',
  '',
  'EXAMPLES OF SPECIAL APPLICATION INSTRUCTIONS:',
  '- Apply by email to a specific address',
  '- Use a specific subject line format (e.g. "Reference: 2024-ADMIN-003")',
  '- Include a job, reference, or competition number',
  '- Answer specific screening questions in the email',
  '- Include salary expectations or salary history',
  '- Include your availability date or start date',
  '- Attach or explicitly omit certain documents (e.g. "do not send a photo")',
  '- Apply before a specific deadline',
  '- Mention a specific code, keyword, or phrase',
  '',
  'GENERIC EMAIL FORMAT (use only when hasSpecialInstructions is false):',
  'Subject: Application for [Job Title]',
  '',
  'Hello,',
  '',
  'I am writing to apply for the [Job Title] position with [Company]. Please find attached my resume and cover letter for your review.',
  '',
  'Thank you for your time and consideration. I would welcome the opportunity to discuss how my experience and skills align with this role.',
  '',
  'Sincerely,',
  '[User Name]',
  '',
  JSON_OUTPUT_INSTRUCTION,
  JSON.stringify(EMAIL_SCHEMA, null, 2),
].join('\n');

function buildUserPrompt(jobData, profile, options = {}) {
  const profileText = profileToPromptText(profile);
  const { resumeGenerated = false, coverLetterGenerated = false, extraInstructions = '' } = options;

  const lines = [
    `JOB TITLE: ${jobData.jobTitle || 'Unknown'}`,
    `COMPANY: ${jobData.company || 'Unknown'}`,
    '',
    '=== JOB POSTING TEXT ===',
    jobData.description || '(no job description provided)',
    '=== END JOB POSTING TEXT ===',
  ];

  if (extraInstructions.trim()) {
    lines.push('');
    lines.push('=== ADDITIONAL APPLICATION INSTRUCTIONS (provided by user — treat as authoritative) ===');
    lines.push(extraInstructions.trim());
    lines.push('=== END ADDITIONAL INSTRUCTIONS ===');
  }

  lines.push('');
  lines.push(profileText);
  lines.push('');
  lines.push('DOCUMENT STATUS:');
  lines.push(`- Resume generated: ${resumeGenerated}`);
  lines.push(`- Cover letter generated: ${coverLetterGenerated}`);
  lines.push('');
  lines.push('Return JSON only — no markdown, no extra text.');

  return lines.join('\n');
}

export async function prepareApplicationEmail(jobData, profile, settings, options = {}, signal) {
  if (isMock(settings)) {
    return generateMockApplicationEmail(jobData, profile);
  }

  const userPrompt = buildUserPrompt(jobData, profile, options);
  return callAI(SYSTEM_PROMPT, userPrompt, settings, signal);
}
