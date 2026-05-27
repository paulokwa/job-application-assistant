import assert from 'node:assert/strict';
import { detectJobPage } from '../modules/jobPageDetector.js';

function check(name, input, expected) {
  const result = detectJobPage(input);

  assert.equal(
    Object.hasOwn(result, 'isLikelySearchPage'),
    true,
    `${name} includes isLikelySearchPage`
  );
  assert.equal(
    result.isLikelyJobPosting,
    expected.isLikelyJobPosting,
    `${name} isLikelyJobPosting`
  );
  assert.equal(
    result.isLikelySearchPage,
    expected.isLikelySearchPage,
    `${name} isLikelySearchPage`
  );
}

const postingText = `
  About the role
  Responsibilities include collaborating with cross-functional teams and delivering customer-focused work.
  Requirements include strong communication, problem solving, and relevant product or technical experience.
  Qualifications include experience in a similar role.
  Employment type: Full-time.
  Apply now to be considered.
`;

check(
  'LinkedIn search page',
  {
    url: 'https://www.linkedin.com/jobs/search/?keywords=product%20manager&location=Toronto',
    title: 'Product Manager Jobs in Toronto',
    text: 'Save this search and set up job alert for new product manager roles.',
  },
  {
    isLikelyJobPosting: false,
    isLikelySearchPage: true,
  }
);

check(
  'LinkedIn single job page',
  {
    url: 'https://www.linkedin.com/jobs/view/123456789',
    title: 'Product Manager at Example Co',
    text: postingText,
  },
  {
    isLikelyJobPosting: true,
    isLikelySearchPage: false,
  }
);

check(
  'Indeed search page',
  {
    url: 'https://ca.indeed.com/jobs?q=software+engineer&l=Toronto',
    title: 'Software Engineer Jobs, Employment in Toronto',
    text: 'Sort by relevance and create job alert for software engineer roles.',
  },
  {
    isLikelyJobPosting: false,
    isLikelySearchPage: true,
  }
);

check(
  'Indeed single viewjob page',
  {
    url: 'https://ca.indeed.com/viewjob?jk=abc123',
    title: 'Software Engineer - Example Co',
    text: postingText,
  },
  {
    isLikelyJobPosting: true,
    isLikelySearchPage: false,
  }
);

check(
  'Glassdoor SRCH search page',
  {
    url: 'https://www.glassdoor.com/Job/software-engineer-jobs-SRCH_KO0,17.htm',
    title: 'Software Engineer Jobs',
    text: 'Create job alert and sort by relevance for software engineer listings.',
  },
  {
    isLikelyJobPosting: false,
    isLikelySearchPage: true,
  }
);

check(
  'Glassdoor real job-listing page',
  {
    url: 'https://www.glassdoor.com/job-listing/software-engineer-example-co-JV_IC123_KO0,17_KE18,28.htm',
    title: 'Software Engineer - Example Co',
    text: postingText,
  },
  {
    isLikelyJobPosting: true,
    isLikelySearchPage: false,
  }
);

check(
  'Generic company careers search page',
  {
    url: 'https://example.com/careers/search?q=support',
    title: 'Careers Search',
    text: 'Refine your search or email me jobs that match this query.',
  },
  {
    isLikelyJobPosting: false,
    isLikelySearchPage: true,
  }
);

check(
  'Greenhouse single posting',
  {
    url: 'https://boards.greenhouse.io/example/jobs/123456',
    title: 'Support Specialist',
    text: `
      About the role
      Responsibilities include helping customers resolve support issues.
      Requirements include strong writing and troubleshooting skills.
      Apply for this job when ready.
    `,
  },
  {
    isLikelyJobPosting: true,
    isLikelySearchPage: false,
  }
);

check(
  'Plain non-job page',
  {
    url: 'https://example.com/about',
    title: 'About Us',
    text: 'Example Co was founded to build useful software. Learn about our company history, mission, and team.',
  },
  {
    isLikelyJobPosting: false,
    isLikelySearchPage: false,
  }
);

check(
  'JSON-LD JobPosting short-circuit',
  {
    url: 'https://example.com/jobs/123',
    title: 'Designer',
    text: '',
    structuredData: '{"@type":"JobPosting","title":"Designer"}',
  },
  {
    isLikelyJobPosting: true,
    isLikelySearchPage: false,
  }
);

console.log('jobPageDetector checks passed');
