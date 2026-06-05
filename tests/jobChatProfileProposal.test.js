import assert from 'node:assert/strict';
import {
  buildProfileProposalDiff,
  formatProfileUpdateProposalForCopy,
  hasExplicitProfileUpdateIntent,
  INCOMPLETE_EXPERIENCE_WARNING,
  TARGET_UNRESOLVED_WARNING,
  sendJobChatProfileUpdateProposal,
  validateProfileUpdateProposal,
} from '../modules/jobChat.js';

const sourceMessage = 'Add my Sun Life Claims Analyst role to my profile';

assert.equal(hasExplicitProfileUpdateIntent(sourceMessage), true);
assert.equal(hasExplicitProfileUpdateIntent('Update my skills to include dental claims processing'), true);
assert.equal(hasExplicitProfileUpdateIntent('Improve my summary based on what I just told you'), true);
assert.equal(hasExplicitProfileUpdateIntent('What should I emphasize for this job?'), false);

const validProposal = validateProfileUpdateProposal({
  type: 'profile_update_proposal',
  proposalVersion: 1,
  section: 'experience',
  action: 'add',
  confidence: 'user_stated',
  requiresConfirmation: true,
  summary: 'Add Claims Analyst role at Sun Life',
  target: null,
  proposedValue: {
    jobTitle: 'Claims Analyst',
    employer: 'Sun Life',
    location: '',
    startDate: '',
    endDate: '',
    bulletPoints: [],
  },
  warnings: [],
  sensitiveFields: [],
  sourceUserMessage: sourceMessage,
}, sourceMessage);

assert.equal(validProposal.section, 'experience');
assert.equal(validProposal.action, 'add');
assert.equal(validProposal.requiresConfirmation, true);
assert.equal(validProposal.proposedValue.jobTitle, 'Claims Analyst');
assert.equal(validProposal.sourceUserMessage, sourceMessage);
assert.match(validProposal.warnings.join('\n'), /missing details such as responsibilities, dates, or location/i);
assert.match(validProposal.createdAt, /^\d{4}-\d{2}-\d{2}T/);
assert.equal(typeof validProposal.baseProfileFingerprint, 'string');

const companyAliasProposal = validateProfileUpdateProposal({
  ...validProposal,
  proposedValue: {
    title: 'Claims Analyst',
    company: 'Sun Life',
  },
}, sourceMessage);

assert.ok(companyAliasProposal);
assert.equal(companyAliasProposal.proposedValue.jobTitle, 'Claims Analyst');
assert.equal(companyAliasProposal.proposedValue.employer, 'Sun Life');
assert.equal(Object.hasOwn(companyAliasProposal.proposedValue, 'title'), false);
assert.equal(Object.hasOwn(companyAliasProposal.proposedValue, 'company'), false);
assert.equal(companyAliasProposal.warnings.includes(INCOMPLETE_EXPERIENCE_WARNING), true);

const incompleteCopyText = formatProfileUpdateProposalForCopy(companyAliasProposal);
assert.match(incompleteCopyText, /Warnings:/);
assert.match(incompleteCopyText, /This suggestion is missing details such as responsibilities, dates, or location/);
assert.match(incompleteCopyText, /employer: Sun Life/);
assert.doesNotMatch(incompleteCopyText, /company: Sun Life/);

assert.equal(validateProfileUpdateProposal(null, sourceMessage), null);
assert.equal(validateProfileUpdateProposal({ ...validProposal, section: 'unknown' }, sourceMessage), null);
assert.equal(validateProfileUpdateProposal({ ...validProposal, action: 'archive' }, sourceMessage), null);
assert.equal(validateProfileUpdateProposal({
  ...validProposal,
  proposedValue: {
    personalInfo: { fullName: 'Jane' },
    experience: [{ jobTitle: 'Claims Analyst' }],
  },
}, sourceMessage), null);
assert.equal(validateProfileUpdateProposal({
  ...validProposal,
  proposedValue: { metadata: { lockedSections: { experience: false } } },
}, sourceMessage), null);
assert.equal(validateProfileUpdateProposal({
  ...validProposal,
  proposedValue: { sourceResumeText: 'replace this' },
}, sourceMessage), null);
assert.equal(validateProfileUpdateProposal({
  ...validProposal,
  warnings: ['Call saveProfile() and update chrome.storage after rendering.'],
}, sourceMessage), null);
assert.equal(validateProfileUpdateProposal({
  ...validProposal,
  summary: 'I have updated your saved profile.',
}, sourceMessage), null);
assert.equal(validateProfileUpdateProposal({
  ...validProposal,
  proposedValue: { jobTitle: 'Job Title', employer: 'Company Name' },
}, sourceMessage), null);
assert.equal(validateProfileUpdateProposal({
  ...validProposal,
  proposedValue: { jobTitle: 'Claims Analyst', employer: 'Sun Life', unexpected: 'nope' },
}, sourceMessage), null);
assert.equal(validateProfileUpdateProposal({
  ...validProposal,
  section: 'personalInfo',
  action: 'update',
  proposedValue: { fullName: 'Jane Doe', nickname: 'JD' },
}, 'Update my profile name'), null);

const skillStringProposal = validateProfileUpdateProposal({
  ...validProposal,
  section: 'skills',
  action: 'add',
  proposedValue: 'Dental claims processing',
}, 'Update my skills to include dental claims processing');

assert.ok(skillStringProposal);
assert.equal(skillStringProposal.section, 'skills');

const skillArrayProposal = validateProfileUpdateProposal({
  ...validProposal,
  section: 'skills',
  action: 'add',
  proposedValue: ['Dental claims processing', 'Claims review'],
}, 'Update my skills to include dental claims processing');

assert.ok(skillArrayProposal);
assert.equal(skillArrayProposal.section, 'skills');

assert.equal(validateProfileUpdateProposal({
  ...validProposal,
  section: 'certifications',
  action: 'add',
  proposedValue: { name: 'Claims Fundamentals', issuer: 'Insurance Institute', extra: 'nope' },
}, 'Add certification to my profile'), null);

const sensitiveProposal = validateProfileUpdateProposal({
  ...validProposal,
  section: 'summary',
  action: 'update',
  proposedValue: { text: 'Add my disability advocacy and salary history.' },
}, 'Update my profile summary with my disability advocacy and salary history');

assert.ok(sensitiveProposal);
assert.ok(sensitiveProposal.sensitiveFields.length > 0);
assert.match(sensitiveProposal.warnings.join('\n'), /sensitive health-related information/i);

const removeProposal = validateProfileUpdateProposal({
  ...validProposal,
  action: 'remove',
  summary: 'Remove old project',
  proposedValue: null,
  target: { jobTitle: 'Old Role', employer: 'Old Employer' },
}, 'Remove that old project from my profile');

assert.ok(removeProposal);
assert.match(removeProposal.warnings.join('\n'), /read-only/i);

const mockProposal = await sendJobChatProfileUpdateProposal(
  { activeProfileId: 'p1', profile: {} },
  sourceMessage,
  { provider: 'mock' },
  new AbortController().signal
);

assert.equal(mockProposal.section, 'experience');
assert.equal(mockProposal.action, 'add');
assert.equal(mockProposal.proposedValue.jobTitle, 'Claims Analyst');
assert.equal(mockProposal.proposedValue.employer, 'Sun Life');
assert.equal(mockProposal.targetProfileId, 'p1');

const normalMockProposal = await sendJobChatProfileUpdateProposal(
  {},
  'What are my biggest gaps?',
  { provider: 'mock' },
  new AbortController().signal
);

assert.equal(normalMockProposal, null);

const cancerSourceMessage = 'Add that I had cancer treatment support responsibilities to my profile';

// Vague experience add with no jobTitle/employer and sensitive content: rejected entirely
const vagueCancerAddAssert = validateProfileUpdateProposal({
  ...validProposal,
  section: 'experience',
  action: 'add',
  summary: 'Add cancer treatment support role',
  proposedValue: { responsibilities: 'Cancer treatment support' },
}, cancerSourceMessage);

assert.equal(vagueCancerAddAssert, null);

// Structured experience add with sensitive content: renders with sensitive warning
const structuredSensitiveAdd = validateProfileUpdateProposal({
  ...validProposal,
  section: 'experience',
  action: 'add',
  summary: 'Add cancer treatment support role',
  proposedValue: { jobTitle: 'Cancer Treatment Support Volunteer', employer: 'Hospital', bulletPoints: ['Assisted patients during treatment'] },
  warnings: [],
}, cancerSourceMessage);

assert.ok(structuredSensitiveAdd);
assert.equal(structuredSensitiveAdd.sensitiveFields.length > 0, true);
assert.match(structuredSensitiveAdd.warnings.join('\n'), /sensitive health-related information/i);

// Structured experience add without sensitive content: renders cleanly
const structuredExperienceAdd = validateProfileUpdateProposal({
  ...validProposal,
  section: 'experience',
  action: 'add',
  summary: 'Add role at company',
  proposedValue: { jobTitle: 'Claims Analyst', employer: 'Sun Life', bulletPoints: ['Processed claims'] },
  warnings: [],
}, sourceMessage);

assert.ok(structuredExperienceAdd);
assert.equal(structuredExperienceAdd.section, 'experience');
assert.equal(structuredExperienceAdd.proposedValue.jobTitle, 'Claims Analyst');
assert.equal(structuredExperienceAdd.sensitiveFields.length, 0);
assert.equal(structuredExperienceAdd.warnings.includes(INCOMPLETE_EXPERIENCE_WARNING), false);

assert.equal(validateProfileUpdateProposal({
  ...validProposal,
  section: 'experience',
  action: 'update',
  proposedValue: { jobTitle: 'Claims Specialist' },
  warnings: [],
  target: null,
}, 'Update my experience'), null);

assert.equal(validateProfileUpdateProposal({
  ...validProposal,
  section: 'experience',
  action: 'remove',
  proposedValue: null,
  warnings: [],
  target: null,
}, 'Remove that role from my profile'), null);

const duplicateSkill = validateProfileUpdateProposal({
  ...validProposal,
  section: 'skills',
  action: 'add',
  proposedValue: 'Dental Claims Processing',
  warnings: [],
}, 'Update my skills to include dental claims processing', {
  profile: { skills: ['dental claims processing'] },
});

assert.ok(duplicateSkill);
assert.match(duplicateSkill.warnings.join('\n'), /already appears/i);

const lockedExperience = validateProfileUpdateProposal({
  ...validProposal,
  warnings: [],
}, sourceMessage, {
  profile: { metadata: { lockedSections: { experience: true } } },
});

assert.ok(lockedExperience);
assert.match(lockedExperience.warnings.join('\n'), /section is locked/i);

const experienceAddDiff = buildProfileProposalDiff(structuredExperienceAdd, {
  profileName: 'General',
  profile: { experience: [] },
});

assert.equal(experienceAddDiff.profileName, 'General');
assert.equal(experienceAddDiff.section, 'experience');
assert.equal(experienceAddDiff.action, 'add');
assert.equal(experienceAddDiff.before, null);
assert.equal(experienceAddDiff.beforeLabel, 'No existing entry selected.');
assert.equal(experienceAddDiff.after.jobTitle, 'Claims Analyst');
assert.equal(experienceAddDiff.fieldChanges.some(change => change.changeType === 'added'), true);
assert.match(experienceAddDiff.readOnlyNotice, /preview only/i);

const duplicateSkillDiff = buildProfileProposalDiff(duplicateSkill, {
  profile: { skills: ['dental claims processing'] },
});

assert.match(duplicateSkillDiff.warnings.join('\n'), /already appears/i);
assert.equal(duplicateSkillDiff.after, 'Dental Claims Processing');

const summaryUpdate = validateProfileUpdateProposal({
  type: 'profile_update_proposal',
  proposalVersion: 1,
  section: 'summary',
  action: 'update',
  summary: 'Update summary',
  target: 'Old summary',
  proposedValue: { text: 'New summary' },
  warnings: [],
  sensitiveFields: [],
}, 'Update my profile summary');

assert.ok(summaryUpdate);
const summaryDiff = buildProfileProposalDiff(summaryUpdate, {
  profile: { summary: 'Old summary' },
});

assert.equal(summaryDiff.before, 'Old summary');
assert.equal(summaryDiff.after, 'New summary');
assert.equal(summaryDiff.fieldChanges[0].changeType, 'changed');

const lockedDiff = buildProfileProposalDiff(lockedExperience, {
  profile: { metadata: { lockedSections: { experience: true } } },
});

assert.match(lockedDiff.warnings.join('\n'), /section is locked/i);

const unresolvedUpdate = validateProfileUpdateProposal({
  type: 'profile_update_proposal',
  proposalVersion: 1,
  section: 'experience',
  action: 'update',
  summary: 'Update old role',
  target: { jobTitle: 'Missing Role', employer: 'Missing Employer' },
  proposedValue: { jobTitle: 'Updated Role' },
  warnings: [],
  sensitiveFields: [],
}, 'Update my old role in my profile');

assert.ok(unresolvedUpdate);
const unresolvedUpdateDiff = buildProfileProposalDiff(unresolvedUpdate, {
  profile: { experience: [{ jobTitle: 'Other Role', employer: 'Other Employer' }] },
});

assert.equal(unresolvedUpdateDiff.targetResolved, false);
assert.match(unresolvedUpdateDiff.warnings.join('\n'), /Target not resolved/i);
assert.equal(unresolvedUpdateDiff.fieldChanges.length, 0);

const unresolvedRemove = validateProfileUpdateProposal({
  type: 'profile_update_proposal',
  proposalVersion: 1,
  section: 'projects',
  action: 'remove',
  summary: 'Remove missing project',
  target: { name: 'Missing Project' },
  proposedValue: null,
  warnings: [],
  sensitiveFields: [],
}, 'Remove that old project from my profile');

assert.ok(unresolvedRemove);
const unresolvedRemoveDiff = buildProfileProposalDiff(unresolvedRemove, {
  profile: { projects: [{ name: 'Other Project' }] },
});

assert.equal(unresolvedRemoveDiff.targetResolved, false);
assert.equal(unresolvedRemoveDiff.warnings.includes(TARGET_UNRESOLVED_WARNING), true);

console.log('jobChatProfileProposal checks passed');
