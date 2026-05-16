// modules/jobInfoExtraction.js
// AI-assisted cleanup for job title and employer after a normal page scan.

import { extractJobFields } from './extraction.js';
import { callAI } from './provider.js';

const isMock = settings => settings?.provider === 'mock';

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

function cleanField(value, maxLength = 120) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function normalizeJobInfo(raw) {
  const parsed = parseJsonObject(raw);
  const confidence = Number(parsed.confidence);
  return {
    jobTitle: cleanField(parsed.jobTitle || parsed.title),
    company: cleanField(parsed.company || parsed.employer || parsed.organization),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
  };
}

export async function extractJobInfoWithAI(description, url, settings, signal) {
  const text = String(description || '').trim();
  if (!text) return normalizeJobInfo(null);

  if (isMock(settings)) {
    const fields = extractJobFields(text, url);
    return {
      jobTitle: cleanField(fields.jobTitle),
      company: cleanField(fields.company),
      confidence: fields.needsReview ? 0.45 : 0.7,
    };
  }

  if (!settings?.provider) {
    throw new Error('no_provider');
  }

  const systemPrompt = [
    'You extract basic job posting metadata for a job application assistant.',
    'Use only the provided job description and source URL.',
    'Return valid JSON only. No markdown, no preamble, no trailing text.',
    'If the job title or employer is not clearly present, return an empty string for that field.',
    'Do not invent company names, titles, departments, locations, qualifications, or application details.',
  ].join('\n\n');

  const schema = {
    jobTitle: 'Exact job title, or empty string if unclear',
    company: 'Employer/company/organization name, or empty string if unclear',
    confidence: 0.0,
  };

  const userPrompt = [
    `SOURCE URL: ${url || ''}`,
    '=== JOB DESCRIPTION ===',
    text.slice(0, 30000),
    '=== END JOB DESCRIPTION ===',
    '',
    'Extract the target job title and employer. Return this raw JSON shape:',
    JSON.stringify(schema, null, 2),
  ].join('\n');

  return normalizeJobInfo(await callAI(systemPrompt, userPrompt, settings, signal));
}
