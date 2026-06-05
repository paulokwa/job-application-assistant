// modules/mock.js
// Mock AI responses for testing workflows without API costs.

function firstText(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}


function normalizeExperience(exp = {}) {
  const dates = firstText(exp.dates);
  const [startDate, endDate] = dates.includes(' - ') ? dates.split(' - ') : ['', ''];
  return {
    jobTitle: firstText(exp.jobTitle, exp.title),
    employer: firstText(exp.employer, exp.company),
    location: firstText(exp.location),
    startDate: firstText(exp.startDate, startDate),
    endDate: firstText(exp.endDate, endDate),
    bulletPoints: asArray(exp.bulletPoints || exp.bullets)
  };
}

function normalizeEducation(edu = {}) {
  return {
    institution: firstText(edu.institution, edu.school),
    credential: firstText(edu.credential, edu.degree),
    location: firstText(edu.location),
    dates: firstText(edu.dates, edu.year),
    notes: asArray(edu.notes)
  };
}

function normalizeCertification(cert) {
  if (typeof cert === 'string') return cert;
  return [cert?.name, cert?.issuer, cert?.year].filter(Boolean).join(' - ');
}

function profileSummary(profile = {}) {
  const summary = firstText(
    profile.summary,
    profile.summaries?.find(s => s?.text)?.text,
    profile.coverLetterProfile?.strengths,
    profile.coverLetterProfile?.notableAchievements
  );
  if (summary) return summary;
  return '[Demo placeholder] Add a profile summary in Settings → My Profile to see tailored content here.';
}

function profileExperience(profile = {}, sourceResumeText = '') {
  const experience = asArray(profile.experience).map(normalizeExperience).filter(exp =>
    exp.jobTitle || exp.employer || exp.bulletPoints.length
  );
  if (experience.length) return experience;

  if (sourceResumeText) {
    return [{
      jobTitle: '[Demo placeholder] Role from uploaded source resume',
      employer: '[Demo placeholder] Employer from uploaded source resume',
      location: '',
      startDate: '',
      endDate: '',
      bulletPoints: ['Demo mode cannot reliably structure this resume text. Review your uploaded source resume and add verified role details before submitting.']
    }];
  }

  return [{
    jobTitle: '[Demo placeholder] Add your job title',
    employer: '[Demo placeholder] Add your employer',
    location: '',
    startDate: '',
    endDate: '',
    bulletPoints: ['[Demo placeholder] Add verified responsibilities and achievements from your own experience.']
  }];
}

export function generateMockResume(jobData, profile, sourceResumeText) {
  const personalInfo = profile?.personalInfo || {};
  const summary = profileSummary(profile);
  const skills = asArray(profile?.skills);
  const experience = profileExperience(profile, sourceResumeText);
  const education = asArray(profile?.education).map(normalizeEducation).filter(edu =>
    edu.institution || edu.credential || edu.notes.length
  );
  const projects = asArray(profile?.projects);
  const certifications = asArray(profile?.certifications).map(normalizeCertification).filter(Boolean);

  return JSON.stringify({
    summary: `${summary}\n\n[Demo mode] This is simulated wording based only on the profile/source resume data available in the extension. Review all facts before using it.`,
    skills: skills.length ? skills : ['[Demo placeholder] Add verified skills from your profile or source resume.'],
    experience,
    education,
    projects,
    certifications
  }, null, 2);
}

export function generateMockCoverLetter(jobData, profile, sourceResumeText) {
  const personalInfo = profile?.personalInfo || {};
  const fullName = firstText(personalInfo.fullName, 'Candidate Name');
  const summary = profileSummary(profile);
  const firstRole = normalizeExperience(profile?.experience?.[0] || {});
  const skills = asArray(profile?.skills).slice(0, 5);
  const roleText = firstText(jobData.jobTitle, 'the role');
  const companyText = firstText(jobData.company, 'your organization');
  const experienceText = firstRole.jobTitle || firstRole.employer
    ? `My background includes ${[firstRole.jobTitle, firstRole.employer].filter(Boolean).join(' at ')}.`
    : '[Demo placeholder] Add verified work experience before submitting this paragraph.';
  const skillsText = skills.length
    ? `Relevant skills from my profile include ${skills.join(', ')}.`
    : '[Demo placeholder] Add verified skills before submitting this paragraph.';

  return JSON.stringify({
    greeting: `Dear Hiring Manager${jobData.company ? ` at ${jobData.company}` : ''},`,
    paragraphs: [
      `I am writing to express my interest in ${roleText} at ${companyText}. [Demo mode] This simulated draft is based only on the profile/source resume data currently available.`,
      `${summary}`,
      `${experienceText} ${skillsText}`,
      `Thank you for your time and consideration. I would welcome the chance to discuss how my verified background may fit ${companyText}.`
    ],
    closing: "Sincerely,",
    signOff: fullName
  }, null, 2);
}

const ATS_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'this', 'that',
  'will', 'from', 'have', 'has', 'must', 'can', 'all', 'any', 'into', 'such',
  'their', 'they', 'them', 'who', 'what', 'when', 'where', 'why', 'how', 'job',
  'role', 'work', 'team', 'company', 'candidate', 'position', 'including'
]);

export function mockExtractAtsKeywords(jobDescription = '') {
  const words = String(jobDescription)
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .map(word => word.replace(/^[.-]+|[.-]+$/g, ''))
    .filter(word => word.length > 2 && !ATS_STOPWORDS.has(word));

  if (!words.length) {
    return ['[Demo placeholder] Add a job description to scan ATS keywords.'];
  }

  const counts = new Map();
  const add = keyword => counts.set(keyword, (counts.get(keyword) || 0) + 1);

  words.forEach(add);
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] !== words[i + 1]) add(`${words[i]} ${words[i + 1]}`);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([keyword]) => keyword)
    .slice(0, 15);
}

export function generateMockApplicationEmail(jobData, profile) {
  const desc = String(jobData?.description || '').toLowerCase();
  const hasSpecial = /\b(email|apply by email|reference|competition number|screening|salary|availability|subject line)\b/.test(desc);
  const name = profile?.personalInfo?.fullName || '[Your Name]';
  const jobTitle = jobData?.jobTitle || 'the position';
  const company = jobData?.company || 'your organization';

  if (hasSpecial) {
    return JSON.stringify({
      hasSpecialInstructions: true,
      applicationMethod: 'email',
      recipientEmail: 'careers@example.com',
      subject: `Application for ${jobTitle} — Reference: DEMO-2024`,
      emailBody: `Dear Hiring Manager,\n\nI am writing to apply for the ${jobTitle} position (Reference: DEMO-2024) with ${company}.\n\nIn response to your application requirements:\n- Salary expectations: [Please confirm: your salary expectations]\n- Availability: [Please confirm: your available start date]\n\nPlease find attached my resume and cover letter for your review.\n\nThank you for your time and consideration.\n\nSincerely,\n${name}`,
      detectedInstructionsSummary: [
        '[Demo] Apply by email with a reference number in the subject',
        '[Demo] Include salary expectations',
        '[Demo] Include availability / start date'
      ],
      requiredItems: [
        'Include reference number DEMO-2024 in the subject line',
        'State salary expectations',
        'State your available start date',
        'Attach resume'
      ],
      screeningQuestions: [
        {
          question: 'What are your salary expectations?',
          suggestedAnswer: null,
          needsUserConfirmation: true,
          reason: '[Demo] Salary expectations are never assumed — confirm before sending'
        },
        {
          question: 'When are you available to start?',
          suggestedAnswer: null,
          needsUserConfirmation: true,
          reason: '[Demo] Availability date not found in profile'
        }
      ],
      attachmentsReminder: [
        'Attach your resume (PDF)',
        'Attach your cover letter (PDF) if generated'
      ],
      warnings: [
        '[Demo mode] This is a simulated response — no real AI was called.',
        'careers@example.com is a placeholder address. Replace with the actual employer email.'
      ],
      mailtoRecommended: true
    }, null, 2);
  }

  return JSON.stringify({
    hasSpecialInstructions: false,
    applicationMethod: 'unknown',
    recipientEmail: null,
    subject: `Application for ${jobTitle}`,
    emailBody: `Hello,\n\nI am writing to apply for the ${jobTitle} position with ${company}. Please find attached my resume and cover letter for your review.\n\nThank you for your time and consideration. I would welcome the opportunity to discuss how my experience and skills align with this role.\n\nSincerely,\n${name}`,
    detectedInstructionsSummary: [],
    requiredItems: [],
    screeningQuestions: [],
    attachmentsReminder: [
      'Attach your resume (PDF)',
      'Attach your cover letter (PDF) if generated'
    ],
    warnings: ['[Demo mode] This is a simulated response — no real AI was called.'],
    mailtoRecommended: false
  }, null, 2);
}

export function generateMockRecruiterMessage(jobData, profile) {
  const name = profile?.personalInfo?.fullName || '[Your Name]';
  const jobTitle = jobData?.jobTitle || jobData?.title || 'the role';
  const company = jobData?.company || 'your organization';
  const skills = asArray(profile?.skills).slice(0, 2);
  const strengths = skills.length
    ? `My background includes ${skills.join(' and ')}, based on the profile details I have saved.`
    : 'My background appears relevant, but I would review the profile details before sending this.';

  return JSON.stringify({
    subject: `Question about ${jobTitle} at ${company}`,
    messageBody: `Hello,\n\nI noticed the ${jobTitle} opportunity at ${company} and wanted to reach out. ${strengths} I would appreciate the chance to learn whether my background may be a fit or whether there is a better contact path for this opening.\n\nThank you for your time,\n${name}`,
    warnings: [
      '[Demo mode] This is a simulated recruiter outreach draft. Review all facts before sending.',
      'This is written as initial outreach and does not claim prior contact, referral, or application status.'
    ],
    notes: [
      'Nothing is sent automatically. Copy the message only after review.'
    ]
  }, null, 2);
}

export function generateMockFollowUpMessage(jobData, profile) {
  const name = profile?.personalInfo?.fullName || '[Your Name]';
  const jobTitle = jobData?.jobTitle || jobData?.title || 'the role';
  const company = jobData?.company || 'your organization';
  const status = jobData?.status || 'saved';
  const skills = asArray(profile?.skills).slice(0, 2);
  const strengthNote = skills.length
    ? `My background in ${skills.join(' and ')} continues to feel like a strong fit.`
    : 'I believe my background remains relevant to this opportunity.';

  if (status === 'rejected') {
    return JSON.stringify({
      subject: `Thank you — ${jobTitle} at ${company}`,
      messageBody: `Hello,\n\nThank you for considering me for the ${jobTitle} position at ${company}. I appreciate the time your team invested in reviewing my application. I have a genuine interest in the work you do and would welcome the chance to connect again if a fitting opportunity arises in the future.\n\nThank you,\n${name}`,
      warnings: [
        '[Demo mode] This is a simulated follow-up draft. Review all facts before sending.',
        'Status is "rejected" — this draft thanks the team without asking them to reconsider.'
      ],
      notes: [
        'Nothing is sent automatically. Copy the message only after review.'
      ]
    }, null, 2);
  }

  if (status === 'applied') {
    return JSON.stringify({
      subject: `Following up — ${jobTitle} at ${company}`,
      messageBody: `Hello,\n\nI wanted to follow up on my application for the ${jobTitle} position at ${company}. ${strengthNote} I remain enthusiastic about this opportunity and would welcome any update on the timeline or next steps.\n\nThank you for your time,\n${name}`,
      warnings: [
        '[Demo mode] This is a simulated follow-up draft. Review all facts before sending.',
        'Status is "applied" — this draft references your application. Verify you have formally applied before sending.'
      ],
      notes: [
        'Nothing is sent automatically. Copy the message only after review.'
      ]
    }, null, 2);
  }

  // saved / needs_review / ready_to_apply — must not imply application was submitted
  return JSON.stringify({
    subject: `Interest in ${jobTitle} at ${company}`,
    messageBody: `Hello,\n\nI wanted to follow up on my interest in the ${jobTitle} position at ${company}. ${strengthNote} I would welcome the chance to learn more about the role or the best path to connect further.\n\nThank you for your time,\n${name}`,
    warnings: [
      '[Demo mode] This is a simulated follow-up draft. Review all facts before sending.',
      'This draft does not claim you applied — status is not "applied". If you have formally applied, update the job status before regenerating.'
    ],
    notes: [
      'Nothing is sent automatically. Copy the message only after review.'
    ]
  }, null, 2);
}

export function generateMockApplicationAnswers(jobData, profile) {
  const jobTitle = jobData?.jobTitle || jobData?.title || 'this role';
  const company = jobData?.company || 'this organization';
  const skills = asArray(profile?.skills).slice(0, 3);
  const summary = firstText(
    profile?.summary,
    profile?.summaries?.find(s => s?.text)?.text,
    ''
  );
  const firstRole = profile?.experience?.[0];
  const roleText = firstRole?.jobTitle && firstRole?.employer
    ? `${firstRole.jobTitle} at ${firstRole.employer}`
    : null;

  const interestAnswer = `I am drawn to ${jobTitle} at ${company} because it aligns with my professional background and goals.${
    summary ? ` ${summary.slice(0, 120).trimEnd()}${summary.length > 120 ? '...' : ''}` : ''
  } [Demo mode] Review this answer — it is based only on the profile data currently saved.`;

  const experienceAnswer = roleText
    ? `My background includes experience as ${roleText}.${
        skills.length ? ` I have worked with ${skills.join(', ')}.` : ''
      } [Demo mode] Review this answer and add specific examples from your own experience before using it.`
    : `[Demo mode] Add your work experience to the profile to generate a relevant answer here.`;

  const selfAnswer = summary
    ? `${summary.slice(0, 200).trimEnd()}${summary.length > 200 ? '...' : ''} [Demo mode] This is drawn from your profile summary — edit as needed.`
    : `[Demo mode] Add a professional summary to your profile to generate a "Tell us about yourself" answer.`;

  return JSON.stringify({
    answers: [
      {
        question: 'Why are you interested in this role?',
        answer: interestAnswer,
        needsUserInput: false,
        inputNeeded: null,
        warnings: ['[Demo mode] Review before using — this is a simulated answer based on your saved profile data.'],
      },
      {
        question: 'What relevant experience do you have?',
        answer: experienceAnswer,
        needsUserInput: false,
        inputNeeded: null,
        warnings: ['[Demo mode] Review and add specific verified examples before copying.'],
      },
      {
        question: 'Why are you a good fit?',
        answer: null,
        needsUserInput: true,
        inputNeeded: 'To draft a "good fit" answer safely, add specific achievements, metrics, or examples from your experience that directly match this role. The profile does not contain enough verified evidence to draft this without risking invented claims.',
        warnings: [],
      },
      {
        question: 'Tell us about yourself.',
        answer: selfAnswer,
        needsUserInput: false,
        inputNeeded: null,
        warnings: ['[Demo mode] Review before using — this is drawn from your profile summary.'],
      },
      {
        question: 'Is there anything else you want us to know?',
        answer: null,
        needsUserInput: true,
        inputNeeded: 'This question is best answered in your own words. Add any relevant detail — awards, volunteering, unique context, or anything not covered in your resume — then copy the answer.',
        warnings: [],
      },
    ],
    notes: [
      'Review all answers before copying. Nothing is submitted automatically.',
      'Answers marked "Needs your input" have editable fields — type your own answer, then copy.',
    ],
    warnings: [
      '[Demo mode] This is a simulated response — no real AI was called.',
    ],
  }, null, 2);
}

export function generateMockJobChatReply(context, userMessage) {
  const job = context.jobTitle
    ? `${context.jobTitle}${context.company ? ` at ${context.company}` : ''}`
    : 'this role';
  const lower = (userMessage || '').toLowerCase();
  if (/should.*(apply|go for)/.test(lower)) {
    return `[Demo mode] Based on the available profile data, here is a realistic take on ${job}. Demo mode cannot perform an AI Fit Check. Switch to a real AI provider, scan the job page, and run AI Fit Check for a specific opinion.`;
  }
  if (/emphasize|highlight|lead with|focus/.test(lower)) {
    return `[Demo mode] For ${job}, lead with the experience and skills that honestly address the posting's priorities. A real AI provider and AI Fit Check will unlock specific wording recommendations.`;
  }
  if (/gap|miss|weak|lack|short/.test(lower)) {
    return `[Demo mode] I will not invent gaps from a keyword list. Switch to a real AI provider, scan the job description, and run AI Fit Check for a contextual review of possible gaps.`;
  }
  if (/resume|angle|position|frame|tailor/.test(lower)) {
    return `[Demo mode] The strongest resume angle for ${job} is a summary that mirrors the top 2–3 priority requirements from the posting, using the job's own language where it is accurate for you. Do not use language that implies experience you do not have. Scan the job and use a real provider for specific suggestions.`;
  }
  if (/overstate|exaggerate|inflate|claim|say i have/.test(lower)) {
    return `[Demo mode] Only claim what is verifiably in your profile or source resume. For adjacent skills, use framing like "exposure to", "familiar with", or "have worked alongside" rather than claiming direct expertise. I will flag anything that seems overstated when reviewing real context.`;
  }
  if (/interview|question|prepare/.test(lower)) {
    return `[Demo mode] Prepare examples for the requirements you can support with documented evidence. For missing requirements, acknowledge the gap honestly and pivot to a related verified strength. Real interview prep needs the full job description, profile, and a real AI provider.`;
  }

  return `[Demo mode] This is a simulated response — no real AI was called. Scan a job page, fill in your profile in Settings → My Profile, and switch to a real AI provider to get specific application strategy advice for ${job}.`;
}

function mockProfileUpdateSection(message) {
  if (/\bskill|skills\b/i.test(message)) return 'skills';
  if (/\bsummary|summaries\b/i.test(message)) return 'summary';
  if (/\bheadline\b/i.test(message)) return 'headline';
  if (/\beducation|degree|diploma|school|university|college\b/i.test(message)) return 'education';
  if (/\bcertification|certificate|license|licence\b/i.test(message)) return 'certifications';
  if (/\bproject|projects\b/i.test(message)) return 'projects';
  if (/\bpersonal info|email|phone|linkedin|portfolio|website\b/i.test(message)) return 'personalInfo';
  if (/\bcover letter profile\b/i.test(message)) return 'coverLetterProfile';
  if (/\bdo not claim\b/i.test(message)) return 'doNotClaimNotes';
  if (/\bexperience|work history|employment|role|job\b/i.test(message)) return 'experience';
  return 'customSections';
}

function mockProfileUpdateAction(message) {
  if (/\b(remove|delete|drop)\b/i.test(message)) return 'remove';
  if (/\b(update|edit|change|improve|rewrite|revise)\b/i.test(message)) return 'update';
  return 'add';
}

function mockExtractSkill(message) {
  const match = message.match(/\b(?:include|add|with)\s+(.+?)(?:\s+to\s+my\s+profile|$)/i);
  return (match?.[1] || message).replace(/\b(skills?|profile|update|add|include)\b/gi, '').trim();
}

function mockExtractExperience(message) {
  const atMatch = message.match(/\b(.+?)\s+at\s+(.+?)(?:\s+to\s+my\s+profile|\s+role|\s+job|$)/i);
  if (atMatch) {
    return {
      jobTitle: atMatch[1].replace(/\b(add|include|my|role|job|experience|profile)\b/gi, '').trim(),
      employer: atMatch[2].trim(),
      location: '',
      startDate: '',
      endDate: '',
      bulletPoints: [],
    };
  }

  const roleMatch = message.match(/\b(?:add|include)\s+(?:my\s+)?(.+?)\s+(?:role|job|experience)\b/i);
  const phrase = (roleMatch?.[1] || '').trim();
  const words = phrase.split(/\s+/).filter(Boolean);
  if (/sun life/i.test(phrase) && words.length >= 3) {
    return {
      jobTitle: words.slice(2).join(' '),
      employer: words.slice(0, 2).join(' '),
      location: '',
      startDate: '',
      endDate: '',
      bulletPoints: [],
    };
  }
  return {
    jobTitle: phrase || 'Role described by user',
    employer: '',
    location: '',
    startDate: '',
    endDate: '',
    bulletPoints: [],
  };
}

export function generateMockJobChatProfileUpdateProposal(context, userMessage) {
  const message = String(userMessage || '').trim();
  const section = mockProfileUpdateSection(message);
  const action = mockProfileUpdateAction(message);
  let proposedValue;

  if (section === 'skills') {
    proposedValue = [mockExtractSkill(message)].filter(Boolean);
  } else if (section === 'experience') {
    proposedValue = mockExtractExperience(message);
  } else if (section === 'headline') {
    proposedValue = message.replace(/\b(improve|update|rewrite|revise|headline|profile)\b/gi, '').trim();
  } else if (section === 'summary') {
    proposedValue = { text: message.replace(/\b(improve|update|rewrite|revise)\b/gi, '').trim() };
  } else if (section === 'personalInfo') {
    proposedValue = { cityProvince: message.replace(/\b(update|edit|change|personal info|profile)\b/gi, '').trim() };
  } else if (section === 'education') {
    proposedValue = { credential: message.replace(/\b(add|include|education|degree|diploma|profile)\b/gi, '').trim() };
  } else if (section === 'certifications') {
    proposedValue = { name: message.replace(/\b(add|include|certification|certificate|license|licence|profile)\b/gi, '').trim() };
  } else if (section === 'projects') {
    proposedValue = { name: message.replace(/\b(add|include|remove|delete|drop|project|profile)\b/gi, '').trim() };
  } else if (section === 'customSections') {
    proposedValue = { label: 'Additional Background', text: message };
  } else if (section === 'doNotClaimNotes') {
    proposedValue = message;
  } else if (section === 'coverLetterProfile') {
    proposedValue = { strengths: message.replace(/\b(update|edit|change|cover letter profile|profile)\b/gi, '').trim() };
  } else if (action === 'remove') {
    proposedValue = null;
  } else {
    proposedValue = { note: message };
  }

  return {
    type: 'profile_update_proposal',
    proposalVersion: 1,
    section,
    action,
    confidence: action === 'remove' ? 'needs_review' : 'user_stated',
    requiresConfirmation: true,
    summary: `${action.charAt(0).toUpperCase()}${action.slice(1)} ${section} from your request`,
    target: action === 'remove' ? message : null,
    proposedValue,
    warnings: action === 'remove'
      ? ['Removal suggestions are read-only in this phase. Review the profile manually before deleting anything.']
      : ['[Demo mode] This is a simulated suggestion based only on the current chat message.'],
    sensitiveFields: [],
    sourceUserMessage: message,
  };
}

export function mockReviseDraft(currentDraft, request, docType) {
  let parsed;
  try {
    parsed = typeof currentDraft === 'string' ? JSON.parse(currentDraft) : currentDraft;
  } catch {
    parsed = {};
  }

  // Simple mock transformation: just add a note about the revision
  if (docType === 'resume') {
    parsed.summary = `[REVISED: ${request}] ` + (parsed.summary || "");
  } else {
    parsed.paragraphs = [
      `[REVISED per request: ${request}]`,
      ...(parsed.paragraphs || [])
    ];
  }

  return JSON.stringify(parsed, null, 2);
}
