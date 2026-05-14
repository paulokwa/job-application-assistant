// modules/schema.js
// Single source of truth for the resume and cover letter data structure.

/**
 * @typedef {Object} PersonalInfo
 * @property {string} fullName
 * @property {string} email
 * @property {string} phone
 * @property {string} cityProvince
 * @property {string} linkedin
 * @property {string} portfolio
 * @property {string} website
 */

/**
 * @typedef {Object} Experience
 * @property {string} jobTitle
 * @property {string} employer
 * @property {string} location
 * @property {string} startDate
 * @property {string} endDate
 * @property {string[]} bulletPoints
 */

/**
 * @typedef {Object} Education
 * @property {string} institution
 * @property {string} credential
 * @property {string} location
 * @property {string} dates
 * @property {string[]} notes
 */

/**
 * @typedef {Object} Project
 * @property {string} name
 * @property {string} role
 * @property {string} description
 * @property {string[]} technologies
 * @property {string} link
 */

/**
 * @typedef {Object} CoverLetterProfile
 * @property {string} tone
 * @property {string} strengths
 * @property {string} targetRole
 * @property {string} notableAchievements
 */

/**
 * @typedef {Object} ResumeMetadata
 * @property {string} selectedTemplate
 * @property {string} accentColor
 * @property {string} spacingMode - 'standard' | 'compact'
 */

/**
 * @typedef {Object} ResumeContent
 * @property {PersonalInfo} personalInfo
 * @property {string} summary
 * @property {Experience[]} experience
 * @property {Education[]} education
 * @property {string[]} skills
 * @property {Project[]} projects
 * @property {string[]} certifications
 * @property {{label: string, text: string}[]} customSections
 * @property {string} doNotClaimNotes
 * @property {CoverLetterProfile} coverLetterProfile
 * @property {ResumeMetadata} metadata
 */

export const DEFAULT_RESUME_CONTENT = {
  personalInfo: {
    fullName: '',
    email: '',
    phone: '',
    cityProvince: '',
    linkedin: '',
    portfolio: '',
    website: '',
  },
  summary: '',
  summaries: [],
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  customSections: [],
  doNotClaimNotes: '',
  coverLetterProfile: {
    tone: 'Professional',
    strengths: '',
    targetRole: '',
    notableAchievements: '',
  },
  metadata: {
    selectedTemplate: 'classic',
    accentColor: '#2563eb', // Default blue-600
    spacingMode: 'standard',
  },
};

function normalizePersonalInfo(data = {}) {
  return {
    ...DEFAULT_RESUME_CONTENT.personalInfo,
    ...(data.personalInfo || data.personal || {}),
    cityProvince: data.personalInfo?.cityProvince
      || data.personalInfo?.address
      || data.personal?.cityProvince
      || data.personal?.address
      || '',
  };
}

function normalizeCustomSections(data = {}) {
  const rawSections = data.customSections || data.customFields || data.additionalSections || [];
  if (!Array.isArray(rawSections)) return [];

  return rawSections
    .map(section => ({
      label: String(section.label || section.name || section.title || 'Additional Background').trim(),
      text: String(section.text || section.value || section.content || '').trim(),
    }))
    .filter(section => section.label && section.text);
}

/**
 * Normalizes any object into the ResumeContent schema.
 * Useful for migrating from old profile formats or cleaning AI output.
 */
export function normalizeResumeContent(data = {}) {
  const base = { ...DEFAULT_RESUME_CONTENT };

  return {
    personalInfo: normalizePersonalInfo(data),
    summary: data.summary || (data.summaries?.[0]?.text) || '',
    summaries: Array.isArray(data.summaries) ? data.summaries.map(s => ({
      label: s.label || 'Summary',
      text: s.text || ''
    })) : [],
    experience: (data.experience || []).map(exp => ({
      jobTitle: exp.jobTitle || exp.title || '',
      employer: exp.employer || exp.company || '',
      location: exp.location || '',
      startDate: exp.startDate || exp.dates?.split(' - ')[0] || '',
      endDate: exp.endDate || exp.dates?.split(' - ')[1] || '',
      bulletPoints: Array.isArray(exp.bulletPoints) ? exp.bulletPoints : (exp.bullets ? exp.bullets.split('\n').map(b => b.trim().replace(/^[•\-\*]\s*/, '')) : []),
    })),
    education: (data.education || []).map(edu => ({
      institution: edu.institution || edu.school || '',
      credential: edu.credential || edu.degree || '',
      location: edu.location || '',
      dates: edu.dates || edu.year || '',
      notes: Array.isArray(edu.notes) ? edu.notes : (edu.notes ? [edu.notes] : []),
    })),
    skills: Array.isArray(data.skills) ? data.skills : [],
    projects: (data.projects || []).map(p => ({
      name: p.name || '',
      role: p.role || '',
      description: p.description || '',
      technologies: Array.isArray(p.technologies) ? p.technologies : [],
      link: p.link || '',
    })),
    certifications: Array.isArray(data.certifications) ? data.certifications.map(c => typeof c === 'string' ? c : (c.name || '')) : [],
    customSections: normalizeCustomSections(data),
    doNotClaimNotes: data.doNotClaimNotes || data.doNotClaim || '',
    coverLetterProfile: { ...base.coverLetterProfile, ...(data.coverLetterProfile || {}) },
    metadata: { ...base.metadata, ...(data.metadata || {}) },
  };
}
