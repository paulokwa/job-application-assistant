# Agent Instructions — Job Application Assistant

## Session Startup Protocol

Every AI agent/Codex/Claude session must read these files before planning or coding:

1. `SESSION_HANDOVER.md` if present
2. `RELEASE_V3_CHECKLIST.md`
3. `ROADMAP.md`
4. `README.md` as needed

Before starting work, report:

- Current branch
- Latest `main` commit
- Current release status
- Next gated action
- What is already completed and must not be repeated

Release gate: do not start packaging or submitting v3.0 until the v2.0 Chrome Web Store review result is known and the user confirms they are ready to proceed.

If you are an AI agent picking up work on this project, read these files before doing anything:

## Required reading

| File | Purpose |
|---|---|
| `SESSION_HANDOVER.md` | Current release gate, completed v2 work, v3 candidate work, and do-not-repeat list |
| `RELEASE_V3_CHECKLIST.md` | Required checklist for future v3.0 packaging after the v2.0 review gate clears |
| `RELEASE_V2_CHECKLIST.md` | Historical checklist for the submitted v2.0 package |
| `ROADMAP.md` | Future roadmap ideas and suggested branch order after v2.0 |
| `README.md` | Repo overview, setup, and basic usage |
| `TROUBLESHOOTING.md` | Resolved technical issues that could recur — check here before debugging familiar-sounding problems |
| `PRODUCT.md` | Strategic context: who the users are, what the product does, design principles, anti-references |
| `DESIGN.md` | Full design system: tokens, typography, colour strategy, component rules, north star |

## What this project is

A Chrome extension (Manifest V3, side panel) that helps job seekers generate tailored resumes and cover letters using an AI provider of their choice (OpenAI, Gemini, Ollama, or Mock mode). No build step — load unpacked in `chrome://extensions`.

## How to run locally

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" and select this directory
4. The extension opens as a side panel

## Key rules

- All CSS uses OKLCH colour tokens defined in `:root` — never use raw hex or `rgb()` in component styles
- The design system is "The Quiet Advisor" — warm parchment light mode, cool-tinted dark mode, slate-teal accent (`oklch(46% 0.10 195)`)
- Both `dashboard/` and `settings/` share the same token names but have separate CSS files
- JS modules live in `modules/` — provider abstraction, drafting, profile, extraction, renderer
- `chrome.storage.local` → provider settings, profiles, source resume text, saved jobs, job history, saved draft; `chrome.storage.sync` → low-sensitivity document settings and compact history summaries; `chrome.storage.session` → captured job page data
- Check `TROUBLESHOOTING.md` before debugging any API, CSS variable, or settings-page JS issue
