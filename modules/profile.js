// modules/profile.js
// Multi-profile storage. Each profile lives under its own sync key (profile_{id})
// so it gets an individual 8 KB budget. An index (profileIndex) tracks names and order.

import { normalizeResumeContent } from './schema.js';

const INDEX_KEY  = 'profileIndex';
const ACTIVE_KEY = 'activeProfileId';
const LEGACY_KEY = 'userProfile';

function profileKey(id) { return `profile_${id}`; }
function makeId()       { return 'p' + Date.now(); }

// ── Migration ─────────────────────────────────────────────────────────────

async function migrateIfNeeded() {
  const data = await chrome.storage.sync.get([INDEX_KEY, LEGACY_KEY]);
  if (data[INDEX_KEY]) return; // already migrated

  const id = makeId();
  await chrome.storage.sync.set({
    [INDEX_KEY]:  [{ id, name: 'General' }],
    [ACTIVE_KEY]: id,
    [profileKey(id)]: data[LEGACY_KEY] || {},
  });
}

// ── Core reads ────────────────────────────────────────────────────────────

export async function loadProfiles() {
  await migrateIfNeeded();
  const data = await chrome.storage.sync.get([INDEX_KEY, ACTIVE_KEY]);
  const profiles = data[INDEX_KEY] || [];
  const activeId = data[ACTIVE_KEY] || profiles[0]?.id || null;
  return { profiles, activeId };
}

export async function loadProfile() {
  const { profiles, activeId } = await loadProfiles();
  const id = activeId || profiles[0]?.id;
  if (!id) return normalizeResumeContent({});
  const data = await chrome.storage.sync.get(profileKey(id));
  return normalizeResumeContent(data[profileKey(id)] || {});
}

// ── Core writes ───────────────────────────────────────────────────────────

export async function saveProfile(profile) {
  const { activeId } = await loadProfiles();
  if (!activeId) return;
  await chrome.storage.sync.set({ [profileKey(activeId)]: profile });
}

export async function switchProfile(id) {
  await chrome.storage.sync.set({ [ACTIVE_KEY]: id });
  const data = await chrome.storage.sync.get(profileKey(id));
  return normalizeResumeContent(data[profileKey(id)] || {});
}

// ── Profile management ────────────────────────────────────────────────────

export async function createProfile(name) {
  const { profiles, activeId } = await loadProfiles();
  const id = makeId();
  await chrome.storage.sync.set({
    [INDEX_KEY]:      [...profiles, { id, name: name || 'New Profile' }],
    [profileKey(id)]: {},
  });
  return id;
}

export async function renameProfile(id, name) {
  const { profiles, activeId } = await loadProfiles();
  const updated = profiles.map(p => p.id === id ? { ...p, name } : p);
  await chrome.storage.sync.set({ [INDEX_KEY]: updated });
}

export async function updateProfileMeta(id, meta) {
  const { profiles, activeId } = await loadProfiles();
  const updated = profiles.map(p => p.id === id ? { ...p, ...meta } : p);
  await chrome.storage.sync.set({ [INDEX_KEY]: updated });
}

export async function deleteProfile(id) {
  const { profiles, activeId } = await loadProfiles();
  if (profiles.length <= 1) return activeId;
  const remaining  = profiles.filter(p => p.id !== id);
  const newActive  = activeId === id ? remaining[0].id : activeId;
  await chrome.storage.sync.remove(profileKey(id));
  await chrome.storage.sync.set({ [INDEX_KEY]: remaining, [ACTIVE_KEY]: newActive });
  return newActive;
}

// ── AI prompt helper ──────────────────────────────────────────────────────

export function profileToPromptText(profile) {
  const p = profile.personalInfo;
  const lines = [];

  lines.push('=== USER PROFILE ===');
  lines.push(`Name: ${p.fullName || '(not provided)'}`);
  lines.push(`Email: ${p.email || '(not provided)'}`);
  lines.push(`Phone: ${p.phone || '(not provided)'}`);
  if (p.cityProvince) lines.push(`Location: ${p.cityProvince}`);
  if (p.linkedin)     lines.push(`LinkedIn: ${p.linkedin}`);
  if (p.portfolio)    lines.push(`Portfolio: ${p.portfolio}`);
  if (p.website)      lines.push(`Website: ${p.website}`);

  if (profile.summaries?.length) {
    lines.push('\n--- Professional Summaries ---');
    profile.summaries.forEach(summary => {
      if (summary.text) lines.push(`${summary.label || 'Summary'}: ${summary.text}`);
    });
  } else if (profile.summary) {
    lines.push(`\nSummary: ${profile.summary}`);
  }

  if (profile.skills?.length) {
    lines.push('\n--- Skills ---');
    lines.push(profile.skills.join(', '));
  }

  if (profile.experience?.length) {
    lines.push('\n--- Work Experience ---');
    profile.experience.forEach((exp, i) => {
      lines.push(`\nRole ${i + 1}: ${exp.jobTitle} at ${exp.employer} (${exp.startDate} - ${exp.endDate}) — ${exp.location}`);
      if (exp.bulletPoints?.length) lines.push(`Responsibilities:\n- ${exp.bulletPoints.join('\n- ')}`);
    });
  }

  if (profile.education?.length) {
    lines.push('\n--- Education ---');
    profile.education.forEach(ed => {
      lines.push(`${ed.credential} — ${ed.institution} (${ed.dates})`);
      if (ed.notes?.length) lines.push(`Notes: ${ed.notes.join('; ')}`);
    });
  }

  if (profile.projects?.length) {
    lines.push('\n--- Projects ---');
    profile.projects.forEach(proj => {
      lines.push(`${proj.name} (${proj.role})`);
      if (proj.description) lines.push(proj.description);
      if (proj.technologies?.length) lines.push(`Tech: ${proj.technologies.join(', ')}`);
      if (proj.link) lines.push(`Link: ${proj.link}`);
    });
  }

  if (profile.certifications?.length) {
    lines.push('\n--- Certifications ---');
    profile.certifications.forEach(cert => lines.push(cert));
  }

  if (profile.customSections?.length) {
    lines.push('\n--- Additional Background ---');
    profile.customSections.forEach(section => {
      if (section.text) lines.push(`${section.label}: ${section.text}`);
    });
  }

  if (profile.doNotClaimNotes) {
    lines.push('\n--- Do Not Claim / Hard Limits ---');
    lines.push(profile.doNotClaimNotes);
  }

  lines.push('\n=== END USER PROFILE ===');
  return lines.join('\n');
}
