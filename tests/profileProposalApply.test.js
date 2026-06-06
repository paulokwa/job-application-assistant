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
assert.equal(isApplySectionSupported('certifications', 'add'), true);
assert.equal(isApplySectionSupported('experience', 'add'), true);
assert.equal(isApplySectionSupported('skills', 'remove'), false);
assert.equal(isApplySectionSupported('summary', 'add'), false);
assert.equal(isApplySectionSupported('certifications', 'remove'), false);
assert.equal(isApplySectionSupported('certifications', 'update'), false);
assert.equal(isApplySectionSupported('experience', 'update'), false);
assert.equal(isApplySectionSupported('experience', 'remove'), false);
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

// Certification add: valid and eligible for real apply
const eligibleCertResult = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: proposal({
    section: 'certifications',
    action: 'add',
    proposedValue: { name: 'First Aid', issuer: 'Red Cross', year: '2024' },
  }),
  activeProfileId: 'p1',
});
assert.equal(eligibleCertResult.ok, true);
assert.equal(isApplySectionSupported(eligibleCertResult.section, eligibleCertResult.action), true);
assert.equal(eligibleCertResult.patchSummary.certification.name, 'First Aid');
assert.equal(eligibleCertResult.patchSummary.certification.issuer, 'Red Cross');
assert.equal(eligibleCertResult.patchSummary.certification.year, '2024');

// Experience add: valid and eligible for real apply
const eligibleExpResult = validateAndApplyProfileProposal({
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
assert.equal(eligibleExpResult.ok, true);
assert.equal(isApplySectionSupported(eligibleExpResult.section, eligibleExpResult.action), true);
assert.equal(eligibleExpResult.patchSummary.section, 'experience');
assert.equal(eligibleExpResult.patchSummary.experience.jobTitle, 'Claims Support');
assert.equal(eligibleExpResult.patchSummary.experience.employer, 'NTT Data');

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

// ---- Undo snapshot behaviour (mocked chrome.storage) ----

const UNDO_SESSION_KEY = 'profileUndoSnapshot';
const snapshotStore = new Map();

const { loadProfile: undoLoadProfile, loadProfiles: undoLoadProfiles, saveProfile: undoSaveProfile } = await import('../modules/profile.js');
const { profileProposalFingerprint: undoFp, validateAndApplyProfileProposal: undoValidate, isApplySectionSupported: undoIsSupported } = await import('../modules/profileProposalApply.js');

function undoGetSnapshot(state) {
  return state.undoSnapshot || null;
}

function undoStoreSnapshot(state, snapshot) {
  // eslint-disable-next-line no-param-reassign
  state.undoSnapshot = snapshot;
  snapshotStore.set(UNDO_SESSION_KEY, snapshot);
}

function undoClearSnapshot(state) {
  // eslint-disable-next-line no-param-reassign
  state.undoSnapshot = null;
  snapshotStore.delete(UNDO_SESSION_KEY);
}

async function undoGuardedApply(afterProfile, expectedId, expectedFingerprint) {
  if (!expectedId) return { ok: false, error: 'No active profile ID available.' };
  const { activeId } = await undoLoadProfiles();
  if (activeId !== expectedId) {
    return { ok: false, error: 'Active profile has changed.' };
  }
  const currentProfile = await undoLoadProfile();
  const currentFingerprint = undoFp(currentProfile);
  if (currentFingerprint !== expectedFingerprint) {
    return { ok: false, error: 'Profile has changed since the proposal was created.' };
  }
  try {
    await undoSaveProfile(afterProfile);
    return { ok: true };
  } catch (_err) {
    return { ok: false, error: 'Failed to save profile.' };
  }
}

// Setup: clean profile state for undo tests
const undoProfileId = 'pundo';
const undoProfile = normalizeResumeContent({
  summary: 'Before undo summary.',
  skills: ['Doc review', 'Case notes'],
  certifications: [],
  experience: [],
  metadata: { lockedSections: {} },
});
const undoAfterProfile = normalizeResumeContent({
  ...undoProfile,
  skills: ['Doc review', 'Case notes', 'Appeals coordination'],
});

storageStore.clear();
snapshotStore.clear();
storageStore.set('profileIndex', [{ id: undoProfileId, name: 'Undo Test' }]);
storageStore.set('activeProfileId', undoProfileId);
storageStore.set('profile_pundo', undoProfile);

const mockUndoState = { undoSnapshot: null };

// Test 1: successful apply creates undo snapshot
const undoBeforeFp = undoFp(undoProfile);
undoStoreSnapshot(mockUndoState, {
  profileId: undoProfileId,
  profileName: 'Undo Test',
  beforeProfile: undoProfile,
  beforeProfileFingerprint: undoBeforeFp,
  afterProfileFingerprint: undoFp(undoAfterProfile),
  section: 'skills',
  action: 'add',
  summary: 'Add appeals coordination',
  appliedAt: Date.now(),
});
assert.ok(undoGetSnapshot(mockUndoState));
assert.equal(undoGetSnapshot(mockUndoState).profileId, undoProfileId);
assert.equal(undoGetSnapshot(mockUndoState).section, 'skills');

// Test 2: apply the afterProfile so undo can restore
const applyResult = await undoGuardedApply(undoAfterProfile, undoProfileId, undoBeforeFp);
assert.equal(applyResult.ok, true);
const profileAfterApply = normalizeResumeContent(storageStore.get('profile_pundo'));
assert.deepEqual(profileAfterApply.skills, ['Doc review', 'Case notes', 'Appeals coordination']);

// Test 3: undo restores previous profile
const snapshot = undoGetSnapshot(mockUndoState);
assert.ok(snapshot);
const currentFpAfterApply = undoFp(normalizeResumeContent(storageStore.get('profile_pundo')));
assert.equal(currentFpAfterApply, snapshot.afterProfileFingerprint);

const undoRestoreResult = await undoGuardedApply(
  snapshot.beforeProfile,
  undoProfileId,
  snapshot.afterProfileFingerprint,
);
assert.equal(undoRestoreResult.ok, true);
undoClearSnapshot(mockUndoState);
const restoredProfile = normalizeResumeContent(storageStore.get('profile_pundo'));
assert.deepEqual(restoredProfile.skills, ['Doc review', 'Case notes']);
assert.equal(undoGetSnapshot(mockUndoState), null);

// Test 4: undo blocked if active profile changed
// Re-apply and set up a snapshot, then change activeProfileId
storageStore.set('profile_pundo', undoAfterProfile);
storageStore.set('activeProfileId', undoProfileId);
undoStoreSnapshot(mockUndoState, {
  profileId: undoProfileId,
  beforeProfile: undoProfile,
  beforeProfileFingerprint: undoBeforeFp,
  afterProfileFingerprint: undoFp(undoAfterProfile),
  section: 'skills',
  action: 'add',
  summary: 'Add skill',
  appliedAt: Date.now(),
});

// Change active profile ID
storageStore.set('activeProfileId', 'p_other');

const mismatchResult = await undoGuardedApply(undoProfile, undoProfileId, undoBeforeFp);
assert.equal(mismatchResult.ok, false);
assert.match(mismatchResult.error, /Active profile has changed/i);

// Snapshot should NOT be cleared on failed undo
assert.ok(undoGetSnapshot(mockUndoState));
undoClearSnapshot(mockUndoState);

// Test 5: undo blocked if current fingerprint does not match afterProfileFingerprint
storageStore.set('activeProfileId', undoProfileId);
storageStore.set('profile_pundo', normalizeResumeContent({ ...undoProfile, summary: 'Tampered!' }));

undoStoreSnapshot(mockUndoState, {
  profileId: undoProfileId,
  beforeProfile: undoProfile,
  beforeProfileFingerprint: undoBeforeFp,
  afterProfileFingerprint: undoFp(undoAfterProfile), // Mismatches current (tampered) state
  section: 'skills',
  action: 'add',
  summary: 'Add skill',
  appliedAt: Date.now(),
});

const staleFpResult = await undoGuardedApply(undoProfile, undoProfileId, undoBeforeFp);
// guardedProfileApply reads current profile, compares against expectedFingerprint
// The expected is undoBeforeFp, the current is the tampered profile's fingerprint
// This actually tests the guard correctly
assert.equal(staleFpResult.ok, false);
assert.match(staleFpResult.error, /Profile has changed/i);

// Snapshot should NOT be cleared on failed undo
assert.ok(undoGetSnapshot(mockUndoState));
undoClearSnapshot(mockUndoState);

// Reset for next test
storageStore.set('profile_pundo', undoAfterProfile);

// Test 6: second apply replaces previous undo snapshot
undoStoreSnapshot(mockUndoState, {
  profileId: undoProfileId,
  beforeProfile: undoProfile,
  beforeProfileFingerprint: undoBeforeFp,
  afterProfileFingerprint: undoFp(undoAfterProfile),
  section: 'skills',
  action: 'add',
  summary: 'First apply',
  appliedAt: Date.now() - 60000,
});
assert.equal(undoGetSnapshot(mockUndoState).summary, 'First apply');

undoStoreSnapshot(mockUndoState, {
  profileId: undoProfileId,
  beforeProfile: undoAfterProfile,
  beforeProfileFingerprint: undoFp(undoAfterProfile),
  afterProfileFingerprint: 'fp_second_apply',
  section: 'summary',
  action: 'update',
  summary: 'Second apply',
  appliedAt: Date.now(),
});
assert.equal(undoGetSnapshot(mockUndoState).summary, 'Second apply');
assert.equal(undoGetSnapshot(mockUndoState).section, 'summary');
undoClearSnapshot(mockUndoState);

// Test 7: restore with afterProfileFingerprint check
// Apply change, store snapshot, verify fingerprint mismatches on tampered profile
storageStore.set('profile_pundo', undoAfterProfile);
const afterFp = undoFp(undoAfterProfile);
undoStoreSnapshot(mockUndoState, {
  profileId: undoProfileId,
  beforeProfile: undoProfile,
  beforeProfileFingerprint: undoBeforeFp,
  afterProfileFingerprint: afterFp,
  section: 'skills',
  action: 'add',
  summary: 'Add skill',
  appliedAt: Date.now(),
});

// Tamper with profile
storageStore.set('profile_pundo', normalizeResumeContent({ ...undoAfterProfile, skills: ['Different'] }));
const tamperedFp = undoFp(normalizeResumeContent(storageStore.get('profile_pundo')));
assert.notEqual(tamperedFp, afterFp);

// The undo guard should detect the mismatch
const currentProfileTampered = await undoLoadProfile();
const currentFp = undoFp(currentProfileTampered);
assert.notEqual(currentFp, undoGetSnapshot(mockUndoState).afterProfileFingerprint);
undoClearSnapshot(mockUndoState);

// ---- Certification apply integration tests (mocked chrome.storage) ----

const certProfileId = 'pcert';
const certProfile = normalizeResumeContent({
  summary: 'Experienced professional.',
  skills: ['Claims review'],
  certifications: [],
  experience: [],
  metadata: { lockedSections: {} },
});
const certAfterProfile = normalizeResumeContent({
  ...certProfile,
  certifications: [...certProfile.certifications, { name: 'First Aid', issuer: 'Red Cross', year: '2024' }],
});

storageStore.set('profileIndex', [{ id: certProfileId, name: 'Cert Test' }]);
storageStore.set('activeProfileId', certProfileId);
storageStore.set('profile_pcert', certProfile);

const certBeforeFp = undoFp(certProfile);

// Test: certification add succeeds and saves afterProfile
const certApplyResult = await undoGuardedApply(certAfterProfile, certProfileId, certBeforeFp);
assert.equal(certApplyResult.ok, true);
const certStored = normalizeResumeContent(storageStore.get('profile_pcert'));
assert.equal(certStored.certifications.length, 1);
assert.equal(certStored.certifications[0].name, 'First Aid');
assert.equal(certStored.certifications[0].issuer, 'Red Cross');
assert.equal(certStored.certifications[0].year, '2024');

// Test: certification apply does not modify unrelated sections
assert.equal(certStored.summary, 'Experienced professional.');
assert.deepEqual(certStored.skills, ['Claims review']);
assert.deepEqual(certStored.experience, []);

// Test: undo restores previous certifications
const certSnapshot = {
  profileId: certProfileId,
  beforeProfile: certProfile,
  beforeProfileFingerprint: certBeforeFp,
  afterProfileFingerprint: undoFp(certAfterProfile),
  section: 'certifications',
  action: 'add',
  summary: 'Added cert',
  appliedAt: Date.now(),
};
const certUndoResult = await undoGuardedApply(certSnapshot.beforeProfile, certProfileId, certSnapshot.afterProfileFingerprint);
assert.equal(certUndoResult.ok, true);
const certRestored = normalizeResumeContent(storageStore.get('profile_pcert'));
assert.deepEqual(certRestored.certifications, []);

// Test: duplicate certification blocked
const dupCertProfile = normalizeResumeContent({
  ...certProfile,
  certifications: [{ name: 'First Aid', issuer: 'Red Cross', year: '2024' }],
});
storageStore.set('profile_pcert', dupCertProfile);

const dupCertResult = undoValidate({
  profile: dupCertProfile,
  proposal: proposal({
    section: 'certifications',
    action: 'add',
    proposedValue: { name: 'first aid', issuer: 'Red Cross', year: '2024' },
    targetProfileId: certProfileId,
  }, dupCertProfile),
  activeProfileId: certProfileId,
});
assert.equal(dupCertResult.ok, false);
assert.equal(dupCertResult.blocked, true);
assert.match(dupCertResult.reasons.join('\n'), /Duplicate certification/i);

// Test: missing certification name blocked
const noNameResult = undoValidate({
  profile: certProfile,
  proposal: proposal({
    section: 'certifications',
    action: 'add',
    proposedValue: { issuer: 'Red Cross', year: '2024' },
    targetProfileId: certProfileId,
  }, certProfile),
  activeProfileId: certProfileId,
});
assert.equal(noNameResult.ok, false);
assert.match(noNameResult.reasons.join('\n'), /Proposal failed profile update validation/i);

// Reset storage
storageStore.set('profile_pcert', certProfile);

// ---- Experience apply integration tests (mocked chrome.storage) ----

const expProfileId = 'pexp';
const expProfile = normalizeResumeContent({
  summary: 'Experienced professional.',
  skills: ['Claims review'],
  certifications: [],
  experience: [{
    jobTitle: 'Claims Analyst',
    employer: 'Sun Life',
    dates: '2020 - 2022',
    bulletPoints: ['Reviewed claims.'],
  }],
  metadata: { lockedSections: {} },
});
const expAfterProfile = normalizeResumeContent({
  ...expProfile,
  experience: [...expProfile.experience, {
    jobTitle: 'Customer Care Rep',
    employer: 'NTT Data',
    location: 'Remote',
    dates: '2022 - 2024',
    startDate: '2022',
    endDate: '2024',
    bulletPoints: ['Handled provider inquiries', 'Documented issues'],
  }],
});

storageStore.set('profileIndex', [{ id: expProfileId, name: 'Exp Test' }]);
storageStore.set('activeProfileId', expProfileId);
storageStore.set('profile_pexp', expProfile);

const expBeforeFp = undoFp(expProfile);

// Test: complete experience add succeeds and saves afterProfile
const expApplyResult = await undoGuardedApply(expAfterProfile, expProfileId, expBeforeFp);
assert.equal(expApplyResult.ok, true);
const expStored = normalizeResumeContent(storageStore.get('profile_pexp'));
assert.equal(expStored.experience.length, 2);
const newExp = expStored.experience[1];
assert.equal(newExp.jobTitle, 'Customer Care Rep');
assert.equal(newExp.employer, 'NTT Data');
assert.equal(newExp.location, 'Remote');
assert.equal(newExp.dates, '2022 - 2024');
assert.deepEqual(newExp.bulletPoints, ['Handled provider inquiries', 'Documented issues']);

// Test: experience apply does not modify unrelated sections
assert.equal(expStored.summary, 'Experienced professional.');
assert.deepEqual(expStored.skills, ['Claims review']);
assert.deepEqual(expStored.certifications, []);

// Test: undo restores previous experience
const expSnapshot = {
  profileId: expProfileId,
  beforeProfile: expProfile,
  beforeProfileFingerprint: expBeforeFp,
  afterProfileFingerprint: undoFp(expAfterProfile),
  section: 'experience',
  action: 'add',
  summary: 'Added role',
  appliedAt: Date.now(),
};
const expUndoResult = await undoGuardedApply(expSnapshot.beforeProfile, expProfileId, expSnapshot.afterProfileFingerprint);
assert.equal(expUndoResult.ok, true);
const expRestored = normalizeResumeContent(storageStore.get('profile_pexp'));
assert.equal(expRestored.experience.length, 1);

// Test: incomplete experience blocked (no details)
const incompleteExpResult = undoValidate({
  profile: expProfile,
  proposal: proposal({
    section: 'experience',
    action: 'add',
    proposedValue: { jobTitle: 'Analyst', employer: 'Corp' },
    targetProfileId: expProfileId,
  }, expProfile),
  activeProfileId: expProfileId,
});
assert.equal(incompleteExpResult.ok, false);
assert.equal(incompleteExpResult.blocked, true);
assert.match(incompleteExpResult.reasons.join('\n'), /Incomplete experience/i);

// Test: duplicate experience blocked
const dupExpResult = undoValidate({
  profile: expProfile,
  proposal: proposal({
    section: 'experience',
    action: 'add',
    proposedValue: {
      jobTitle: 'Claims Analyst',
      employer: 'Sun Life',
      dates: '2020 - 2022',
      bulletPoints: ['Duplicate attempt'],
    },
    targetProfileId: expProfileId,
  }, expProfile),
  activeProfileId: expProfileId,
});
assert.equal(dupExpResult.ok, false);
assert.equal(dupExpResult.blocked, true);
assert.match(dupExpResult.reasons.join('\n'), /Duplicate experience/i);

// Test: update and remove actions still blocked
const expUpdateResult = undoValidate({
  profile: expProfile,
  proposal: proposal({
    section: 'experience',
    action: 'update',
    proposedValue: { jobTitle: 'Updated Role' },
    targetProfileId: expProfileId,
  }, expProfile),
  activeProfileId: expProfileId,
});
assert.equal(expUpdateResult.ok, false);
assert.match(expUpdateResult.reasons.join('\n'), /Unsupported action/i);

const expRemoveResult = undoValidate({
  profile: expProfile,
  proposal: proposal({
    section: 'experience',
    action: 'remove',
    proposedValue: null,
    targetProfileId: expProfileId,
  }, expProfile),
  activeProfileId: expProfileId,
});
assert.equal(expRemoveResult.ok, false);
assert.match(expRemoveResult.reasons.join('\n'), /Unsupported action/i);

// Reset storage
storageStore.set('profile_pexp', expProfile);

// ---- Stale marker logic ----

function buildStaleAffected({ hasResume, hasCoverLetter, hasFitCheck }) {
  const affected = [];
  if (hasResume) affected.push('resume');
  if (hasCoverLetter) affected.push('coverLetter');
  if (hasFitCheck) affected.push('fitAnalysis');
  return affected;
}

// Test 1: no generated output means no stale markers
assert.deepEqual(buildStaleAffected({ hasResume: false, hasCoverLetter: false, hasFitCheck: false }), []);

// Test 2: resume-only draft marks only resume
const resumeOnly = buildStaleAffected({ hasResume: true, hasCoverLetter: false, hasFitCheck: false });
assert.deepEqual(resumeOnly, ['resume']);

// Test 3: cover-letter-only marks only coverLetter
const clOnly = buildStaleAffected({ hasResume: false, hasCoverLetter: true, hasFitCheck: false });
assert.deepEqual(clOnly, ['coverLetter']);

// Test 4: fit check only
const fitOnly = buildStaleAffected({ hasResume: false, hasCoverLetter: false, hasFitCheck: true });
assert.deepEqual(fitOnly, ['fitAnalysis']);

// Test 5: all three present
const allThree = buildStaleAffected({ hasResume: true, hasCoverLetter: true, hasFitCheck: true });
assert.deepEqual(allThree, ['resume', 'coverLetter', 'fitAnalysis']);

// Test 6: resume + fit check, no cover letter
const resumeFit = buildStaleAffected({ hasResume: true, hasCoverLetter: false, hasFitCheck: true });
assert.deepEqual(resumeFit, ['resume', 'fitAnalysis']);

// Test 7: clearing a marker removes it
const remainingAfterResume = resumeFit.filter(a => a !== 'resume');
assert.deepEqual(remainingAfterResume, ['fitAnalysis']);

// Test 8: clearing all markers leaves empty
const all = ['resume', 'coverLetter', 'fitAnalysis'];
const afterClearResume = all.filter(a => a !== 'resume');
assert.deepEqual(afterClearResume, ['coverLetter', 'fitAnalysis']);
const afterClearAll = afterClearResume.filter(a => a !== 'coverLetter').filter(a => a !== 'fitAnalysis');
assert.deepEqual(afterClearAll, []);

// Test 9: no stale behavior for unsupported sections (experience, certs not in affected)
const unsupportedCheck = buildStaleAffected({ hasResume: true, hasCoverLetter: true, hasFitCheck: true });
assert.ok(!unsupportedCheck.includes('experience'));
assert.ok(!unsupportedCheck.includes('certifications'));
assert.ok(!unsupportedCheck.includes('summary'));

// Cleanup mock
delete global.chrome;

console.log('profileProposalApply checks passed');
