// modules/extraction.js
// Parses raw job page text to extract structured job fields and detect special instructions.
// Also handles DOCX text extraction for profile auto-fill.

/**
 * Attempts to extract structured job fields from raw text.
 * @param {string} rawText - The raw text from the page or selection
 * @param {string} url - The source URL
 * @returns {{ jobTitle, company, sourceUrl, description }}
 */
export function extractJobFields(rawText, url) {
  if (!rawText) return { jobTitle: '', company: '', sourceUrl: url || '', description: '' };
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  let jobTitle = '';
  let company = '';

  const titlePatterns = [
    /^job\s*title[:\-–]?\s*(.+)$/i,
    /^position[:\-–]?\s*(.+)$/i,
    /^role[:\-–]?\s*(.+)$/i,
    /^vacancy[:\-–]?\s*(.+)$/i,
    /^posting\s*title[:\-–]?\s*(.+)$/i,
  ];
  const companyPatterns = [
    /^(?:company|employer|organization|department|ministry|agency|branch)[:\-–]?\s*(.+)$/i,
    /^(?:employer|hiring\s*organization)[:\-–]?\s*(.+)$/i,
  ];

  for (const line of lines) {
    if (!jobTitle) {
      for (const pat of titlePatterns) {
        const m = line.match(pat);
        if (m) { jobTitle = m[1].trim(); break; }
      }
    }
    if (!company) {
      for (const pat of companyPatterns) {
        const m = line.match(pat);
        if (m) { company = m[1].trim(); break; }
      }
    }
    if (jobTitle && company) break;
  }

  // Fallback: first meaningful line as job title
  if (!jobTitle) {
    const firstMeaningfulLine = lines.find(l => l.length > 8 && l.length < 120 && !/^(home|menu|skip|search|login|sign)/i.test(l));
    if (firstMeaningfulLine) jobTitle = firstMeaningfulLine;
  }

  return {
    jobTitle: jobTitle || '',
    company:  company  || '',
    sourceUrl: url || '',
    description: rawText,
  };
}

/**
 * Scans text for special application instructions.
 * @param {string} text
 * @returns {string[]} Array of detected instruction strings
 */
export function detectSpecialInstructions(text) {
  const instructions = [];
  const lower = text.toLowerCase();

  // Email submission
  const emailMatches = text.match(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g);
  if (emailMatches) {
    // Only flag if it appears in context that suggests submission
    const submissionCtx = /send\s+(?:your\s+)?(?:resume|application|cv|cover)|apply\s+(?:by\s+)?email|email\s+(?:your\s+)?(?:resume|application)|submit.*email/i;
    if (submissionCtx.test(text)) {
      const uniqueEmails = [...new Set(emailMatches)];
      instructions.push(`📧 Submit by email to: ${uniqueEmails.join(', ')}`);
    }
  }

  // Closing / deadline dates
  const deadlinePatterns = [
    /closing\s+date[:\s]+([^\n.]{3,60})/i,
    /application\s+deadline[:\s]+([^\n.]{3,60})/i,
    /applications?\s+(?:must\s+be\s+)?(?:received|submitted)\s+by[:\s]+([^\n.]{3,60})/i,
    /apply\s+by[:\s]+([^\n.]{3,60})/i,
    /deadline[:\s]+([^\n.]{3,60})/i,
    /(?:posted|closes?)[:\s]+([A-Z][a-z]+ \d{1,2},? \d{4})/i,
  ];
  for (const pat of deadlinePatterns) {
    const m = text.match(pat);
    if (m) {
      instructions.push(`📅 Deadline: ${m[1].trim()}`);
      break;
    }
  }

  // Reference / competition numbers
  const refPatterns = [
    /(?:competition|reference|job|posting|req(?:uisition)?)\s*(?:number|no|#|id)[:\s#]+([A-Z0-9\-_]{3,30})/i,
    /(?:file|vacancy)\s*(?:number|no|#)[:\s#]+([A-Z0-9\-_]{3,30})/i,
  ];
  for (const pat of refPatterns) {
    const m = text.match(pat);
    if (m) {
      instructions.push(`🔢 Reference/Competition #: ${m[1].trim()}`);
      break;
    }
  }

  // Required attachments
  const attachmentKeywords = [
    { re: /writing\s+sample/i, label: '📝 A writing sample is required.' },
    { re: /portfolio/i, label: '🗂 A portfolio is required or requested.' },
    { re: /references?\s+(?:required|must|list|page)/i, label: '👥 References are required.' },
    { re: /cover\s+letter\s+(?:is\s+)?(?:required|must)/i, label: '📄 Cover letter explicitly required.' },
    { re: /transcript/i, label: '🎓 Academic transcript may be required.' },
    { re: /proof\s+of\s+(?:education|certification|license)/i, label: '📋 Proof of education/certification required.' },
  ];
  for (const kw of attachmentKeywords) {
    if (kw.re.test(text)) instructions.push(kw.label);
  }

  // Combine-into-one-file instructions
  if (/combine.*(?:one|single)\s*(?:pdf|file|document)|merge.*documents?/i.test(text)) {
    instructions.push('📎 Instructions say to combine documents into one file.');
  }

  // Salary expectation request
  if (/salary\s+(?:expectation|requirement|history|range)\s+(?:required|requested|include|provide)/i.test(text)) {
    instructions.push('💰 Salary expectations or history may be requested.');
  }

  // Subject line requirement
  const subjectMatch = text.match(/subject\s*(?:line)?[:\s]+["']?([^"'\n]{5,80})["']?/i);
  if (subjectMatch && /email|send/i.test(text)) {
    instructions.push(`✉️ Use subject line: "${subjectMatch[1].trim()}"`);
  }

  return instructions;
}

/**
 * Uses the configured AI provider to extract user profile data from the raw text of a resume.
 * @param {string} resumeText - The raw text of the uploaded resume
 * @param {object} settings - The provider settings ({ provider, apiKey, modelName, endpoint })
 * @returns {Promise<object>} - Parsed profile matching DEFAULT_PROFILE structure
 */
export async function extractProfileFromResume(resumeText, settings) {
  if (!settings || !settings.provider) {
    throw new Error('AI provider is not configured. Please configure it in settings.');
  }

  // We only run this dynamically, so let's import callAI here to avoid circular dep issues just in case,
  // or just rely on the fact that provider.js is already imported in settings where this is called.
  // Actually, we should just import it at the top level of this file.
  
  const systemPrompt = `You are a resume parsing assistant. 
Your goal is to extract information from the user's resume and output it STRICTLY as a JSON object matching the exact schema below.
If a piece of information is missing, leave the string empty or the array empty.
Do NOT include any markdown formatting, backticks, or explanation in your output. Just the raw JSON object.

Schema:
{
  "personal": {
    "fullName": "Name",
    "email": "Email address",
    "phone": "Phone number",
    "address": "Location/Address",
    "linkedin": "LinkedIn URL",
    "portfolio": "Portfolio/Website URL"
  },
  "summaries": [
    { "label": "General Profile", "text": "A professional summary or objective extracted from the resume" }
  ],
  "skills": ["Skill 1", "Skill 2"],
  "experience": [
    { 
      "title": "Job Title", 
      "company": "Company Name", 
      "dates": "Start - End Date", 
      "location": "Job Location", 
      "bullets": "• Bullet 1\\n• Bullet 2", 
      "tags": [] 
    }
  ],
  "education": [
    { "degree": "Degree/Diploma", "school": "School Name", "year": "Graduation Year", "notes": "Any honors or notes" }
  ],
  "certifications": [
    { "name": "Cert Name", "issuer": "Issuing Org", "year": "Year", "doNotClaim": false }
  ]
}`;

  const userPrompt = `Here is the user's resume text:\n\n${resumeText}\n\nParse this into the requested JSON schema now.`;

  // We are importing callAI dynamically to avoid circular dependencies
  const { callAI } = await import('./provider.js');

  const responseText = await callAI(systemPrompt, userPrompt, settings);
  
  try {
    // Strip markdown blocks if the AI accidentally adds them
    let cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    // Sometimes it might start or end with a tick
    cleanJson = cleanJson.replace(/^`/, '').replace(/`$/, '');
    
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error('Failed to parse AI resume extraction JSON:', e, responseText);
    throw new Error('AI returned invalid profile data layout.');
  }
}

/**
 * Extracts raw text from a DOCX file buffer.
 * Simple implementation for profile auto-fill.
 */
export async function extractTextFromDocx(arrayBuffer) {
  // We use PizZip from the global scope if available (loaded in settings/dashboard)
  const PizZipLib = (typeof PizZip !== 'undefined') ? PizZip : window.PizZip;
  if (!PizZipLib) {
    // Fallback: load it dynamically if we are in an environment that allows it
    // But usually it's pre-loaded in HTML.
    throw new Error('PizZip library not found. Ensure lib/pizzip.js is loaded.');
  }

  const zip = new PizZipLib(arrayBuffer);
  const docXml = zip.file('word/document.xml').asText();
  
  // Very simplistic XML to Text: strip all tags
  // For better results we could look for <w:t> specifically
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXml, "text/xml");
  const texts = xmlDoc.getElementsByTagName("w:t");
  let out = "";
  for (let i = 0; i < texts.length; i++) {
    out += texts[i].textContent + " ";
  }
  return out.trim();
}

/**
 * Reads an ArrayBuffer from a File object.
 */
export function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}
