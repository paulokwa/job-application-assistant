# Agent Instructions — Job Application Assistant

If you are an AI agent picking up work on this project, read these files before doing anything:

## Required reading

| File | Purpose |
|---|---|
| `SESSION_HANDOVER.md` | Full log of everything built or changed in the most recent session — prevents duplicating work |
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
- `chrome.storage.sync` → provider settings and doc settings; `chrome.storage.local` → profile, source resume text, saved draft; `chrome.storage.session` → captured job page data
- Check `TROUBLESHOOTING.md` before debugging any API, CSS variable, or settings-page JS issue
