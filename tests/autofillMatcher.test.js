import assert from 'node:assert/strict';
import { buildAutofillMatches } from '../modules/autofillMatcher.js';

function field(fieldIndex, labelText, atsPlatform = '') {
  return {
    fieldId: `field-${fieldIndex}`,
    fieldIndex,
    tagName: 'input',
    type: 'text',
    name: '',
    id: '',
    autocomplete: '',
    ariaLabel: '',
    placeholder: '',
    labelText,
    nearbyText: '',
    options: [],
    currentValue: '',
    atsPlatform,
    isVisible: true,
    isDisabled: false,
    isReadOnly: false,
    isSensitive: false,
    skipReason: null,
  };
}

const profile = {
  education: [
    {
      institution: 'Nova Scotia Community College',
      credential: 'IT Programming',
      dates: '2020 - 2022',
    },
    {
      institution: 'The University of Sheffield',
      credential: 'Bachelor of Arts in Social Work',
      dates: '2007 - 2011',
    },
  ],
};

const denseWorkdayFields = [
  field(0, 'School or University', 'workday'),
  field(1, 'Field of Study', 'workday'),
  field(2, 'School or University', 'workday'),
  field(3, 'Field of Study', 'workday'),
];

const { matches, summary } = buildAutofillMatches(denseWorkdayFields, profile);
const byIndex = new Map(matches.map(match => [match.field.fieldIndex, match]));

assert.equal(summary.matched, 4);
assert.equal(byIndex.get(0)?.profileKey, 'education[0].institution');
assert.equal(byIndex.get(0)?.profileValue, 'Nova Scotia Community College');
assert.equal(byIndex.get(1)?.profileKey, 'education[0].credential');
assert.equal(byIndex.get(1)?.profileValue, 'IT Programming');
assert.equal(byIndex.get(2)?.profileKey, 'education[1].institution');
assert.equal(byIndex.get(2)?.profileValue, 'The University of Sheffield');
assert.equal(byIndex.get(3)?.profileKey, 'education[1].credential');
assert.equal(byIndex.get(3)?.profileValue, 'Bachelor of Arts in Social Work');

console.log('autofillMatcher checks passed');
