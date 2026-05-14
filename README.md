# Job Page Draft Assistant

A Chrome extension that helps you create tailored resumes and cover letters directly from any job posting page.

---

## Installation (Chrome)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select this folder: `c:\Coding\Job Page Draft Assistant`
5. The extension will appear in your toolbar

---

## First-Time Setup

1. Click the extension icon in the toolbar **or** open `chrome://extensions` → Details → Extension options
2. Go to **⚙ AI Provider** and:
   - Select your provider (OpenAI, Gemini, or Ollama)
   - Enter your API key and model name
   - Click **Test Connection** to verify
3. Go to **👤 My Profile** and fill in:
   - Your personal details
   - Work experience
   - Skills and summaries
4. *(Optional)* Go to **📁 Templates** and upload your `.docx` resume/cover letter templates

---

## How to Use

1. Go to any job posting page
2. *(Optional)* Highlight the job description text for more accurate extraction
3. **Right-click** on the page
4. Choose from the context menu:
   - **Job Page Draft Assistant → Create Resume**
   - **Job Page Draft Assistant → Create Cover Letter**
   - **Job Page Draft Assistant → Create Both**
5. The side panel opens — review and edit the extracted job info
6. Click **Generate**
7. Review the draft, ask for revisions in the chat box if needed
8. Click **Confirm Draft**, then **Save**

---

## Template Placeholders (for your .docx templates)

| Placeholder | Description |
|---|---|
| `{{FULL_NAME}}` | Your full name |
| `{{EMAIL}}` | Email address |
| `{{PHONE}}` | Phone number |
| `{{LINKEDIN}}` | LinkedIn URL |
| `{{PORTFOLIO}}` | Portfolio URL |
| `{{SUMMARY}}` | Professional summary |
| `{{SKILLS}}` | Skills section |
| `{{RESUME_BODY}}` | Full resume content block |
| `{{EXPERIENCE_1_TITLE}}` | First job title |
| `{{EXPERIENCE_1_COMPANY}}` | First company name |
| `{{EXPERIENCE_1_DATES}}` | First role date range |
| `{{EXPERIENCE_1_BULLETS}}` | First role bullet points |
| `{{COVER_LETTER_BODY}}` | Full cover letter body |
| `{{DATE}}` | Today's date |
| `{{HIRING_MANAGER}}` | Hiring manager name |
| `{{COMPANY_NAME}}` | Company name (from job) |
| `{{JOB_TITLE}}` | Job title (from posting) |

---

## Project Structure

```
manifest.json          ← Chrome extension config
background.js          ← Service worker (context menu, routing)
content.js             ← Captures page selection/content
dashboard/
  dashboard.html       ← Main side panel UI
  dashboard.css
  dashboard.js
settings/
  settings.html        ← Settings + profile editor
  settings.css
  settings.js
modules/
  extraction.js        ← Parses job page content
  provider.js          ← OpenAI / Gemini / Ollama API layer
  profile.js           ← User profile storage
  drafting.js          ← AI prompt construction
  template.js          ← .docx template filling
lib/
  pizzip.js            ← .docx ZIP handler
```

---

## Supported AI Providers

| Provider | API Key needed | Notes |
|---|---|---|
| OpenAI | Yes | Recommended: `gpt-4o` or `gpt-4-turbo` |
| Google Gemini | Yes | Recommended: `gemini-1.5-pro` |
| Ollama (Local) | No | Requires Ollama running at `localhost:11434` |
| Mock Mode | No | Local simulation for dev/testing — no API calls made |

---

## 🔐 Security — API Key Handling

**API keys are never stored in the extension source code.**

- Keys are entered by the user in **Settings → AI Provider**
- They are stored locally in **`chrome.storage.sync`** — encrypted by Chrome, tied to your profile, never sent anywhere except directly to the AI provider API you chose
- The source code contains **no hardcoded credentials** — you can safely publish or share this repo without leaking any keys
- If you fork this project and add a real key somewhere by mistake, the `.gitignore` strips common secret files (`.env`, `secrets.json`, etc.), but always double-check before committing
