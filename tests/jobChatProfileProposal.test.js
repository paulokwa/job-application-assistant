import assert from 'node:assert/strict';
import {
  formatProfileUpdateProposalForCopy,
  hasExplicitProfileUpdateIntent,
  INCOMPLETE_EXPERIENCE_WARNING,
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

const companyAliasProposal = validateProfileUpdateProposal({
  ...validProposal,
  proposedValue: {
    jobTitle: 'Claims Analyst',
    company: 'Sun Life',
  },
}, sourceMessage);

assert.ok(companyAliasProposal);
assert.equal(companyAliasProposal.proposedValue.employer, 'Sun Life');
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
}, 'Remove that old project from my profile');

assert.ok(removeProposal);
assert.match(removeProposal.warnings.join('\n'), /read-only/i);

const mockProposal = await sendJobChatProfileUpdateProposal(
  {},
  sourceMessage,
  { provider: 'mock' },
  new AbortController().signal
);

assert.equal(mockProposal.section, 'experience');
assert.equal(mockProposal.action, 'add');
assert.equal(mockProposal.proposedValue.jobTitle, 'Claims Analyst');
assert.equal(mockProposal.proposedValue.employer, 'Sun Life');

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

console.log('jobChatProfileProposal checks passed');
