import assert from 'node:assert/strict';
import { extractJobFields } from '../modules/extraction.js';

const tests = [
  {
    name: 'Job Title: pattern extracts title',
    input: 'Job Title: Administrative Assistant\nEmployer: Advantage Personnel\nLocation: Halifax, NS',
    expectedTitle: 'Administrative Assistant',
    expectedCompany: 'Advantage Personnel',
  },
  {
    name: 'job title: (lowercase, no space) pattern works',
    input: 'job title:Administrative Assistant\nCompany: Advantage Personnel',
    expectedTitle: 'Administrative Assistant',
    expectedCompany: 'Advantage Personnel',
  },
  {
    name: 'Position: pattern extracts title',
    input: 'Position: Senior Developer\nEmployer: Tech Corp',
    expectedTitle: 'Senior Developer',
    expectedCompany: 'Tech Corp',
  },
  {
    name: 'Role: pattern extracts title',
    input: 'Role: Project Manager\nOrganization: Gov Agency',
    expectedTitle: 'Project Manager',
    expectedCompany: 'Gov Agency',
  },
  {
    name: 'Employer: pattern extracts company',
    input: 'Job Title: Analyst\nEmployer: Big Bank',
    expectedTitle: 'Analyst',
    expectedCompany: 'Big Bank',
  },
  {
    name: 'Hiring Organization: pattern extracts company',
    input: 'Job Title: Nurse\nHiring Organization: Halifax Health',
    expectedTitle: 'Nurse',
    expectedCompany: 'Halifax Health',
  },
  {
    name: 'fallback: first meaningful line when no label pattern',
    input: 'Home\nSkip to content\nAdministrative Assistant\nAdvantage Personnel is hiring.',
    expectedTitle: 'Administrative Assistant',
    expectedCompany: '',
  },
  {
    name: 'empty input returns empty fields',
    input: '',
    expectedTitle: '',
    expectedCompany: '',
  },
  {
    name: 'needsReview true when company is missing',
    input: 'Job Title: Developer\nSome company info here',
    expectedNeedsReview: true,
  },
  {
    name: 'needsReview true when title is fallback',
    input: 'Administrative Assistant\nCompany: Test Co',
    expectedNeedsReview: true,
  },
  {
    name: 'needsReview false when both found by pattern',
    input: 'Job Title: Developer\nCompany: Test Co',
    expectedNeedsReview: false,
  },
  {
    name: 'em dash in label pattern works',
    input: 'Job Title\u2013Administrative Assistant\nCompany: Advantage Personnel',
    expectedTitle: 'Administrative Assistant',
    expectedCompany: 'Advantage Personnel',
  },
];

let passed = 0;
for (const t of tests) {
  const result = extractJobFields(t.input, '');
  if (t.expectedTitle !== undefined && result.jobTitle !== t.expectedTitle) {
    console.error(`FAIL: "${t.name}" — expected jobTitle "${t.expectedTitle}", got "${result.jobTitle}"`);
    process.exitCode = 1;
  } else if (t.expectedCompany !== undefined && result.company !== t.expectedCompany) {
    console.error(`FAIL: "${t.name}" — expected company "${t.expectedCompany}", got "${result.company}"`);
    process.exitCode = 1;
  } else if (t.expectedNeedsReview !== undefined && result.needsReview !== t.expectedNeedsReview) {
    console.error(`FAIL: "${t.name}" — expected needsReview ${t.expectedNeedsReview}, got ${result.needsReview}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${t.name}`);
    passed++;
  }
}

console.log(`\n${passed}/${tests.length} extractJobFields tests passed`);

function jobInfoSuggestionReview(info, currentTitle = '', currentCompany = '') {
  return [
    { label: 'Job title', value: info.jobTitle || currentTitle || '(no title found)' },
    { label: 'Employer', value: info.company || currentCompany || '(no employer found)' },
  ];
}

const reviewTests = [
  {
    name: 'AI title present: shows AI title',
    info: { jobTitle: 'Senior Engineer', company: 'Acme Corp' },
    currentTitle: 'Engineer',
    currentCompany: 'Acme',
    expectedTitle: 'Senior Engineer',
    expectedCompany: 'Acme Corp',
  },
  {
    name: 'AI title empty, current title present: shows current title',
    info: { jobTitle: '', company: 'Advantage Personnel' },
    currentTitle: 'Administrative Assistant',
    currentCompany: '',
    expectedTitle: 'Administrative Assistant',
    expectedCompany: 'Advantage Personnel',
  },
  {
    name: 'Both empty: shows fallback text',
    info: { jobTitle: '', company: '' },
    currentTitle: '',
    currentCompany: '',
    expectedTitle: '(no title found)',
    expectedCompany: '(no employer found)',
  },
  {
    name: 'AI title empty, current title present, company empty: shows current title and fallback company',
    info: { jobTitle: '', company: '' },
    currentTitle: 'Administrative Assistant',
    currentCompany: '',
    expectedTitle: 'Administrative Assistant',
    expectedCompany: '(no employer found)',
  },
  {
    name: 'AI company empty, current company present: shows current company',
    info: { jobTitle: 'Analyst', company: '' },
    currentTitle: '',
    currentCompany: 'Bank of Nova Scotia',
    expectedTitle: 'Analyst',
    expectedCompany: 'Bank of Nova Scotia',
  },
  {
    name: 'No defaults provided: same as both empty',
    info: { jobTitle: '', company: '' },
    expectedTitle: '(no title found)',
    expectedCompany: '(no employer found)',
  },
];

let reviewPassed = 0;
for (const t of reviewTests) {
  const result = jobInfoSuggestionReview(t.info, t.currentTitle, t.currentCompany);
  const titleEntry = result.find(r => r.label === 'Job title');
  const companyEntry = result.find(r => r.label === 'Employer');
  if (titleEntry.value !== t.expectedTitle) {
    console.error(`FAIL: "${t.name}" — expected title "${t.expectedTitle}", got "${titleEntry.value}"`);
    process.exitCode = 1;
  } else if (companyEntry.value !== t.expectedCompany) {
    console.error(`FAIL: "${t.name}" — expected company "${t.expectedCompany}", got "${companyEntry.value}"`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${t.name}`);
    reviewPassed++;
  }
}

console.log(`\n${reviewPassed}/${reviewTests.length} jobInfoSuggestionReview tests passed`);