import assert from 'node:assert/strict';
import { normalizeResumeContent } from '../modules/schema.js';
import { profileToPromptText } from '../modules/profile.js';
import { mergeProfileFormData } from '../modules/profileRoundTrip.js';

const existing = normalizeResumeContent({
  personalInfo: {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '902-555-0123',
    cityProvince: 'Halifax, NS',
    linkedin: 'https://linkedin.example/jane',
    portfolio: 'https://portfolio.example',
    website: 'https://website.example',
  },
  headline: 'Operations Specialist',
  summary: 'Scalar summary to preserve.',
  summaries: [{ label: 'General', text: 'Visible summary.' }],
  skills: ['Operations', 'Documentation'],
  experience: [{
    jobTitle: 'Coordinator',
    employer: 'Acme',
    location: 'Halifax, NS',
    startDate: 'January 2020',
    endDate: 'March 2022',
    bulletPoints: ['Kept records accurate.'],
  }],
  education: [{
    credential: 'Diploma',
    institution: 'NSCC',
    location: 'Dartmouth, NS',
    dates: '2018 - 2020',
    notes: ['Dean list'],
  }],
  projects: [{
    name: 'Claims Dashboard',
    role: 'Analyst',
    description: 'Built reporting workflow.',
    technologies: ['Sheets'],
    link: 'https://project.example',
  }],
  certifications: [
    { name: 'Claims Fundamentals', issuer: 'Insurance Institute', year: '2021' },
    'Legacy String Cert',
  ],
  customSections: [{ label: 'Volunteer', text: 'Community intake support.' }],
  doNotClaimNotes: 'Do not claim licensing.',
  coverLetterProfile: {
    tone: 'Warm',
    strengths: 'Clear communication',
    targetRole: 'Coordinator',
    notableAchievements: 'Reduced backlog',
  },
  metadata: {
    lockedSections: { education: true },
    selectedTemplate: 'modern',
  },
});

assert.deepEqual(existing.certifications[0], {
  name: 'Claims Fundamentals',
  issuer: 'Insurance Institute',
  year: '2021',
});
assert.equal(existing.certifications[1].name, 'Legacy String Cert');

const collectedFromSettings = {
  personalInfo: {
    fullName: 'Jane Doe',
    email: 'jane.new@example.com',
    phone: '902-555-0123',
    cityProvince: 'Halifax, NS',
    linkedin: 'https://linkedin.example/jane',
    portfolio: 'https://portfolio.example',
  },
  summaries: [{ label: 'General', text: 'Visible summary edited.' }],
  skills: ['Operations', 'Documentation', 'Case review'],
  experience: [{
    jobTitle: 'Coordinator',
    employer: 'Acme',
    location: 'Halifax, NS',
    dates: 'January 2020 - March 2022',
    bulletPoints: ['Kept records accurate.', 'Improved handoffs.'],
  }],
  education: [{
    credential: 'Diploma',
    institution: 'NSCC',
    dates: '2018 - 2020',
  }],
  certifications: [
    { name: 'Claims Fundamentals', issuer: 'Insurance Institute' },
    { name: 'Legacy String Cert', issuer: '' },
    { name: '', issuer: '' },
    { name: '   ', issuer: '   ' },
  ],
  customSections: [{ label: 'Volunteer', text: 'Community intake support.' }],
  doNotClaimNotes: 'Do not claim licensing.',
};

const merged = mergeProfileFormData(existing, collectedFromSettings);

assert.equal(merged.personalInfo.email, 'jane.new@example.com');
assert.equal(merged.personalInfo.website, 'https://website.example');
assert.equal(merged.headline, 'Operations Specialist');
assert.equal(merged.summary, 'Scalar summary to preserve.');
assert.deepEqual(merged.projects, existing.projects);
assert.deepEqual(merged.coverLetterProfile, existing.coverLetterProfile);
assert.equal(merged.education[0].location, 'Dartmouth, NS');
assert.deepEqual(merged.education[0].notes, ['Dean list']);
assert.equal(merged.experience[0].startDate, 'January 2020');
assert.equal(merged.experience[0].endDate, 'March 2022');
assert.deepEqual(merged.metadata.lockedSections, { education: true });

assert.equal(merged.certifications.length, 2);
assert.deepEqual(merged.certifications[0], {
  name: 'Claims Fundamentals',
  issuer: 'Insurance Institute',
  year: '2021',
});
assert.deepEqual(merged.certifications[1], {
  name: 'Legacy String Cert',
  issuer: '',
  year: '',
});

const promptText = profileToPromptText(merged);
assert.match(promptText, /Claims Fundamentals - Insurance Institute - 2021/);
assert.doesNotMatch(promptText, /\[object Object\]/);

const editedDates = mergeProfileFormData(existing, {
  ...collectedFromSettings,
  experience: [{
    ...collectedFromSettings.experience[0],
    dates: 'April 2020 - Present',
  }],
});

assert.equal(editedDates.experience[0].startDate, 'April 2020');
assert.equal(editedDates.experience[0].endDate, 'Present');

const editedNonDashDates = mergeProfileFormData(existing, {
  ...collectedFromSettings,
  experience: [{
    ...collectedFromSettings.experience[0],
    dates: 'April 2020 to Present',
  }],
});

assert.equal(editedNonDashDates.experience[0].dates, 'April 2020 to Present');

const reloaded = normalizeResumeContent(merged);

assert.equal(reloaded.personalInfo.website, 'https://website.example');
assert.equal(reloaded.headline, 'Operations Specialist');
assert.equal(reloaded.summary, 'Scalar summary to preserve.');
assert.deepEqual(reloaded.projects, existing.projects);
assert.deepEqual(reloaded.coverLetterProfile, existing.coverLetterProfile);
assert.equal(reloaded.education[0].location, 'Dartmouth, NS');
assert.deepEqual(reloaded.education[0].notes, ['Dean list']);
assert.equal(reloaded.experience[0].dates, 'Jan 2020 - Mar 2022');
assert.equal(reloaded.experience[0].startDate, 'Jan 2020');
assert.equal(reloaded.experience[0].endDate, 'Mar 2022');
assert.deepEqual(reloaded.metadata.lockedSections, { education: true });
assert.deepEqual(reloaded.certifications, merged.certifications);

const mixedDateProfile = normalizeResumeContent({
  experience: [
    { jobTitle: 'Claims Analyst', employer: 'NTT Data', dates: 'Jan 8th, 2024 - Present' },
    { jobTitle: 'QA Tester', employer: 'Acme', dates: 'October 2023 - Nov 2023' },
    { jobTitle: 'Coordinator', employer: 'Acme', dates: '2020 - 2022' },
  ],
});

assert.equal(mixedDateProfile.experience[0].dates, 'Jan 2024 - Present');
assert.equal(mixedDateProfile.experience[0].startDate, 'Jan 2024');
assert.equal(mixedDateProfile.experience[1].dates, 'Oct 2023 - Nov 2023');
assert.equal(mixedDateProfile.experience[2].dates, '2020 - 2022');

console.log('profileRoundTrip checks passed');
