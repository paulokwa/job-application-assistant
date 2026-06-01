# Deferred Profile System Hardening And Chat Profile Suggestions

Status: Deferred / future investigation.

This note parks the future idea of allowing Job Chat to suggest saved-profile updates. It is documentation only. It does not commit the feature to v3.0 and does not authorize implementation before profile hardening work is done.

## Context

A focused audit found that Job Chat currently cannot modify the saved profile. That is the safer current state. Chat receives the active in-memory profile as context and returns plain text replies only. It does not import `saveProfile()`, parse structured profile actions, or write `profile_*` storage keys.

The future feature idea is to let users say things such as:

- "Add my new Claims Analyst role at Sun Life to my profile."
- "Update my skills to include dental claims processing."
- "Improve my summary based on what I just told you."

This must never become direct AI-to-storage editing.

## Product Principle

The app should remain an assistant, not an autopilot. Job Chat must never silently modify saved profile data.

## Preferred Future Architecture

- Chat detects explicit profile-update intent.
- AI generates a structured `profile_update_proposal`.
- The app validates the proposal.
- The user sees a clear review card with before/after values.
- The user explicitly confirms before anything is saved.
- The app applies a deterministic allowlisted patch, not a full profile replacement.
- The profile state refreshes everywhere after saving.
- Existing drafts, Fit Analysis, and other derived outputs are marked stale or invalidated where appropriate.

## Known Risks Discovered During Audit

- `saveProfile()` replaces the entire active profile without validation.
- Profile data has schema drift.
- Certification issuer data can be dropped during normalization.
- Settings may omit some schema fields and can drop unrendered fields on save.
- Experience dates use mixed formats.
- Dashboard and generators can use cached profile state.
- Source resume text is currently global, not truly per-profile.
- No revision number, timestamp, version history, or undo path exists yet.
- No tests currently cover profile persistence or Job Chat profile proposals.

## Recommended Order Before Enabling Chat-To-Profile Editing

1. Run a focused Profile Data Round-Trip Audit.
2. Fix profile schema round-trip gaps.
3. Preserve unrendered fields when saving from Settings.
4. Fix certification issuer preservation.
5. Normalize experience date handling.
6. Add profile-focused tests.
7. Ensure dashboard reloads active profile and source resume text after Settings closes.
8. Add profile `lastUpdated` / revision metadata.
9. Add read-only Job Chat "Suggested Profile Update" cards.
10. Add strict proposal validation and diff generation.
11. Add deterministic confirm/apply by profile ID.
12. Add one-step undo.
13. Add edit-before-apply.

## Future Restart Prompt

Use this prompt when returning to the work:

```text
We previously audited the idea of allowing Job Chat to modify the saved profile in the AI Job Butler / Job Application Assistant Chrome extension.

Important conclusion:
Do not implement direct AI-to-profile editing. The current Job Chat cannot modify saved profile data, and that is currently safe. Future implementation should use a structured proposal card and explicit user confirmation.

Task:
Do not implement chat-to-profile editing yet.

First perform a focused Profile Data Round-Trip Audit.

Audit goals:
1. Confirm whether profile data can be loaded, edited in Settings, saved, reloaded, and used by all generators without losing or mutating data.
2. Identify which fields are dropped, renamed, normalized incorrectly, or converted to the wrong type.
3. Inspect personalInfo, headline, summary, summaries, experience, education, skills, projects, certifications, customSections, doNotClaimNotes, coverLetterProfile, and metadata.lockedSections.
4. Check every profile consumer: resume generation, cover letter generation, resume refine, cover letter refine, email drafting, job fit analysis, recruiter message, follow-up message, short answer generation, Job Chat, and autofill.
5. Check whether each consumer reloads the profile or uses cached state.
6. Check whether stale profile state could affect outputs after Settings changes.
7. Audit storage keys: profileIndex, activeProfileId, profile_${id}, legacy userProfile, sourceResumeText, and sourceResumeName.
8. Rank issues as Critical, High, Medium, or Low.
9. Recommend the smallest safe fix order.
10. Do not modify files yet.

Return:
- Files inspected
- Current profile storage model
- Round-trip risks
- Generator impact
- Risk ranking
- Recommended fix order
- What not to touch yet
- Whether this blocks v3.0 packaging
```

## Future Phase 1 Implementation Prompt

Use this only after profile hardening:

```text
Implement Phase 1 only for Job Chat profile update suggestions.

Do not add saving/apply behavior yet.

Goal:
When the user clearly asks Job Chat to modify their saved profile, the app should generate and render a read-only “Suggested Profile Update” card in the chat stream. The card must not write to chrome.storage or mutate state.profile.

Requirements:
1. Detect explicit profile-update intent in Job Chat messages.
2. Add a dedicated proposal path separate from normal Job Chat answers.
3. Do not call saveProfile().
4. Do not write profile storage keys.
5. Do not mutate state.profile.
6. Use a strict proposal JSON contract for profile_update_proposal.
7. Reject unknown sections, unknown actions, malformed proposals, full-profile replacement objects, storage-key changes, metadata changes, and placeholder/demo values.
8. Render a read-only card with title, section, action, summary, proposed value preview, warnings, and the text: “This is only a suggestion. It has not changed your saved profile yet.”
9. Buttons: Copy Suggestion, View Profile, Cancel.
10. Do not include an active Apply to Profile button yet.
11. Mock mode must use the same validation/rendering path.
12. Confirm normal Job Chat still works.

Return:
- Files changed
- Summary of implementation
- Confirmation that no save/apply behavior was added
- Manual test checklist
- Any issues found
```
