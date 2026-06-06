// modules/drafting.js
// Prompt construction and draft generation logic for resumes and cover letters.

import { callAI } from './provider.js';
import { profileToPromptText } from './profile.js';
import { generateMockResume, generateMockCoverLetter, mockReviseDraft, mockExtractAtsKeywords } from './mock.js';

/** Returns true if the settings specify Mock Mode. */
const isMock = settings => settings?.provider === 'mock';

// ── Shared system prompt ─────────────────────────────────────────────────

const HALLUCINATION_GUARD = `CRITICAL RULE — HONESTY:
You must only use information explicitly provided in the user profile or source resume below.
Do NOT invent, assume, or embellish:
- qualifications or credentials not listed
- years of experience beyond what is stated
- certifications or licenses not listed
- software or tools not listed in the skills
- measurable achievements or statistics not supplied
- job titles or responsibilities not described

If information needed for a section is missing, omit that section rather than fabricating content. 
Accuracy and honesty are non-negotiable.`;

const RESUME_FACTUAL_GROUNDING_RULE = `RESUME FACTUAL FIELD RULE:
For structured resume fields, copy factual history exactly from the user profile or source resume unless the user explicitly asks to change that factual field.
Do not tailor, modernize, re-title, infer, or replace these factual fields:
- experience jobTitle
- experience employer/company
- experience location
- experience startDate
- experience endDate
- education institution
- education credential
- education dates
- certification names
- certification issuers
- certification years

The target job title may influence the headline, summary, skills emphasis, bullet wording, and ordering/emphasis of relevant experience.
The target job title must never be inserted into a historical work experience title.`;

function buildSourceTruthBlock(profileText, sourceResumeText) {
  const blocks = [];
  if (sourceResumeText) {
    blocks.push('=== USER SOURCE RESUME (GROUND TRUTH) ===');
    blocks.push(sourceResumeText);
    blocks.push('=== END SOURCE RESUME ===');
    blocks.push('');
  }
  blocks.push('=== USER PROFILE DATA ===');
  blocks.push(profileText);
  blocks.push('=== END USER PROFILE ===');
  return blocks.join('\n');
}

function toneInstruction(tone = 30) {
  if (tone <= 20) return 'TONE: Highly formal and polished. No contractions. Precise, measured language throughout.';
  if (tone <= 40) return 'TONE: Clear and professional. Direct and confident without being stiff.';
  if (tone <= 60) return 'TONE: Balanced — professional but warm and approachable. Avoid overly corporate phrasing.';
  if (tone <= 80) return 'TONE: Conversational and warm. Contractions are welcome. Sound like a person, not a template.';
  return           'TONE: Casual and friendly. Be direct and personable. Avoid stiff corporate language entirely.';
}

function clLengthInstruction(length = 'standard') {
  if (length === 'short')    return 'LENGTH: Write 3 paragraphs maximum — an opening, one body paragraph, and a closing. Be concise and direct.';
  if (length === 'detailed') return 'LENGTH: Write 6 or more paragraphs. Explore the candidate\'s background, achievements, and company fit in depth.';
  return 'LENGTH: Write 4–5 paragraphs — an opening, 2–3 body paragraphs covering key strengths, and a closing.';
}

const JSON_OUTPUT_INSTRUCTION = `OUTPUT FORMAT:
Your final response must be valid JSON ONLY. No markdown code blocks, no preamble, no trailing text.
Follow the provided schema exactly.`;

function buildFitContextBlock(fitContext) {
  if (!fitContext) return '';

  const lines = [
    '=== FIT ANALYSIS CONTEXT (advisory only) ===',
    'This context was pre-computed by a separate analysis. Use it ONLY as framing guidance.',
    'Do NOT invent, claim, or imply any qualification, credential, skill, or experience that is not',
    'already explicitly present in the source resume or profile above.',
    '',
  ];

  if (fitContext.suggestedAngle) {
    lines.push(`Suggested positioning angle: ${fitContext.suggestedAngle}`, '');
  }

  if (Array.isArray(fitContext.strongMatches) && fitContext.strongMatches.length) {
    lines.push('Verified strong matches from profile to emphasize:');
    fitContext.strongMatches.forEach(match => lines.push(`- ${match}`));
    lines.push('');
  }

  if (Array.isArray(fitContext.possibleGaps) && fitContext.possibleGaps.length) {
    lines.push('Possible gaps — treat as CAUTION AREAS only. Do NOT fabricate experience or skills to address them:');
    fitContext.possibleGaps.forEach(gap => lines.push(`- ${gap}`));
    lines.push('');
  }

  lines.push('=== END FIT ANALYSIS CONTEXT ===');
  return lines.join('\n');
}

// ── Resume Generation ─────────────────────────────────────────────────────

export async function generateResume(jobData, profile, settings, sourceResumeText = '', signal, tone = 30, fitContext = null) {
  if (isMock(settings)) return generateMockResume(jobData, profile, sourceResumeText);
  const profileText = profileToPromptText(profile);
  const truthBlock = buildSourceTruthBlock(profileText, sourceResumeText);
  const fitContextBlock = buildFitContextBlock(fitContext);

  const systemPrompt = [
    'You are an expert resume writer helping a job seeker tailor their resume to a specific job posting.',
    HALLUCINATION_GUARD,
    RESUME_FACTUAL_GROUNDING_RULE,
    toneInstruction(tone),
    'You must return a structured JSON object containing tailored content. The layout is controlled by the application; you only provide the words.',
    'Focus on highlighting achievements relevant to the target job description.',
  ].join('\n\n');

  const resumeSchema = {
    headline: "A short professional headline (3–6 words) positioning the candidate for the target role — e.g. 'Administrative Professional | Office Operations'. Reflect the target job, not the user's most recent job title.",
    summary: "A 3-4 sentence professional summary tailored to the job.",
    skills: ["Skill 1", "Skill 2", "..."],
    experience: [
      {
        jobTitle: "Original factual job title copied exactly from profile/source resume; do not use the target job title here",
        employer: "Original factual employer/company copied exactly from profile/source resume",
        location: "Original factual location copied exactly from profile/source resume; empty string if not provided",
        startDate: "Original factual start date from profile/source resume, normalized to compact MMM YYYY or YYYY; omit day numbers; empty string if not provided",
        endDate: "Original factual end date from profile/source resume, normalized to compact MMM YYYY, YYYY, or Present; empty string if not provided",
        bulletPoints: ["Accomplishment bullet 1", "Accomplishment bullet 2", "..."]
      }
    ],
    education: [
      {
        institution: "Original factual institution copied exactly from profile/source resume",
        credential: "Original factual degree/diploma/credential copied exactly from profile/source resume",
        location: "Original factual location copied exactly from profile/source resume; empty string if not provided",
        dates: "(copy verbatim from profile; use empty string if not provided — do not invent dates)",
        notes: ["Academic achievement or detail"]
      }
    ],
    projects: [
      {
        name: "Project Name",
        role: "Your Role",
        description: "Concise tailoring of project impact.",
        technologies: ["Tech 1", "Tech 2"],
        link: "Optional Link"
      }
    ],
    certifications: ["Certification name exactly as listed in profile/source resume; include issuer/year only if already provided"]
  };

  const userPromptParts = [
    `TARGET JOB TITLE: ${jobData.jobTitle}`,
    `TARGET EMPLOYER: ${jobData.company}`,
    `=== JOB DESCRIPTION ===\n${jobData.description}\n=== END JOB DESCRIPTION ===`,
    '',
    truthBlock,
    '',
  ];
  if (fitContextBlock) userPromptParts.push(fitContextBlock, '');
  userPromptParts.push(
    'TASK: Tailor the resume to the target job description while keeping factual history fields unchanged. Improve headline, summary, skills emphasis, and bullet wording; do not rewrite historical job titles, employers, dates, locations, education credentials, or certifications.',
    '',
    JSON_OUTPUT_INSTRUCTION,
    JSON.stringify(resumeSchema, null, 2)
  );
  const userPrompt = userPromptParts.join('\n');

  return callAI(systemPrompt, userPrompt, settings, signal);
}

// ── Cover Letter Generation ───────────────────────────────────────────────

export async function generateCoverLetter(jobData, profile, settings, sourceResumeText = '', signal, tone = 30, clLength = 'standard', fitContext = null) {
  if (isMock(settings)) return generateMockCoverLetter(jobData, profile, sourceResumeText);
  const profileText = profileToPromptText(profile);
  const truthBlock = buildSourceTruthBlock(profileText, sourceResumeText);
  const fitContextBlock = buildFitContextBlock(fitContext);

  const systemPrompt = [
    'You are an expert cover letter writer and career coach.',
    HALLUCINATION_GUARD,
    toneInstruction(tone),
    clLengthInstruction(clLength),
    'Return a structured JSON object containing greetings and body paragraphs.',
    'Write in a professional, engaging, and personalized tone that shows fit for the role and company.',
  ].join('\n\n');

  const coverLetterSchema = {
    greeting: "Dear [Hiring Manager Name or Hiring Manager],",
    paragraphs: [
      "Intro: Why you are excited and which role you are applying for.",
      "Body 1: How your specific achievements solve the company's problems.",
      "Body 2: Evidence of culture fit and additional technical strengths.",
      "Closing: Call to action and professional sign-off."
    ],
    closing: "Sincerely,",
    signOff: profile.personalInfo.fullName
  };

  const userPromptParts = [
    `TARGET JOB TITLE: ${jobData.jobTitle}`,
    `TARGET EMPLOYER: ${jobData.company}`,
    `=== JOB DESCRIPTION ===\n${jobData.description}\n=== END JOB DESCRIPTION ===`,
    '',
    truthBlock,
    '',
  ];
  if (fitContextBlock) userPromptParts.push(fitContextBlock, '');
  userPromptParts.push(
    'TASK: Write a tailored, persuasive cover letter body.',
    '',
    JSON_OUTPUT_INSTRUCTION,
    JSON.stringify(coverLetterSchema, null, 2)
  );
  const userPrompt = userPromptParts.join('\n');

  return callAI(systemPrompt, userPrompt, settings, signal);
}

// ── Draft Revision ─────────────────────────────────────────────────────────

export async function reviseDraft(currentDraft, revisionRequest, docType, jobData, profile, settings, isAtsRevision = false) {
  if (isMock(settings)) return mockReviseDraft(currentDraft, revisionRequest, docType);
  const profileText = profileToPromptText(profile);

  const draftStr = typeof currentDraft === 'object' ? JSON.stringify(currentDraft, null, 2) : currentDraft;

  const honestyRule = isAtsRevision
    ? 'KEYWORD MODE: The user is explicitly directing you to incorporate the listed keywords and phrases. Add skill names, tools, and descriptive terms exactly as provided, placed naturally into existing bullet points or the skills list. Do not fabricate specific metrics, dates, or credentials not in the profile.'
    : HALLUCINATION_GUARD;

  const systemPromptParts = [
    `You are revising a ${docType === 'resume' ? 'resume' : 'cover letter'} structured JSON based on user feedback.`,
    honestyRule,
    'Return the COMPLETE revised JSON object following the established schema.',
  ];
  if (docType === 'resume') {
    systemPromptParts.push(
      RESUME_FACTUAL_GROUNDING_RULE,
      'For resume revisions, improve bullets, summary, skills emphasis, and ordering unless the user explicitly requests a factual field correction.'
    );
  }
  systemPromptParts.push('IMPORTANT: Use any new information provided in the revision request even if not in the profile.');
  const systemPrompt = systemPromptParts.join('\n\n');

  const userPrompt = [
    '=== JOB DESCRIPTION ===',
    jobData.description,
    '',
    profileText,
    '',
    `=== CURRENT ${docType.toUpperCase()} JSON DRAFT ===`,
    draftStr,
    '',
    `USER REVISION REQUEST: "${revisionRequest}"`,
    '',
    'Apply the changes requested and return the full updated JSON.',
  ].join('\n');

  return callAI(systemPrompt, userPrompt, settings);
}

// ── ATS Keyword Extraction ────────────────────────────────────────────────

export async function extractAtsKeywords(jobDescription, settings, signal) {
  if (isMock(settings)) return mockExtractAtsKeywords(jobDescription);

  const systemPrompt = [
    'You are an ATS keyword analyst.',
    'Extract the most important skills, qualifications, and requirements from the job description.',
    'Return a JSON array of strings only. Each item is a keyword or short phrase (1–3 words).',
    'Aim for 10–15 keywords covering: technical skills, soft skills, qualifications, tools, and certifications.',
    'OUTPUT FORMAT: valid JSON array only. No markdown, no preamble, no trailing text.',
    'Example: ["case management", "Microsoft Office", "team leadership", "Bachelor\'s degree"]',
  ].join('\n');

  const userPrompt = `Extract ATS keywords from this job description:\n\n${jobDescription}`;

  try {
    const raw = await callAI(systemPrompt, userPrompt, settings, signal);
    const start = raw.indexOf('[');
    const end   = raw.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
}

// ── Special Instructions Extraction via AI ────────────────────────────────

export async function detectSpecialInstructionsAI(jobDescription, settings) {
  if (isMock(settings)) return [];
  const systemPrompt = [
    'Scan the job description for specific application instructions.',
    'Return a numbered list of instructions (subject lines, required formats, specific questions to answer).',
    'If nothing unusual is found, respond with exactly: NONE',
  ].join('\n');

  const userPrompt = `Scan this job posting:\n\n${jobDescription}`;

  try {
    const result = await callAI(systemPrompt, userPrompt, settings);
    if (!result || result.trim().toUpperCase() === 'NONE') return [];
    return result.split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}
