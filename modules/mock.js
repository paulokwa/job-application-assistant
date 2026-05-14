// modules/mock.js
// Mock AI responses for testing workflows without API costs.

export function generateMockResume(jobData, profile, sourceResumeText) {
  return JSON.stringify({
    summary: `Dedicated professional eager to join ${jobData.company || 'the team'} as a ${jobData.jobTitle || 'specialist'}. Proven track record of leveraging skills to drive results.`,
    skills: ["Strategic Planning", "Team Leadership", "Data Analysis", "Communication"],
    experience: [
      {
        jobTitle: jobData.jobTitle || "Senior Professional",
        employer: jobData.company || "Leading Corporation",
        location: "Remote",
        startDate: "Jan 2021",
        endDate: "Present",
        bulletPoints: [
          "Delivered high-impact solutions for cross-functional teams.",
          "Optimized internal processes reducing overhead by 15%.",
          "Mentored junior staff and fostered a culture of excellence."
        ]
      }
    ],
    education: [
      {
        institution: "State University",
        credential: "Bachelor of Science",
        location: "City, ST",
        dates: "2015 - 2019",
        notes: ["Dean's List for 4 consecutive semesters"]
      }
    ],
    projects: [
      {
        name: "Project Excellence",
        role: "Project Lead",
        description: "Headed a diverse team to implement a new CRM system.",
        technologies: ["JavaScript", "Node.js", "PostgreSQL"],
        link: "https://project.example.com"
      }
    ],
    certifications: ["Project Management Professional (PMP)", "Six Sigma Green Belt"]
  }, null, 2);
}

export function generateMockCoverLetter(jobData, profile, sourceResumeText) {
  return JSON.stringify({
    greeting: `Dear Hiring Manager at ${jobData.company || 'the company'},`,
    paragraphs: [
      `I am writing to express my strong interest in the ${jobData.jobTitle || 'Specialist'} position. With my background in the industry and my commitment to excellence, I am confident I would be a valuable addition to your team.`,
      `In my previous roles, I have consistently demonstrated the ability to tackle complex challenges and deliver meaningful results. My experience aligns perfectly with the requirements mentioned in your job posting.`,
      `Thank you for your time and consideration. I look forward to discussing how my skills can contribute to the continued success of ${jobData.company || 'your organization'}.`
    ],
    closing: "Sincerely,",
    signOff: profile.personalInfo?.fullName || "Candidate Name"
  }, null, 2);
}

export function mockExtractAtsKeywords() {
  return [
    'team leadership', 'data analysis', 'strategic planning', 'communication',
    'project management', 'stakeholder engagement', 'Microsoft Office',
    'problem solving', "Bachelor's degree", 'cross-functional collaboration',
    'budget management', 'process improvement'
  ];
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
