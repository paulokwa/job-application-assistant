# Stitch Redesign Brief

## Product

**Job Application Assistant** is a Chrome MV3 side-panel extension for one-job-at-a-time job application drafting.

It is not a job board, recruiter CRM, interview scheduler, analytics dashboard, or applicant tracking system.

The app helps job seekers stay focused while tailoring resumes, cover letters, and application materials from a job posting without constantly switching tabs.

## Core Workflow

1. Open the side panel from a job posting tab.
2. Scan or paste a job description.
3. Review/edit Job Title, Employer, URL, and description.
4. Choose active profile and AI provider.
5. Generate resume, cover letter, or both.
6. Preview, edit, refine, check ATS keywords, and print/save as PDF.
7. Optionally save the job, analyze fit, draft application emails/messages, discuss the job with AI, or use review-first autofill on application forms.

## Current UX Problem

The interface contains too much information at once.

The first/left column is mostly manageable, but the second/right preview column becomes crowded once generated documents appear.

The generated document should become the main visual focus after generation, but currently many tools compete for attention:

- Preview tabs
- Edit controls
- Appearance controls
- Refine tools
- ATS tools
- Export/print controls
- Application email tools

The redesign should make the document preview easier to read and make surrounding actions clearer, calmer, and better grouped.

## Real Existing Features

### Job Input

- Scan current job page
- Paste job description manually
- Edit job title
- Edit employer/company
- Edit job URL
- Edit job description
- Already-seen job warning

### Profile

- Multiple user profiles
- My Profile editor
- Source resume upload
- Profile data management

### AI Generation

- Generate Resume
- Generate Cover Letter
- Generate Both
- Stop Generation
- AI Provider selection
- Model selection
- API key management
- Privacy/provider notice

### Document Review

- Resume Preview
- Cover Letter Preview
- Merged Preview
- Direct Editing
- Clear Draft
- Template Selection
- Accent Color
- Spacing Controls

### Improvement Tools

- Refine Resume
- Apply Changes
- Revert Changes
- ATS Keyword Analysis
- Apply ATS Keywords

### Application Tools

- Print / Save as PDF through browser print dialog
- Application Email Assistant
- Recruiter Message Generator
- Follow-Up Message Generator
- Short Application Answers
- Reminder Message Generator

### Job Management

- Saved Jobs
- Job Status
- Notes
- Fit Analysis
- AI Fit Check
- Job History

### Autofill

- Scan application forms
- Review detected fields
- Fill selected fields
- User review required before autofill

### AI Job Discussion

- Job-specific AI chat
- Discuss strategy
- Ask questions about the role
- Profile improvement suggestions with user review before profile changes

## Feature Relationships That Must Remain Clear

- Job Scan -> Job Details -> AI Generation
- Profile -> AI Generation
- AI Provider -> AI Generation
- Generated Resume -> Preview -> Refine -> ATS Check -> Export
- Generated Cover Letter -> Preview -> Export
- Saved Jobs -> Load Into Generator
- Fit Analysis -> Saved Jobs
- AI Fit Check -> Current Job
- Job Chat -> Current Job Context
- Autofill -> Application Submission Stage
- Application Email -> Final Application Stage

## Primary / Secondary / Tertiary Features

### Primary

- Scan/paste job
- Review job fields
- Select profile/provider
- Generate resume/cover letter
- Preview document
- Refine/revert
- Print/save as PDF

### Secondary

- Saved Jobs
- Job History/regenerate
- Fit Analysis / AI Fit Check
- Application Email
- Job Chat
- Autofill
- ATS Check
- Application Pack Actions
- Template/accent/spacing
- Source resume upload / profile autofill

### Tertiary

- Theme toggle
- Support/donate
- Feature tours
- Help & Feedback
- Ollama setup guide
- Settings navigation
- Profile management details

## Redesign Goals

Create multiple design concepts.

### Concept A: Minimal Professional

Inspired by Linear, Notion, and Arc Browser.

Characteristics:

- Calm
- Spacious
- Minimal
- Strong typography
- Progressive disclosure

### Concept B: Document First

The generated document becomes the hero element.

Characteristics:

- Large preview area
- Secondary actions grouped into toolbars or side action rails
- Workflow feels like reviewing a real document
- Preview is not buried under cards

### Concept C: Step-Based Workflow

Characteristics:

- Step 1: Job
- Step 2: Profile
- Step 3: Generate
- Step 4: Review
- Step 5: Apply
- Clear progression
- Reduced clutter

## Preview Area Design Goals

After generation, make the generated resume/cover letter the dominant element.

Group post-generation actions into categories:

### Review

- Edit
- Appearance

### Improve

- Refine
- ATS

### Apply

- Export PDF
- Application Email
- Autofill

Avoid long vertical stacks of unrelated cards underneath the preview.

## Header / Navigation Goals

Primary navigation should emphasize:

- Profile
- Jobs
- Settings

Secondary navigation:

- History
- Chat

Tertiary actions should be grouped or visually deprioritized:

- Theme
- Help
- Support / Donate
- Tours

Reduce header clutter.

## Visual Style

Professional and trustworthy.

Target users may be stressed, overwhelmed, unemployed, or applying to many jobs.

Avoid:

- Excessive colors
- Marketing-heavy SaaS aesthetics
- Gamification
- Recruiter-style dashboards

Favor:

- Clarity
- Readability
- Confidence
- Focus
- Calm productivity

## Important Constraints

Do not invent features.

Do not add:

- Recruiter CRM
- Interview scheduling
- Calendar integration
- Automatic reminders
- Team collaboration
- Subscription screens
- Analytics dashboards
- Job search engine
- Automatic job applications
- Automatic email sending
- Kanban recruiting pipeline
- Browser-wide background scraping
- Direct PDF download
- DOCX export unless separately confirmed

Only redesign the UI and information architecture using the existing feature set.

## Extra Implementation Context

The current UI exports through browser Print -> Save as PDF.

Older project documents may mention DOCX export or a generic source/template web app workflow. Ignore those older instructions if they conflict with the current Chrome extension code and this brief.

Use this file as the design direction source of truth for Stitch exploration.
