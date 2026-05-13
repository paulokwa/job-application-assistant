// modules/drafting.js
// Prompt construction and draft generation logic for resumes and cover letters.

import { callAI } from './provider.js';
import { profileToPromptText } from './profile.js';
import { generateMockResume, generateMockCoverLetter, mockReviseDraft } from './mock.js';

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

const JSON_OUTPUT_INSTRUCTION = `OUTPUT FORMAT:
Your final response must be valid JSON ONLY. No markdown code blocks, no preamble, no trailing text.
Follow the provided schema exactly.`;

// ── Resume Generation ─────────────────────────────────────────────────────

export async function generateResume(jobData, profile, settings, sourceResumeText = '', signal) {
  if (isMock(settings)) return generateMockResume(jobData, profile, sourceResumeText);
  const profileText = profileToPromptText(profile);
  const truthBlock = buildSourceTruthBlock(profileText, sourceResumeText);

  const systemPrompt = [
    'You are an expert resume writer helping a job seeker tailor their resume to a specific job posting.',
    HALLUCINATION_GUARD,
    'You must return a structured JSON object containing tailored content. The layout is controlled by the application; you only provide the words.',
    'Focus on highlighting achievements relevant to the target job description.',
  ].join('\n\n');

  const resumeSchema = {
    summary: "A 3-4 sentence professional summary tailored to the job.",
    skills: ["Skill 1", "Skill 2", "..."],
    experience: [
      {
        jobTitle: "Tailored Job Title",
        employer: "Company Name",
        location: "City, State",
        startDate: "Month Year",
        endDate: "Month Year or Present",
        bulletPoints: ["Accomplishment bullet 1", "Accomplishment bullet 2", "..."]
      }
    ],
    education: [
      {
        institution: "University Name",
        credential: "Degree/Diploma Name",
        location: "City, State",
        dates: "Year - Year",
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
    certifications: ["Certification 1", "Certification 2"]
  };

  const userPrompt = [
    `TARGET JOB TITLE: ${jobData.jobTitle}`,
    `TARGET EMPLOYER: ${jobData.company}`,
    `=== JOB DESCRIPTION ===\n${jobData.description}\n=== END JOB DESCRIPTION ===`,
    '',
    truthBlock,
    '',
    'TASK: Tailor the user profile/resume content to the target job description.',
    '',
    JSON_OUTPUT_INSTRUCTION,
    JSON.stringify(resumeSchema, null, 2),
  ].join('\n');

  return callAI(systemPrompt, userPrompt, settings, signal);
}

// ── Cover Letter Generation ───────────────────────────────────────────────

export async function generateCoverLetter(jobData, profile, settings, sourceResumeText = '', signal) {
  if (isMock(settings)) return generateMockCoverLetter(jobData, profile, sourceResumeText);
  const profileText = profileToPromptText(profile);
  const truthBlock = buildSourceTruthBlock(profileText, sourceResumeText);

  const systemPrompt = [
    'You are an expert cover letter writer and career coach.',
    HALLUCINATION_GUARD,
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

  const userPrompt = [
    `TARGET JOB TITLE: ${jobData.jobTitle}`,
    `TARGET EMPLOYER: ${jobData.company}`,
    `=== JOB DESCRIPTION ===\n${jobData.description}\n=== END JOB DESCRIPTION ===`,
    '',
    truthBlock,
    '',
    'TASK: Write a tailored, persuasive cover letter body.',
    '',
    JSON_OUTPUT_INSTRUCTION,
    JSON.stringify(coverLetterSchema, null, 2),
  ].join('\n');

  return callAI(systemPrompt, userPrompt, settings, signal);
}

// ── Draft Revision ─────────────────────────────────────────────────────────

export async function reviseDraft(currentDraft, revisionRequest, docType, jobData, profile, settings) {
  if (isMock(settings)) return mockReviseDraft(currentDraft, revisionRequest, docType);
  const profileText = profileToPromptText(profile);
  
  const draftStr = typeof currentDraft === 'object' ? JSON.stringify(currentDraft, null, 2) : currentDraft;

  const systemPrompt = [
    `You are revising a ${docType === 'resume' ? 'resume' : 'cover letter'} structured JSON based on user feedback.`,
    HALLUCINATION_GUARD,
    'Return the COMPLETE revised JSON object following the established schema.',
    'IMPORTANT: Use any new information provided in the revision request even if not in the profile.',
  ].join('\n\n');

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
