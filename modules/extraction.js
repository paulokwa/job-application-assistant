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
If the resume includes useful non-standard sections that do not fit the main fields, preserve them under customSections.
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
  ],
  "customSections": [
    { "label": "Volunteer Work", "text": "Useful resume content that does not fit the standard fields" }
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
    console.error('Failed to parse AI resume extraction JSON:', e?.message || e);
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

// ── PDF Extraction ────────────────────────────────────────────────────────
// Strategy: decompress FlateDecode content streams using the browser's native
// DecompressionStream API, then parse PDF text operators (BT/ET/Tj/TJ).
// Falls back to a byte scan for uncompressed PDFs.
// Neither approach handles scanned/image PDFs or complex font encoding tables.

/**
 * Extracts text from a PDF File object.
 * Primary: decompresses content streams and parses text operators.
 * Fallback: scans raw bytes for printable ASCII (catches uncompressed PDFs).
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractTextFromPdf(file) {
  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);

  let streamText = '';
  try {
    streamText = await extractPdfStreams(bytes);
  } catch (_) {
    // Stream extraction failed entirely — proceed to fallback
  }

  // Prefer stream extraction when it produced meaningful content.
  // Byte-scanning a compressed PDF produces large amounts of printable-range garbage,
  // so a raw length comparison would incorrectly favour the scan over real text.
  let text;
  if (streamText.trim().length >= 50) {
    text = streamText;
  } else {
    const scanText = extractPdfByteScan(bytes);
    text = scanText.trim().length > streamText.trim().length ? scanText : streamText;
  }

  return normalizePdfText(text);
}

/**
 * Scores quality of extracted PDF text.
 * Returns a level ('good' | 'partial' | 'poor' | 'failed') plus raw metrics.
 * @param {string} text
 * @returns {{ level: string, score: number, charCount: number }}
 */
export function scorePdfExtraction(text) {
  if (!text || text.trim().length === 0) return { level: 'failed', score: 0, charCount: 0 };

  const t = text.toLowerCase();
  const charCount = text.trim().length;
  let score = 0;

  // Volume
  if (charCount >= 800) score += 3;
  else if (charCount >= 300) score += 2;
  else if (charCount >= 100) score += 1;

  // Contact signals
  if (/@[a-z0-9.-]+\.[a-z]{2,}/.test(t)) score += 2;
  if (/\b\d{3}[\s.\-]\d{3}[\s.\-]\d{4}|\(\d{3}\)\s*\d{3}/.test(text)) score += 1;
  if (/linkedin/.test(t)) score += 1;

  // Resume section headings
  const headings = ['experience', 'education', 'skills', 'summary', 'objective',
    'certifications', 'projects', 'work history', 'employment'];
  const foundCount = headings.filter(h => t.includes(h)).length;
  score += Math.min(foundCount * 2, 4);

  const level = score >= 8 ? 'good' : score >= 4 ? 'partial' : 'poor';
  return { level, score, charCount };
}

/**
 * Finds all PDF content streams, decompresses FlateDecode ones with
 * DecompressionStream, and extracts text from each.
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
async function extractPdfStreams(bytes) {
  // Decode as latin1 — lossless for binary data (byte N → codepoint N)
  const raw = new TextDecoder('latin1').decode(bytes);
  const collectedTexts = [];
  let searchFrom = 0;

  while (searchFrom < raw.length) {
    // Find next valid stream keyword (must be preceded by newline)
    const idx1 = raw.indexOf('\nstream\n', searchFrom);
    const idx2 = raw.indexOf('\nstream\r\n', searchFrom);

    let contentStart;
    if (idx1 === -1 && idx2 === -1) break;

    if (idx1 !== -1 && (idx2 === -1 || idx1 <= idx2)) {
      contentStart = idx1 + 8;  // skip '\nstream\n'
    } else {
      contentStart = idx2 + 9;  // skip '\nstream\r\n'
    }

    // Look back up to 512 chars for the stream's dictionary
    const lookbackStart = Math.max(0, contentStart - 520);
    const region = raw.slice(lookbackStart, contentStart);
    const dictStart = region.lastIndexOf('<<');

    if (dictStart === -1) { searchFrom = contentStart; continue; }

    const dictStr = region.slice(dictStart);

    // Skip image and font-descriptor streams
    if (/\/Subtype\s*\/Image/i.test(dictStr) || /\/Type\s*\/FontDescriptor/i.test(dictStr)) {
      searchFrom = contentStart;
      continue;
    }

    // Get declared byte length — must be a literal number (indirect refs skipped)
    const lenMatch = dictStr.match(/\/Length\s+(\d+)/);
    if (!lenMatch) { searchFrom = contentStart; continue; }

    const declaredLength = parseInt(lenMatch[1], 10);
    if (declaredLength <= 0 || contentStart + declaredLength > raw.length) {
      searchFrom = contentStart;
      continue;
    }

    const isFlate = /\/Filter\s*\/FlateDecode/i.test(dictStr) ||
                    /\/Filter\s*\[.*?\/FlateDecode.*?\]/i.test(dictStr);

    let contentStr = null;

    if (isFlate) {
      try {
        const compressed = bytes.slice(contentStart, contentStart + declaredLength);
        const decompressed = await decompressZlib(compressed);
        if (decompressed) {
          contentStr = new TextDecoder('latin1').decode(decompressed);
        }
      } catch (_) {
        // Skip this stream on error
      }
    } else {
      contentStr = raw.slice(contentStart, contentStart + declaredLength);
    }

    if (contentStr) {
      const text = parseContentStreamText(contentStr);
      if (text && text.trim().length > 0) collectedTexts.push(text);
    }

    searchFrom = contentStart + declaredLength;
  }

  return collectedTexts.join('\n');
}

/**
 * Decompresses a FlateDecode stream using the browser-native DecompressionStream API.
 * Tries zlib format first (PDF spec), then raw deflate (some generators omit the header).
 * Returns null if the API is unavailable or both formats fail.
 * @param {Uint8Array} compressed
 * @returns {Promise<Uint8Array|null>}
 */
async function decompressZlib(compressed) {
  if (typeof DecompressionStream === 'undefined') return null;
  // 'deflate' = zlib wrapper (RFC 1950) — correct per PDF spec
  // 'deflate-raw' = raw DEFLATE (RFC 1951) — fallback for non-compliant generators
  for (const format of ['deflate', 'deflate-raw']) {
    const result = await tryDecompress(compressed, format);
    if (result) return result;
  }
  return null;
}

async function tryDecompress(compressed, format) {
  try {
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();

    // Fire-and-forget write: don't await before reading or we can deadlock on backpressure
    writer.write(compressed).then(() => writer.close()).catch(() => {});

    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } catch (_) {
      if (chunks.length === 0) return null;
    }

    if (chunks.length === 0) return null;
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  } catch (_) {
    return null;
  }
}

/**
 * Parses text from a decoded PDF content stream string.
 * Handles BT/ET blocks and Tj, TJ, ' operators.
 * @param {string} content
 * @returns {string}
 */
function parseContentStreamText(content) {
  const segments = [];

  // Match BT...ET blocks (non-greedy, dot matches newlines via [\s\S])
  const btEtRegex = /\bBT\b([\s\S]*?)\bET\b/g;
  let m;
  while ((m = btEtRegex.exec(content)) !== null) {
    const blockText = parseTextBlock(m[1]);
    if (blockText.trim()) segments.push(blockText.trim());
  }

  return segments.join('\n');
}

/**
 * Extracts text from the body of a BT...ET block.
 * @param {string} block
 * @returns {string}
 */
function parseTextBlock(block) {
  let result = '';
  const lines = block.split(/\r?\n/);

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // T* — move to next line
    if (/\bT\*\b/.test(t)) { result += '\n'; continue; }

    // Td / TD — vertical movement means new line
    const tdM = t.match(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+T[dD]\b/);
    if (tdM && Math.abs(parseFloat(tdM[2])) > 0.1) { result += '\n'; }

    // Tj — (string) Tj  or  <hex> Tj
    const tjRe = /(\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]*>)\s+Tj\b/g;
    let sub;
    while ((sub = tjRe.exec(t)) !== null) result += decodePdfOperand(sub[1]);

    // ' — newline + show string (\b after ' is wrong; ' is non-word so boundary never fires)
    const primeRe = /(\((?:[^()\\]|\\.)*\)|<[0-9a-fA-F\s]*>)\s+'(?=\s|$)/g;
    while ((sub = primeRe.exec(t)) !== null) result += '\n' + decodePdfOperand(sub[1]);

    // TJ — [(str)kern(str)...] TJ
    const tjArrRe = /\[([\s\S]*?)\]\s+TJ\b/g;
    while ((sub = tjArrRe.exec(t)) !== null) result += decodeTjArray(sub[1]);
  }

  return result;
}

/**
 * Decodes a single PDF string operand: literal (text) or hex <hex>.
 * @param {string} operand
 * @returns {string}
 */
function decodePdfOperand(operand) {
  if (operand.startsWith('(')) return decodePdfLiteralString(operand.slice(1, -1));
  if (operand.startsWith('<')) return decodePdfHexString(operand.slice(1, -1));
  return '';
}

/**
 * Decodes a PDF literal string, handling common escape sequences.
 * Strips high-byte characters that aren't standard ASCII.
 * @param {string} raw
 * @returns {string}
 */
function decodePdfLiteralString(raw) {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\[0-7]{1,3}/g, m => {
      const code = parseInt(m.slice(1), 8);
      return code >= 0x20 && code <= 0x7E ? String.fromCharCode(code) : '';
    })
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

/**
 * Decodes a PDF hex string like 48656C6C6F → "Hello".
 * @param {string} hex
 * @returns {string}
 */
function decodePdfHexString(hex) {
  const cleaned = hex.replace(/\s/g, '');
  let out = '';
  for (let i = 0; i + 1 < cleaned.length; i += 2) {
    const code = parseInt(cleaned.slice(i, i + 2), 16);
    if (code >= 0x20 && code <= 0x7E) out += String.fromCharCode(code);
  }
  return out;
}

/**
 * Decodes a TJ array: mix of literal strings, hex strings, and kerning numbers.
 * Large negative kerning values (< -200) are treated as word spaces.
 * @param {string} inner - content between the outer brackets
 * @returns {string}
 */
function decodeTjArray(inner) {
  let out = '';
  let i = 0;
  while (i < inner.length) {
    if (inner[i] === '(') {
      // Literal string — walk to matching close paren, respecting escapes
      let j = i + 1;
      let depth = 1;
      while (j < inner.length && depth > 0) {
        if (inner[j] === '\\') { j += 2; continue; }
        if (inner[j] === '(') depth++;
        if (inner[j] === ')') depth--;
        j++;
      }
      out += decodePdfLiteralString(inner.slice(i + 1, j - 1));
      i = j;
    } else if (inner[i] === '<') {
      const end = inner.indexOf('>', i);
      if (end === -1) break;
      out += decodePdfHexString(inner.slice(i + 1, end));
      i = end + 1;
    } else {
      const numM = inner.slice(i).match(/^\s*(-?\d+(?:\.\d+)?)\s*/);
      if (numM) {
        if (parseFloat(numM[1]) < -200) out += ' '; // large kerning gap = word space
        i += numM[0].length;
      } else {
        i++;
      }
    }
  }
  return out;
}

/**
 * Fallback: scans raw bytes for printable ASCII.
 * Works for uncompressed PDFs or PDFs with ASCII-encoded content streams.
 * Filters out lines that are purely PDF syntax noise.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function extractPdfByteScan(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c >= 32 && c < 127) text += String.fromCharCode(c);
    else if (c === 10 || c === 13) text += '\n';
  }
  return text.split('\n')
    .filter(line => line.trim().length > 3 && /[a-zA-Z0-9]/.test(line))
    .join('\n');
}

/**
 * Post-processes extracted PDF text:
 * - Collapses spaced-out headings like "S K I L L S" → "SKILLS"
 * - Reduces excessive blank lines
 * - Removes lines with no alphanumeric content
 * @param {string} text
 * @returns {string}
 */
function normalizePdfText(text) {
  if (!text) return '';

  // "S K I L L S" → "SKILLS" (3+ single uppercase letters separated by single spaces)
  text = text.replace(/\b([A-Z](?: [A-Z]){2,})\b/g, m => m.replace(/ /g, ''));

  // Collapse runs of 3+ blank lines to 2
  text = text.replace(/\n{3,}/g, '\n\n');

  // Drop lines with no letters or digits
  text = text.split('\n')
    .filter(line => !line.trim() || /[a-zA-Z0-9]/.test(line))
    .join('\n');

  return text.trim();
}
