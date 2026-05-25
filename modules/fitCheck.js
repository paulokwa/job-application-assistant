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
  // Generic soft-skill and cultural boilerplate — appear in nearly every posting
  'thrive', 'foster', 'proactive', 'motivated', 'dedicated',
]);

/**
 * Tokenize a string into lowercase, stopword-filtered, meaningful tokens.
 * Applies one conservative normalization: tokens ending in "ies" with length >= 7
 * are rewritten to end in "y" (e.g. technologies → technology, responsibilities →
 * responsibility). No other stemming is applied.
 */
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^[-.,]+|[-.,]+$/g, ''))
    .map(w => w.length >= 7 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Normalize a multi-word label into a phrase string (lowercase, trimmed, single spaces).
 * Returns null if the entry has fewer than 2 whitespace-separated parts.
 * Used to preserve coherent labels from user-curated fields.
 */
function phraseFrom(text) {
  const trimmed = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return trimmed.includes(' ') ? trimmed : null;
}

/**
 * Extract keywords from a saved profile.
 * Sources: skills[], summary, summaries[], experience bullet points,
 *          certifications[], projects (technologies + description).
 *
 * User-curated fields (skills, certifications, project technologies) emit both
 * individual tokens AND the full normalized phrase for multi-word entries.
 * Phrases are identifiable in the returned array by containing a space character.
 * Summary and experience prose emit individual tokens only — phrase extraction
 * from prose produces too much noise.
 *
 * Returns a string[] of unique entries (tokens and phrase strings intermixed).
 */
export function extractProfileKeywords(profile) {
  const tokens = new Set();

  // Skills are user-curated — highest signal.
  // Add individual tokens AND the normalized phrase for multi-word entries.
  for (const skill of (profile?.skills || [])) {
    for (const t of tokenize(skill)) tokens.add(t);
    const phrase = phraseFrom(skill);
    if (phrase) tokens.add(phrase);
  }

  // Summary text — prose only, individual tokens.
  for (const t of tokenize(profile?.summary || '')) tokens.add(t);

  // Summaries array (labelled summary variants) — prose only.
  for (const s of (profile?.summaries || [])) {
    for (const t of tokenize(s?.text || '')) tokens.add(t);
  }

  // Experience bullet points — prose only, individual tokens.
  for (const exp of (profile?.experience || [])) {
    for (const bullet of (exp?.bulletPoints || [])) {
      for (const t of tokenize(bullet)) tokens.add(t);
    }
  }

  // Certifications — user-curated labels, same phrase treatment as skills.
  for (const cert of (profile?.certifications || [])) {
    for (const t of tokenize(cert)) tokens.add(t);
    const phrase = phraseFrom(cert);
    if (phrase) tokens.add(phrase);
  }

  // Projects: named technologies are user-curated (add phrase).
  // Description text is prose (individual tokens only).
  for (const proj of (profile?.projects || [])) {
    for (const tech of (proj?.technologies || [])) {
      for (const t of tokenize(tech)) tokens.add(t);
      const phrase = phraseFrom(tech);
      if (phrase) tokens.add(phrase);
    }
    for (const t of tokenize(proj?.description || '')) tokens.add(t);
  }

  return [...tokens];
}

/**
 * Extract meaningful keywords from raw job text.
 * Counts token frequency before deduplication: terms appearing more often
 * in the posting are more likely to be real requirements than incidental mentions.
 * Returns a string[] sorted by frequency descending, length descending as tiebreaker.
 */
export function extractJobKeywords(jobText) {
  const freq = new Map();
  for (const t of tokenize(jobText)) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return [...freq.keys()].sort(
    (a, b) => (freq.get(b) - freq.get(a)) || (b.length - a.length)
  );
}

/**
 * Score profile keywords against job keywords.
 *
 * Profile keywords may include phrase entries (strings containing a space) from
 * user-curated fields. Score is computed on individual token matches only, keeping
 * the denominator (jobKeywords.length) stable regardless of how many phrases the
 * profile carries.
 *
 * Matched display: when all meaningful constituent tokens of a profile phrase are
 * matched, the phrase is shown as one chip and its individual tokens are suppressed
 * from the display list. Partial matches fall back to showing the matched tokens
 * individually.
 *
 * Unmatched display: jobKeywords is pre-sorted by frequency (from extractJobKeywords),
 * so the capped display shows the most-repeated job requirements the profile misses.
 *
 * Returns:
 *   score    — 0–100, fraction of job tokens found in profile tokens
 *   matched  — phrase chips first, then remaining matched tokens (up to 15)
 *   unmatched — job tokens absent from profile, >= 4 chars, frequency-ordered, capped at 10
 */
export function scoreMatch(profileKeywords, jobKeywords) {
  if (!jobKeywords.length) {
    return { score: 0, matched: [], unmatched: [] };
  }

  // Separate phrases (contain space) from tokens (no space).
  // Score uses token matching only so the denominator does not change with phrase count.
  const profilePhrases = profileKeywords.filter(k => k.includes(' '));
  const profileTokenSet = new Set(profileKeywords.filter(k => !k.includes(' ')));

  const matchedTokens = jobKeywords.filter(k => profileTokenSet.has(k));
  const score = Math.min(100, Math.round((matchedTokens.length / jobKeywords.length) * 100));

  // Build matched display with phrase grouping.
  // For each profile phrase, derive its meaningful constituent tokens (same stopword
  // filter and normalization as tokenize). If every constituent is matched, show the
  // full phrase as one chip and suppress the individual tokens from the display.
  const matchedTokenSet = new Set(matchedTokens);
  const suppressedTokens = new Set();
  const phraseChips = [];

  for (const phrase of profilePhrases) {
    const constituents = tokenize(phrase);
    if (constituents.length === 0) continue;
    if (constituents.every(t => matchedTokenSet.has(t))) {
      phraseChips.push(phrase);
      for (const t of constituents) suppressedTokens.add(t);
    }
  }

  const matched = [
    ...phraseChips,
    ...matchedTokens.filter(t => !suppressedTokens.has(t)),
  ].slice(0, 15);

  // Unmatched: jobKeywords is already frequency-sorted; filter and cap.
  const unmatched = jobKeywords
    .filter(k => !profileTokenSet.has(k) && k.length >= 4)
    .slice(0, 10);

  return { score, matched, unmatched };
}
