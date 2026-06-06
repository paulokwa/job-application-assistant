import assert from 'node:assert/strict';
import {
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

const sensitiveConfirmed = validateAndApplyProfileProposal({
  profile: baseProfile,
  proposal: sensitiveProposal,
  activeProfileId: 'p1',
  confirmedSensitive: true,
});

assert.equal(sensitiveConfirmed.ok, true);
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

console.log('profileProposalApply checks passed');
