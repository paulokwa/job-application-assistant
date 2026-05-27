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
