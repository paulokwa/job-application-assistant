import assert from 'node:assert/strict';
import { extractJobFields } from '../modules/extraction.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

console.log('extractJobFields – label patterns');

test('Job Title: label pattern extracts value', () => {
  const r = extractJobFields('Job Title: Administrative Assistant\nCompany: Acme Corp', '');
  assert.equal(r.jobTitle, 'Administrative Assistant');
  assert.equal(r.jobTitleSource, 'pattern');
});

test('Position: label pattern extracts value', () => {
  const r = extractJobFields('Position: Software Engineer', '');
  assert.equal(r.jobTitle, 'Software Engineer');
  assert.equal(r.jobTitleSource, 'pattern');
});

test('Role: label pattern extracts value', () => {
  const r = extractJobFields('Role: Product Manager', '');
  assert.equal(r.jobTitle, 'Product Manager');
  assert.equal(r.jobTitleSource, 'pattern');
});

test('Vacancy: label pattern extracts value', () => {
  const r = extractJobFields('Vacancy: Data Analyst', '');
  assert.equal(r.jobTitle, 'Data Analyst');
  assert.equal(r.jobTitleSource, 'pattern');
});

test('Posting Title: label pattern extracts value', () => {
  const r = extractJobFields('Posting Title: UX Designer', '');
  assert.equal(r.jobTitle, 'UX Designer');
  assert.equal(r.jobTitleSource, 'pattern');
});

test('label pattern beats nav text in order', () => {
  const r = extractJobFields('Contact Us\nJob Seekers\nEmployers\nJob Title: Administrative Assistant\nCompany: Advantage Personnel', '');
  assert.equal(r.jobTitle, 'Administrative Assistant');
  assert.equal(r.jobTitleSource, 'pattern');
  assert.equal(r.company, 'Advantage Personnel');
  assert.equal(r.companySource, 'pattern');
});

test('Company: label extracts company name', () => {
  const r = extractJobFields('Job Title: Developer\nCompany: TestCorp', '');
  assert.equal(r.company, 'TestCorp');
  assert.equal(r.companySource, 'pattern');
});

test('Employer: label extracts company name', () => {
  const r = extractJobFields('Job Title: Developer\nEmployer: TestCorp', '');
  assert.equal(r.company, 'TestCorp');
});

test('Organization: label extracts company name', () => {
  const r = extractJobFields('Job Title: Developer\nOrganization: Acme NGO', '');
  assert.equal(r.company, 'Acme NGO');
});

console.log('\nextractJobFields – nav rejection');

test('Contact Us is rejected by fallback', () => {
  const r = extractJobFields('Contact Us\nSome Real Job Description That Is Long', '');
  assert.ok(r.jobTitle !== 'Contact Us', `Should not pick 'Contact Us', got '${r.jobTitle}'`);
});

test('About is rejected by fallback', () => {
  const r = extractJobFields('About\nSome Real Job Description That Is Long', '');
  assert.ok(r.jobTitle !== 'About', `Should not pick 'About', got '${r.jobTitle}'`);
});

test('Careers is rejected by fallback', () => {
  const r = extractJobFields('Careers\nSenior Developer Position Available', '');
  assert.ok(r.jobTitle !== 'Careers', `Should not pick 'Careers', got '${r.jobTitle}'`);
});

test('Employers link is rejected by fallback', () => {
  const r = extractJobFields('Employers\nSenior Developer Position Available', '');
  assert.ok(r.jobTitle !== 'Employers', `Should not 'Employers', got '${r.jobTitle}'`);
});

test('Job Seekers is rejected by fallback', () => {
  const r = extractJobFields('Job Seekers\nSenior Developer Position Available', '');
  assert.ok(r.jobTitle !== 'Job Seekers', `Should not pick 'Job Seekers', got '${r.jobTitle}'`);
});

test('Online Portal is rejected by fallback', () => {
  const r = extractJobFields('Online Portal\nSenior Developer Position Available', '');
  assert.ok(r.jobTitle !== 'Online Portal', `Should not pick 'Online Portal', got '${r.jobTitle}'`);
});

test('Privacy is rejected by fallback', () => {
  const r = extractJobFields('Privacy Policy\nSenior Developer Position Available', '');
  assert.ok(!r.jobTitle.startsWith('Privacy'), `Should not pick Privacy text, got '${r.jobTitle}'`);
});

test('Accessibility is rejected by fallback', () => {
  const r = extractJobFields('Accessibility\nSenior Developer Position Available', '');
  assert.ok(!r.jobTitle.startsWith('Accessibility'), `Should not pick Accessibility text, got '${r.jobTitle}'`);
});

test('Français is rejected by fallback', () => {
  const r = extractJobFields('Français\nSenior Developer Position Available', '');
  assert.ok(r.jobTitle !== 'Français', `Should not pick 'Français', got '${r.jobTitle}'`);
});

test('Share is rejected by fallback', () => {
  const r = extractJobFields('Share This Job\nSenior Developer Position Available', '');
  assert.ok(!r.jobTitle.startsWith('Share'), `Should not pick Share text, got '${r.jobTitle}'`);
});

test('year-prefixed line is rejected (copyright)', () => {
  const r = extractJobFields('2024 All Rights Reserved\nSenior Developer Position Available', '');
  assert.ok(!r.jobTitle.startsWith('2024'), `Should not pick copyright text, got '${r.jobTitle}'`);
});

console.log('\nextractJobFields – heading fallback');

test('short capitalized line with no colon becomes heading candidate', () => {
  const r = extractJobFields('Home\nMenu\nAdministrative Assistant\nWe are looking for someone great', '');
  assert.equal(r.jobTitle, 'Administrative Assistant');
  assert.equal(r.jobTitleSource, 'heading');
});

test('heading candidate is flagged as needsReview', () => {
  const r = extractJobFields('Home\nMenu\nAdministrative Assistant\nWe are hiring', '');
  assert.equal(r.needsReview, true);
});

test('heading fallback skips lines with colons', () => {
  const r = extractJobFields('Home\nSome Label: Not A Title\nSoftware Engineer\nApply Now', '');
  assert.equal(r.jobTitle, 'Software Engineer');
  assert.equal(r.jobTitleSource, 'heading');
});

console.log('\nextractJobFields – generic fallback');

test('longer meaningful line still works when no heading found', () => {
  const r = extractJobFields('Home\nSome Real Job Description That Is Long Enough To Pass Filters', '');
  assert.ok(r.jobTitle.length > 0, 'Should find a fallback title');
  assert.equal(r.jobTitleSource, 'heading');
});

test('all nav text results in empty title', () => {
  const r = extractJobFields('Home\nContact Us\nAbout\nCareers\nPrivacy\nTerms\nSitemap', '');
  assert.equal(r.jobTitle, '');
  assert.equal(r.needsReview, true);
});

console.log('\nextractJobFields – priority order');

test('label pattern wins over heading fallback', () => {
  const r = extractJobFields('Administrative Assistant\nJob Title: Senior Developer\nCompany: Acme', '');
  assert.equal(r.jobTitle, 'Senior Developer');
  assert.equal(r.jobTitleSource, 'pattern');
});

test('heading fallback wins over generic fallback', () => {
  const r = extractJobFields('Home\nAdministrative Assistant\nThis is a much longer description of the job position that would be a poor title candidate', '');
  assert.equal(r.jobTitle, 'Administrative Assistant');
  assert.equal(r.jobTitleSource, 'heading');
});

test('pattern source does not trigger needsReview', () => {
  const r = extractJobFields('Job Title: Developer\nCompany: Acme', '');
  assert.equal(r.needsReview, false);
});

test('fallback source triggers needsReview', () => {
  const r = extractJobFields('Some meaningful line about a developer position that is long enough to pass', '');
  assert.equal(r.needsReview, true);
});

console.log('\nextractJobFields – edge cases');

test('empty input returns empty fields', () => {
  const r = extractJobFields('', '');
  assert.equal(r.jobTitle, '');
  assert.equal(r.company, '');
  assert.equal(r.sourceUrl, '');
});

test('null-like input returns empty fields', () => {
  const r = extractJobFields(null, '');
  assert.equal(r.jobTitle, '');
});

test('url is preserved in sourceUrl', () => {
  const r = extractJobFields('Job Title: Dev', 'https://example.com/job');
  assert.equal(r.sourceUrl, 'https://example.com/job');
});

test('dash variants in labels are handled', () => {
  const r = extractJobFields('Job Title - Administrative Assistant\nCompany - Acme', '');
  assert.equal(r.jobTitle, 'Administrative Assistant');
  assert.equal(r.company, 'Acme');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);