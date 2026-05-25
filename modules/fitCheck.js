// modules/fitCheck.js
// Pure keyword-overlap scorer for Fit Check. No AI, no browser APIs. Testable in isolation.
// Results are signals only — not verdicts. UI must communicate this clearly.

// Comprehensive stopword + job-page noise list.
// This deliberately includes generic workplace words that create false "missing" signals.
const STOPWORDS = new Set([
  // Common English function words
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'this', 'that',
  'will', 'from', 'have', 'has', 'must', 'can', 'all', 'any', 'into', 'such',
  'their', 'they', 'them', 'who', 'what', 'when', 'where', 'why', 'how',
  'a', 'an', 'in', 'on', 'at', 'to', 'of', 'by', 'or', 'be', 'is', 'was',
  'were', 'been', 'being', 'do', 'does', 'did', 'had', 'may', 'might',
  'should', 'would', 'could', 'shall', 'not', 'but', 'if', 'as', 'up',
  'it', 'its', 'we', 'he', 'she', 'i', 'me', 'my', 'him', 'her', 'his',
  'us', 'so', 'no', 'also', 'both', 'each', 'too', 'very', 'just', 'now',
  'then', 'than', 'more', 'most', 'other', 'while', 'about', 'which',
  'these', 'those', 'some', 'same', 'there', 'here', 'own', 'few', 'nor',
  // Generic job page noise — words that appear everywhere and carry no signal
  'job', 'role', 'work', 'working', 'team', 'company', 'position', 'candidate',
  'employment', 'employer', 'employee', 'hiring', 'hire', 'apply', 'application',
  'applicant', 'culture', 'career', 'opportunity', 'office', 'location',
  'remote', 'hybrid', 'onsite', 'benefits', 'salary', 'compensation', 'pay',
  'full', 'part', 'time', 'year', 'years', 'month', 'day', 'new', 'great',
  'good', 'best', 'top', 'key', 'strong', 'excellent', 'including', 'include',
  'included', 'includes', 'well', 'able', 'ability', 'skills', 'skill',
  'knowledge', 'understanding', 'background', 'field', 'plus', 'based',
  'make', 'ensure', 'help', 'support', 'provide', 'build', 'develop',
  'manage', 'lead', 'join', 'use', 'using', 'degree', 'required', 'preferred',
  'minimum', 'highly', 'ideal', 'ideally', 'proven', 'relevant',
  'passionate', 'driven', 'collaborative', 'dynamic', 'innovative',
  'exciting', 'growing', 'fast', 'paced', 'people', 'member', 'members',
  'staff', 'experience', 'experienced', 'within', 'across', 'through',
  'between', 'under', 'over', 'during', 'following', 'related', 'number',
  'high', 'large', 'small', 'long', 'short', 'broad', 'deep', 'wide',
]);

// Tokenize a string into lowercase, stopword-filtered, meaningful tokens.
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^[-.,]+|[-.,]+$/g, ''))
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Extract keywords from a saved profile.
 * Sources: skills[], summary, summaries[], experience bullet points,
 *          certifications[], projects (technologies + description).
 * Returns a string[] of unique lowercase tokens.
 */
export function extractProfileKeywords(profile) {
  const tokens = new Set();

  // Skills are user-curated — highest signal. Tokenize to handle multi-word entries.
  for (const skill of (profile?.skills || [])) {
    for (const t of tokenize(skill)) tokens.add(t);
  }

  // Summary text
  for (const t of tokenize(profile?.summary || '')) tokens.add(t);

  // Summaries array (labelled summary variants)
  for (const s of (profile?.summaries || [])) {
    for (const t of tokenize(s?.text || '')) tokens.add(t);
  }

  // Experience bullet points
  for (const exp of (profile?.experience || [])) {
    for (const bullet of (exp?.bulletPoints || [])) {
      for (const t of tokenize(bullet)) tokens.add(t);
    }
  }

  // Certifications
  for (const cert of (profile?.certifications || [])) {
    for (const t of tokenize(cert)) tokens.add(t);
  }

  // Projects: named technologies and description text
  for (const proj of (profile?.projects || [])) {
    for (const tech of (proj?.technologies || [])) {
      for (const t of tokenize(tech)) tokens.add(t);
    }
    for (const t of tokenize(proj?.description || '')) tokens.add(t);
  }

  return [...tokens];
}

/**
 * Extract meaningful keywords from raw job text.
 * Uses the same stopword list plus length filter to reduce noise.
 * Returns a string[] of unique lowercase tokens.
 */
export function extractJobKeywords(jobText) {
  return [...new Set(tokenize(jobText))];
}

/**
 * Score profile keywords against job keywords.
 * Returns:
 *   score    — 0–100, fraction of job keywords found in profile
 *   matched  — job tokens that appear in the profile (up to 15 for display)
 *   unmatched — job tokens not in profile, filtered to >= 4 chars, sorted by length
 *               descending (longer = more specific), capped at 10 for display
 */
export function scoreMatch(profileKeywords, jobKeywords) {
  if (!jobKeywords.length) {
    return { score: 0, matched: [], unmatched: [] };
  }

  const profileSet = new Set(profileKeywords);
  const matched   = jobKeywords.filter(k => profileSet.has(k));
  const unmatched = jobKeywords
    .filter(k => !profileSet.has(k) && k.length >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 10);

  const score = Math.min(100, Math.round((matched.length / jobKeywords.length) * 100));

  return { score, matched: matched.slice(0, 15), unmatched };
}
