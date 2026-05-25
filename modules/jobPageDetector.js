// modules/jobPageDetector.js
// Pure job-page detection utility. No browser APIs, no AI calls.
// Takes pre-extracted strings and returns a confidence verdict.

const KNOWN_ATS_HOSTS = [
  'greenhouse.io',
  'boards.greenhouse.io',
  'lever.co',
  'jobs.lever.co',
  'myworkdayjobs.com',
  'myworkday.com',
  'ashbyhq.com',
  'jobs.ashbyhq.com',
  'smartrecruiters.com',
  'jobs.smartrecruiters.com',
  'workable.com',
  'apply.workable.com',
  'indeed.com',
  'linkedin.com/jobs',
  'taleo.net',
  'icims.com',
  'bamboohr.com',
  'jobvite.com',
  'recruitee.com',
  'teamtailor.com',
  'dover.com',
  'rippling.com/hiring',
  // UKG / UltiPro (common in Canada and US)
  'ultipro.ca',
  'ultipro.com',
  'recruiting.ultipro.ca',
  'recruiting.ultipro.com',
  'ukg.com',
  // Ceridian Dayforce (dominant in Canada)
  'dayforce.com',
  'ceridian.com',
  // SAP SuccessFactors
  'successfactors.com',
  'successfactors.eu',
  // Oracle / Taleo cloud
  'oraclecloud.com',
  // Other common platforms
  'humi.ca',
  'personio.com',
  'pinpointhq.com',
  'dover.io',
  'jazz.co',
  'jazzhr.com',
  'breezy.hr',
  'recruitingbypaychex.com',
];

// Phrases that commonly appear as section headings in job postings.
// Use only straight apostrophes here — smart quotes are normalised before matching.
const SECTION_HEADERS = [
  'responsibilities',
  'requirements',
  'qualifications',
  "what you'll do",
  "what we're looking for",
  'about the role',
  'key responsibilities',
  'essential duties',
  'minimum qualifications',
  'preferred qualifications',
  'job requirements',
  'about this role',
  'what you will do',
  'your responsibilities',
  'role requirements',
  'the role',
  // Additional headers seen on UltiPro, Dayforce, and similar platforms
  "what you'll likely have",
  "what you will likely have",
  "what you'll need",
  "what you will need",
  'what we offer',
  "here's the deal",
  'job details',
  'position summary',
  'position overview',
  'job summary',
  'who you are',
  'about you',
  'nice to have',
  'must have',
  'day in the life',
];

// Metadata-like labels common in job postings.
const METADATA_FIELDS = [
  'employment type',
  'job type',
  'remote',
  'hybrid',
  'on-site',
  'full-time',
  'part-time',
  'full time',
  'part time',
  'salary range',
  'compensation',
  'experience level',
  'seniority level',
  'department',
  // Additional metadata seen on Canadian / UltiPro-style postings
  'job category',
  'requisition',
  'travel required',
  'hourly rate',
  'rate of pay',
  'noc code',
  'posting date',
  'start date',
  'contract',
  'permanent',
  'temporary',
];

// Phrases that indicate an application flow is present.
const APPLICATION_PHRASES = [
  'apply now',
  'submit application',
  'apply for this role',
  'apply for this job',
  'apply today',
  'cover letter',
  'resume or cv',
  'submit your resume',
  'submit your cv',
  'to be considered',
  'send your resume',
  'click apply',
];

/**
 * detectJobPage({ url, title, text, structuredData })
 * Returns { isLikelyJobPosting: boolean, confidence: number, reasons: string[] }
 *
 * Scoring (additive, capped at 100):
 *   Structured JobPosting schema → 90 (short-circuit)
 *   Known ATS domain             → 25
 *   Section headers              → up to 30 (10 pts each)
 *   Metadata fields              → up to 20 (5 pts each)
 *   Application language         → up to 15 (5 pts each)
 *
 * Phase 1 threshold: confidence >= 40
 */
export function detectJobPage({ url = '', title = '', text = '', structuredData = '' } = {}) {
  const reasons = [];

  // 1. JSON-LD structured data — highest-confidence signal, short-circuit
  if (structuredData && structuredData.includes('"JobPosting"')) {
    return {
      isLikelyJobPosting: true,
      confidence: 90,
      reasons: ['Page contains JobPosting structured data (JSON-LD)'],
    };
  }

  let score = 0;
  const urlLower = url.toLowerCase();
  // Normalise Unicode smart quotes/apostrophes to straight equivalents before
  // matching so phrases like "what you'll do" match "what you’ll do".
  const combined = (text + ' ' + title)
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"');

  // 2. Known ATS / job board domain (25 pts)
  const atsDomain = KNOWN_ATS_HOSTS.find(host => urlLower.includes(host));
  if (atsDomain) {
    score += 25;
    reasons.push(`URL matches known job platform: ${atsDomain}`);
  }

  // 3. Job section headers (10 pts each, capped at 30)
  let sectionScore = 0;
  const foundSections = [];
  for (const header of SECTION_HEADERS) {
    if (combined.includes(header)) {
      foundSections.push(header);
      sectionScore += 10;
      if (sectionScore >= 30) break;
    }
  }
  if (foundSections.length > 0) {
    score += sectionScore;
    reasons.push(`Job section headers found: ${foundSections.slice(0, 3).join(', ')}`);
  }

  // 4. Metadata fields (5 pts each, capped at 20)
  let metaScore = 0;
  const foundMeta = [];
  for (const field of METADATA_FIELDS) {
    if (combined.includes(field)) {
      foundMeta.push(field);
      metaScore += 5;
      if (metaScore >= 20) break;
    }
  }
  if (foundMeta.length > 0) {
    score += metaScore;
    reasons.push(`Job metadata found: ${foundMeta.slice(0, 3).join(', ')}`);
  }

  // 5. Application language (5 pts each, capped at 15)
  let appScore = 0;
  const foundApp = [];
  for (const phrase of APPLICATION_PHRASES) {
    if (combined.includes(phrase)) {
      foundApp.push(phrase);
      appScore += 5;
      if (appScore >= 15) break;
    }
  }
  if (foundApp.length > 0) {
    score += appScore;
    reasons.push(`Application language found: ${foundApp.slice(0, 2).join(', ')}`);
  }

  const confidence = Math.min(100, score);

  return {
    isLikelyJobPosting: confidence >= 40,
    confidence,
    reasons,
  };
}
