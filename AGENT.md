# Agent Instructions — Job Application Assistant

## Session Startup Protocol

Every AI agent/Codex/Claude session must start with `START_HERE.md`, then read these files before planning or coding:

1. `SESSION_HANDOVER.md`
2. `AGENT.md`
3. `RELEASE_V4_CHECKLIST.md`
4. `RELEASE_V3_CHECKLIST.md`
5. `ROADMAP.md`
6. `TROUBLESHOOTING.md`
7. `README.md` as needed

`AGENTS.md` is the short authoritative startup checklist. This file gives the fuller project rules and should stay aligned with `AGENTS.md` and `START_HERE.md`.

Before starting work, report:

- Current branch
- Latest `main` commit
- Current release status
- Next gated action
- What is already completed and must not be repeated

Release gate: v2.0 has been accepted by Google. v3.0 was submitted to the Chrome Web Store on 2026-06-02 and approved by Google on 2026-06-04. v4.0 is the active release cycle, with Tab-Scoped Job Sessions and Draft Restore completed as v4.0 development work. Do not create or submit a v4.0 package unless the user explicitly confirms a release scope.

## Required reading reference

| File | Purpose |
|---|---|
| `START_HERE.md` | First-stop summary for new sessions, current release status, and active release gate |
| `AGENTS.md` | Short authoritative startup checklist and stop conditions |
| `SESSION_HANDOVER.md` | Current release status, completed work, v4 gate status, and do-not-repeat list |
| `RELEASE_V4_CHECKLIST.md` | Active v4.0 release-cycle checklist, smoke tests, gates, and packaging guardrails |
| `RELEASE_V3_CHECKLIST.md` | Historical checklist and approved-package record for v3.0 |
| `RELEASE_V2_CHECKLIST.md` | Historical checklist for the accepted v2.0 package |
| `ROADMAP.md` | Future roadmap ideas and suggested branch order after v2.0 |
| `README.md` | Repo overview, setup, and basic usage |
| `TROUBLESHOOTING.md` | Resolved technical issues that could recur — **must be read before any work on `modules/autofillMatcher.js`** (entry 16 defines the rule that prevents ATS-specific fixes from breaking other already-working ATS platforms); also check before debugging any API, CSS variable, or settings-page JS issue |
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
- `chrome.storage.local` → provider settings, profiles, source resume text, saved jobs, job history, and tab-scoped draft restore data; `chrome.storage.sync` → low-sensitivity document settings and compact history summaries; `chrome.storage.session` → tab-scoped captured job page data
- Check `TROUBLESHOOTING.md` before debugging any API, CSS variable, or settings-page JS issue
