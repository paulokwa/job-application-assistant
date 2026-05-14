---
name: Job Application Assistant
description: A calm, trustworthy Chrome extension for tailoring resumes and cover letters to specific job postings.
colors:
  accent: "#2e7585"
  accent-subtle: "#e0f2f4"
  accent-on: "#f8fdfe"
  canvas: "#faf9f4"
  surface: "#fefdfb"
  raised: "#f2efea"
  border: "#d6d9e4"
  border-subtle: "#eaecf0"
  ink: "#1d2330"
  ink-2: "#686f7d"
  ink-3: "#97a0ad"
  success: "#2d8e5f"
  success-subtle: "#edf7f1"
  warning: "#9a6c00"
  warning-subtle: "#fdf4e0"
  danger: "#b44040"
  danger-subtle: "#fdeaea"
typography:
  display:
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  title:
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  caption:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-on}"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  button-primary-hover:
    backgroundColor: "#236a79"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  button-secondary-hover:
    backgroundColor: "{colors.border-subtle}"
    textColor: "{colors.ink}"
  button-confirm:
    backgroundColor: "{colors.success}"
    textColor: "{colors.accent-on}"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  input-focus:
    backgroundColor: "{colors.surface}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
---

# Design System: Job Application Assistant

## 1. Overview

**Creative North Star: "The Quiet Advisor"**

A skilled career coach who never raises their voice. Warm, unhurried, competent. The tool recedes so the work can breathe: the document being drafted is always the hero, the interface never is. This system trusts restraint. Every element earns its place by serving the user's task, not by decorating the screen.

The physical scene driving every decision: a job seeker at a desk, morning or evening, focused and slightly anxious, wanting to feel capable and ready. The interface should feel like the right tool for an important moment — composed, credible, professional without being corporate. It should not feel like an AI product, a job board, or a resume-builder SaaS.

This system explicitly rejects: dark mode with purple or indigo gradients and glowing accents (the 2023 AI tool aesthetic); corporate job-board coldness (LinkedIn, Indeed, Workday); colorful gamified resume builders (Canva, Zety, Resume.io); generic productivity-app softness (Notion clones, pastel-carded dashboards). Any of these aesthetics would undercut the trust the product needs to earn.

**Key Characteristics:**
- System-adaptive: follows OS light/dark preference with consistent tokens in both modes
- Restrained color strategy: warm-buff or cool-dark neutrals with one deliberate slate-teal accent
- Typographic contrast through weight and size — Plus Jakarta Sans for structure, Inter for content
- Flat-first elevation: cards defined by border and tonal background, not shadow drama
- Progressive confidence: the interface becomes more alive as the user's work progresses

## 2. Colors

A warm-cool counterpoint system: backgrounds lean warm (buff parchment in light, deep cool-tinted dark in dark), text and borders lean cool (ink blue-gray), and the single accent is a desaturated teal that reads as steady professional confidence rather than tech enthusiasm.

**The One Voice Rule.** The accent (`--color-accent`) appears only on interactive targets: buttons, links, focus rings, active nav items, and confirmed selections. It is never used decoratively. Its restraint is its authority.

### Primary

- **Slate Tide** (`oklch(46% 0.10 195)` / light: `#2e7585`, dark: `#3a8fa0`): The sole accent color. Applied to primary buttons, focus rings, active states, and confirmed selections. Neither corporate blue nor health green — the hue of a confident, experienced professional who has no need to shout.

### Secondary

(None. This system uses one accent. Secondary colors exist only for semantic state communication.)

### Tertiary

(None.)

### Neutral

- **Warm Parchment** (`oklch(97.5% 0.007 85)` / `#faf9f4`): Page background in light mode. The slight buff tint reads as quality paper rather than clinical white — deliberate and warm.
- **Clean Sheet** (`oklch(99.5% 0.004 85)` / `#fefdfb`): Card and surface background in light mode. Marginally warmer than pure white; provides the tonal step above Warm Parchment that defines cards without heavy shadowing.
- **Parchment Mid** (`oklch(95.5% 0.009 85)` / `#f2efea`): Input backgrounds, sidebar areas. The third warm-neutral step that grounds form fields in light mode.
- **Rule Line** (`oklch(87% 0.008 240)` / `#d6d9e4`): Main border. Cool-tinted against warm backgrounds — like a printed document rule. Provides clear structure without weight.
- **Hairline** (`oklch(92% 0.005 240)` / `#eaecf0`): Subtle dividers between sections within a card. Barely present; creates rhythm without interruption.
- **Ink** (`oklch(18% 0.007 240)` / `#1d2330`): Primary text. Cool-tinted near-black — the color of quality printed text. Not pure black, not charcoal. Never use `#000000`.
- **Secondary Ink** (`oklch(44% 0.009 240)` / `#686f7d`): Labels, secondary text, placeholder copy.
- **Faded Ink** (`oklch(63% 0.007 240)` / `#97a0ad`): Hints, captions, muted metadata. 4.5:1 contrast against card backgrounds only; do not use for critical information.

**Dark mode counterparts** (applied via `@media (prefers-color-scheme: dark)`):
- Canvas: `oklch(14% 0.008 250)` — deep cool-tinted dark, not pure black, not indigo navy
- Surface: `oklch(18% 0.009 250)` — card background step
- Raised: `oklch(22% 0.009 250)` — input / elevated panel
- Border: `oklch(30% 0.008 250)` — main border
- Border-subtle: `oklch(26% 0.005 250)` — dividers
- Ink: `oklch(94% 0.006 85)` — warm-tinted near-white text
- Ink-2: `oklch(73% 0.007 250)` — secondary
- Ink-3: `oklch(52% 0.007 250)` — muted
- Accent: `oklch(56% 0.10 195)` — slightly lighter for dark-mode legibility

**Semantic:**
- **Confirmed Green** (`oklch(56% 0.13 145)` / `#2d8e5f`): Success states, confirmed actions, export-ready. Muted enough to avoid "neon" health-app energy.
- **Advisory Amber** (`oklch(67% 0.13 75)` / `#9a6c00`): Warnings, mock mode. Warm rather than garish.
- **Caution Red** (`oklch(54% 0.17 25)` / `#b44040`): Errors, destructive states. Restrained.

**The No-Pure Rule.** Pure white (`#ffffff`) and pure black (`#000000`) are forbidden. Every neutral carries a micro-tint toward warm (85°) in backgrounds or cool (240–250°) in text and borders.

## 3. Typography

**Display/Heading Font:** Plus Jakarta Sans (Google Fonts, weights 600–700, with system-ui, sans-serif fallback)
**Body/UI Font:** Inter (Google Fonts, weights 400–500, with system-ui, sans-serif fallback)

**Character:** Plus Jakarta Sans brings geometric confidence without feeling cold — its slightly rounded terminals and strong weight contrast give headings presence without shouting. Inter provides dense, reliable legibility for UI labels, body copy, and form fields. Together they establish a clear hierarchy: structure announced by Plus Jakarta Sans, content carried by Inter.

### Hierarchy

- **Display** (Plus Jakarta Sans, 700, 18–20px, leading 1.2): Settings section headings, overlay titles. Used sparingly — one per major view.
- **Headline** (Plus Jakarta Sans, 600, 15–16px, leading 1.3): Card section titles within settings. Creates clear group anchors without competing with Display.
- **Title** (Plus Jakarta Sans, 600, 13.5px, leading 1.4): Card headers in dashboard, navigation labels. The primary wayfinding text.
- **Body** (Inter, 400, 13.5px, leading 1.6): Form field content, job description text, descriptions. Line length capped at 65–75ch where possible.
- **Label** (Inter, 500, 12px, leading 1.4, tracking +0.01em): Form field labels, settings field names. NOT uppercase — small caps is a typographic choice, not a label convention. Weight contrast with body is sufficient.
- **Caption** (Inter, 400, 11.5px, leading 1.5): Hints, metadata, placeholder descriptions. Only where truly secondary; avoid overuse.

**The Floor Rule.** No text below 11.5px. Text at 10px is inaccessible on high-DPI screens and in low-light environments. Step badges and micro-labels are the only exception, and only when they carry no critical information.

**The Weight Rule.** Hierarchy is established through size and weight contrast, never color alone. A label in `--color-ink-3` must be secondary in size or weight compared to primary text — color alone cannot carry hierarchy.

## 4. Elevation

This system is flat-first. Depth is expressed through tonal steps in background color (canvas → surface → raised), not shadow intensity. Cards in light mode carry one ambient shadow for legibility against the warm canvas; cards in dark mode are defined by border and background tonal step only.

**The Tonal Rule.** In dark mode, shadows are invisible. Use background lightness steps to convey elevation hierarchy. Adding shadows in dark mode produces a muddy, heavy feeling — always use tonal differentiation instead.

### Shadow Vocabulary

- **Ambient Card** (`0 1px 4px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04)`): Light mode only. A diffuse, barely-there lift that separates surface-colored cards from the warm canvas background. Not structural — purely perceptual.
- **Focus Ring** (`0 0 0 3px {colors.accent-subtle}`): Applied on `:focus-visible` to all interactive elements. Uses the accent-subtle tint, not a glow. Offset rather than inset.

No glow shadows. No colored box-shadows. The `--shadow-glow` pattern from the prior system is prohibited.

## 5. Components

### Buttons

Composed and grounded. Solid fills, no gradients, no lift transforms, no glow on hover. State changes are expressed through background darkening and a 2px offset focus ring.

- **Shape:** Gently curved (6px radius). Not pill, not square.
- **Primary:** Slate Tide background (`--color-accent`), warm near-white text. Padding 9px 18px. Font: Inter 700, 13px.
- **Primary hover:** Background darkens by 8% lightness. No `translateY`, no box-shadow growth.
- **Primary focus-visible:** 2px `--color-accent` ring, 3px offset, `--color-accent-subtle` shadow.
- **Secondary:** Raised background (`--color-raised`), secondary ink text. Border: `--color-border`. Same shape and padding.
- **Secondary hover:** Background shifts to border-subtle, text to primary ink.
- **Confirm (export / save):** Success green background. Same shape. Reserved for terminal actions only — export, confirm draft.
- **Disabled:** 50% opacity on text and icon only; background and border remain at 70%. No `cursor: not-allowed` drama.
- **Large variant (generate CTA):** Full width, padding 12px 16px. Same shape — width is the differentiator, not height.

### Cards / Panels

Cards in this system are document sections, not floating UI tiles. They use minimal visual distinction: a border, a tonal background step, and consistent padding. They should never feel like they're hovering.

- **Background:** `--color-surface` (light) / `--color-surface-dark` (dark)
- **Border:** 1px `--color-border`
- **Radius:** 14px (large — the only "premium" gesture)
- **Padding:** 14px internal, 12px gap between cards
- **Shadow:** Ambient Card in light mode only
- **Nested cards are forbidden.** The `exp-entry` / `edu-entry` pattern uses `--color-raised` background as the visual differentiator instead.

### Inputs / Fields

- **Background:** `--color-raised` at rest; `--color-surface` on focus (brightens the field)
- **Border:** 1px `--color-border` at rest; 1px `--color-accent` on focus
- **Focus shadow:** `0 0 0 3px --color-accent-subtle`
- **Radius:** 6px
- **Font:** Inter 400, 13px, `--color-ink`
- **Placeholder:** `--color-ink-3`
- **Resize:** vertical only on textareas

### Navigation (Settings)

- **Standalone mode:** Left sidebar, 200px, sticky. `--color-raised` background, `--color-border` right edge.
- **Embedded mode:** Top tab bar, scrollable horizontal. Same background.
- **Nav item default:** Inter 500 13px, `--color-ink-2`
- **Nav item hover:** `--color-canvas` background, `--color-ink`
- **Nav item active:** `--color-accent-subtle` background (8% tinted), `--color-accent` text, Plus Jakarta Sans 600

### Step Badges

Numbered circles (18px) that indicate sequential step position in the dashboard left column. Use `--color-border` background, `--color-accent` text, `--color-border` border. Not for decoration — only when the step number carries wayfinding information.

### Tab Bar

Borderless button tabs. Default: `--color-ink-3`. Active: `--color-accent` text, 2px solid `--color-accent` bottom border. No background change on active — the underline is sufficient.

### Upload Areas

Dashed border (`2px dashed --color-border`), `--color-raised` background, `--color-ink-2` label. On hover: border shifts to `--color-accent`, background to `--color-accent-subtle` at very low opacity.

### Toast

Positioned bottom-center. `--color-surface` background, `--color-border` border, `--color-ink` text. Pill-radius. No bounce or spring animation — ease-out-quart entry (translate Y from +8px to 0), opacity 0 to 1. Duration 200ms.

### Error State

Inline, below the generate button. `--color-danger-subtle` background, `--color-danger` border, `--color-ink` text for message, `--color-danger` for the danger icon only. Recovery actions (Retry, Settings) are secondary buttons — no red on the buttons themselves.

## 6. Do's and Don'ts

### Do:
- **Do** use OKLCH for all color values. Reduce chroma as lightness approaches 0 or 100 to avoid garish extremes.
- **Do** tint every neutral toward its brand hue — warm (hue 85) for backgrounds, cool (hue 240–250) for borders and text.
- **Do** use Plus Jakarta Sans 600–700 for headings and navigation labels, Inter for body copy and form fields.
- **Do** establish hierarchy through size + weight contrast (minimum 1.25 ratio between adjacent steps).
- **Do** use the Ambient Card shadow in light mode only — it is invisible in dark mode by design.
- **Do** apply the accent color to interactive targets only: buttons, active states, focus rings, confirmed selections.
- **Do** use `@media (prefers-color-scheme: dark)` to adapt all tokens. The system-adaptive requirement is a first-class constraint.
- **Do** keep the document preview as the visual hero. UI chrome should recede as generation completes.
- **Do** use `prefers-reduced-motion` to disable or reduce all animations for users who request it.
- **Do** write export button copy with confidence. "Save as PDF" not "⚠️ Quick PDF." The limitation notice belongs in onboarding, not on the button.

### Don't:
- **Don't** use dark mode with purple or indigo gradients, glow effects, or glassmorphism. This is the exact aesthetic the product must not resemble. If it looks like a 2023 AI tool, it has failed.
- **Don't** use corporate job-board / recruiter aesthetics: cold grays, HR-portal density, LinkedIn-blue interactive elements.
- **Don't** use colorful gamified resume-builder patterns: pastel palettes, progress-bar gamification, upsell visual pressure.
- **Don't** use `transition: all` — ever. Transitioning layout properties causes reflow jank. Always specify the exact CSS properties being transitioned (`background-color`, `color`, `border-color`, `opacity`, `transform`).
- **Don't** use bounce or spring easing (`cubic-bezier(0.175, 0.885, 0.32, 1.275)` and family). Ease out with exponential curves only.
- **Don't** apply `border-left` or `border-top` greater than 1px as a colored accent stripe on cards, callouts, or list items. Use background tints or full borders.
- **Don't** use gradient fills on buttons or logo marks. Solid colors only.
- **Don't** use `background-clip: text` with a gradient. Single solid color for all text.
- **Don't** add glow-colored box-shadows to interactive elements. The focus ring is the only permitted glow-like treatment, and it uses a tint, not a saturated glow.
- **Don't** use text below 11.5px. Step badges at 10px are the documented exception.
- **Don't** place developer debug controls (API failure simulators, mock-mode toggles) in the production user interface. Gate them behind URL query parameters.
- **Don't** use warning icons (`⚠️`) on primary action buttons. Reserve warning states for inline error messages, not action affordances.
- **Don't** use emoji as the primary icon system. Prefer SVG or text. Emoji as decorative accent is acceptable in empty states only.
- **Don't** use `#000000` or `#ffffff`. Every neutral carries a micro-tint.
