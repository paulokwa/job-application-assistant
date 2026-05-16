// modules/fitAnalysis.js
// Job fit analysis for saved jobs. Compares only provided profile/resume facts against a job posting.

import { callAI } from './provider.js';
import { profileToPromptText } from './profile.js';

const LABELS = new Set([
  'strong_match',
  'good_match',
  'maybe',
  'weak_match',
  'not_recommended',
]);

const isMock = settings => settings?.provider === 'mock';

function safeProfile(profile) {
  if (profile?.personalInfo) return profile;
  return {
    personalInfo: {},
    summaries: [],
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    customSections: [],
  };
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function labelForScore(score) {
  if (score >= 85) return 'strong_match';
  if (score >= 70) return 'good_match';
  if (score >= 50) return 'maybe';
  if (score >= 30) return 'weak_match';
  return 'not_recommended';
}

function asStringArray(value, max = 5) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function parseJsonObject(raw) {
  if (raw && typeof raw === 'object') return raw;
  const text = String(raw || '').trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (_) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return {};
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return {};
    }
  }
}

function hasProfileContent(profile = {}) {
  const p = profile.personalInfo || {};
  return Boolean(
    p.fullName ||
    profile.summary ||
    profile.summaries?.some(summary => summary?.text) ||
    profile.skills?.length ||
    profile.experience?.length ||
    profile.education?.length ||
    profile.projects?.length ||
    profile.certifications?.length ||
    profile.customSections?.some(section => section?.text)
  );
}

export function hasFitAnalysisInputs(profile, sourceResumeText) {
  return hasProfileContent(profile) || Boolean(String(sourceResumeText || '').trim());
}

export function normalizeFitAnalysis(raw) {
  const parsed = parseJsonObject(raw);
  const score = clampScore(parsed.score);
  const label = LABELS.has(parsed.label) ? parsed.label : labelForScore(score);

  return {
    score,
    label,
    strongMatches: asStringArray(parsed.strongMatches),
    possibleGaps: asStringArray(parsed.possibleGaps),
    suggestedAngle: String(parsed.suggestedAngle || '').trim(),
    recommendation: String(parsed.recommendation || '').trim(),
    analyzedAt: new Date().toISOString(),
  };
}

function keywordSet(text) {
  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'this', 'that',
    'will', 'from', 'have', 'has', 'must', 'can', 'all', 'any', 'into', 'such',
    'their', 'they', 'them', 'who', 'what', 'when', 'where', 'why', 'how', 'job',
    'role', 'work', 'team', 'company', 'candidate', 'position', 'including'
  ]);

  return new Set(String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .map(word => word.replace(/^[.-]+|[.-]+$/g, ''))
    .filter(word => word.length > 2 && !stopwords.has(word)));
}

function mockAnalyzeFit(savedJob, profile, sourceResumeText) {
  const profileText = `${profileToPromptText(safeProfile(profile))}\n${sourceResumeText || ''}`;
  const jobKeywords = keywordSet(savedJob.cleanDescription || savedJob.rawContent || '');
  const profileKeywords = keywordSet(profileText);
  const matched = [...jobKeywords].filter(word => profileKeywords.has(word)).slice(0, 5);
  const gaps = [...jobKeywords].filter(word => !profileKeywords.has(word)).slice(0, 5);
  const score = matched.length
    ? Math.min(88, 45 + matched.length * 8)
    : 35;

  return normalizeFitAnalysis({
    score,
    label: labelForScore(score),
    strongMatches: matched.length
      ? matched.map(word => `[Demo mode] Profile/resume text mentions "${word}".`)
      : ['[Demo mode] Add more profile or resume details to surface stronger evidence.'],
    possibleGaps: gaps.length
      ? gaps.map(word => `[Demo mode] Job posting mentions "${word}", but it was not found in the available profile/resume text.`)
      : ['[Demo mode] No obvious keyword gaps found in this simplified mock analysis.'],
    suggestedAngle: '[Demo mode] Lead with the verified experience and skills already present in your profile/source resume.',
    recommendation: '[Demo mode] This is a simulated fit analysis. Review the job posting and your profile before relying on it.',
  });
}

export async function analyzeFit(savedJob, profile, settings, sourceResumeText = '', signal) {
  const description = String(savedJob?.cleanDescription || savedJob?.rawContent || '').trim();
  if (!description) {
    throw new Error('fit_no_job_description');
  }
  if (!hasFitAnalysisInputs(profile, sourceResumeText)) {
    throw new Error('fit_missing_profile');
  }
  if (!settings?.provider) {
    throw new Error('no_provider');
  }
  if (isMock(settings)) {
    return mockAnalyzeFit(savedJob, profile, sourceResumeText);
  }

  const profileText = profileToPromptText(safeProfile(profile));
  const truthBlocks = [];
  if (sourceResumeText) {
    truthBlocks.push('=== USER SOURCE RESUME (GROUND TRUTH) ===');
    truthBlocks.push(sourceResumeText);
    truthBlocks.push('=== END SOURCE RESUME ===');
    truthBlocks.push('');
  }
  truthBlocks.push('=== USER PROFILE DATA ===');
  truthBlocks.push(profileText);
  truthBlocks.push('=== END USER PROFILE ===');

  const systemPrompt = [
    'You are a careful job fit analyst for a job seeker.',
    'Compare the target job posting against only the provided user profile and source resume.',
    'Do not invent, infer, or assume qualifications, credentials, years of experience, tools, achievements, licenses, education, or job history.',
    'If evidence is not present in the profile or source resume, treat it as a possible gap.',
    'Return valid JSON only. No markdown, no preamble, no trailing text.',
  ].join('\n\n');

  const schema = {
    score: 0,
    label: 'strong_match | good_match | maybe | weak_match | not_recommended',
    strongMatches: ['Specific verified match from the profile/source resume'],
    possibleGaps: ['Requirement from the job posting not clearly supported by the profile/source resume'],
    suggestedAngle: 'Concise positioning angle based only on verified evidence.',
    recommendation: 'Short recommendation summary for whether and how to apply.',
  };

  const userPrompt = [
    `TARGET JOB TITLE: ${savedJob.title || ''}`,
    `TARGET EMPLOYER: ${savedJob.company || ''}`,
    `=== JOB DESCRIPTION ===\n${description}\n=== END JOB DESCRIPTION ===`,
    '',
    truthBlocks.join('\n'),
    '',
    'Analyze fit and return a raw JSON object using this exact shape:',
    JSON.stringify(schema, null, 2),
  ].join('\n');

  const raw = await callAI(systemPrompt, userPrompt, settings, signal);
  return normalizeFitAnalysis(raw);
}
