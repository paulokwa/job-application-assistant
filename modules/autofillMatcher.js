// modules/autofillMatcher.js
// Deterministic, rule-based matcher for autofill suggestions.
// Maps scanned form field descriptors to profile values using signal patterns.
// No AI, no guessing, no form submission.

/**
 * @typedef {Object} FieldDescriptor
 * @property {string} fieldId
 * @property {number} fieldIndex
 * @property {string} tagName
 * @property {string} type
 * @property {string} name
 * @property {string} id
 * @property {string} autocomplete
 * @property {string} ariaLabel
 * @property {string} placeholder
 * @property {string} labelText
 * @property {string} nearbyText
 * @property {string[]} options
 * @property {string} currentValue
 * @property {boolean} isVisible
 * @property {boolean} isDisabled
 * @property {boolean} isReadOnly
 * @property {boolean} isSensitive
 * @property {string|null} skipReason
 */

/**
 * @typedef {'high'|'medium'} MatchConfidence
 */

/**
 * @typedef {Object} MatchResult
 * @property {FieldDescriptor} field
 * @property {string} profileKey   - e.g. 'personalInfo.email'
 * @property {string} profileValue - the value from the active profile
 * @property {MatchConfidence} confidence
 * @property {string} reason       - human-readable explanation of why this matched
 */

/**
 * @typedef {Object} MatchSummary
 * @property {number} total     - all scanned fields
 * @property {number} matched   - fillable fields with a profile value found
 * @property {number} skipped   - sensitive / disabled / readonly fields
 * @property {number} unmatched - visible, fillable fields with no profile match
 */

/**
 * @typedef {Object} AutofillResult
 * @property {MatchResult[]} matches
 * @property {MatchSummary} summary
 */

// ── Signal helpers ────────────────────────────────────────────────────────────

function combined(field) {
  return [
    field.labelText,
    field.ariaLabel,
    field.placeholder,
    field.name,
    field.id,
    field.nearbyText,
  ].join(' ').toLowerCase();
}

// Returns true if any term appears anywhere in the field's combined signal string.
function hasSignal(field, ...terms) {
  const c = combined(field);
  return terms.some(t => c.includes(t));
}

// Returns true if the field's autocomplete attribute exactly matches one of the given values.
function hasAutocomplete(field, ...values) {
  return values.includes((field.autocomplete || '').toLowerCase());
}

// ── Name splitting helpers ────────────────────────────────────────────────────

function firstName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  return parts[0] || '';
}

function lastName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : '';
}

// ── City / province helpers ───────────────────────────────────────────────────
// Expects "City, Province" or just "City".

function cityPart(cityProvince) {
  return (cityProvince || '').split(',')[0].trim();
}

function provincePart(cityProvince) {
  const parts = (cityProvince || '').split(',');
  return parts.length > 1 ? parts[1].trim() : '';
}

// ── Matchers ──────────────────────────────────────────────────────────────────
// Tried in order — first match wins for each field.
// 'high'   → unambiguous; safe to pre-check in the review modal.
// 'medium' → reasonable inference; shown for review but not pre-checked.

const MATCHERS = [

  // ── Personal info ─────────────────────────────────────────────────────────

  {
    profileKey: 'personalInfo.fullName',
    get: p => p.personalInfo?.fullName || '',
    confidence: 'high',
    reason: 'autocomplete or label matches full name',
    test: f =>
      hasAutocomplete(f, 'name') ||
      hasSignal(f, 'full name', 'full_name', 'fullname', 'your name'),
  },
  {
    profileKey: 'personalInfo.firstName',
    get: p => firstName(p.personalInfo?.fullName),
    confidence: 'high',
    reason: 'autocomplete or label matches first / given name',
    test: f =>
      hasAutocomplete(f, 'given-name') ||
      hasSignal(f, 'first name', 'given name', 'firstname', 'given_name'),
  },
  {
    profileKey: 'personalInfo.lastName',
    get: p => lastName(p.personalInfo?.fullName),
    confidence: 'high',
    reason: 'autocomplete or label matches last / family name',
    test: f =>
      hasAutocomplete(f, 'family-name') ||
      hasSignal(f, 'last name', 'family name', 'surname', 'lastname', 'family_name'),
  },
  {
    profileKey: 'personalInfo.email',
    get: p => p.personalInfo?.email || '',
    confidence: 'high',
    reason: 'type=email, autocomplete, or label matches email',
    test: f =>
      f.type === 'email' ||
      hasAutocomplete(f, 'email') ||
      hasSignal(f, 'email'),
  },
  {
    profileKey: 'personalInfo.phone',
    get: p => p.personalInfo?.phone || '',
    confidence: 'high',
    reason: 'type=tel, autocomplete, or label matches phone',
    test: f =>
      f.type === 'tel' ||
      hasAutocomplete(f, 'tel') ||
      hasSignal(f, 'phone', 'telephone', 'mobile', 'cell number'),
  },
  {
    profileKey: 'personalInfo.linkedin',
    get: p => p.personalInfo?.linkedin || '',
    confidence: 'high',
    reason: 'label matches LinkedIn',
    test: f => hasSignal(f, 'linkedin'),
  },
  {
    profileKey: 'personalInfo.portfolio',
    get: p => p.personalInfo?.portfolio || p.personalInfo?.website || '',
    confidence: 'high',
    reason: 'label matches portfolio or personal website',
    test: f => hasSignal(f, 'portfolio', 'personal website', 'personal site', 'personal url'),
  },

  // ── Location — city before province so the city matcher takes a dedicated "city" field ──

  {
    profileKey: 'personalInfo.city',
    get: p => cityPart(p.personalInfo?.cityProvince),
    confidence: 'high',
    reason: 'autocomplete or label matches city',
    test: f =>
      hasAutocomplete(f, 'address-level2') ||
      hasSignal(f, 'city'),
  },
  {
    profileKey: 'personalInfo.province',
    get: p => provincePart(p.personalInfo?.cityProvince),
    confidence: 'medium',
    reason: 'autocomplete or label matches province / state',
    test: f =>
      hasAutocomplete(f, 'address-level1') ||
      hasSignal(f, 'province', 'state', 'region'),
  },

  // ── Most recent work experience ───────────────────────────────────────────

  {
    profileKey: 'experience[0].jobTitle',
    get: p => p.experience?.[0]?.jobTitle || '',
    confidence: 'high',
    reason: 'autocomplete or label matches current job title',
    test: f =>
      hasAutocomplete(f, 'organization-title') ||
      hasSignal(f, 'job title', 'position title', 'current title', 'current position', 'current role'),
  },
  {
    profileKey: 'experience[0].employer',
    get: p => p.experience?.[0]?.employer || '',
    confidence: 'high',
    reason: 'autocomplete or label matches employer / company',
    test: f =>
      hasAutocomplete(f, 'organization') ||
      hasSignal(f, 'employer', 'current employer', 'current company', 'company name', 'organization name'),
  },
  {
    profileKey: 'experience[0].startDate',
    get: p => p.experience?.[0]?.startDate || '',
    confidence: 'high',
    reason: 'label matches employment start date',
    test: f =>
      hasSignal(f, 'employment start', 'start date', 'start month', 'start year', 'from date', 'date started'),
  },
  {
    profileKey: 'experience[0].endDate',
    get: p => p.experience?.[0]?.endDate || '',
    confidence: 'high',
    reason: 'label matches employment end date',
    test: f =>
      hasSignal(f, 'employment end', 'end date', 'end month', 'end year', 'to date', 'date ended', 'date left'),
  },

  // ── Most recent education ─────────────────────────────────────────────────

  {
    profileKey: 'education[0].institution',
    get: p => p.education?.[0]?.institution || '',
    confidence: 'high',
    reason: 'label matches school or institution',
    test: f =>
      hasSignal(f, 'school name', 'university', 'college', 'institution', 'educational institution', 'school attended'),
  },
  {
    profileKey: 'education[0].credential',
    get: p => p.education?.[0]?.credential || '',
    confidence: 'high',
    reason: 'label matches degree or credential',
    test: f =>
      hasSignal(f, 'degree', 'credential', 'diploma', 'qualification', 'field of study', 'major', 'program name'),
  },
  {
    profileKey: 'education[0].dates',
    get: p => p.education?.[0]?.dates || '',
    confidence: 'medium',
    reason: 'label matches graduation or education dates',
    test: f =>
      hasSignal(f, 'graduation year', 'graduation date', 'grad year', 'graduated', 'education date'),
  },
];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Match scanned form fields against the active profile.
 * Returns match suggestions and a summary — does not touch the page.
 *
 * @param {FieldDescriptor[]} fields
 * @param {object} profile - the active profile from state.profile
 * @returns {AutofillResult}
 */
export function buildAutofillMatches(fields, profile) {
  if (!fields?.length || !profile) {
    return {
      matches: [],
      summary: { total: fields?.length ?? 0, matched: 0, skipped: 0, unmatched: 0 },
    };
  }

  const matches = [];
  let matched   = 0;
  let skipped   = 0;
  let unmatched = 0;

  for (const field of fields) {
    if (field.isSensitive || field.isDisabled || field.isReadOnly) {
      skipped++;
      continue;
    }

    let found = false;
    for (const matcher of MATCHERS) {
      if (!matcher.test(field)) continue;
      const value = matcher.get(profile);
      if (!value) continue;             // skip if profile has no value for this key
      matches.push({
        field,
        profileKey:   matcher.profileKey,
        profileValue: value,
        confidence:   matcher.confidence,
        reason:       matcher.reason,
      });
      matched++;
      found = true;
      break;                            // first match wins
    }

    if (!found) unmatched++;
  }

  return {
    matches,
    summary: { total: fields.length, matched, skipped, unmatched },
  };
}
