import assert from 'node:assert/strict';
import {
  isApplySectionSupported,
  profileProposalFingerprint,
  validateAndApplyProfileProposal,
} from '../modules/profileProposalApply.js';
import { validateProfileUpdateProposal } from '../modules/jobChat.js';
import { normalizeResumeContent } from '../modules/schema.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const baseProfile = normalizeResumeContent({
  summary: 'Old summary.',
  summaries: [{ label: 'General', text: 'Summary card should remain.' }],
  skills: ['Claims review', 'Documentation'],
  certifications: [
    { name: 'Claims Fundamentals', issuer: 'Insurance Institute', year: '2021' },
  ],
  experience: [{
    jobTitle: 'Claims Analyst',
    employer: 'Sun Life',
    dates: '2020 - 2022',
    startDate: '2020',
    endDate: '2022',
    bulletPoints: ['Reviewed claims.'],
  }],
  metadata: { lockedSections: {} },
});

function proposal(overrides = {}, profile = baseProfile) {
  return {
    type: 'profile_update_proposal',
    proposalVersion: 1,
    section: 'skills',
    action: 'add',
    confidence: 'user_stated',
    requiresConfirmation: true,
    summary: 'Add profile detail',
    target: null,
    proposedValue: 'Appeals coordination',
    warnings: [],
    sensitiveFields: [],
    sourceUserMessage: 'Update my profile',
    targetProfileId: 'p1',
    baseProfileFingerprint: profileProposalFingerprint(normalizeResumeContent(profile)),
    ...overrides,
  };
}

const skillsProfileBefore = clone(baseProfile);
const skillsResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({ proposedValue: ['Appeals coordination', ' Case notes '] }),
  activeProfileId: 'p1',
});

assert.equal(skillsResult.ok, true);
assert.equal(skillsResult.blocked, false);
assert.equal(skillsResult.patchSummary.section, 'skills');
assert.deepEqual(skillsResult.patchSummary.addedSkills, ['Appeals coordination', 'Case notes']);
assert.deepEqual(skillsResult.beforeProfile.skills, ['Claims review', 'Documentation']);
assert.deepEqual(skillsResult.afterProfile.skills, ['Claims review', 'Documentation', 'Appeals coordination', 'Case notes']);
assert.deepEqual(baseProfile, skillsProfileBefore);

const duplicateSkill = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({ proposedValue: ' claims   REVIEW ' }),
  activeProfileId: 'p1',
});

assert.equal(duplicateSkill.ok, false);
assert.equal(duplicateSkill.blocked, true);
assert.match(duplicateSkill.reasons.join('\n'), /Duplicate skill/i);

const duplicateProposedSkill = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({ proposedValue: ['Appeals coordination', ' appeals   COORDINATION '] }),
  activeProfileId: 'p1',
});

assert.equal(duplicateProposedSkill.ok, false);
assert.match(duplicateProposedSkill.reasons.join('\n'), /Duplicate skills inside the proposal/i);

const summaryResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'summary',
    action: 'update',
    proposedValue: { text: 'Updated summary only.' },
  }),
  activeProfileId: 'p1',
});

assert.equal(summaryResult.ok, true);
assert.equal(summaryResult.afterProfile.summary, 'Updated summary only.');
assert.deepEqual(summaryResult.afterProfile.summaries, baseProfile.summaries);
assert.deepEqual(summaryResult.patchSummary, {
  section: 'summary',
  action: 'update',
  before: 'Old summary.',
  after: 'Updated summary only.',
});

const certificationResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'certifications',
    action: 'add',
    proposedValue: {
      name: 'Claims Management Certificate',
      issuer: 'Claims College',
      year: '2024',
    },
  }),
  activeProfileId: 'p1',
});

assert.equal(certificationResult.ok, true);
assert.deepEqual(certificationResult.patchSummary.certification, {
  name: 'Claims Management Certificate',
  issuer: 'Claims College',
  year: '2024',
});
assert.deepEqual(certificationResult.afterProfile.certifications.at(-1), {
  name: 'Claims Management Certificate',
  issuer: 'Claims College',
  year: '2024',
});

const duplicateCertification = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'certifications',
    action: 'add',
    proposedValue: {
      name: 'claims fundamentals',
      issuer: 'Insurance Institute',
      year: '2021',
    },
  }),
  activeProfileId: 'p1',
});

assert.equal(duplicateCertification.ok, false);
assert.match(duplicateCertification.reasons.join('\n'), /Duplicate certification/i);

const experienceResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'experience',
    action: 'add',
    proposedValue: {
      title: 'Senior Claims Analyst',
      company: 'Blue Cross',
      location: 'Halifax, NS',
      dates: '2022 - 2024',
      responsibilities: 'Reviewed complex appeals',
    },
  }),
  activeProfileId: 'p1',
});

assert.equal(experienceResult.ok, true);
assert.equal(experienceResult.patchSummary.section, 'experience');
assert.equal(experienceResult.patchSummary.experience.jobTitle, 'Senior Claims Analyst');
assert.deepEqual(experienceResult.afterProfile.experience.at(-1), {
  jobTitle: 'Senior Claims Analyst',
  employer: 'Blue Cross',
  location: 'Halifax, NS',
  dates: '2022 - 2024',
  startDate: '2022',
  endDate: '2024',
  bulletPoints: ['Reviewed complex appeals'],
});

const experienceWithDescription = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'experience',
    action: 'add',
    proposedValue: {
      jobTitle: 'Claims Coordinator',
      employer: 'Medavie',
      dates: '2024 - Present',
      bulletPoints: ['Reviewed appeal files', 'Reviewed appeal files'],
      description: 'Prepared decision summaries',
    },
  }),
  activeProfileId: 'p1',
});

assert.equal(experienceWithDescription.ok, true);
assert.deepEqual(experienceWithDescription.afterProfile.experience.at(-1).bulletPoints, [
  'Reviewed appeal files',
  'Prepared decision summaries',
]);

const experienceWithDuplicateDescription = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'experience',
    action: 'add',
    proposedValue: {
      jobTitle: 'Claims Support Specialist',
      employer: 'Medavie',
      dates: '2024 - Present',
      bulletPoints: ['Prepared decision summaries'],
      description: ' prepared   DECISION summaries ',
    },
  }),
  activeProfileId: 'p1',
});

assert.equal(experienceWithDuplicateDescription.ok, true);
assert.deepEqual(experienceWithDuplicateDescription.afterProfile.experience.at(-1).bulletPoints, [
  'Prepared decision summaries',
]);

const incompleteExperience = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'experience',
    action: 'add',
    proposedValue: {
      jobTitle: 'Senior Claims Analyst',
      employer: 'Blue Cross',
    },
  }),
  activeProfileId: 'p1',
});

assert.equal(incompleteExperience.ok, false);
assert.match(incompleteExperience.reasons.join('\n'), /Incomplete experience/i);

const duplicateExperience = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'experience',
    action: 'add',
    proposedValue: {
      jobTitle: 'claims analyst',
      employer: 'SUN LIFE',
      dates: '2020 - 2022',
      bulletPoints: ['Another bullet'],
    },
  }),
  activeProfileId: 'p1',
});

assert.equal(duplicateExperience.ok, false);
assert.match(duplicateExperience.reasons.join('\n'), /Duplicate experience/i);

const lockedProfile = normalizeResumeContent({
  ...baseProfile,
  metadata: { lockedSections: { skills: true } },
});
const lockedResult = validateAndApplyProfileProposal({
  profile: lockedProfile,
  proposal: proposal({}, lockedProfile),
  activeProfileId: 'p1',
});

assert.equal(lockedResult.ok, false);
assert.match(lockedResult.reasons.join('\n'), /section is locked/i);

const sensitiveProposal = proposal({
  section: 'summary',
  action: 'update',
  proposedValue: { text: 'Add my disability advocacy experience.' },
});
const sensitiveNeedsConfirmation = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: sensitiveProposal,
  activeProfileId: 'p1',
});

assert.equal(sensitiveNeedsConfirmation.ok, false);
assert.equal(sensitiveNeedsConfirmation.blocked, false);
assert.equal(sensitiveNeedsConfirmation.needsConfirmation, true);
assert.equal(sensitiveNeedsConfirmation.afterProfile, null);

const sensitiveConfirmed = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: sensitiveProposal,
  activeProfileId: 'p1',
  confirmedSensitive: true,
});

assert.equal(sensitiveConfirmed.ok, true);
assert.equal(sensitiveConfirmed.needsConfirmation, false);
assert.equal(sensitiveConfirmed.afterProfile.summary, 'Add my disability advocacy experience.');

const activeProfileMismatch = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal(),
  activeProfileId: 'p2',
});

assert.equal(activeProfileMismatch.ok, false);
assert.match(activeProfileMismatch.reasons.join('\n'), /targetProfileId/i);

const staleFingerprint = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    baseProfileFingerprint: profileProposalFingerprint(normalizeResumeContent({
      ...baseProfile,
      summary: 'Different summary.',
    })),
  }),
  activeProfileId: 'p1',
});

assert.equal(staleFingerprint.ok, false);
assert.match(staleFingerprint.reasons.join('\n'), /fingerprint/i);

const unknownProposedValueKey = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'certifications',
    action: 'add',
    proposedValue: {
      name: 'Safe Cert',
      issuer: 'Issuer',
      year: '2025',
      extra: 'nope',
    },
  }),
  activeProfileId: 'p1',
});

assert.equal(unknownProposedValueKey.ok, false);
assert.match(unknownProposedValueKey.reasons.join('\n'), /Unknown proposedValue key: extra/i);

const blockedMetadataKey = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'experience',
    action: 'add',
    proposedValue: {
      jobTitle: 'Analyst',
      employer: 'Employer',
      metadata: { lockedSections: {} },
    },
  }),
  activeProfileId: 'p1',
});

assert.equal(blockedMetadataKey.ok, false);
assert.match(blockedMetadataKey.reasons.join('\n'), /Blocked proposal key: metadata/i);

[
  ['storage', { storage: { profile: baseProfile } }],
  ['chrome.storage', { 'chrome.storage': { local: {} } }],
  ['sourceResumeText', { sourceResumeText: 'resume text' }],
  ['sourceResumeName', { sourceResumeName: 'resume.pdf' }],
  ['drafts', { drafts: [] }],
  ['savedDrafts', { savedDrafts: {} }],
  ['saveProfile', { saveProfile: true }],
].forEach(([key, proposedValue]) => {
  const blockedResult = validateAndApplyProfileProposal({
    profile: baseProfile,
    proposal: proposal({
      section: 'experience',
      action: 'add',
      proposedValue: {
        jobTitle: 'Analyst',
        employer: 'Employer',
        ...proposedValue,
      },
    }),
    activeProfileId: 'p1',
  });

  assert.equal(blockedResult.ok, false);
  assert.match(blockedResult.reasons.join('\n'), new RegExp(`Blocked proposal key: ${key}`, 'i'));
});

const unknownTopLevelKey = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: {
    ...proposal(),
    unexpectedTopLevel: 'nope',
  },
  activeProfileId: 'p1',
});

assert.equal(unknownTopLevelKey.ok, false);
assert.match(unknownTopLevelKey.reasons.join('\n'), /Unknown proposal key: unexpectedTopLevel/i);

const unsupportedRemove = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    action: 'remove',
    proposedValue: ['Documentation'],
  }),
  activeProfileId: 'p1',
});

assert.equal(unsupportedRemove.ok, false);
assert.match(unsupportedRemove.reasons.join('\n'), /Unsupported action/i);

const unsupportedSection = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'education',
    action: 'add',
    proposedValue: {
      institution: 'NSCC',
      credential: 'Diploma',
    },
  }),
  activeProfileId: 'p1',
});

assert.equal(unsupportedSection.ok, false);
assert.match(unsupportedSection.reasons.join('\n'), /Unsupported section/i);

const unsupportedAction = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'skills',
    action: 'update',
    target: 'Documentation',
    proposedValue: 'Case documentation',
  }),
  activeProfileId: 'p1',
});

assert.equal(unsupportedAction.ok, false);
assert.match(unsupportedAction.reasons.join('\n'), /Unsupported action/i);

const profileBefore = clone(baseProfile);
const immutableResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'summary',
    action: 'update',
    proposedValue: 'Fresh summary.',
  }),
  activeProfileId: 'p1',
});

assert.equal(immutableResult.ok, true);
assert.deepEqual(baseProfile, profileBefore);
assert.notStrictEqual(immutableResult.beforeProfile, baseProfile);
assert.notStrictEqual(immutableResult.afterProfile, baseProfile);
assert.deepEqual(immutableResult.beforeProfile, normalizeResumeContent(profileBefore));
assert.deepEqual(immutableResult.afterProfile.coverLetterProfile, normalizeResumeContent(profileBefore).coverLetterProfile);

const jobChatValidatedProposal = validateProfileUpdateProposal({
  type: 'profile_update_proposal',
  proposalVersion: 1,
  section: 'skills',
  action: 'add',
  proposedValue: 'Appeals coordination',
  summary: 'Add skill',
  warnings: [],
  sensitiveFields: [],
}, 'Update my skills', {
  profile: baseProfile,
  activeProfileId: 'p1',
});

assert.equal(jobChatValidatedProposal.baseProfileFingerprint, profileProposalFingerprint(baseProfile));

// ---- isApplySectionSupported ----

assert.equal(isApplySectionSupported('skills', 'add'), true);
assert.equal(isApplySectionSupported('summary', 'update'), true);
assert.equal(isApplySectionSupported('experience', 'add'), false);
assert.equal(isApplySectionSupported('certifications', 'add'), false);
assert.equal(isApplySectionSupported('skills', 'remove'), false);
assert.equal(isApplySectionSupported('summary', 'add'), false);
assert.equal(isApplySectionSupported('education', 'add'), false);
assert.equal(isApplySectionSupported('projects', 'update'), false);
assert.equal(isApplySectionSupported('', 'add'), false);
assert.equal(isApplySectionSupported('skills', ''), false);

// ---- Apply eligibility checks (validation-only, no storage) ----

// Skills add: valid and eligible for real apply
const eligibleSkillsResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({ proposedValue: ['Code Review', ' Unit testing '] }),
  activeProfileId: 'p1',
});
assert.equal(eligibleSkillsResult.ok, true);
assert.equal(isApplySectionSupported(eligibleSkillsResult.section, eligibleSkillsResult.action), true);

// Summary update: valid and eligible for real apply
const eligibleSummaryResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'summary',
    action: 'update',
    proposedValue: { text: 'A new professional summary.' },
  }),
  activeProfileId: 'p1',
});
assert.equal(eligibleSummaryResult.ok, true);
assert.equal(isApplySectionSupported(eligibleSummaryResult.section, eligibleSummaryResult.action), true);

// Certification add: valid but NOT eligible for real apply (Phase 2D-3 scope)
const notYetCertResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'certifications',
    action: 'add',
    proposedValue: { name: 'First Aid', issuer: 'Red Cross', year: '2024' },
  }),
  activeProfileId: 'p1',
});
assert.equal(notYetCertResult.ok, true);
assert.equal(isApplySectionSupported(notYetCertResult.section, notYetCertResult.action), false);

// Experience add: valid but NOT eligible for real apply (Phase 2D-3 scope)
const notYetExpResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'experience',
    action: 'add',
    proposedValue: {
      jobTitle: 'Claims Support',
      employer: 'NTT Data',
      location: 'Remote',
      bulletPoints: ['Handled provider inquiries'],
    },
  }),
  activeProfileId: 'p1',
});
assert.equal(notYetExpResult.ok, true);
assert.equal(isApplySectionSupported(notYetExpResult.section, notYetExpResult.action), false);

// Duplicate skill: blocked, not eligible
const dupBlocked = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({ proposedValue: 'claims review' }),
  activeProfileId: 'p1',
});
assert.equal(dupBlocked.ok, false);
assert.equal(dupBlocked.blocked, true);
assert.equal(isApplySectionSupported(dupBlocked.section, dupBlocked.action), true);

// Stale fingerprint: blocked, not eligible
const staleFp = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    baseProfileFingerprint: profileProposalFingerprint(normalizeResumeContent({
      ...baseProfile,
      summary: 'Totally different summary.',
    })),
  }),
  activeProfileId: 'p1',
});
assert.equal(staleFp.ok, false);
assert.match(staleFp.reasons.join('\n'), /fingerprint/i);

// Active profile mismatch: blocked
const mismatch = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal(),
  activeProfileId: 'p2',
});
assert.equal(mismatch.ok, false);
assert.match(mismatch.reasons.join('\n'), /targetProfileId/i);

// Locked skills: blocked
const lockedSkillsResult = validateAndApplyProfileProposal({
  profile: normalizeResumeContent({ ...baseProfile, metadata: { lockedSections: { skills: true } } }),
  proposal: proposal({}, normalizeResumeContent({ ...baseProfile, metadata: { lockedSections: { skills: true } } })),
  activeProfileId: 'p1',
});
assert.equal(lockedSkillsResult.ok, false);
assert.match(lockedSkillsResult.reasons.join('\n'), /section is locked/i);

// Sensitive: needs confirmation
const sensitiveResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'summary',
    action: 'update',
    proposedValue: { text: 'Add my disability advocacy experience.' },
  }),
  activeProfileId: 'p1',
});
assert.equal(sensitiveResult.ok, false);
assert.equal(sensitiveResult.needsConfirmation, true);

// Sensitive confirmed: ok
const sensitiveOkResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'summary',
    action: 'update',
    proposedValue: { text: 'Add my disability advocacy experience.' },
  }),
  activeProfileId: 'p1',
  confirmedSensitive: true,
});
assert.equal(sensitiveOkResult.ok, true);

// ---- Guarded apply integration tests (mocked chrome.storage) ----

const storageStore = new Map();
global.chrome = {
  storage: {
    local: {
      async get(keys) {
        const result = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const key of keyList) {
          if (storageStore.has(key)) result[key] = JSON.parse(JSON.stringify(storageStore.get(key)));
        }
        return result;
      },
      async set(items) {
        for (const [key, value] of Object.entries(items)) {
          storageStore.set(key, JSON.parse(JSON.stringify(value)));
        }
      },
      async remove(key) {
        storageStore.delete(key);
      },
    },
  },
};

const { loadProfile, loadProfiles, saveProfile } = await import('../modules/profile.js');

async function guardedProfileApplyTest(afterProfile, expectedId, expectedFingerprint) {
  if (!expectedId) return { ok: false, error: 'No active profile ID available.' };
  const { activeId } = await loadProfiles();
  if (activeId !== expectedId) {
    return { ok: false, error: 'Active profile has changed. Please close and reopen the Apply Requirements Review.' };
  }
  const currentProfile = await loadProfile();
  const currentFingerprint = profileProposalFingerprint(currentProfile);
  if (currentFingerprint !== expectedFingerprint) {
    return { ok: false, error: 'Profile has changed since the proposal was created. Please review and try again.' };
  }
  try {
    await saveProfile(afterProfile);
    return { ok: true };
  } catch (_err) {
    return { ok: false, error: 'Failed to save profile.' };
  }
}

// Setup storage: activeProfileId = 'p1', profileIndex with one entry
const testProfileId = 'p1';
const testProfile = normalizeResumeContent({
  summary: 'Old summary.',
  skills: ['Claims review', 'Documentation'],
  certifications: [],
  experience: [],
  metadata: { lockedSections: {} },
});
storageStore.clear();
storageStore.set('profileIndex', [{ id: testProfileId, name: 'General' }]);
storageStore.set('activeProfileId', testProfileId);
storageStore.set('profile_p1', testProfile);

const initialFingerprint = profileProposalFingerprint(testProfile);

// Test: successful skills add saves afterProfile and fingerprint matches
const skillsAfterProfile = normalizeResumeContent({
  ...testProfile,
  skills: [...testProfile.skills, 'Appeals coordination'],
});
const skillsSaveResult = await guardedProfileApplyTest(skillsAfterProfile, testProfileId, initialFingerprint);
assert.equal(skillsSaveResult.ok, true);
const storedSkillsProfile = normalizeResumeContent(storageStore.get('profile_p1'));
assert.deepEqual(storedSkillsProfile.skills, ['Claims review', 'Documentation', 'Appeals coordination']);

// Reset for next test
storageStore.set('profile_p1', testProfile);

// Test: successful summary update saves afterProfile
const summaryAfterProfile = normalizeResumeContent({
  ...testProfile,
  summary: 'Updated summary.',
});
const summarySaveResult = await guardedProfileApplyTest(summaryAfterProfile, testProfileId, initialFingerprint);
assert.equal(summarySaveResult.ok, true);
const storedSummaryProfile = normalizeResumeContent(storageStore.get('profile_p1'));
assert.equal(storedSummaryProfile.summary, 'Updated summary.');

// Reset for next test
storageStore.set('profile_p1', testProfile);

// Test: stale fingerprint blocks apply
const staleFingerprintValue = 'fp_deadbeef';
const staleSaveResult = await guardedProfileApplyTest(skillsAfterProfile, testProfileId, staleFingerprintValue);
assert.equal(staleSaveResult.ok, false);
assert.match(staleSaveResult.error, /Profile has changed/i);
// Verify profile was NOT mutated
const unchangedProfile = normalizeResumeContent(storageStore.get('profile_p1'));
assert.deepEqual(unchangedProfile, testProfile);

// Reset for next test
storageStore.set('profile_p1', testProfile);

// Test: active profile mismatch blocks apply
const mismatchSaveResult = await guardedProfileApplyTest(skillsAfterProfile, 'p99', initialFingerprint);
assert.equal(mismatchSaveResult.ok, false);
assert.match(mismatchSaveResult.error, /Active profile has changed/i);
const unchangedAfterMismatch = normalizeResumeContent(storageStore.get('profile_p1'));
assert.deepEqual(unchangedAfterMismatch, testProfile);

// Test: duplicate skill blocks at validation level
const dupSkillApply = validateAndApplyProfileProposal({
  profile: testProfile,
  proposal: proposal({ proposedValue: 'Claims review' }),
  activeProfileId: testProfileId,
});
assert.equal(dupSkillApply.ok, false);
assert.equal(dupSkillApply.blocked, true);

// Test: no saveProfile or profile mutation for blocked proposals
assert.deepEqual(normalizeResumeContent(storageStore.get('profile_p1')), testProfile);

// Cleanup mock
delete global.chrome;

console.log('profileProposalApply checks passed');
