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
 * @property {string} atsPlatform
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
 * @typedef {Object} EmploymentGroup
 * @property {number} index - 0-based experience array index this section was mapped to
 * @property {string} label - display label, e.g. "Employment — Acme Corp"
 */

/**
 * @typedef {Object} MatchResult
 * @property {FieldDescriptor} field
 * @property {string} profileKey   - e.g. 'personalInfo.email' or 'experience[1].employer'
 * @property {string} profileValue - the value from the active profile
 * @property {MatchConfidence} confidence
 * @property {string} reason       - human-readable explanation of why this matched
 * @property {EmploymentGroup} [employmentGroup] - set only when multi-section grouping is active
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

// ── Date conversion helpers ───────────────────────────────────────────────────
// Converts freeform profile date strings to MM/YYYY for ATS forms that require
// that format. Returns '' for unconvertible values (year-only, "Present",
// unknown months) so the caller's `if (!value)` guard prevents an empty fill.

const MONTH_MAP = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

function toMonthYear(dateStr) {
  if (!dateStr) return '';
  const s = dateStr.trim();
  if (/^\d{2}\/\d{4}$/.test(s)) return s;
  if (/^\d{2}-\d{4}$/.test(s)) return s.replace('-', '/');
  const m = s.match(/^([A-Za-z]+)[,\s]+(\d{4})$/);
  if (m) {
    const mm = MONTH_MAP[m[1].toLowerCase()];
    if (mm) return `${mm}/${m[2]}`;
  }
  return '';
}

// Splits a freeform dates string ("Oct 2020 – Dec 2021", "Jan 2019 - Present") into
// [startStr, endStr]. Uses \p{Dash} (Unicode Dash property) to cover all dash-like
// separators: hyphen-minus, en-dash, em-dash, figure dash, horizontal bar, minus sign, etc.
// Returns ['', ''] for unparseable input — callers treat '' as missing.
function splitDates(datesStr) {
  if (!datesStr) return ['', ''];
  const parts = datesStr.split(/\s*\p{Dash}\s*/u);
  return [parts[0]?.trim() || '', parts[1]?.trim() || ''];
}

// Extracts the two-digit month number from a freeform date string ("October 2023" → "10").
// Returns '' for year-only, "Present", or unknown months — callers' !value guard fires.
function toMonth(dateStr) {
  if (!dateStr) return '';
  const m = dateStr.trim().match(/^([A-Za-z]+)[,\s]+\d{4}$/);
  if (m) return MONTH_MAP[m[1].toLowerCase()] || '';
  return '';
}

// Extracts the four-digit year from a freeform date string ("October 2023" → "2023").
// Returns '' for "Present" or strings with no four-digit year.
function toYear(dateStr) {
  if (!dateStr) return '';
  const m = dateStr.match(/\b(\d{4})\b/);
  return m ? m[1] : '';
}

function toGraduationYear(datesStr) {
  if (!datesStr) return '';
  const matches = datesStr.match(/\b(\d{4})\b/g);
  return matches ? matches[matches.length - 1] : '';
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
    test: f => hasSignal(f,
      'portfolio', 'personal website', 'personal site', 'personal url',
      'github', 'github profile', 'github url',
    ),
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
      hasSignal(f, 'employer', 'company', 'current employer', 'current company', 'company name', 'organization name'),
  },
  {
    profileKey: 'experience[0].startDate',
    get: p => {
      const exp = p.experience?.[0];
      return exp?.startDate || splitDates(exp?.dates)[0];
    },
    confidence: 'high',
    reason: 'label matches employment start date',
    test: f =>
      hasSignal(f, 'employment start', 'start date', 'start month', 'start year', 'from date', 'date started'),
  },
  {
    profileKey: 'experience[0].endDate',
    get: p => {
      const exp = p.experience?.[0];
      return exp?.endDate || splitDates(exp?.dates)[1];
    },
    confidence: 'high',
    reason: 'label matches employment end date',
    test: f =>
      hasSignal(f, 'employment end', 'end date', 'end month', 'end year', 'to date', 'date ended', 'date left'),
  },

  // ── Work experience location ─────────────────────────────────────────────
  // Scoped to avoid matching personal address or city fields. Medium confidence
  // because the signal 'location' is broad; regrouping assigns it to the correct
  // experience[N] entry after section detection.

  {
    profileKey: 'experience[0].location',
    get: p => p.experience?.[0]?.location || '',
    confidence: 'medium',
    reason: 'label matches work location within an employment section',
    test: f =>
      !hasSignal(f,
        'city', 'home address', 'mailing address', 'residential',
        'zip', 'postal', 'country',
      ) &&
      hasSignal(f, 'location', 'work location', 'job location', 'office location', 'place of work'),
  },

  // ── Workday-style date fields (MM/YYYY format) ────────────────────────────
  // Companion matchers for ATS forms (e.g. Workday) that use From/To labels
  // with MM/YYYY placeholders. toMonthYear() converts freeform profile dates;
  // returns '' for unconvertible values so the if (!value) guard fires safely.
  // These come after the general date matchers so general forms match first.

  {
    profileKey: 'experience[0].startDate',
    get: p => {
      const exp = p.experience?.[0];
      return toMonthYear(exp?.startDate || splitDates(exp?.dates)[0]);
    },
    confidence: 'high',
    reason: 'From + MM/YYYY placeholder (Workday-style start date)',
    // Mutual exclusion (!hasSignal 'to') removed: nearbyText bleed causes From field
    // to contain 'to' from the adjacent To label, defeating the guard.
    test: f => hasSignal(f, 'mm/yyyy') && hasSignal(f, 'from'),
  },
  {
    profileKey: 'experience[0].endDate',
    get: p => {
      const exp = p.experience?.[0];
      return toMonthYear(exp?.endDate || splitDates(exp?.dates)[1]);
    },
    confidence: 'high',
    reason: 'To + MM/YYYY placeholder (Workday-style end date)',
    // Mutual exclusion (!hasSignal 'from') removed: same nearbyText bleed issue.
    test: f => hasSignal(f, 'mm/yyyy') && hasSignal(f, 'to'),
  },

  // ── Workday split Month / Year inputs ─────────────────────────────────────
  // Workday Work Experience sections split each date into two separate inputs.
  // Identified by id segments: startDate-dateSectionMonth, startDate-dateSectionYear,
  // endDate-dateSectionMonth, endDate-dateSectionYear.
  // toMonth / toYear extract the relevant part; '' for "Present" so the guard fires.

  {
    profileKey: 'experience[0].startDate',
    // Iterates experiences to find the first parseable start month so the flat pass
    // creates a match object even when experience[0] has year-only dates. Regrouping
    // then overwrites profileValue with the correct entry for each section.
    get: p => {
      for (const exp of (p.experience || [])) {
        const m = toMonth(exp?.startDate || splitDates(exp?.dates)[0]);
        if (m) return m;
      }
      return '';
    },
    confidence: 'medium',
    reason: 'Workday start-date Month input (id: startDate-dateSectionMonth)',
    test: f => hasSignal(f, 'startdate') && hasSignal(f, 'datesectionmonth'),
  },
  {
    profileKey: 'experience[0].startDate',
    get: p => {
      for (const exp of (p.experience || [])) {
        const y = toYear(exp?.startDate || splitDates(exp?.dates)[0]);
        if (y) return y;
      }
      return '';
    },
    confidence: 'medium',
    reason: 'Workday start-date Year input (id: startDate-dateSectionYear)',
    test: f => hasSignal(f, 'startdate') && hasSignal(f, 'datesectionyear'),
  },
  {
    profileKey: 'experience[0].endDate',
    get: p => {
      for (const exp of (p.experience || [])) {
        const m = toMonth(exp?.endDate || splitDates(exp?.dates)[1]);
        if (m) return m;
      }
      return '';
    },
    confidence: 'medium',
    reason: 'Workday end-date Month input (id: endDate-dateSectionMonth)',
    test: f => hasSignal(f, 'enddate') && hasSignal(f, 'datesectionmonth'),
  },
  {
    profileKey: 'experience[0].endDate',
    get: p => {
      for (const exp of (p.experience || [])) {
        const y = toYear(exp?.endDate || splitDates(exp?.dates)[1]);
        if (y) return y;
      }
      return '';
    },
    confidence: 'medium',
    reason: 'Workday end-date Year input (id: endDate-dateSectionYear)',
    test: f => hasSignal(f, 'enddate') && hasSignal(f, 'datesectionyear'),
  },

  // ── Employment responsibilities / duties ──────────────────────────────────

  {
    profileKey: 'experience[0].bulletPoints',
    get: p => (p.experience?.[0]?.bulletPoints || []).map(b => `- ${b}`).join('\n'),
    confidence: 'medium',
    reason: 'label matches responsibilities, duties, or job description',
    test: f =>
      f.tagName === 'textarea' &&
      !hasSignal(f,
        'cover letter', 'why do you want', 'reason for leaving', 'salary',
        'work authorization', 'legal declaration', 'demographic', 'equal opportunity',
      ) &&
      hasSignal(f,
        'responsibilities', 'duties', 'job description', 'role description',
        'key responsibilities', 'what you did', 'describe your role',
        'describe responsibilities', 'work description', 'main tasks',
        'job duties', 'position duties',
      ),
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
    // normalizeResumeContent already maps edu.year → edu.dates, so no year fallback needed here.
    get: p => p.education?.[0]?.dates || '',
    confidence: 'medium',
    reason: 'label matches graduation or education dates',
    // Exclude select fields — a freeform dates string like "2020 - 2022" won't match dropdown options.
    test: f =>
      f.tagName !== 'select' &&
      hasSignal(f,
        'graduation year', 'graduation date', 'grad year', 'graduated',
        'education date', 'education dates', 'school dates',
        'attended dates', 'dates attended',
      ),
  },
  {
    profileKey: 'education[0].dates',
    get: p => toGraduationYear(p.education?.[0]?.dates || ''),
    confidence: 'medium',
    reason: 'Graduation year select dropdown (last year extracted from education dates)',
    test: f =>
      f.tagName === 'select' &&
      hasSignal(f,
        'graduation year', 'grad year', 'year graduated', 'year of graduation',
        'year completed', 'completion year',
      ),
  },
];

// ── Employment section grouping ───────────────────────────────────────────────
// After the flat match pass, cluster experience[0].* matches into per-section groups
// and reassign each cluster to the corresponding profile.experience[N] entry.
// Only activates when two or more valid employment sections are detected.

// Maximum field-index gap before treating consecutive anchor fields as a new section.
// 4 works for Workday's layout: within-section gap is 1 (jobTitle→employer consecutive),
// between-section gap is ~8 (employer at index N, next jobTitle at N+8 with location,
// checkbox, 4 date inputs, and roleDesc textarea in between).
const EMPLOYMENT_GAP_THRESHOLD = 4;

// Anchor field types — only these drive gap-based cluster detection.
// startDate and endDate are intentionally excluded: on Workday each date is split into
// two separate Month/Year inputs, which would add 4 extra anchors per section and collapse
// the between-section gap to 2 (below the threshold of 4), breaking grouping detection.
// Date fields are handled by the post-clustering assignable pass instead.
const EMPLOYMENT_FIELD_TYPES = new Set(['employer', 'jobTitle']);

// Fields that are assigned to the correct cluster by post-clustering fieldIndex position
// rather than being used for gap detection.
const EXPERIENCE_ASSIGNABLE = new Set([
  'experience[0].startDate',
  'experience[0].endDate',
  'experience[0].location',
  'experience[0].bulletPoints',
]);

function fieldTypeFromKey(profileKey) {
  const dot = profileKey.lastIndexOf('.');
  return dot !== -1 ? profileKey.slice(dot + 1) : '';
}

function isEmploymentKey(profileKey) {
  return profileKey.startsWith('experience[0].') &&
    EMPLOYMENT_FIELD_TYPES.has(fieldTypeFromKey(profileKey));
}

// Returns { matches: MatchResult[], droppedCount: number }.
// droppedCount is the number of matches removed because the profile has no entry for that section.
function regroupEmploymentMatches(matches, profile) {
  // Only jobTitle and employer drive gap-based cluster detection (EMPLOYMENT_FIELD_TYPES).
  // All other experience fields — dates (split Month/Year or combined), location, bullets —
  // are assigned to clusters post-hoc by fieldIndex position (EXPERIENCE_ASSIGNABLE).
  const anchorMatches     = matches.filter(m => isEmploymentKey(m.profileKey));
  const assignableMatches = matches.filter(m => EXPERIENCE_ASSIGNABLE.has(m.profileKey));
  const otherMatches      = matches.filter(m =>
    !isEmploymentKey(m.profileKey) && !EXPERIENCE_ASSIGNABLE.has(m.profileKey),
  );

  if (anchorMatches.length === 0) return { matches, droppedCount: 0 };

  // Sort anchor matches by DOM order and cluster by fieldIndex gap.
  const sorted = [...anchorMatches].sort((a, b) => a.field.fieldIndex - b.field.fieldIndex);

  const clusters = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].field.fieldIndex - sorted[i - 1].field.fieldIndex;
    if (gap > EMPLOYMENT_GAP_THRESHOLD) {
      clusters.push(current);
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  clusters.push(current);

  // Validate: a cluster must contain at least two distinct anchor field types.
  const validClusters   = [];
  const fallbackMatches = [];

  for (const cluster of clusters) {
    const types = new Set(cluster.map(m => fieldTypeFromKey(m.profileKey)));
    if (types.size >= 2) {
      validClusters.push(cluster);
    } else {
      fallbackMatches.push(...cluster);
    }
  }

  // Only one valid section detected — no reassignment needed.
  if (validClusters.length <= 1) return { matches, droppedCount: 0 };

  // Compute the max fieldIndex of each cluster's anchor fields.
  // A bullet match at fieldIndex F belongs to cluster[i] if F < clusterMaxIndex[i+1],
  // or to the last cluster if F >= all clusterMaxIndex values.
  const clusterMaxIndex = validClusters.map(c =>
    Math.max(...c.map(m => m.field.fieldIndex))
  );

  const clusterAssignable = validClusters.map(() => []);
  for (const am of [...assignableMatches].sort((a, b) => a.field.fieldIndex - b.field.fieldIndex)) {
    let assigned = validClusters.length - 1;
    for (let i = 0; i < validClusters.length - 1; i++) {
      if (am.field.fieldIndex < clusterMaxIndex[i + 1]) {
        assigned = i;
        break;
      }
    }
    clusterAssignable[assigned].push(am);
  }

  // Reassign each valid cluster to profile.experience[N].
  const reassigned = [];
  let droppedCount = 0;

  for (let i = 0; i < validClusters.length; i++) {
    const expEntry = profile.experience?.[i];

    if (!expEntry) {
      droppedCount += validClusters[i].length + clusterAssignable[i].length;
      continue;
    }

    const employer   = expEntry.employer || expEntry.jobTitle || `Experience ${i + 1}`;
    const groupLabel = `Employment — ${employer}`;
    const sectionNum = i + 1;

    // Reassign anchor fields (jobTitle, employer only — dates are handled below).
    for (const match of validClusters[i]) {
      const fieldType = fieldTypeFromKey(match.profileKey);
      const value     = expEntry[fieldType] || '';

      if (!value) {
        droppedCount++;
        continue;
      }

      reassigned.push({
        ...match,
        profileKey:      `experience[${i}].${fieldType}`,
        profileValue:    value,
        confidence:      i === 0 ? match.confidence : 'medium',
        reason:          `Matched ${fieldType} field in detected employment section ${sectionNum}`,
        employmentGroup: { index: i, label: groupLabel },
      });
    }

    // Reassign dates, location, and bullets within this section's DOM range.
    // Date fields apply the appropriate transformation based on the field's id signals:
    // split Month/Year inputs use toMonth()/toYear(); MM/YYYY combined use toMonthYear();
    // general freeform inputs get the raw string. splitDates() provides a fallback when
    // the profile stores dates as a single string rather than separate startDate/endDate.
    for (const match of clusterAssignable[i]) {
      const fieldType = fieldTypeFromKey(match.profileKey);
      let value;
      if (fieldType === 'bulletPoints') {
        value = (expEntry.bulletPoints || []).map(b => `- ${b}`).join('\n');
      } else if (fieldType === 'startDate' || fieldType === 'endDate') {
        const [s, e] = splitDates(expEntry.dates);
        const raw = expEntry[fieldType] || (fieldType === 'startDate' ? s : e);
        if (hasSignal(match.field, 'datesectionmonth'))    value = toMonth(raw) || '';
        else if (hasSignal(match.field, 'datesectionyear')) value = toYear(raw) || '';
        else if (hasSignal(match.field, 'mm/yyyy'))         value = toMonthYear(raw) || '';
        else                                                value = raw;
      } else {
        value = expEntry[fieldType] || '';
      }

      if (!value) {
        droppedCount++;
        continue;
      }

      reassigned.push({
        ...match,
        profileKey:      `experience[${i}].${fieldType}`,
        profileValue:    value,
        confidence:      'medium',
        reason:          `Matched ${fieldType} field in detected employment section ${sectionNum}`,
        employmentGroup: { index: i, label: groupLabel },
      });
    }
  }

  return {
    matches: [...otherMatches, ...fallbackMatches, ...reassigned],
    droppedCount,
  };
}

// ── Education section grouping ────────────────────────────────────────────────
// Same clustering model as employment grouping.
// Reassigns education[0].* matches into per-section groups so Education 2
// maps to education[1] rather than duplicating education[0].

const EDUCATION_GAP_THRESHOLD = 3;
const EDUCATION_FIELD_TYPES = new Set(['institution', 'credential', 'dates']);

function isEducationKey(profileKey) {
  return profileKey.startsWith('education[0].') &&
    EDUCATION_FIELD_TYPES.has(fieldTypeFromKey(profileKey));
}

// Returns { matches: MatchResult[], droppedCount: number }.
function regroupEducationMatches(matches, profile) {
  const eduMatches   = matches.filter(m => isEducationKey(m.profileKey));
  const otherMatches = matches.filter(m => !isEducationKey(m.profileKey));

  if (eduMatches.length === 0) return { matches, droppedCount: 0 };

  const sorted = [...eduMatches].sort((a, b) => a.field.fieldIndex - b.field.fieldIndex);

  const clusters = [];
  const isWorkday = sorted.some(m => m.field.atsPlatform === 'workday');
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].field.fieldIndex - sorted[i - 1].field.fieldIndex;
    const fieldType = fieldTypeFromKey(sorted[i].profileKey);
    const currentTypes = new Set(current.map(m => fieldTypeFromKey(m.profileKey)));

    // Workday places Education 2 immediately after Education 1, so the generic
    // field-index gap is not enough to identify a new section. A repeated school
    // anchor is the stable section boundary on Workday's dense education layout.
    const startsDenseWorkdaySection =
      isWorkday &&
      fieldType === 'institution' &&
      currentTypes.has('institution');

    if (gap > EDUCATION_GAP_THRESHOLD || startsDenseWorkdaySection) {
      clusters.push(current);
      current = [sorted[i]];
    } else {
      current.push(sorted[i]);
    }
  }
  clusters.push(current);

  const validClusters   = [];
  const fallbackMatches = [];

  for (const cluster of clusters) {
    const types = new Set(cluster.map(m => fieldTypeFromKey(m.profileKey)));
    if (types.size >= 2) {
      validClusters.push(cluster);
    } else {
      fallbackMatches.push(...cluster);
    }
  }

  if (validClusters.length <= 1) return { matches, droppedCount: 0 };

  const reassigned = [];
  let droppedCount = 0;

  for (let i = 0; i < validClusters.length; i++) {
    const eduEntry = profile.education?.[i];

    if (!eduEntry) {
      droppedCount += validClusters[i].length;
      continue;
    }

    const label      = `Education — ${eduEntry.institution || `Education ${i + 1}`}`;
    const sectionNum = i + 1;

    for (const match of validClusters[i]) {
      const fieldType = fieldTypeFromKey(match.profileKey);
      let value = eduEntry[fieldType] || '';
      if (
        fieldType === 'dates' &&
        match.field.tagName === 'select' &&
        hasSignal(
          match.field,
          'graduation year', 'grad year', 'year graduated', 'year of graduation',
          'year completed', 'completion year'
        )
      ) {
        value = toGraduationYear(value);
      }

      if (!value) {
        droppedCount++;
        continue;
      }

      reassigned.push({
        ...match,
        profileKey:   `education[${i}].${fieldType}`,
        profileValue: value,
        confidence:   i === 0 ? match.confidence : 'medium',
        reason:       `Matched ${fieldType} field in detected education section ${sectionNum}`,
      });
    }
  }

  return {
    matches: [...otherMatches, ...fallbackMatches, ...reassigned],
    droppedCount,
  };
}

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

  const { matches: empGrouped, droppedCount: empDropped } = regroupEmploymentMatches(matches, profile);
  const { matches: grouped,   droppedCount: eduDropped }  = regroupEducationMatches(empGrouped, profile);
  const droppedCount = empDropped + eduDropped;

  return {
    matches: grouped,
    summary: {
      total:     fields.length,
      matched:   matched - droppedCount,
      skipped,
      unmatched: unmatched + droppedCount,
    },
  };
}
