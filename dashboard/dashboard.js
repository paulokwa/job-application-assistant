// dashboard/dashboard.js — Main dashboard controller (Redesigned for HTML/PDF System)

import { extractJobFields, checkDescriptionQuality } from '../modules/extraction.js';
import { generateResume, generateCoverLetter, reviseDraft, extractAtsKeywords } from '../modules/drafting.js';
import { prepareApplicationEmail } from '../modules/emailDrafting.js';
import { generateRecruiterMessage } from '../modules/recruiterMessage.js';
import { generateFollowUpMessage } from '../modules/followUpMessage.js';
import { generateApplicationAnswers, PRESET_QUESTIONS } from '../modules/applicationAnswers.js';
import { extractJobInfoWithAI } from '../modules/jobInfoExtraction.js';
import { loadProfile, loadProfileById, loadProfiles, saveProfile, switchProfile } from '../modules/profile.js';
import { analyzeFit } from '../modules/fitAnalysis.js';
import { buildAutofillMatches } from '../modules/autofillMatcher.js';
import { loadProviderSettings, saveProviderSettings } from '../modules/providerSettings.js';
import {
  compactJobHistoryEntry,
  compactSavedDraft,
  compactSavedJob,
  compactSavedJobs,
  isStorageQuotaError,
  storageQuotaMessage,
  wasTruncated,
} from '../modules/storageLimits.js';
import { getSpacingCss, renderDocument, renderMergedDocument } from '../modules/renderer.js';
import { buildFilename } from '../modules/template.js';
import { mapError } from '../modules/errorMapper.js';
import {
  buildProfileProposalDiff,
  canEditProfileUpdateProposal,
  formatProfileUpdateProposalForCopy,
  PROFILE_PROPOSAL_EDIT_UNSUPPORTED_MESSAGE,
  sendJobChatMessage,
  sendJobChatProfileUpdateProposal,
  validateEditedProfileUpdateProposal,
} from '../modules/jobChat.js';
import { isApplySectionSupported, profileProposalFingerprint, validateAndApplyProfileProposal } from '../modules/profileProposalApply.js';
import { esc } from '../modules/html.js';
import { normalizeProfileDatePart } from '../modules/schema.js';

// ── Config ─────────────────────────────────────────────────────────────────
// Support/Ko-fi URL — used by the header button.
const SUPPORT_URL = 'https://ko-fi.com/mwakelabs';
const AI_PROVIDER_SETUP_SAVED_KEY = 'aiProviderSetupSaved';
const SYNC_HISTORY_SUMMARY_KEY = 'jobHistorySummary';
const CHAT_REFINE_REPLY_CHAR_LIMIT = 2000;
const SAVED_JOBS_KEY = 'savedJobs';
const JOB_SESSIONS_BY_TAB_KEY = 'jobSessionsByTab';
const SAVED_DRAFTS_BY_TAB_KEY = 'savedDraftsByTab';
const SOURCE_RESUME_KEYS = ['sourceResumeText', 'sourceResumeName'];
const EDITED_HTML_SAVE_DELAY_MS = 500;
const MAX_EDITED_HTML_CHARS = 500000;
const MAX_SAVED_JOBS = 50;
const SAVED_JOB_GENERATION_MODES = new Set(['resume', 'cover-letter']);
const SAVED_JOBS_MESSAGE_TYPES = new Set([
  'JPDA_SAVED_JOB_LOADED',
  'JPDA_SAVED_JOB_GENERATE_REQUESTED',
  'JPDA_ANALYZE_FIT_REQUESTED',
  'JPDA_RECRUITER_MESSAGE_REQUESTED',
  'JPDA_FOLLOW_UP_MESSAGE_REQUESTED',
  'JPDA_APPLICATION_ANSWERS_REQUESTED',
  'JPDA_REMINDER_TEXT_REQUESTED',
]);
const HISTORY_MESSAGE_TYPES = new Set([
  'JPDA_HISTORY_REGENERATE_REQUESTED',
]);
const MAX_SYNC_HISTORY_SUMMARIES = 12;
const MAX_SYNC_HISTORY_BYTES = 7000;
const SESSION_SCAN_TEXT_CAP_CHARS = 60000;
const SESSION_SCAN_TRUNCATION_MARKER = '\n\n[Truncated: page text exceeded session storage cap]';
const MAX_SYNC_FIELD_LENGTHS = {
  jobTitle: 140,
  company: 120,
  sourceUrl: 1200,
  docType: 40,
};
const PROFILE_APPLY_CONFIRMATION_WARNING = 'This will update your saved profile and may affect future resumes, cover letters, job-fit analysis, and email drafts. Review carefully before applying.';

async function guardedProfileApply(afterProfile, expectedId, expectedFingerprint) {
  if (!expectedId) return { ok: false, error: 'No active profile ID available.' };
  const { activeId } = await loadProfiles();
  if (activeId !== expectedId) {
    return { ok: false, error: 'Active profile has changed. Please close and reopen the Apply Requirements Review.' };
  }
  const currentProfile = await loadProfile();
  const currentFingerprint = profileProposalFingerprint(currentProfile);
  if (currentFingerprint !== expectedFingerprint) {
    return { ok: false, error: 'Profile has changed since the proposal was created. Please review and try again.' };
  }
  try {
    await saveProfile(afterProfile);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Failed to save profile: ${err.message}` };
  }
}

const UNDO_SNAPSHOT_SESSION_KEY = 'profileUndoSnapshot';
const UNDO_SNAPSHOT_TTL_MS = 15 * 60 * 1000;

function getUndoSnapshot() {
  return state.profileUndoSnapshot || null;
}

async function loadUndoSnapshotFromStorage() {
  if (state.profileUndoSnapshot) return state.profileUndoSnapshot;
  try {
    const data = await chrome.storage.session.get(UNDO_SNAPSHOT_SESSION_KEY);
    const snapshot = data[UNDO_SNAPSHOT_SESSION_KEY];
    if (!snapshot || Date.now() - snapshot.appliedAt > UNDO_SNAPSHOT_TTL_MS) {
      chrome.storage.session.remove(UNDO_SNAPSHOT_SESSION_KEY).catch(() => {});
      return null;
    }
    state.profileUndoSnapshot = snapshot;
    return snapshot;
  } catch {
    return null;
  }
}

function storeUndoSnapshot(snapshot) {
  state.profileUndoSnapshot = snapshot;
  chrome.storage.session.set({ [UNDO_SNAPSHOT_SESSION_KEY]: snapshot }).catch(() => {});
}

function clearUndoSnapshot() {
  state.profileUndoSnapshot = null;
  chrome.storage.session.remove(UNDO_SNAPSHOT_SESSION_KEY).catch(() => {});
}

function renderUndoButton(onUndo) {
  const container = document.createElement('div');
  container.className = 'job-chat-profile-undo';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'job-chat-action-btn job-chat-undo-btn';
  btn.textContent = 'Undo profile update';
  btn.addEventListener('click', onUndo);

  container.appendChild(btn);
  return container;
}

function setProfileChangeStaleMarkers(reason) {
  const affected = [];
  if (state.drafts.resume) affected.push('resume');
  if (state.drafts['cover-letter']) affected.push('coverLetter');
  if (state.lastFitCheck) affected.push('fitAnalysis');
  if (affected.length === 0) return;

  const profileId = state.profile ? profileProposalFingerprint(state.profile) : '';
  state.profileChangeStale = {
    profileId,
    changedAt: Date.now(),
    reason,
    affected,
  };
  renderStaleNotice();
}

function clearStaleMarkerForType(type) {
  if (!state.profileChangeStale) return;
  state.profileChangeStale.affected = state.profileChangeStale.affected.filter(a => a !== type);
  if (state.profileChangeStale.affected.length === 0) {
    state.profileChangeStale = null;
    removeStaleNotice();
  } else {
    renderStaleNotice();
  }
}

function clearAllStaleMarkers() {
  state.profileChangeStale = null;
  removeStaleNotice();
}

function renderStaleNotice() {
  removeStaleNotice();
  if (!state.profileChangeStale) return;

  const reasonText = state.profileChangeStale.reason === 'undo' ? 'changed and then undone' : 'updated';
  const affected = state.profileChangeStale.affected;
  const labelList = [
    ...(affected.includes('resume') ? ['resume'] : []),
    ...(affected.includes('coverLetter') ? ['cover letter'] : []),
    ...(affected.includes('fitAnalysis') ? ['fit analysis'] : []),
  ].join(', ');

  const notice = document.createElement('div');
  notice.className = 'profile-stale-notice';
  notice.id = 'profile-stale-notice';
  notice.textContent = `Your profile was ${reasonText}. Existing ${labelList} may not reflect the latest profile.`;

  const card = document.getElementById('card-drafts');
  if (card) {
    card.insertBefore(notice, card.firstChild);
  }
}

function removeStaleNotice() {
  const existing = document.getElementById('profile-stale-notice');
  existing?.remove();
}

const urlParams = new URLSearchParams(window.location.search);
const dashboardMode = urlParams.get('mode') === 'full' ? 'full' : 'panel';
const sourceTabId = parsePositiveInt(urlParams.get('sourceTabId'));
document.documentElement.dataset.dashboardMode = dashboardMode;

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  jobData: {
    jobTitle: '', company: '', sourceUrl: '', description: '',
  },
  docSettings: {},
  profileIndex: [],    // [{id, name}] metadata — kept in sync by populateProfileStrip()
  lastFitCheck: null,  // { tab, jobText, jobTitle, jobCompany, selectedProfileId, aiMatchesByProfile } — AI-only Fit Check context
  currentTab: 'resume',     // 'resume' | 'cover-letter'
  drafts:         { resume: null, 'cover-letter': null },
  originalDrafts: { resume: null, 'cover-letter': null },

  // UI customization
  templateId: 'classic',
  accentColor: '#2563eb',
  spacingMode: 'standard',
  tone: 30,
  clLength: 'standard',

  settings: null,
  profile: null,
  sourceResumeText: '',
  sourceResumeName: '',
  lastRunMode: null,
  loadedFitContext: null,
  generationReceipt: null,
  atsRevision: false,
  editMode: { resume: false, 'cover-letter': false },
  hasEdits: { resume: false, 'cover-letter': false },
  editedHtml: { resume: null, 'cover-letter': null },
  currentJobMeta: {
    sourceType: 'manual_entry',
    rawContent: '',
    aiJobInfoAttemptedFor: '',
  },
  autofillToolsExpanded: false,
  autofillFields:  [],
  autofillMatches: [],
  jobChat: { messages: [], jobSignature: '' },
  profileUndoSnapshot: null,
  profileChangeStale: null,
};

let currentAbortController = null;
let currentJobChatController = null;
let currentFitAnalysisController = null;
let currentJobInfoController = null;
let currentAiMatchController = null;
let currentEmailController = null;
let currentRecruiterController = null;
let currentRecruiterJob = null;
let currentRecruiterRequestId = 0;
let currentFollowUpController = null;
let currentFollowUpJob = null;
let currentFollowUpRequestId = 0;
let currentAppAnswersController = null;
let currentAppAnswersJob = null;
let currentAppAnswersRequestId = 0;
let currentReminderRequestId = 0;
let generationStatusTimers = [];
let jobChatPatienceTimers = [];
const editedHtmlSaveTimers = { resume: null, 'cover-letter': null };
const alreadySeenScanWarnings = new Set();

// ── DOM refs ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  sourceIndicator:    $('source-indicator'),
  selectionNotice:    $('selection-notice'),
  fieldTitle:         $('field-job-title'),
  fieldCompany:       $('field-company'),
  fieldUrl:           $('field-url'),
  fieldDesc:          $('field-job-desc'),
  descQualityNotice:  $('desc-quality-notice'),
  jobInfoReview:      $('job-info-review'),
  
  btnGenResume:       $('btn-gen-resume'),
  btnGenCL:           $('btn-gen-cover-letter'),
  btnGenBoth:         $('btn-gen-both'),
  
  genStatus:          $('gen-status'),
  genStatusText:      $('gen-status-text'),
  genError:           $('gen-error'),
  genErrorMessage:    $('gen-error-message'),
  btnErrorRetry:      $('btn-error-retry'),
  btnErrorSettings:   $('btn-error-settings'),
  btnErrorDemo:       $('btn-error-demo'),
  btnPrivacySettings: $('btn-privacy-settings'),
  
  tabBtns:            document.querySelectorAll('.tab-btn'),
  tabPanels:          document.querySelectorAll('.tab-panel'),
  
  templateOptions:    document.querySelectorAll('.template-option'),
  colorDots:          document.querySelectorAll('.color-dot'),
  selectSpacing:      $('select-spacing'),
  rangeTone:          $('range-tone'),
  toneDescriptor:     $('tone-descriptor'),
  lengthPills:        document.querySelectorAll('.length-pill'),
  
  previewResumeFrame: $('preview-resume-frame'),
  previewCLFrame:     $('preview-cl-frame'),
  previewMergedFrame: $('preview-merged-frame'),
  draftResumeEmpty:   $('draft-resume-empty'),
  draftResumeContent: $('draft-resume-content'),
  draftCLEmpty:       $('draft-cl-empty'),
  draftCLContent:     $('draft-cl-content'),
  draftMergedEmpty:   $('draft-merged-empty'),
  draftMergedContent: $('draft-merged-content'),
  tabBtnMerged:       $('tab-btn-merged'),
  manualEditNotice:   $('manual-edit-notice'),
  
  fieldRevision:      $('field-revision'),
  btnApplyChanges:    $('btn-apply-changes'),
  btnRegenerate:      $('btn-regenerate'),
  
  btnPrintBoth:       $('btn-print-both'),
  btnPrintResume:     $('btn-print-resume'),
  btnPrintCL:         $('btn-print-cl'),
  btnPrintMerged:     $('btn-print-merged'),

  btnAtsScan:         $('btn-ats-scan'),
  atsEmpty:           $('ats-empty'),
  atsStatus:          $('ats-status'),
  atsResults:         $('ats-results'),
  atsScore:           $('ats-score'),
  atsMatchedGroup:    $('ats-matched-group'),
  atsMissingGroup:    $('ats-missing-group'),
  atsMatchedChips:    $('ats-matched-chips'),
  atsMissingChips:    $('ats-missing-chips'),
  atsApplyRow:        $('ats-apply-row'),
  btnAtsApply:        $('btn-ats-apply'),
  
  toast:              $('toast'),
  btnTheme:           $('btn-theme'),
  btnJobs:            $('btn-jobs'),
  btnHistory:         $('btn-history'),
  profileSwitcher:    $('profile-switcher'),
  profileMenuList:    $('profile-menu-list'),
  profileStrip:       $('profile-strip'),
  btnOpenProfile:     $('btn-open-profile'),
  btnOpenFullPage:    $('btn-open-full-page'),
  historyView:        $('history-view'),
  btnCloseHistory:    $('btn-close-history'),
  jobsView:           $('jobs-view'),
  btnCloseJobs:       $('btn-close-jobs'),
  btnJobsTourOverlay: $('btn-jobs-tour-overlay'),
  btnSupport:         $('btn-support'),
  btnSettings:        $('btn-settings'),
  mockBanner:         $('mock-mode-banner'),
  settingsView:       $('settings-view'),
  settingsOverlayTitle: $('settings-overlay-title'),
  btnCloseSettings:   $('btn-close-settings'),
  btnNewDraft:        $('btn-new-draft'),
  btnSaveJob:         $('btn-save-job'),
  btnTour:            $('btn-tour'),
  btnScan:            $('btn-scan-page'),
  btnAiFitCheck:      $('btn-ai-fit-check'),
  btnDiscussJob:      $('btn-discuss-job'),
  btnAiJobInfo:       $('btn-ai-job-info'),
  applicationFormCard: $('card-application-form'),
  btnToggleAutofillTools: $('btn-toggle-autofill-tools'),
  autofillToolsBody:  $('autofill-tools-body'),
  autofillHelperCopy: $('autofill-helper-copy'),
  btnScanFormFields:  $('btn-scan-form-fields'),
  btnReviewAutofill:  $('btn-review-autofill'),
  autofillNoProfile:    $('autofill-no-profile'),
  autofillStatusText:   $('autofill-status-text'),
  autofillReviewView:   $('autofill-review-view'),
  autofillReviewBody:   $('autofill-review-body'),
  btnFillPage:          $('btn-fill-page'),
  settingsFrame:      $('settings-frame'),
  btnEditResume:      $('btn-edit-resume'),
  btnEditCL:          $('btn-edit-cl'),
  btnClearResume:     $('btn-clear-resume'),
  btnClearCL:         $('btn-clear-cl'),

  // Email assistant
  btnPrepareEmail:        $('btn-prepare-email'),
  emailAssistantView:     $('email-assistant-view'),
  btnCloseEmailAssistant: $('btn-close-email-assistant'),
  btnRegenEmail:          $('btn-regen-email'),
  emailPanelLoading:      $('email-panel-loading'),
  emailPanelError:        $('email-panel-error'),
  emailPanelErrorMsg:     $('email-panel-error-msg'),
  btnEmailErrorRetry:     $('btn-email-error-retry'),
  emailPanelResult:       $('email-panel-result'),
  emailContextBanner:     $('email-context-banner'),
  emailDocsMissing:       $('email-docs-missing'),
  emailRecipientGroup:    $('email-recipient-group'),
  emailRecipientDisplay:  $('email-recipient-display'),
  btnCopyRecipient:       $('btn-copy-recipient'),
  emailSubjectDisplay:    $('email-subject-display'),
  btnCopySubject:         $('btn-copy-subject'),
  emailBodyDisplay:       $('email-body-display'),
  btnCopyBody:            $('btn-copy-body'),
  emailChecklistGroup:    $('email-checklist-group'),
  emailChecklist:         $('email-checklist'),
  btnCopyChecklist:       $('btn-copy-checklist'),
  emailQuestionsGroup:    $('email-questions-group'),
  emailQuestionsList:     $('email-questions-list'),
  emailAttachmentsGroup:  $('email-attachments-group'),
  emailAttachmentsList:   $('email-attachments-list'),
  emailWarningsGroup:     $('email-warnings-group'),
  emailWarningsList:      $('email-warnings-list'),
  btnOpenEmailApp:        $('btn-open-email-app'),
  emailMailtoTooLong:     $('email-mailto-too-long'),
  emailExtraInstructions: $('email-extra-instructions'),

  // Recruiter message
  recruiterMessageView:     $('recruiter-message-view'),
  btnCloseRecruiterMessage: $('btn-close-recruiter-message'),
  btnRegenRecruiterMessage: $('btn-regen-recruiter-message'),
  recruiterPanelLoading:    $('recruiter-panel-loading'),
  recruiterPanelError:      $('recruiter-panel-error'),
  recruiterPanelErrorMsg:   $('recruiter-panel-error-msg'),
  btnRecruiterErrorRetry:   $('btn-recruiter-error-retry'),
  recruiterPanelResult:     $('recruiter-panel-result'),
  recruiterContextBanner:   $('recruiter-context-banner'),
  recruiterSubjectGroup:    $('recruiter-subject-group'),
  recruiterSubjectDisplay:  $('recruiter-subject-display'),
  btnCopyRecruiterSubject:  $('btn-copy-recruiter-subject'),
  recruiterBodyDisplay:     $('recruiter-body-display'),
  btnCopyRecruiterBody:     $('btn-copy-recruiter-body'),
  recruiterWarningsGroup:   $('recruiter-warnings-group'),
  recruiterWarningsList:    $('recruiter-warnings-list'),
  recruiterNotesGroup:      $('recruiter-notes-group'),
  recruiterNotesList:       $('recruiter-notes-list'),

  // Follow-up message
  followUpMessageView:     $('follow-up-message-view'),
  btnCloseFollowUpMessage: $('btn-close-follow-up-message'),
  btnRegenFollowUpMessage: $('btn-regen-follow-up-message'),
  followUpPanelLoading:    $('follow-up-panel-loading'),
  followUpPanelError:      $('follow-up-panel-error'),
  followUpPanelErrorMsg:   $('follow-up-panel-error-msg'),
  btnFollowUpErrorRetry:   $('btn-follow-up-error-retry'),
  followUpPanelResult:     $('follow-up-panel-result'),
  followUpContextBanner:   $('follow-up-context-banner'),
  followUpSubjectGroup:    $('follow-up-subject-group'),
  followUpSubjectDisplay:  $('follow-up-subject-display'),
  btnCopyFollowUpSubject:  $('btn-copy-follow-up-subject'),
  followUpBodyDisplay:     $('follow-up-body-display'),
  btnCopyFollowUpBody:     $('btn-copy-follow-up-body'),
  followUpWarningsGroup:   $('follow-up-warnings-group'),
  followUpWarningsList:    $('follow-up-warnings-list'),
  followUpNotesGroup:      $('follow-up-notes-group'),
  followUpNotesList:       $('follow-up-notes-list'),

  // Application answers
  appAnswersView:          $('application-answers-view'),
  btnCloseAppAnswers:      $('btn-close-app-answers'),
  btnRegenAppAnswers:      $('btn-regen-app-answers'),
  appAnswersPanelLoading:  $('app-answers-panel-loading'),
  appAnswersPanelError:    $('app-answers-panel-error'),
  appAnswersPanelErrorMsg: $('app-answers-panel-error-msg'),
  btnAppAnswersErrorRetry: $('btn-app-answers-error-retry'),
  appAnswersPanelResult:   $('app-answers-panel-result'),
  appAnswersContextBanner: $('app-answers-context-banner'),
  appAnswersList:          $('app-answers-list'),

  // Reminder text
  reminderTextView:       $('reminder-text-view'),
  btnCloseReminderText:   $('btn-close-reminder-text'),
  reminderPanelError:     $('reminder-panel-error'),
  reminderPanelErrorMsg:  $('reminder-panel-error-msg'),
  reminderPanelResult:    $('reminder-panel-result'),
  reminderTimingNote:     $('reminder-timing-note'),
  reminderDateGroup:      $('reminder-date-group'),
  reminderDateDisplay:    $('reminder-date-display'),
  reminderTitleDisplay:   $('reminder-title-display'),
  btnCopyReminderTitle:   $('btn-copy-reminder-title'),
  reminderBodyDisplay:    $('reminder-body-display'),
  btnCopyReminderBody:    $('btn-copy-reminder-body'),

  rightCol:            $('right-col'),
  outputPlaceholder:   $('output-placeholder'),

  // Job Discussion Chat
  btnChat:             $('btn-chat'),
  jobChatView:         $('job-chat-view'),
  btnCloseJobChat:     $('btn-close-job-chat'),
  btnClearJobChat:     $('btn-clear-job-chat'),
  jobChatJobLabel:     $('job-chat-job-label'),
  jobChatEmpty:        $('job-chat-empty'),
  jobChatContextNote:  $('job-chat-context-note'),
  jobChatChips:        $('job-chat-chips'),
  jobChatScroll:       $('job-chat-scroll'),
  jobChatMessages:     $('job-chat-messages'),
  jobChatInput:        $('job-chat-input'),
  btnJobChatSend:      $('btn-job-chat-send'),
};

// ── Job Discussion Chat ───────────────────────────────────────────────────

function buildJobChatContext() {
  const { jobData, profile, lastFitCheck, drafts } = state;
  const activeProfileId = dom.profileSwitcher.dataset.profileId || '';
  const profileMeta = state.profileIndex.find(p => p.id === activeProfileId);
  const profileName = profileMeta?.name || 'General';

  let aiReview = null;
  if (lastFitCheck) {
    aiReview = lastFitCheck.aiMatchesByProfile?.[activeProfileId] ?? null;
  }

  return {
    jobTitle:        jobData.jobTitle  || '',
    company:         jobData.company   || '',
    sourceUrl:       jobData.sourceUrl || '',
    description:     jobData.description || '',
    activeProfileId,
    profileName,
    profile:         profile || null,
    aiReview,
    hasResumeDraft:  Boolean(drafts.resume),
    hasCLDraft:      Boolean(drafts['cover-letter']),
  };
}

function hasJobChatContext() {
  return Boolean(state.jobData.jobTitle || state.jobData.description);
}

function normalizeJobChatSignaturePart(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildJobChatSignature(jobData = state.jobData) {
  const sourceUrl = normalizeJobChatSignaturePart(jobData.sourceUrl);
  const description = normalizeJobChatSignaturePart(jobData.description);
  const jobTitle = normalizeJobChatSignaturePart(jobData.jobTitle);
  const company = normalizeJobChatSignaturePart(jobData.company);

  if (!jobTitle && !description) return '';

  if (sourceUrl || description) {
    const firstSlice = description.slice(0, 120);
    const lastSlice = description.slice(-120);
    return `url:${sourceUrl}|desc:${description.length}:${firstSlice}:${lastSlice}`;
  }

  if (jobTitle || company) {
    return `manual:${jobTitle}|${company}`;
  }

  return '';
}

function syncJobChatToCurrentJob() {
  const previousSignature = state.jobChat.jobSignature || '';
  const nextSignature = buildJobChatSignature();

  if ((previousSignature && previousSignature !== nextSignature) || !nextSignature) {
    clearJobChat();
  }

  state.jobChat.jobSignature = nextSignature;
}

function refreshJobChatEntryPoints() {
  const hasContext = hasJobChatContext();

  dom.btnChat.disabled = !hasContext;
  dom.btnChat.title = hasContext
    ? 'Discuss this job with AI'
    : 'Scan or load a job first';

  dom.btnDiscussJob.disabled = !hasContext;
  dom.btnDiscussJob.title = hasContext
    ? 'Discuss this job'
    : 'Scan or load a job first';
  dom.btnDiscussJob.classList.toggle('hidden', !hasContext);
}

function openJobChat() {
  dom.jobChatView.classList.add('visible');
  renderJobChatOverlay();
  if (hasJobChatContext()) {
    // Delay so the overlay slide-in animation completes before focusing
    setTimeout(() => dom.jobChatInput.focus(), 220);
  }
}

function closeJobChat() {
  dom.jobChatView.classList.remove('visible');
  currentJobChatController?.abort();
  currentJobChatController = null;
}

function renderJobChatOverlay() {
  const hasContext  = hasJobChatContext();
  const hasMessages = state.jobChat.messages.length > 0;

  // Header job label
  const label = [state.jobData.jobTitle, state.jobData.company].filter(Boolean).join(' — ');
  dom.jobChatJobLabel.textContent = label;

  dom.jobChatEmpty.classList.toggle('hidden', hasContext);

  if (hasContext) {
    const hasAiReview = Boolean(buildJobChatContext().aiReview);
    const parts = ['profile', 'job description'];
    if (hasAiReview) parts.push('AI Fit Check');
    dom.jobChatContextNote.textContent = `AI has access to: ${parts.join(', ')}.`;
  }
  dom.jobChatContextNote.classList.toggle('hidden', !hasContext);
  dom.jobChatChips.classList.toggle('hidden', !hasContext || hasMessages);

  dom.jobChatInput.disabled       = !hasContext;
  dom.btnJobChatSend.disabled     = !hasContext || !dom.jobChatInput.value.trim();

  renderChatMessages();
}

function renderChatMessages() {
  dom.jobChatMessages.innerHTML = '';
  state.jobChat.messages.forEach((msg, index) => {
    appendChatBubble(msg.role, msg.content, false, msg.profileProposal, index);
  });
  scrollChatToBottom();
}

function appendChatBubble(role, content, pending = false, profileProposal = null, messageIndex = -1) {
  const el = document.createElement('div');
  el.className = [
    'job-chat-msg',
    pending          ? 'job-chat-msg--thinking'  :
    role === 'user'  ? 'job-chat-msg--user'       :
                       'job-chat-msg--assistant',
  ].join(' ');
  if (pending || role !== 'assistant') {
    el.textContent = pending ? '…' : content;
  } else {
    renderAssistantChatBubbleContent(el, content, profileProposal, messageIndex);
  }
  dom.jobChatMessages.appendChild(el);
  return el;
}

function renderAssistantChatBubbleContent(el, content, profileProposal = null, messageIndex = -1) {
  el.innerHTML = renderChatMarkdown(content);

  if (profileProposal) {
    el.appendChild(renderProfileSuggestionCard(profileProposal, messageIndex));
  }

  const actions = document.createElement('div');
  actions.className = 'job-chat-actions';

  const btnResume = document.createElement('button');
  btnResume.type = 'button';
  btnResume.className = 'job-chat-action-btn';
  btnResume.textContent = 'Use in Resume Refine';
  btnResume.addEventListener('click', () => useChatReplyInRefine(content, 'resume'));

  const btnCoverLetter = document.createElement('button');
  btnCoverLetter.type = 'button';
  btnCoverLetter.className = 'job-chat-action-btn';
  btnCoverLetter.textContent = 'Use in Cover Letter Refine';
  btnCoverLetter.addEventListener('click', () => useChatReplyInRefine(content, 'cover-letter'));

  actions.append(btnResume, btnCoverLetter);
  el.appendChild(actions);
}

function sectionLabel(section) {
  const labels = {
    personalInfo: 'Personal Info',
    headline: 'Headline',
    summary: 'Summary',
    summaries: 'Summaries',
    experience: 'Experience',
    education: 'Education',
    skills: 'Skills',
    projects: 'Projects',
    certifications: 'Certifications',
    customSections: 'Custom Sections',
    doNotClaimNotes: 'Do Not Claim Notes',
    coverLetterProfile: 'Cover Letter Profile',
  };
  return labels[section] || section || 'Profile';
}

function actionLabel(action) {
  const labels = { add: 'Add', update: 'Update', remove: 'Remove' };
  return labels[action] || 'Review';
}

function formatProposalValue(value) {
  if (value == null || value === '') return 'No specific value provided.';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return 'No items provided.';
    return value.map(item => `- ${formatProposalValue(item).replace(/\n/g, '\n  ')}`).join('\n');
  }
  if (typeof value === 'object') {
    const lines = [];
    Object.entries(value).forEach(([key, item]) => {
      if (item == null || item === '' || (Array.isArray(item) && !item.length)) return;
      const formatted = formatProposalValue(item);
      lines.push(`${key}: ${formatted.includes('\n') ? `\n${formatted}` : formatted}`);
    });
    return lines.length ? lines.join('\n') : 'No specific value provided.';
  }
  return String(value);
}

function formatDiffFieldChanges(changes = []) {
  if (!changes.length) return 'No field-level changes detected.';
  return changes.map(change => {
    const before = formatProposalValue(change.before).replace(/\n/g, '\n    ');
    const after = formatProposalValue(change.after).replace(/\n/g, '\n    ');
    return `${change.changeType.toUpperCase()} ${change.field}\n  Before: ${before}\n  After: ${after}`;
  }).join('\n\n');
}

function profileApplySectionValue(profile = {}, section = '') {
  if (section === 'summary') return profile.summary || '';
  if (section === 'skills') return profile.skills || [];
  if (section === 'certifications') return profile.certifications || [];
  if (section === 'experience') return profile.experience || [];
  return profile?.[section] ?? null;
}

function profileApplyStatusText(result = {}) {
  if (result.ok) return 'Eligible for future Apply.';
  if (result.needsConfirmation) return 'Sensitive confirmation required.';
  return 'Blocked for future Apply.';
}

function profileApplyStatusClass(result = {}) {
  if (result.ok) return 'job-chat-profile-apply-status--ready';
  if (result.needsConfirmation) return 'job-chat-profile-apply-status--confirm';
  return 'job-chat-profile-apply-status--blocked';
}

function appendProfileApplyList(host, titleText, values = [], emptyText = 'None.') {
  const section = document.createElement('div');
  section.className = 'job-chat-profile-apply-section';
  const title = document.createElement('strong');
  title.textContent = titleText;
  section.appendChild(title);

  const items = values.filter(Boolean);
  if (!items.length) {
    const empty = document.createElement('p');
    empty.textContent = emptyText;
    section.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'job-chat-profile-apply-list';
    items.forEach(value => {
      const item = document.createElement('li');
      item.textContent = value;
      list.appendChild(item);
    });
    section.appendChild(list);
  }

  host.appendChild(section);
}

function renderProfileApplyReadinessPanel(result, proposal, context, confirmedSensitive = false, onSensitiveConfirmationChange, onApply) {
  const panel = document.createElement('div');
  panel.className = 'job-chat-profile-apply-readiness';
  panel.dataset.profileApplyReadinessPanel = 'true';

  const title = document.createElement('div');
  title.className = 'job-chat-profile-diff-title';
  title.textContent = 'Apply Requirements Review';

  const status = document.createElement('p');
  status.className = `job-chat-profile-apply-status ${profileApplyStatusClass(result)}`;
  status.textContent = profileApplyStatusText(result);

  const meta = document.createElement('p');
  meta.className = 'job-chat-profile-diff-meta';
  meta.textContent = [
    `Section: ${sectionLabel(result.section || proposal.section)}`,
    `Action: ${actionLabel(result.action || proposal.action)}`,
    context.profileName ? `Profile: ${context.profileName}` : '',
    proposal.targetProfileId ? `Target ID: ${proposal.targetProfileId}` : context.activeProfileId ? `Active ID: ${context.activeProfileId}` : '',
  ].filter(Boolean).join(' | ');

  const warning = document.createElement('p');
  warning.className = 'job-chat-profile-apply-warning';
  warning.textContent = PROFILE_APPLY_CONFIRMATION_WARNING;

  const grid = document.createElement('div');
  grid.className = 'job-chat-profile-diff-grid';

  const before = document.createElement('div');
  before.className = 'job-chat-profile-diff-col';
  before.innerHTML = '<strong>Before</strong>';
  const beforePre = document.createElement('pre');
  beforePre.textContent = formatProposalValue(profileApplySectionValue(result.beforeProfile || context.profile || {}, result.section || proposal.section));
  before.appendChild(beforePre);

  const after = document.createElement('div');
  after.className = 'job-chat-profile-diff-col';
  after.innerHTML = '<strong>After</strong>';
  const afterPre = document.createElement('pre');
  afterPre.textContent = result.afterProfile
    ? formatProposalValue(profileApplySectionValue(result.afterProfile, result.section || proposal.section))
    : 'No simulated profile output. Resolve the requirements below first.';
  after.appendChild(afterPre);
  grid.append(before, after);

  const patch = document.createElement('div');
  patch.className = 'job-chat-profile-apply-section';
  const patchTitle = document.createElement('strong');
  patchTitle.textContent = 'Patch summary';
  const patchPre = document.createElement('pre');
  patchPre.className = 'job-chat-profile-apply-summary';
  patchPre.textContent = result.patchSummary
    ? formatProposalValue(result.patchSummary)
    : 'No patch summary. This suggestion is not ready for simulated Apply.';
  patch.append(patchTitle, patchPre);

  panel.append(title, status, meta, warning, grid, patch);

  appendProfileApplyList(panel, 'Warnings', result.warnings || [], 'No warnings.');
  appendProfileApplyList(panel, 'Block reasons', result.reasons || [], result.ok ? 'No blocking reasons.' : 'No specific reason provided.');

  const applySupported = isApplySectionSupported(result.section || proposal.section, result.action || proposal.action);
  const applyReady = result.ok && applySupported;

  const eligibility = document.createElement('p');
  eligibility.className = 'job-chat-profile-apply-eligibility';
  eligibility.textContent = applyReady
    ? 'This proposal is ready to apply. Review carefully before proceeding. Nothing has been saved yet.'
    : result.ok && !applySupported
      ? 'This proposal is valid but this section is not yet enabled for Apply. Nothing has been saved.'
      : result.needsConfirmation
        ? 'This proposal needs sensitive-content confirmation before it could be eligible for a future Apply flow. Nothing has been saved.'
        : 'This proposal is not currently eligible for a future Apply flow. Nothing has been saved.';
  panel.appendChild(eligibility);

  if (result.needsConfirmation || proposal.sensitiveFields?.length) {
    const label = document.createElement('label');
    label.className = 'job-chat-profile-apply-confirm';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = confirmedSensitive;
    checkbox.addEventListener('change', () => onSensitiveConfirmationChange?.(checkbox.checked));
    const text = document.createElement('span');
    text.textContent = 'I understand this may include sensitive personal information.';
    label.append(checkbox, text);
    panel.appendChild(label);
  }

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'job-chat-action-btn';
  if (applyReady && onApply) {
    applyBtn.textContent = 'Apply to Profile';
    applyBtn.addEventListener('click', () => onApply());
  } else {
    applyBtn.textContent = 'Apply coming later.';
    applyBtn.disabled = true;
  }
  panel.appendChild(applyBtn);

  return panel;
}

function invalidateProfileApplyReadinessPanel(panel) {
  const readiness = panel?.querySelector('[data-profile-apply-readiness-panel]');
  readiness?.remove();
  const reviewButton = panel?.querySelector('[data-profile-apply-readiness-button]');
  if (reviewButton) reviewButton.textContent = 'Review Apply Requirements';
}

function proposalTextValue(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.text === 'string') return value.text;
  return '';
}

function proposalStringListValue(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
  return [];
}

function renderProfileSuggestionWarnings(host, proposal) {
  host.innerHTML = '';
  const warnings = [...(proposal.warnings || [])];
  if (proposal.sensitiveFields?.length) {
    warnings.push('Sensitive data warning: this may include protected or sensitive personal details. Review carefully before using it in job application materials.');
  }
  if (!warnings.length) return;

  const list = document.createElement('ul');
  list.className = 'job-chat-profile-suggestion-warnings';
  warnings.forEach(warning => {
    const item = document.createElement('li');
    item.textContent = warning;
    list.appendChild(item);
  });
  host.appendChild(list);
}

function renderProfileDiffWarnings(host, diff) {
  host.innerHTML = '';
  if (!diff.warnings?.length && !diff.sensitiveFields?.length) return;

  const warnings = document.createElement('ul');
  warnings.className = 'job-chat-profile-suggestion-warnings';
  [...(diff.warnings || []), ...(diff.sensitiveFields || []).map(field => `Sensitive data review: ${field}`)].forEach(warning => {
    const item = document.createElement('li');
    item.textContent = warning;
    warnings.appendChild(item);
  });
  host.appendChild(warnings);
}

function updateProfileDiffPreviewPanel(panel, diff) {
  panel.querySelector('[data-profile-diff-meta]').textContent = [
    diff.profileName ? `Profile: ${diff.profileName}` : '',
    `Section: ${diff.sectionLabel}`,
    `Action: ${diff.actionLabel}`,
  ].filter(Boolean).join(' | ');
  panel.querySelector('[data-profile-diff-before]').textContent = diff.before == null ? diff.beforeLabel : formatProposalValue(diff.before);
  panel.querySelector('[data-profile-diff-after]').textContent = diff.after == null ? diff.afterLabel : formatProposalValue(diff.after);
  panel.querySelector('[data-profile-diff-changes]').textContent = formatDiffFieldChanges(diff.fieldChanges);
  panel.querySelector('[data-profile-diff-notice]').textContent = diff.readOnlyNotice;
  renderProfileDiffWarnings(panel.querySelector('[data-profile-diff-warnings]'), diff);
}

function createProfileEditField(labelText, control) {
  const label = document.createElement('label');
  label.className = 'job-chat-profile-edit-field';
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(text, control);
  return label;
}

function createProfileEditTextInput(value = '') {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = String(value || '');
  input.className = 'job-chat-profile-edit-input';
  return input;
}

function createProfileEditTextarea(value = '', rows = 4) {
  const textarea = document.createElement('textarea');
  textarea.value = String(value || '');
  textarea.rows = rows;
  textarea.className = 'job-chat-profile-edit-textarea';
  return textarea;
}

function renderProfileProposalEditFields(proposal, onChange) {
  const editor = document.createElement('div');
  editor.className = 'job-chat-profile-edit-fields hidden';

  const status = document.createElement('p');
  status.className = 'job-chat-profile-edit-status';

  if (!canEditProfileUpdateProposal(proposal)) {
    const unsupported = document.createElement('p');
    unsupported.className = 'job-chat-profile-edit-unsupported';
    unsupported.textContent = PROFILE_PROPOSAL_EDIT_UNSUPPORTED_MESSAGE;
    editor.append(unsupported);
    return { editor, status };
  }

  const wire = (controls, collect) => {
    const handler = () => onChange(collect(), status);
    controls.forEach(control => control.addEventListener('input', handler));
    editor.append(...controls.map(item => item.field));
  };

  const value = proposal.proposedValue;
  if (proposal.section === 'skills') {
    const textarea = createProfileEditTextarea(proposalStringListValue(value).join('\n'), 5);
    wire([{ field: createProfileEditField('Skills, one per line', textarea), addEventListener: textarea.addEventListener.bind(textarea) }], () =>
      textarea.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
    );
  } else if (proposal.section === 'summary') {
    const textarea = createProfileEditTextarea(proposalTextValue(value), 6);
    wire([{ field: createProfileEditField('Summary', textarea), addEventListener: textarea.addEventListener.bind(textarea) }], () => ({
      text: textarea.value,
    }));
  } else if (proposal.section === 'experience' && proposal.action === 'add') {
    const current = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const jobTitle = createProfileEditTextInput(current.jobTitle);
    const employer = createProfileEditTextInput(current.employer);
    const location = createProfileEditTextInput(current.location);
    const dates = createProfileEditTextInput(current.dates || [current.startDate, current.endDate].filter(Boolean).join(' - '));
    const bulletPoints = createProfileEditTextarea(proposalStringListValue(current.bulletPoints || current.responsibilities).join('\n'), 5);
    const fields = [
      createProfileEditField('Job title', jobTitle),
      createProfileEditField('Employer', employer),
      createProfileEditField('Location', location),
      createProfileEditField('Dates', dates),
      createProfileEditField('Bullet points / responsibilities', bulletPoints),
    ];
    const controls = [jobTitle, employer, location, dates, bulletPoints];
    const handler = () => onChange({
      jobTitle: jobTitle.value,
      employer: employer.value,
      location: location.value,
      dates: dates.value,
      bulletPoints: bulletPoints.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
    }, status);
    controls.forEach(control => control.addEventListener('input', handler));
    editor.append(...fields);
  } else if (proposal.section === 'certifications' && proposal.action === 'add') {
    const current = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const name = createProfileEditTextInput(current.name);
    const issuer = createProfileEditTextInput(current.issuer);
    const year = createProfileEditTextInput(current.year);
    const fields = [
      createProfileEditField('Name', name),
      createProfileEditField('Issuer', issuer),
      createProfileEditField('Year', year),
    ];
    const controls = [name, issuer, year];
    const handler = () => onChange({
      name: name.value,
      issuer: issuer.value,
      year: year.value,
    }, status);
    controls.forEach(control => control.addEventListener('input', handler));
    editor.append(...fields);
  }

  editor.appendChild(status);
  return { editor, status };
}

function renderProfileDiffPreviewPanel(diff, proposal, callbacks = {}) {
  const panel = document.createElement('div');
  panel.className = 'job-chat-profile-diff';

  const title = document.createElement('div');
  title.className = 'job-chat-profile-diff-title';
  title.textContent = 'Profile Change Preview';

  const meta = document.createElement('p');
  meta.className = 'job-chat-profile-diff-meta';
  meta.dataset.profileDiffMeta = 'true';
  meta.textContent = [
    diff.profileName ? `Profile: ${diff.profileName}` : '',
    `Section: ${diff.sectionLabel}`,
    `Action: ${diff.actionLabel}`,
  ].filter(Boolean).join(' | ');

  const grid = document.createElement('div');
  grid.className = 'job-chat-profile-diff-grid';

  const before = document.createElement('div');
  before.className = 'job-chat-profile-diff-col';
  before.innerHTML = '<strong>Before</strong>';
  const beforePre = document.createElement('pre');
  beforePre.dataset.profileDiffBefore = 'true';
  beforePre.textContent = diff.before == null ? diff.beforeLabel : formatProposalValue(diff.before);
  before.appendChild(beforePre);

  const after = document.createElement('div');
  after.className = 'job-chat-profile-diff-col';
  after.innerHTML = '<strong>After</strong>';
  const afterPre = document.createElement('pre');
  afterPre.dataset.profileDiffAfter = 'true';
  afterPre.textContent = diff.after == null ? diff.afterLabel : formatProposalValue(diff.after);
  after.appendChild(afterPre);

  grid.append(before, after);

  const changes = document.createElement('pre');
  changes.className = 'job-chat-profile-diff-changes';
  changes.dataset.profileDiffChanges = 'true';
  changes.textContent = formatDiffFieldChanges(diff.fieldChanges);

  panel.append(title, meta, grid, changes);

  const warningHost = document.createElement('div');
  warningHost.dataset.profileDiffWarnings = 'true';
  renderProfileDiffWarnings(warningHost, diff);
  panel.appendChild(warningHost);

  const notice = document.createElement('p');
  notice.className = 'job-chat-profile-suggestion-notice';
  notice.dataset.profileDiffNotice = 'true';
  notice.textContent = diff.readOnlyNotice;
  panel.appendChild(notice);

  const editControls = document.createElement('div');
  editControls.className = 'job-chat-profile-edit-controls';
  const btnEdit = document.createElement('button');
  btnEdit.type = 'button';
  btnEdit.className = 'job-chat-action-btn';
  btnEdit.textContent = 'Edit Suggestion';
  const { editor } = renderProfileProposalEditFields(proposal, (nextValue, status) => {
    callbacks.onEditValueChange?.(nextValue, status, panel);
  });
  btnEdit.addEventListener('click', () => {
    const hidden = editor.classList.toggle('hidden');
    btnEdit.textContent = hidden ? 'Edit Suggestion' : 'Hide Editor';
  });
  editControls.append(btnEdit);
  panel.append(editControls, editor);

  const reviewControls = document.createElement('div');
  reviewControls.className = 'job-chat-profile-apply-controls';
  const btnReviewApply = document.createElement('button');
  btnReviewApply.type = 'button';
  btnReviewApply.className = 'job-chat-action-btn';
  btnReviewApply.dataset.profileApplyReadinessButton = 'true';
  btnReviewApply.textContent = 'Review Apply Requirements';
  btnReviewApply.addEventListener('click', () => {
    const existing = panel.querySelector('[data-profile-apply-readiness-panel]');
    if (existing) {
      existing.remove();
      btnReviewApply.textContent = 'Review Apply Requirements';
      return;
    }
    callbacks.onReviewApplyRequirements?.(panel, false);
    btnReviewApply.textContent = 'Hide Apply Requirements';
  });
  reviewControls.appendChild(btnReviewApply);
  panel.appendChild(reviewControls);

  const disabledApply = document.createElement('button');
  disabledApply.type = 'button';
  disabledApply.className = 'job-chat-action-btn';
  disabledApply.textContent = 'Apply coming later.';
  disabledApply.disabled = true;
  panel.appendChild(disabledApply);

  return panel;
}

function renderProfileSuggestionCard(proposal, messageIndex) {
  let currentProposal = proposal;
  const card = document.createElement('div');
  card.className = 'job-chat-profile-suggestion';

  const title = document.createElement('div');
  title.className = 'job-chat-profile-suggestion-title';
  title.textContent = 'Suggested Profile Update';

  const meta = document.createElement('div');
  meta.className = 'job-chat-profile-suggestion-meta';

  const section = document.createElement('span');
  section.className = 'job-chat-profile-section';
  section.textContent = sectionLabel(proposal.section);

  const action = document.createElement('span');
  action.className = `job-chat-profile-action job-chat-profile-action--${proposal.action || 'review'}`;
  action.textContent = actionLabel(proposal.action);

  meta.append(section, action);

  const summary = document.createElement('p');
  summary.className = 'job-chat-profile-suggestion-summary';
  summary.textContent = proposal.summary || 'Review suggested profile change.';

  const preview = document.createElement('pre');
  preview.className = 'job-chat-profile-suggestion-preview';
  preview.textContent = formatProposalValue(currentProposal.proposedValue);

  card.append(title, meta, summary, preview);

  const warningsHost = document.createElement('div');
  renderProfileSuggestionWarnings(warningsHost, currentProposal);
  card.appendChild(warningsHost);

  const notice = document.createElement('p');
  notice.className = 'job-chat-profile-suggestion-notice';
  notice.textContent = 'This is only a suggestion. It has not changed your saved profile yet.';
  card.appendChild(notice);

  const buttons = document.createElement('div');
  buttons.className = 'job-chat-profile-suggestion-buttons';

  const btnCopy = document.createElement('button');
  btnCopy.type = 'button';
  btnCopy.className = 'job-chat-action-btn';
  btnCopy.textContent = 'Copy Suggestion';
  btnCopy.addEventListener('click', () => {
    navigator.clipboard
      .writeText(formatProfileUpdateProposalForCopy(currentProposal))
      .then(() => showToast('Profile suggestion copied'))
      .catch(() => showToast('Copy failed — try selecting and copying manually.'));
  });

  const syncEditedProposal = (nextProposal, panel, status) => {
    currentProposal = nextProposal;
    if (messageIndex >= 0 && state.jobChat.messages[messageIndex]) {
      state.jobChat.messages[messageIndex].profileProposal = nextProposal;
    }
    preview.textContent = formatProposalValue(currentProposal.proposedValue);
    renderProfileSuggestionWarnings(warningsHost, currentProposal);
    if (panel) {
      updateProfileDiffPreviewPanel(panel, buildProfileProposalDiff(currentProposal, buildJobChatContext()));
      invalidateProfileApplyReadinessPanel(panel);
    }
    if (status) {
      status.textContent = 'Preview updated. Saved profile unchanged.';
      status.classList.remove('job-chat-profile-edit-status--error');
    }
  };

  const handleEditedProposalValue = (nextValue, status, panel) => {
    const result = validateEditedProfileUpdateProposal(currentProposal, nextValue, buildJobChatContext());
    if (!result.proposal) {
      if (status) {
        status.textContent = result.unsupportedMessage || result.validationMessage;
        status.classList.add('job-chat-profile-edit-status--error');
      }
      return;
    }
    syncEditedProposal(result.proposal, panel, status);
  };

  let applyConfirmedSensitive = false;

  const applyHandler = async () => {
    if (!confirm(PROFILE_APPLY_CONFIRMATION_WARNING)) return;

    const context = buildJobChatContext();
    const result = validateAndApplyProfileProposal({
      profile: context.profile,
      proposal: currentProposal,
      activeProfileId: context.activeProfileId,
      confirmedSensitive: applyConfirmedSensitive,
    });

    if (!result.ok || !result.afterProfile) {
      showToast(result.reasons?.length ? result.reasons.join(' ') : 'Apply validation failed.');
      return;
    }

    if (!isApplySectionSupported(result.section, result.action)) {
      showToast('Apply is not yet supported for this section and action.');
      return;
    }

    const beforeProfile = result.beforeProfile;
    const afterFingerprint = profileProposalFingerprint(result.afterProfile);

    const saveResult = await guardedProfileApply(
      result.afterProfile,
      context.activeProfileId,
      currentProposal.baseProfileFingerprint,
    );

    if (!saveResult.ok) {
      showToast(saveResult.error || 'Failed to save profile.');
      return;
    }

    const snapshot = {
      profileId: context.activeProfileId,
      profileName: context.profileName,
      beforeProfile,
      beforeProfileFingerprint: profileProposalFingerprint(beforeProfile),
      afterProfileFingerprint: afterFingerprint,
      section: result.section,
      action: result.action,
      summary: currentProposal.summary || '',
      appliedAt: Date.now(),
    };
    storeUndoSnapshot(snapshot);

    state.profile = await loadProfile();
    showToast('Profile updated successfully.');

    card.dataset.profileApplied = 'true';
    const existingNotice = card.querySelector('.job-chat-profile-suggestion-notice');
    if (existingNotice) {
      existingNotice.textContent = 'This suggestion has been applied to your saved profile.';
      existingNotice.classList.add('job-chat-profile-suggestion-notice--applied');
    }

    const existingUndo = card.querySelector('.job-chat-profile-undo');
    existingUndo?.remove();
    const undoEl = renderUndoButton(undoHandler);
    if (existingNotice) {
      existingNotice.after(undoEl);
    } else {
      card.appendChild(undoEl);
    }

    invalidateProfileApplyReadinessPanel(card);
    setProfileChangeStaleMarkers('apply');
  };

  const undoHandler = async () => {
    const snapshot = getUndoSnapshot();
    if (!snapshot) {
      showToast('Nothing to undo.');
      return;
    }

    const context = buildJobChatContext();
    if (context.activeProfileId !== snapshot.profileId) {
      showToast('Cannot undo: the active profile has changed.');
      return;
    }

    const currentProfile = await loadProfile();
    const currentFingerprint = profileProposalFingerprint(currentProfile);
    if (currentFingerprint !== snapshot.afterProfileFingerprint) {
      showToast('Cannot undo: the profile has been modified since the last apply.');
      return;
    }

    const saveResult = await guardedProfileApply(
      snapshot.beforeProfile,
      snapshot.profileId,
      snapshot.afterProfileFingerprint,
    );

    if (!saveResult.ok) {
      showToast(saveResult.error || 'Undo failed. Please try again.');
      return;
    }

    state.profile = await loadProfile();
    clearUndoSnapshot();
    showToast('Profile update undone.');

    card.dataset.profileApplied = 'false';
    const existingNotice = card.querySelector('.job-chat-profile-suggestion-notice');
    if (existingNotice) {
      existingNotice.textContent = 'Profile update has been undone.';
      existingNotice.classList.remove('job-chat-profile-suggestion-notice--applied');
    }
    const undoButton = card.querySelector('.job-chat-profile-undo');
    undoButton?.remove();

    setProfileChangeStaleMarkers('undo');
  };

  const renderApplyReadiness = (targetPanel, confirmedSensitive = false) => {
    applyConfirmedSensitive = confirmedSensitive;
    const context = buildJobChatContext();
    const result = validateAndApplyProfileProposal({
      profile: context.profile,
      proposal: currentProposal,
      activeProfileId: context.activeProfileId,
      confirmedSensitive,
    });
    const oldPanel = targetPanel.querySelector('[data-profile-apply-readiness-panel]');
    oldPanel?.remove();
    const readinessPanel = renderProfileApplyReadinessPanel(
      result, currentProposal, context, confirmedSensitive,
      (nextConfirmedSensitive) => {
        renderApplyReadiness(targetPanel, nextConfirmedSensitive);
      },
      applyHandler,
    );
    const disabledApply = targetPanel.querySelector(':scope > button[disabled]');
    if (disabledApply) {
      targetPanel.insertBefore(readinessPanel, disabledApply);
    } else {
      targetPanel.appendChild(readinessPanel);
    }
  };

  const btnPreview = document.createElement('button');
  btnPreview.type = 'button';
  btnPreview.className = 'job-chat-action-btn';
  btnPreview.textContent = 'Preview Changes';
  btnPreview.addEventListener('click', () => {
    let panel = card.querySelector('.job-chat-profile-diff');
    if (panel) {
      panel.remove();
      btnPreview.textContent = 'Preview Changes';
      return;
    }
    const diff = buildProfileProposalDiff(currentProposal, buildJobChatContext());
    panel = renderProfileDiffPreviewPanel(diff, currentProposal, {
      onEditValueChange: handleEditedProposalValue,
      onReviewApplyRequirements: renderApplyReadiness,
    });
    card.insertBefore(panel, buttons);
    btnPreview.textContent = 'Hide Preview';
  });

  const btnProfile = document.createElement('button');
  btnProfile.type = 'button';
  btnProfile.className = 'job-chat-action-btn';
  btnProfile.textContent = 'View Profile';
  btnProfile.addEventListener('click', () => {
    closeJobChat();
    openSettingsSection('profile');
  });

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button';
  btnCancel.className = 'job-chat-action-btn';
  btnCancel.textContent = 'Cancel';
  btnCancel.addEventListener('click', () => {
    if (messageIndex >= 0 && state.jobChat.messages[messageIndex]) {
      state.jobChat.messages[messageIndex].profileProposal = null;
    }
    card.remove();
    showToast('Profile suggestion dismissed');
  });

  buttons.append(btnCopy, btnPreview, btnProfile, btnCancel);
  card.appendChild(buttons);

  return card;
}

function buildChatRefineInstruction(reply, docType) {
  const docLabel = docType === 'cover-letter' ? 'cover letter' : 'resume';
  const text = String(reply || '').trim();
  const capped = text.length > CHAT_REFINE_REPLY_CHAR_LIMIT
    ? `${text.slice(0, CHAT_REFINE_REPLY_CHAR_LIMIT).trimEnd()}\n\n[Trimmed for length.]`
    : text;

  return [
    'Use the following chat guidance as positioning and emphasis guidance only. Do not treat it as new factual profile data, and do not add qualifications, credentials, tools, metrics, dates, or experience unless they are already supported by my profile/source resume. Revise the ' + docLabel + ' accordingly:',
    '',
    capped,
  ].join('\n');
}

function useChatReplyInRefine(reply, docType) {
  const targetDoc = docType === 'cover-letter' ? 'cover-letter' : 'resume';
  const docLabel = targetDoc === 'cover-letter' ? 'cover letter' : 'resume';

  state.atsRevision = false;
  switchTab(targetDoc);
  dom.fieldRevision.value = buildChatRefineInstruction(reply, targetDoc);
  refreshRevisionButton();
  closeJobChat();
  document.getElementById('card-revision').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  dom.fieldRevision.focus();

  if (state.drafts[targetDoc]) {
    showToast('Chat guidance added to Refine — review and click Apply Changes.');
  } else {
    showToast(`Chat guidance added. Generate the ${docLabel} before applying changes.`);
  }
}

function escChatText(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function applyInlineChatMd(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderChatMarkdown(raw) {
  if (!raw) return '';
  return String(raw)
    .split(/\n{2,}/)
    .map(para =>
      para.split('\n').map(line => {
        const hMatch = line.match(/^#{1,3}\s+(.+)$/);
        if (hMatch) return `<span class="chat-md-h">${applyInlineChatMd(escChatText(hMatch[1]))}</span>`;
        return applyInlineChatMd(escChatText(line));
      }).join('<br>')
    )
    .join('<br><br>');
}

function scrollChatToBottom() {
  dom.jobChatScroll.scrollTop = dom.jobChatScroll.scrollHeight;
}

async function sendJobChatTurn(text) {
  const msg = text.trim();
  if (!msg || !hasJobChatContext()) return;
  if (currentJobChatController) return;

  dom.jobChatInput.value = '';
  dom.btnJobChatSend.textContent = '■ Stop';
  dom.btnJobChatSend.disabled = false;
  dom.jobChatChips.classList.add('hidden');

  // Add user bubble
  state.jobChat.messages.push({ role: 'user', content: msg });
  appendChatBubble('user', msg);

  // Pending AI bubble
  const pendingEl = appendChatBubble('assistant', '', true);
  scrollChatToBottom();
  startJobChatPatienceTimers(pendingEl);

  const context          = buildJobChatContext();
  const historyBeforeMsg = state.jobChat.messages.slice(0, -1);

  currentJobChatController = new AbortController();
  try {
    const reply = await sendJobChatMessage(
      context,
      historyBeforeMsg,
      msg,
      state.settings,
      currentJobChatController.signal
    );
    const assistantMessage = { role: 'assistant', content: reply, profileProposal: null };
    state.jobChat.messages.push(assistantMessage);
    const assistantMessageIndex = state.jobChat.messages.length - 1;
    pendingEl.className  = 'job-chat-msg job-chat-msg--assistant';
    renderAssistantChatBubbleContent(pendingEl, reply, null, assistantMessageIndex);

    try {
      const profileProposal = await sendJobChatProfileUpdateProposal(
        context,
        msg,
        state.settings,
        currentJobChatController.signal
      );
      if (profileProposal) {
        assistantMessage.profileProposal = profileProposal;
        renderAssistantChatBubbleContent(pendingEl, reply, profileProposal, assistantMessageIndex);
        scrollChatToBottom();
      }
    } catch (proposalErr) {
      if (proposalErr?.name === 'AbortError') return;
      console.warn('Profile update suggestion was not rendered:', proposalErr?.message || proposalErr);
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      pendingEl.remove();
      state.jobChat.messages.pop(); // remove the user message whose reply was aborted
    } else {
      pendingEl.textContent = mapError(e).message;
      pendingEl.className   = 'job-chat-msg job-chat-msg--assistant job-chat-msg--error';
    }
  } finally {
    clearJobChatPatienceTimers();
    currentJobChatController = null;
    dom.btnJobChatSend.textContent = 'Send';
    dom.btnJobChatSend.disabled = !dom.jobChatInput.value.trim();
    scrollChatToBottom();
  }
}

function clearJobChat() {
  state.jobChat.messages = [];
  currentJobChatController?.abort();
  currentJobChatController = null;
  dom.jobChatInput.value = '';
  renderJobChatOverlay();
}

// ── Output panel visibility ───────────────────────────────────────────────
function hasGeneratedOutput() {
  return Boolean(state.drafts.resume || state.drafts['cover-letter']);
}

function updateOutputPanelVisibility() {
  const hasOutput = hasGeneratedOutput();
  dom.rightCol.hidden = !hasOutput;
  dom.outputPlaceholder.classList.toggle('hidden', hasOutput);
}

function buildJobContextSignature(jobData = state.jobData) {
  const sourceUrl = String(jobData.sourceUrl || '').trim().replace(/\/+$/, '').toLowerCase();
  const description = String(jobData.description || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const jobTitle = String(jobData.jobTitle || '').trim().toLowerCase();
  const company = String(jobData.company || '').trim().toLowerCase();

  if (sourceUrl || description) {
    return `url:${sourceUrl}|desc:${description.length}:${description.slice(0, 160)}:${description.slice(-160)}`;
  }
  return `manual:${jobTitle}|${company}`;
}

async function clearGeneratedOutputForJobChange() {
  state.drafts = { resume: null, 'cover-letter': null };
  state.originalDrafts = { resume: null, 'cover-letter': null };
  state.lastRunMode = null;
  state.loadedFitContext = null;
  state.generationReceipt = null;
  state.lastFitCheck = null;
  state.editedHtml = { resume: null, 'cover-letter': null };
  state.hasEdits = { resume: false, 'cover-letter': false };
  clearTimeout(editedHtmlSaveTimers.resume);
  clearTimeout(editedHtmlSaveTimers['cover-letter']);
  editedHtmlSaveTimers.resume = null;
  editedHtmlSaveTimers['cover-letter'] = null;

  dom.draftResumeEmpty.classList.remove('hidden');
  dom.draftResumeContent.classList.add('hidden');
  dom.draftCLEmpty.classList.remove('hidden');
  dom.draftCLContent.classList.add('hidden');
  dom.draftMergedEmpty.classList.remove('hidden');
  dom.draftMergedContent.classList.add('hidden');
  dom.tabBtnMerged.classList.add('hidden');
  dom.btnPrintMerged.classList.add('hidden');
  dom.btnAiFitCheck.classList.add('hidden');
  dom.genStatus.classList.add('hidden');
  dom.genStatus.classList.remove('gen-status--complete');
  clearEditState('resume');
  clearEditState('cover-letter');
  updateManualEditNotice();
  refreshExportButtons();
  updateOutputPanelVisibility();
  clearAllStaleMarkers();
  await removeScopedSavedDraft();
}

// ── Init ──────────────────────────────────────────────────────────────────
function setSourceResumeState(data = {}) {
  state.sourceResumeText = data.sourceResumeText || '';
  state.sourceResumeName = data.sourceResumeName || '';
}

async function refreshSourceResumeState() {
  setSourceResumeState(await chrome.storage.local.get(SOURCE_RESUME_KEYS));
}

async function init() {
  state.settings = await loadSettings();
  state.profile  = await loadProfile();
  await populateProfileStrip();

  const [localData, syncData, scopedDraft] = await Promise.all([
    chrome.storage.local.get([...SOURCE_RESUME_KEYS, AI_PROVIDER_SETUP_SAVED_KEY, 'theme']),
    chrome.storage.sync.get(['docSettings']),
    loadScopedSavedDraft(),
  ]);
  state.docSettings = syncData.docSettings || {};
  applyTheme(localData.theme || 'system');
  setSourceResumeState(localData);
  const aiProviderSetupComplete = localData[AI_PROVIDER_SETUP_SAVED_KEY] || hasExistingAiProviderSetup(state.settings);
  if (aiProviderSetupComplete && !localData[AI_PROVIDER_SETUP_SAVED_KEY]) {
    chrome.storage.local.set({ [AI_PROVIDER_SETUP_SAVED_KEY]: true });
  }

  if (state.settings?.provider === 'mock') {
    dom.mockBanner.classList.remove('hidden');
  }

  bindEvents();
  refreshAutofillCard();
  refreshJobChatEntryPoints();

  // Restore any previously generated draft before loading session data
  if (scopedDraft) {
    restoreSavedDraft(scopedDraft);
  } else {
    switchTab('resume');
  }

  updateOutputPanelVisibility();

  // Load session data (may overwrite job fields if a new job page was captured)
  loadSession();

  // Listen for data written by background script (context menu extraction)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'session' && ownScopedValueChanged(changes[JOB_SESSIONS_BY_TAB_KEY])) {
      loadSession();
    }
  });

  // Listen for AI Fit Check actions from the card injected into the job page.
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SESSION_UPDATED') {
      if (message.sourceTabId && message.sourceTabId !== sourceTabId) return;
      loadSession();
      return;
    }

    if (message.type === 'FIT_CHECK_PROFILE_CHANGED') {
      const { profileId, tabId } = message;
      if (!profileId || tabId !== state.lastFitCheck?.tab?.id) return;
      currentAiMatchController?.abort();
      currentAiMatchController = null;
      rerenderAiFitCheckWithProfile(profileId).catch(() => {});
    }
    if (message.type === 'RUN_FIT_CHECK_AI') {
      const { profileId, tabId } = message;
      if (!profileId || tabId !== state.lastFitCheck?.tab?.id) return;
      runFitCheckAI(profileId).catch(() => {});
    }
    if (message.type === 'OPEN_JOB_CHAT_FROM_FIT_CHECK') {
      const { tabId } = message;
      if (!tabId || tabId !== state.lastFitCheck?.tab?.id) return;
      if (!hasJobChatContext()) return;
      syncJobChatToCurrentJob();
      refreshJobChatEntryPoints();
      openJobChat();
    }
  });

  // Keep onboarding visible on app launch until the user saves AI Provider settings.
  if (!aiProviderSetupComplete) showWelcomeModal();
}

function normalizeStorageMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function scopedTabKey(tabId = sourceTabId) {
  return tabId ? String(tabId) : '';
}

function ownScopedValueChanged(change, tabId = sourceTabId) {
  const key = scopedTabKey(tabId);
  if (!key) return false;
  return JSON.stringify(change?.oldValue?.[key] || null) !== JSON.stringify(change?.newValue?.[key] || null);
}

async function loadScopedJobSession(tabId = sourceTabId) {
  const key = scopedTabKey(tabId);
  if (!key) return null;

  const data = await chrome.storage.session.get([JOB_SESSIONS_BY_TAB_KEY]);
  const sessions = normalizeStorageMap(data[JOB_SESSIONS_BY_TAB_KEY]);
  return sessions[key] || null;
}

async function saveScopedJobSession(session, tabId = sourceTabId) {
  const key = scopedTabKey(tabId);
  if (!key) return false;

  const data = await chrome.storage.session.get([JOB_SESSIONS_BY_TAB_KEY]);
  const sessions = normalizeStorageMap(data[JOB_SESSIONS_BY_TAB_KEY]);
  await chrome.storage.session.set({
    [JOB_SESSIONS_BY_TAB_KEY]: {
      ...sessions,
      [key]: session,
    },
  });
  return true;
}

async function updateScopedJobSession(mutator, tabId = sourceTabId) {
  const key = scopedTabKey(tabId);
  if (!key) return null;

  const data = await chrome.storage.session.get([JOB_SESSIONS_BY_TAB_KEY]);
  const sessions = { ...normalizeStorageMap(data[JOB_SESSIONS_BY_TAB_KEY]) };
  const next = mutator(sessions[key] || null);
  if (next) sessions[key] = next;
  else delete sessions[key];
  await chrome.storage.session.set({ [JOB_SESSIONS_BY_TAB_KEY]: sessions });
  return next;
}

async function removeScopedJobSession(tabId = sourceTabId) {
  await updateScopedJobSession(() => null, tabId);
}

async function loadScopedSavedDraft(tabId = sourceTabId) {
  const key = scopedTabKey(tabId);
  if (!key) return null;

  const data = await chrome.storage.local.get([SAVED_DRAFTS_BY_TAB_KEY]);
  const drafts = normalizeStorageMap(data[SAVED_DRAFTS_BY_TAB_KEY]);
  return drafts[key] || null;
}

async function saveScopedSavedDraft(savedDraft, tabId = sourceTabId) {
  const key = scopedTabKey(tabId);
  if (!key) return false;

  const data = await chrome.storage.local.get([SAVED_DRAFTS_BY_TAB_KEY]);
  const drafts = normalizeStorageMap(data[SAVED_DRAFTS_BY_TAB_KEY]);
  await chrome.storage.local.set({
    [SAVED_DRAFTS_BY_TAB_KEY]: {
      ...drafts,
      [key]: compactSavedDraft(savedDraft),
    },
  });
  return true;
}

async function updateScopedSavedDraft(mutator, tabId = sourceTabId) {
  const key = scopedTabKey(tabId);
  if (!key) return null;

  const data = await chrome.storage.local.get([SAVED_DRAFTS_BY_TAB_KEY]);
  const drafts = { ...normalizeStorageMap(data[SAVED_DRAFTS_BY_TAB_KEY]) };
  const next = mutator(drafts[key] || null);
  if (next) drafts[key] = compactSavedDraft(next);
  else delete drafts[key];
  await chrome.storage.local.set({ [SAVED_DRAFTS_BY_TAB_KEY]: drafts });
  return next;
}

async function removeScopedSavedDraft(tabId = sourceTabId) {
  await updateScopedSavedDraft(() => null, tabId);
}

async function loadSession(session = null) {
  const scopedSession = session || await loadScopedJobSession();
  return applySession(scopedSession);
}

function normalizeSavedJobGenerationMode(mode) {
  return SAVED_JOB_GENERATION_MODES.has(mode) ? mode : '';
}

function generationModeLabel(mode) {
  return mode === 'resume' ? 'resume' : 'cover letter';
}

function isFromJobsFrame(event) {
  return event.source === document.getElementById('jobs-frame')?.contentWindow;
}

function isFromHistoryFrame(event) {
  return event.source === document.getElementById('history-frame')?.contentWindow;
}

function withCurrentSourceTab(sessionPayload) {
  if (!sessionPayload || typeof sessionPayload !== 'object') return null;
  return {
    ...sessionPayload,
    ...(sourceTabId ? { sourceTabId } : {}),
  };
}

function setAutofillToolsExpanded(expanded) {
  state.autofillToolsExpanded = Boolean(expanded);
  const isExpanded = state.autofillToolsExpanded;
  dom.autofillToolsBody.hidden = !isExpanded;
  dom.btnToggleAutofillTools.setAttribute('aria-expanded', String(isExpanded));
  dom.btnToggleAutofillTools.textContent = isExpanded ? 'Hide autofill tools' : 'Show autofill tools';
  dom.autofillHelperCopy.textContent = isExpanded
    ? 'Use this on application pages with repetitive fields. The helper never submits the form.'
    : 'Fill repetitive application form fields on the current page. The helper never submits the form.';
  dom.applicationFormCard.classList.toggle('is-expanded', isExpanded);
  dom.applicationFormCard.classList.toggle('is-collapsed', !isExpanded);
}

function refreshAutofillCard() {
  const hasProfile = state.settings?.provider === 'mock' || !!state.profile?.personalInfo?.fullName;
  const hasMatches = (state.autofillMatches || []).length > 0;
  dom.btnReviewAutofill.disabled = !hasProfile || !hasMatches;
  dom.autofillNoProfile.classList.toggle('hidden', hasProfile);
}

// summary is the MatchSummary from buildAutofillMatches; omit before first scan.
function updateAutofillStatus(fields, summary) {
  if (!fields || fields.length === 0) {
    dom.autofillStatusText.textContent = 'No form fields detected on this page.';
    return;
  }

  const parts = [`${fields.length} field${fields.length !== 1 ? 's' : ''} detected`];

  if (summary) {
    if (summary.matched > 0)   parts.push(`${summary.matched} matched`);
    if (summary.unmatched > 0) parts.push(`${summary.unmatched} need manual input`);
    if (summary.skipped > 0)   parts.push(`${summary.skipped} skipped (sensitive)`);
  } else {
    const skipped  = fields.filter(f => f.isSensitive || f.isDisabled || f.isReadOnly).length;
    const fillable = fields.length - skipped;
    if (fillable > 0) parts.push(`${fillable} ready to fill`);
    if (skipped > 0)  parts.push(`${skipped} skipped (sensitive)`);
  }

  dom.autofillStatusText.textContent = parts.join('. ') + '.';
}

// ── Autofill review overlay ────────────────────────────────────────────────

function fieldDisplayName(field) {
  return field.labelText || field.ariaLabel || field.placeholder || field.name || field.id || `Field ${field.fieldIndex + 1}`;
}

function renderMatchRow(match, defaultChecked) {
  const name       = esc(fieldDisplayName(match.field));
  const value      = esc(match.profileValue);
  const source     = esc(match.profileKey);
  const badgeClass = match.confidence === 'high' ? 'high' : 'medium';
  const badgeText  = match.confidence === 'high' ? 'High' : 'Medium';
  const checked    = defaultChecked ? ' checked' : '';
  return `
    <label class="autofill-match-row">
      <input type="checkbox" class="autofill-row-check" data-field-index="${match.field.fieldIndex}"${checked}>
      <div class="autofill-row-body">
        <div class="autofill-row-top">
          <span class="autofill-row-field-name">${name}</span>
          <span class="autofill-confidence-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="autofill-row-value">${value}</div>
        <div class="autofill-row-source">${source}</div>
      </div>
    </label>`;
}

function renderSkippedRow(field) {
  const name   = esc(fieldDisplayName(field));
  const reason = esc(field.skipReason || 'Skipped');
  return `
    <div class="autofill-skipped-row">
      <span class="autofill-skip-icon" aria-hidden="true">⊘</span>
      <div class="autofill-row-body">
        <span class="autofill-row-field-name">${name}</span>
        <span class="autofill-skip-reason">${reason}</span>
      </div>
    </div>`;
}

function renderAutofillReview() {
  const matches = state.autofillMatches || [];
  const fields  = state.autofillFields  || [];

  // Separate employment-grouped matches (multi-section) from regular matches.
  const empMatches     = matches.filter(m => m.employmentGroup != null);
  const regularMatches = matches.filter(m => m.employmentGroup == null);

  const skipped        = fields.filter(f => f.isSensitive || f.isDisabled || f.isReadOnly);
  const unmatchedCount = Math.max(0, fields.length - matches.length - skipped.length);
  const highMatches    = regularMatches.filter(m => m.confidence === 'high');
  const mediumMatches  = regularMatches.filter(m => m.confidence === 'medium');

  let html = '';

  if (matches.length === 0) {
    html += `<p class="autofill-review-empty">No fields could be matched to your profile. Make sure your profile has details filled in, then scan the form again.</p>`;
  } else {
    // Employment sections — rendered as named groups when multi-section grouping is active.
    if (empMatches.length > 0) {
      const groups = new Map();
      for (const m of empMatches) {
        const key = m.employmentGroup.index;
        if (!groups.has(key)) groups.set(key, { label: m.employmentGroup.label, matches: [] });
        groups.get(key).matches.push(m);
      }
      for (const [, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
        const allPreChecked = group.matches.every(m => m.confidence === 'high');
        const toggleLabel   = allPreChecked ? 'Deselect all' : 'Select all';
        html += `<div class="autofill-review-section">
          <h3 class="autofill-review-section-title">${esc(group.label)} <span class="autofill-section-count">${group.matches.length}</span><button type="button" class="autofill-group-toggle">${toggleLabel}</button></h3>
          <div class="autofill-match-list">${group.matches.map(m => renderMatchRow(m, m.confidence === 'high')).join('')}</div>
        </div>`;
      }
    }

    // Regular (personal info, education, single-section employment) in existing high/medium split.
    if (highMatches.length > 0) {
      html += `<div class="autofill-review-section">
        <h3 class="autofill-review-section-title">Ready to fill <span class="autofill-section-count">${highMatches.length}</span></h3>
        <div class="autofill-match-list">${highMatches.map(m => renderMatchRow(m, true)).join('')}</div>
      </div>`;
    }
    if (mediumMatches.length > 0) {
      html += `<div class="autofill-review-section">
        <h3 class="autofill-review-section-title">Review before filling <span class="autofill-section-count">${mediumMatches.length}</span></h3>
        <div class="autofill-match-list">${mediumMatches.map(m => renderMatchRow(m, false)).join('')}</div>
      </div>`;
    }
  }

  if (skipped.length > 0) {
    html += `<div class="autofill-review-section">
      <h3 class="autofill-review-section-title">Skipped — answer manually <span class="autofill-section-count">${skipped.length}</span></h3>
      <div class="autofill-skipped-list">${skipped.map(f => renderSkippedRow(f)).join('')}</div>
    </div>`;
  }

  if (unmatchedCount > 0) {
    html += `<p class="autofill-unmatched-note">${unmatchedCount} other field${unmatchedCount !== 1 ? 's' : ''} on this page were not matched and will not be touched.</p>`;
  }

  dom.autofillReviewBody.innerHTML = html;
  updateFillPageButton();
}

function updateFillPageButton() {
  const count = dom.autofillReviewBody.querySelectorAll('.autofill-row-check:checked').length;
  dom.btnFillPage.textContent = count > 0 ? `Fill selected (${count})` : 'Fill selected';
  dom.btnFillPage.disabled    = count === 0;
}

function openAutofillReview() {
  if (!state.autofillMatches?.length && state.autofillFields?.length) {
    const { matches, summary } = buildAutofillMatches(state.autofillFields, state.profile);
    state.autofillMatches = matches;
    updateAutofillStatus(state.autofillFields, summary);
    refreshAutofillCard();
  }
  renderAutofillReview();
  dom.autofillReviewView.classList.add('visible');
}

function closeAutofillReview() {
  dom.autofillReviewView.classList.remove('visible');
}

async function handleFillPage() {
  const checked = dom.autofillReviewBody.querySelectorAll('.autofill-row-check:checked');
  if (checked.length === 0) {
    showToast('No fields selected to fill.');
    return;
  }

  // Build fill instructions for each checked match, keyed by fieldIndex.
  const selectedIndices = new Set(
    Array.from(checked).map(cb => parseInt(cb.dataset.fieldIndex, 10))
  );
  const fills = (state.autofillMatches || [])
    .filter(m => selectedIndices.has(m.field.fieldIndex))
    .map(m => ({
      fieldIndex: m.field.fieldIndex,
      fieldId:    m.field.fieldId,
      tagName:    m.field.tagName,
      type:       m.field.type,
      id:         m.field.id,    // passed to content script for staleness check
      name:       m.field.name,  // passed to content script for staleness check
      value:      m.profileValue,
    }));

  if (fills.length === 0) {
    showToast('No matching fields to fill.');
    return;
  }

  // Do NOT close the overlay yet — only close after at least one field fills successfully.
  // Keeping context visible lets the user rescan without losing state.

  try {
    const tab = await getScanTargetTab();

    if (!tab?.id) {
      showToast('⚠️ No active tab found. Reopen the application form and try again.');
      return;
    }

    if (tab.url && isRestrictedUrl(tab.url)) {
      showToast('⚠️ Cannot fill fields on this page type.');
      return;
    }

    // Re-inject in case the tab was navigated since the scan.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch (injectErr) {
      console.warn('[JPDA] Could not inject content script for fill:', injectErr.message);
      showToast('⚠️ Cannot access this page. Try reloading the form tab and rescanning.');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'FILL_FORM_FIELDS', fills });

    if (!response) {
      showToast('⚠️ No response from page. The form may have changed — scan again.');
      return;
    }

    if (response.error) {
      console.warn('[JPDA] Fill error:', response.error);
      showToast(`⚠️ Fill failed: ${response.error}`);
      return;
    }

    const { filled, failed } = response;

    if (filled > 0) {
      // Success — close overlay and update status in the Application Form card.
      closeAutofillReview();
      if (failed === 0) {
        showToast(`✦ ${filled} field${filled !== 1 ? 's' : ''} filled.`);
        dom.autofillStatusText.textContent = `${filled} field${filled !== 1 ? 's' : ''} filled.`;
      } else {
        showToast(`✦ ${filled} filled. ${failed} could not be filled — check those manually.`);
        dom.autofillStatusText.textContent = `${filled} filled. ${failed} failed.`;
      }
    } else {
      // All fills failed — keep the overlay open so the user can rescan without losing context.
      showToast('⚠️ No fields were filled. The form may have changed — scan again.');
    }
  } catch (err) {
    console.warn('[JPDA] handleFillPage error:', err?.message || 'Unknown error');
    showToast('⚠️ Could not fill the form. Try rescanning the page.');
  }
}

function showJobInfoReviewNotice(message, tone = 'warning', actionHtml = '') {
  if (!dom.jobInfoReview) return;
  if (actionHtml) {
    dom.jobInfoReview.innerHTML = `<span>${esc(message)}</span>${actionHtml}`;
  } else {
    dom.jobInfoReview.textContent = message;
  }
  dom.jobInfoReview.dataset.tone = tone;
  dom.jobInfoReview.classList.remove('hidden');
}

function showScanRecoveryNotice(kind = 'reconnect') {
  if (!dom.jobInfoReview) return;

  const isRestricted = kind === 'restricted';
  const title = isRestricted
    ? 'This page cannot be scanned.'
    : 'This page needs to be reconnected.';
  const steps = isRestricted
    ? [
      'Open the job posting in a normal browser tab instead of a PDF, browser settings page, or Chrome Web Store page.',
      'Reopen Job Application Assistant from that tab and try again.',
    ]
    : [
      'Reload the job page, then reopen Job Application Assistant from the toolbar.',
      'Try the scan again. If it still fails, right-click the job page and choose "Job Application Assistant".',
    ];

  dom.jobInfoReview.innerHTML = `
    <strong class="scan-recovery-title">${esc(title)}</strong>
    <ol class="scan-recovery-steps">
      ${steps.map(step => `<li>${esc(step)}</li>`).join('')}
    </ol>
    <p class="scan-recovery-note">Your saved profile data is unaffected.</p>
    <button type="button" class="job-info-review-action scan-recovery-action" data-action="retry-job-scan">Try Again</button>
  `;
  dom.jobInfoReview.dataset.tone = 'warning';
  dom.jobInfoReview.classList.remove('hidden');
}

function hideJobInfoReviewNotice() {
  if (!dom.jobInfoReview) return;
  dom.jobInfoReview.classList.add('hidden');
}

function refreshJobInfoReviewNotice() {
  if (dom.fieldTitle.value.trim() && dom.fieldCompany.value.trim()) {
    hideJobInfoReviewNotice();
  }
}

function maybeShowDescQualityNotice(text) {
  if (!dom.descQualityNotice) return;
  const quality = checkDescriptionQuality(text);
  if (quality === 'ok') {
    dom.descQualityNotice.classList.add('hidden');
  } else {
    dom.descQualityNotice.classList.remove('hidden');
  }
}

function maybeShowScannedJobInfoReview(fields, jobTitle, company) {
  if (!fields?.needsReview && jobTitle && company) {
    hideJobInfoReviewNotice();
    return;
  }
  showJobInfoReviewNotice('Review Job Title and Employer before saving or analyzing. Page scans can miss these fields. Use AI suggest fields for a second pass.');
}

function jobInfoSuggestionReview(info, currentTitle = '', currentCompany = '') {
  return [
    { label: 'Job title', value: info.jobTitle || currentTitle || '(no title found)' },
    { label: 'Employer', value: info.company || currentCompany || '(no employer found)' },
  ];
}

async function confirmAiJobInfoSuggestions(info) {
  return showChoiceDialog(
    'Apply AI field suggestions?',
    'Review the detected details before applying.',
    {
      primaryLabel: 'Apply',
      reviewDetails: jobInfoSuggestionReview(info, dom.fieldTitle.value.trim(), dom.fieldCompany.value.trim()),
    }
  ).then(result => result === 'primary');
}

async function confirmScannedAiJobInfoSuggestions(info, alreadySeen = null) {
  return showChoiceDialog(
    'Apply AI field suggestions?',
    alreadySeen
      ? 'Review the detected details. This posting already appears in your workspace, so check your application status before generating again. Fit Check is optional.'
      : 'Review the detected details. Fit Check is optional.',
    {
      secondaryLabel: 'Apply',
      primaryLabel: 'Apply + Fit Check',
      reviewDetails: alreadySeenReviewDetails(alreadySeen, jobInfoSuggestionReview(info, dom.fieldTitle.value.trim(), dom.fieldCompany.value.trim())),
    }
  );
}

function applyAiJobInfoSuggestions(info) {
  if (info.jobTitle) {
    dom.fieldTitle.value = info.jobTitle;
    state.jobData.jobTitle = info.jobTitle;
  }
  if (info.company) {
    dom.fieldCompany.value = info.company;
    state.jobData.company = info.company;
  }
  syncJobChatToCurrentJob();
  refreshJobChatEntryPoints();
}

async function runAiJobInfoExtraction() {
  const text = dom.fieldDesc.value.trim();
  if (text.length < 50) {
    showToast('Add a job description before using AI suggest fields.');
    return;
  }

  if (state.currentJobMeta?.aiJobInfoAttemptedFor === text) {
    const runAgain = await showConfirmDialog(
      'Run AI fill again?',
      'AI has already checked this job description. Run it again and review new suggestions?',
      'Run again'
    );
    if (!runAgain) return;
  }

  currentJobInfoController?.abort();
  const controller = new AbortController();
  currentJobInfoController = controller;

  const btn = dom.btnAiJobInfo;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Checking...';
  showJobInfoReviewNotice('AI is checking Job Title and Employer from the description...', 'info');

  try {
    const settings = await loadSettings();
    if (!settings?.provider) {
      showToast('Set up an AI provider or Demo Mode before using AI suggest fields.');
      maybeShowScannedJobInfoReview({ needsReview: true }, dom.fieldTitle.value.trim(), dom.fieldCompany.value.trim());
      return;
    }

    const info = await extractJobInfoWithAI(text, dom.fieldUrl.value.trim(), settings, controller.signal);
    state.currentJobMeta = {
      ...(state.currentJobMeta || {}),
      aiJobInfoAttemptedFor: text,
    };

    if (!info.jobTitle && !info.company) {
      showJobInfoReviewNotice('AI could not confidently find Job Title or Employer. Please review the fields manually.');
      return;
    }

    const applySuggestions = await confirmAiJobInfoSuggestions(info);
    if (!applySuggestions) {
      showJobInfoReviewNotice('AI suggestions were not applied. Review Job Title and Employer before saving or analyzing.');
      return;
    }

    applyAiJobInfoSuggestions(info);
    showJobInfoReviewNotice('AI filled Job Title and Employer. Review them before saving or analyzing.', 'info');
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.warn('[JPDA] job info extraction failed:', err?.message || err);
      maybeShowScannedJobInfoReview({ needsReview: true }, dom.fieldTitle.value.trim(), dom.fieldCompany.value.trim());
    }
  } finally {
    if (currentJobInfoController === controller) currentJobInfoController = null;
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function applyExtractedData(raw, url, usedSelection) {
  if (raw.error) {
    showToast(`⚠️ ${raw.error}`);
    return;
  }

  const text = raw.selectedText || raw.pageText || '';
  const sourceType = raw.sourceType === 'manual_entry' ? 'manual_entry' : 'extension_scan';

  if (raw.loadedFromSavedJob) {
    dom.selectionNotice.classList.add('hidden');
    dom.sourceIndicator.textContent = 'Loaded from Jobs';
    dom.sourceIndicator.className = 'card-hint source-page';
  } else if (sourceType === 'manual_entry') {
    dom.selectionNotice.classList.add('hidden');
    dom.sourceIndicator.textContent = 'Manual entry';
    dom.sourceIndicator.className = 'card-hint source-page';
  } else if (usedSelection) {
    dom.selectionNotice.classList.remove('hidden');
    dom.sourceIndicator.textContent = '✦ From your selection';
    dom.sourceIndicator.className = 'card-hint source-selection';
  } else {
    dom.selectionNotice.classList.add('hidden');
    dom.sourceIndicator.textContent = '✦ From page content';
    dom.sourceIndicator.className = 'card-hint source-page';
  }

  const fields = extractJobFields(text, url);
  const jobTitle = raw.jobTitle || fields.jobTitle;
  const company = raw.company || fields.company;
  const nextJobData = { jobTitle, company, sourceUrl: url, description: text };
  const previousSignature = buildJobContextSignature();
  const nextSignature = buildJobContextSignature(nextJobData);

  if (previousSignature && nextSignature && previousSignature !== nextSignature && hasGeneratedOutput()) {
    await clearGeneratedOutputForJobChange();
  }

  dom.fieldTitle.value   = jobTitle;
  dom.fieldCompany.value = company;
  dom.fieldUrl.value     = url;
  dom.fieldDesc.value    = text;
  maybeShowDescQualityNotice(text);

  state.jobData = nextJobData;
  state.currentJobMeta = {
    sourceType,
    rawContent: raw.pageText || raw.selectedText || text,
    aiJobInfoAttemptedFor: '',
  };
  syncJobChatToCurrentJob();
  refreshJobChatEntryPoints();

  if (!raw.loadedFromSavedJob && sourceType !== 'manual_entry') {
    maybeShowScannedJobInfoReview(fields, jobTitle, company);
  } else {
    refreshJobInfoReviewNotice();
  }
}

async function applySession(session) {
  state.loadedFitContext = session?.loadedJobFitAnalysis || null;
  if (!session || !session.extractedData) {
    return;
  }

  const raw = session.extractedData;
  const url = session.sourceUrl || raw.url || '';
  await applyExtractedData(raw, url, !!raw.selectedText);

  // Context-menu scans prepare an explicit AI Fit Check action. They do not
  // spend tokens automatically.
  if (session.sourceTabId && !session.regenerateRequested) {
    chrome.tabs.get(session.sourceTabId)
      .then(tab => { if (tab?.id) prepareAiFitCheckContext(raw, tab); })
      .catch(() => {});  // Tab closed or unavailable — silently skip
  }

  if (session.pendingMode) {
    state.lastRunMode = session.pendingMode;
  }

  if (session.regenerateRequested) {
    const mode = session.pendingMode || 'both';
    dom.historyView.classList.remove('visible');
    await updateScopedJobSession(current => current ? { ...current, regenerateRequested: null } : current);
    await clearEditedHtml('resume');
    await clearEditedHtml('cover-letter');
    showToast('Reloaded job from history. Regenerating...');
    runGeneration(mode);
  }
}

// Returns true for pages where Chrome blocks script injection.
function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('data:') ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://chromewebstore.google.com')
  );
}

// ── AI Fit Check ──────────────────────────────────────────────────────────
// Scanning prepares context only. AI Fit Check runs only after an explicit
// user choice so no provider request or token spend is hidden behind Scan.

function prepareAiFitCheckContext(scanResponse, tab) {
  if (!tab?.id) return;
  const text = scanResponse?.selectedText || scanResponse?.pageText || '';
  if (text.trim().length < 50) return;

  const selectedProfileId = dom.profileSwitcher.dataset.profileId || '';
  state.lastFitCheck = {
    tab,
    jobText: text,
    jobTitle: state.jobData.jobTitle || '',
    jobCompany: state.jobData.company || '',
    selectedProfileId,
    aiMatchesByProfile: {},
  };
  dom.btnAiFitCheck.classList.remove('hidden');
  chrome.tabs.sendMessage(tab.id, { type: 'REMOVE_FIT_CHECK_CARD' }).catch(() => {});
}

async function sendAiFitCheckCard({ profileId, aiMatch = null, aiMatchError = null, aiLoading = false }) {
  const fc = state.lastFitCheck;
  if (!fc?.tab?.id) return;

  try {
    await chrome.tabs.sendMessage(fc.tab.id, {
      type: 'SHOW_FIT_CHECK_CARD',
      tabId: fc.tab.id,
      activeProfileId: profileId,
      profiles: state.profileIndex.length > 1 ? state.profileIndex : [],
      hasAiProvider: Boolean(state.settings?.provider),
      aiMatch,
      aiMatchError,
      aiLoading,
    });
  } catch (err) {
    console.warn('[JPDA] AI Fit Check card injection failed:', err?.message || err);
  }
}

// Profile selection in the Fit Check card is temporary. Cached AI results are
// reused; a profile that has not been reviewed gets an explicit run button.
async function rerenderAiFitCheckWithProfile(profileId) {
  const fc = state.lastFitCheck;
  if (!fc?.tab?.id) return;
  fc.selectedProfileId = profileId;
  await sendAiFitCheckCard({
    profileId,
    aiMatch: fc.aiMatchesByProfile?.[profileId] || null,
  });
}

function toFitCheckCardAiMatch(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    score: result.score,
    label: result.label,
    strongMatches: Array.isArray(result.strongMatches) ? result.strongMatches : [],
    possibleGaps: Array.isArray(result.possibleGaps) ? result.possibleGaps : [],
    recommendation: result.recommendation || '',
  };
}

async function runFitCheckAI(profileId) {
  if (!profileId) {
    showToast('Add a profile before running AI Fit Check.');
    return;
  }

  const fc = state.lastFitCheck;
  if (!fc?.tab?.id || !fc.jobText) return;

  const settings = await loadSettings();
  if (!settings?.provider) {
    showToast('Set up an AI provider or Demo Mode before running AI Fit Check.');
    return;
  }
  state.settings = settings;

  currentAiMatchController?.abort();
  const controller = new AbortController();
  currentAiMatchController = controller;

  fc.selectedProfileId = profileId;
  dom.btnAiFitCheck.disabled = true;
  dom.btnAiFitCheck.textContent = 'Checking fit…';
  await sendAiFitCheckCard({ profileId, aiLoading: true });

  try {
    const profile = await loadProfileById(profileId);

    const savedJobShape = {
      title: fc.jobTitle,
      company: fc.jobCompany,
      cleanDescription: fc.jobText.slice(0, 4000),
      rawContent: fc.jobText.slice(0, 4000),
    };

    const result = await analyzeFit(savedJobShape, profile, settings, '', controller.signal, 'transferable');
    if (controller.signal.aborted) return;

    const cardAiMatch = toFitCheckCardAiMatch(result);
    fc.aiMatchesByProfile[profileId] = cardAiMatch;
    clearStaleMarkerForType('fitAnalysis');
    await sendAiFitCheckCard({ profileId, aiMatch: cardAiMatch });
  } catch (err) {
    if (err?.name === 'AbortError') return;
    const errMsg = err?.message === 'fit_no_job_description' ? 'Add a job description before running AI review.'
      : err?.message === 'fit_missing_profile' ? 'Add profile details before running AI review.'
      : err?.message === 'no_provider' ? 'Set up an AI provider before running AI review.'
      : mapError(err).message;

    await sendAiFitCheckCard({ profileId, aiMatchError: errMsg });
  } finally {
    if (currentAiMatchController === controller) currentAiMatchController = null;
    dom.btnAiFitCheck.disabled = false;
    dom.btnAiFitCheck.textContent = 'Run AI Fit Check';
  }
}

async function scanCurrentPage() {
  const btn = dom.btnScan;
  btn.disabled = true;
  btn.textContent = 'Scanning…';

  try {
    const tab = await getScanTargetTab();

    if (!tab?.id) {
      showToast('⚠️ No active tab found.');
      return;
    }

    // Only block early if we actually know the URL is restricted.
    // Without the `tabs` permission, chrome.tabs.query omits `url` for tabs
    // where activeTab was not freshly granted — undefined URL is not the same
    // as a restricted URL. Let executeScript attempt injection and fail on its
    // own if the page genuinely blocks scripts.
    if (tab.url && isRestrictedUrl(tab.url)) {
      showToast('⚠️ Cannot scan this page — open a job posting in a normal browser tab first.');
      showScanRecoveryNotice('restricted');
      return;
    }

    // Inject content.js on demand (user triggered this action).
    // The guard in content.js prevents duplicate listeners on repeated scans.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch (injectErr) {
      console.warn('[JPDA] Could not inject content script:', injectErr.message);
      showToast('⚠️ This page needs to be reconnected. Reload the job page, reopen the extension, and try again.');
      showScanRecoveryNotice('reconnect');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_CONTENT' });

    if (!response) {
      showToast('⚠️ No response from page. Try right-clicking and using the context menu instead.');
      showScanRecoveryNotice('reconnect');
      return;
    }

    if (response.error) {
      showToast(`⚠️ ${response.error}`);
      return;
    }

    await applyExtractedData(response, tab.url || '', !!response.selectedText);
    const alreadySeen = await findAlreadySeenJob(state.jobData);
    state.currentJobMeta = {
      ...(state.currentJobMeta || {}),
      alreadySeen,
    };
    if (alreadySeen) showAlreadySeenJobWarning(alreadySeen);
    prepareAiFitCheckContext(response, tab);
    await persistScannedJobSession(response, tab);
    showToast('✦ Page scanned');
  } catch (err) {
    console.warn('[JPDA] scanCurrentPage error:', err?.message || 'Unknown scan error');
    showToast('⚠️ Could not scan the page. Try the context menu instead.');
    showScanRecoveryNotice('reconnect');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan page';
  }
}

async function scanJobPageAndMaybeSuggestFields() {
  const btn = dom.btnScan;
  btn.disabled = true;
  btn.textContent = 'Scanning…';

  try {
    const tab = await getScanTargetTab();

    if (!tab?.id) {
      showToast('⚠️ No active tab found.');
      return;
    }

    if (tab.url && isRestrictedUrl(tab.url)) {
      showToast('⚠️ Cannot scan this page — open a job posting in a normal browser tab first.');
      showScanRecoveryNotice('restricted');
      return;
    }

    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch (injectErr) {
      console.warn('[JPDA] Could not inject content script:', injectErr.message);
      showToast('⚠️ This page needs to be reconnected. Reload the job page, reopen the extension, and try again.');
      showScanRecoveryNotice('reconnect');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_CONTENT' });

    if (!response) {
      showToast('⚠️ No response from page. Try right-clicking and using the context menu instead.');
      showScanRecoveryNotice('reconnect');
      return;
    }

    if (response.error) {
      showToast(`⚠️ ${response.error}`);
      return;
    }

    await applyExtractedData(response, tab.url || '', !!response.selectedText);
    const alreadySeen = await findAlreadySeenJob(state.jobData);
    state.currentJobMeta = {
      ...(state.currentJobMeta || {}),
      alreadySeen,
    };
    if (alreadySeen) showAlreadySeenJobWarning(alreadySeen);
    prepareAiFitCheckContext(response, tab);
    await persistScannedJobSession(response, tab);

    const settings = await loadSettings();
    if (!settings?.provider && alreadySeen) {
      showAlreadySeenJobWarning(alreadySeen, { force: true });
      showToast('Job page scanned');
      return;
    }

    if (!settings?.provider) {
      showJobInfoReviewNotice(
        'Job page scanned. AI is not connected, so some fields may need manual review.',
        'warning',
        ' <button type="button" class="job-info-review-action" data-action="open-ai-settings">Open AI settings</button>'
      );
      showToast('✦ Job page scanned');
      return;
    }

    btn.textContent = 'Checking fields…';
    const descText = dom.fieldDesc.value.trim();
    const pageUrl  = dom.fieldUrl.value.trim();

    try {
      currentJobInfoController?.abort();
      const controller = new AbortController();
      currentJobInfoController = controller;

      const info = await extractJobInfoWithAI(descText, pageUrl, settings, controller.signal);
      if (currentJobInfoController === controller) currentJobInfoController = null;

      state.currentJobMeta = {
        ...(state.currentJobMeta || {}),
        aiJobInfoAttemptedFor: descText,
      };

      if (!info.jobTitle && !info.company && alreadySeen) {
        showAlreadySeenJobWarning(alreadySeen, { force: true });
      } else if (!info.jobTitle && !info.company) {
        showJobInfoReviewNotice('AI could not confidently find Job Title or Employer. Please review the fields manually.');
      } else {
        const choice = await confirmScannedAiJobInfoSuggestions(info, alreadySeen);
        if (choice !== 'cancel') {
          applyAiJobInfoSuggestions(info);
          if (alreadySeen) showAlreadySeenJobWarning(alreadySeen, { force: true });
          if (!alreadySeen) showJobInfoReviewNotice(
            'Job page scanned. AI suggested job details — please review before generating.',
            'info'
          );
          if (choice === 'primary') {
            await runFitCheckAI(dom.profileSwitcher.dataset.profileId || '');
          }
        }
      }
    } catch (aiErr) {
      if (aiErr?.name !== 'AbortError') {
        console.warn('[JPDA] AI job info step failed:', aiErr?.message || aiErr);
        if (alreadySeen) {
          showAlreadySeenJobWarning(alreadySeen, { force: true });
        } else {
          showJobInfoReviewNotice(
            'Job page scanned, but AI cleanup failed. You can still edit the fields manually.',
            'warning'
          );
        }
      }
    }

    showToast('✦ Job page scanned');
  } catch (err) {
    console.warn('[JPDA] scanJobPageAndMaybeSuggestFields error:', err?.message || 'Unknown scan error');
    showToast('⚠️ Could not scan the page. Try the context menu instead.');
    showScanRecoveryNotice('reconnect');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan job page';
  }
}

async function scanFormFieldsOnPage() {
  const btn = dom.btnScanFormFields;
  btn.disabled = true;
  btn.textContent = 'Scanning…';

  try {
    const tab = await getScanTargetTab();

    if (!tab?.id) {
      showToast('⚠️ No active tab found.');
      return;
    }

    if (tab.url && isRestrictedUrl(tab.url)) {
      showToast('⚠️ Cannot scan this page — open the job application form in a normal browser tab first.');
      return;
    }

    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch (injectErr) {
      console.warn('[JPDA] Could not inject content script:', injectErr.message);
      showToast('⚠️ Cannot scan this page — Chrome blocks scripts here.');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_FORM_FIELDS' });

    if (!response) {
      showToast('⚠️ No response from page. Try reloading the application form tab first.');
      return;
    }

    if (response.error) {
      showToast(`⚠️ ${response.error}`);
      return;
    }

    state.autofillFields = response.fields || [];
    const { matches, summary } = buildAutofillMatches(state.autofillFields, state.profile);
    state.autofillMatches = matches;
    updateAutofillStatus(state.autofillFields, summary);
    refreshAutofillCard();

    // Debug: inspect scanned descriptors and match results in the dashboard console.
    console.group('[JPDA] Scan results');
    console.table(state.autofillFields.map(f => ({
      index:       f.fieldIndex,
      tag:         f.tagName,
      type:        f.type,
      label:       f.labelText,
      aria:        f.ariaLabel,
      placeholder: f.placeholder,
      name:        f.name,
      id:          f.id,
      sensitive:   f.isSensitive,
      skip:        f.skipReason || '',
    })));
    console.table(matches.map(m => ({
      profileKey:  m.profileKey,
      value:       m.profileValue,
      confidence:  m.confidence,
      label:       m.field.labelText,
      group:       m.employmentGroup?.label ?? '',
    })));
    console.groupEnd();

    const count = state.autofillFields.length;
    showToast(count > 0 ? `✦ ${count} field${count !== 1 ? 's' : ''} scanned, ${matches.length} matched.` : 'No form fields found on this page.');
  } catch (err) {
    console.warn('[JPDA] scanFormFieldsOnPage error:', err?.message || 'Unknown error');
    showToast('⚠️ Could not scan form fields.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan form fields';
  }
}

// ── Events ────────────────────────────────────────────────────────────────
function bindEvents() {
  // Feature tour
  dom.btnTour.addEventListener('click', startTour);
  $('tour-btn-skip').addEventListener('click', endTour);
  $('tour-btn-prev').addEventListener('click', () => { if (tourIndex > 0) showTourStep(tourIndex - 1); });
  $('tour-btn-next').addEventListener('click', () => {
    if (tourIndex < currentTourSteps.length - 1) showTourStep(tourIndex + 1);
    else endTour();
  });

  // Scan page
  dom.btnScan.addEventListener('click', scanJobPageAndMaybeSuggestFields);
  dom.btnAiFitCheck.addEventListener('click', () => {
    const profileId = state.lastFitCheck?.selectedProfileId || dom.profileSwitcher.dataset.profileId || '';
    if (!profileId) {
      showToast('Add a profile before running AI Fit Check.');
      return;
    }
    runFitCheckAI(profileId).catch(() => {});
  });
  dom.jobInfoReview.addEventListener('click', e => {
    if (e.target.dataset.action === 'open-ai-settings') openSettingsSection('provider');
    if (e.target.dataset.action === 'retry-job-scan') scanJobPageAndMaybeSuggestFields();
    if (e.target.dataset.action === 'open-jobs') dom.jobsView.classList.add('visible');
    if (e.target.dataset.action === 'open-history') dom.historyView.classList.add('visible');
  });
  dom.btnSaveJob.addEventListener('click', saveCurrentJob);

  // New draft
  dom.btnNewDraft.addEventListener('click', clearSession);

  // Profile strip
  dom.profileSwitcher.addEventListener('click', toggleProfileMenu);
  dom.profileSwitcher.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openProfileMenu();
      dom.profileMenuList.querySelector('.profile-menu-option')?.focus();
    }
  });
  dom.profileMenuList.addEventListener('click', async e => {
    const btn = e.target.closest('.profile-menu-option');
    if (btn) await switchToProfile(btn.dataset.profileId);
  });
  dom.profileMenuList.addEventListener('keydown', async e => {
    const options = [...dom.profileMenuList.querySelectorAll('.profile-menu-option')];
    const index = options.indexOf(document.activeElement);

    if (e.key === 'Escape') {
      closeProfileMenu();
      dom.profileSwitcher.focus();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      options[Math.min(index + 1, options.length - 1)]?.focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      options[Math.max(index - 1, 0)]?.focus();
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const btn = document.activeElement.closest('.profile-menu-option');
      if (btn) await switchToProfile(btn.dataset.profileId);
    }
  });
  document.addEventListener('click', e => {
    if (!dom.profileStrip.contains(e.target)) closeProfileMenu();
  });
  dom.btnOpenProfile.addEventListener('click', () => openSettingsSection('profile'));
  dom.btnOpenFullPage.addEventListener('click', openFullPage);

  // Theme toggle
  dom.btnTheme.addEventListener('click', toggleTheme);

  // Job Discussion Chat
  dom.btnChat.addEventListener('click', openJobChat);
  dom.btnDiscussJob.addEventListener('click', openJobChat);
  dom.btnCloseJobChat.addEventListener('click', closeJobChat);
  dom.btnClearJobChat.addEventListener('click', clearJobChat);
  dom.btnJobChatSend.addEventListener('click', () => {
    if (currentJobChatController) { currentJobChatController.abort(); return; }
    sendJobChatTurn(dom.jobChatInput.value);
  });
  dom.jobChatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendJobChatTurn(dom.jobChatInput.value);
    }
  });
  dom.jobChatInput.addEventListener('input', () => {
    if (currentJobChatController) return; // Stop button is active — leave it alone
    dom.btnJobChatSend.disabled = !dom.jobChatInput.value.trim();
  });
  dom.jobChatChips.addEventListener('click', e => {
    const prompt = e.target.dataset.prompt;
    if (prompt) sendJobChatTurn(prompt);
  });

  // History
  dom.btnHistory.addEventListener('click', () => dom.historyView.classList.add('visible'));
  dom.btnCloseHistory.addEventListener('click', () => dom.historyView.classList.remove('visible'));

  // Saved jobs
  dom.btnJobs.addEventListener('click', () => dom.jobsView.classList.add('visible'));
  dom.btnCloseJobs.addEventListener('click', () => dom.jobsView.classList.remove('visible'));
  dom.btnJobsTourOverlay.addEventListener('click', () => {
    document.getElementById('jobs-frame')?.contentWindow?.postMessage({ type: 'START_JOBS_TOUR' }, '*');
  });
  window.addEventListener('message', async e => {
    if (e.origin !== window.location.origin) return;
    if (SAVED_JOBS_MESSAGE_TYPES.has(e.data?.type) && !isFromJobsFrame(e)) return;
    if (HISTORY_MESSAGE_TYPES.has(e.data?.type) && !isFromHistoryFrame(e)) return;
    if (e.data?.type === 'JPDA_SAVED_JOB_LOADED') {
      dom.jobsView.classList.remove('visible');
      const sessionPayload = withCurrentSourceTab(e.data.sessionPayload);
      if (sessionPayload) {
        await saveScopedJobSession(sessionPayload);
        await loadSession(sessionPayload);
      }
      showToast('Loaded saved job. Generate when ready.');
      return;
    }
    if (e.data?.type === 'JPDA_SAVED_JOB_GENERATE_REQUESTED') {
      const mode = normalizeSavedJobGenerationMode(e.data.mode);
      dom.jobsView.classList.remove('visible');
      const sessionPayload = withCurrentSourceTab(e.data.sessionPayload);
      if (sessionPayload) {
        await saveScopedJobSession(sessionPayload);
        await loadSession(sessionPayload);
      }
      await updateScopedJobSession(current => current ? { ...current, pendingMode: null } : current);
      if (!mode) {
        showToast('Loaded saved job. Generate when ready.');
        return;
      }
      if (await confirmOverwrite(mode)) {
        showToast(`Loaded saved job. Generating ${generationModeLabel(mode)}...`);
        runGeneration(mode);
      } else {
        showToast('Loaded saved job. Generation canceled.');
      }
      return;
    }
    if (e.data?.type === 'JPDA_HISTORY_REGENERATE_REQUESTED') {
      const mode = e.data.mode || 'both';
      dom.historyView.classList.remove('visible');
      const sessionPayload = withCurrentSourceTab(e.data.sessionPayload);
      if (sessionPayload) {
        await saveScopedJobSession(sessionPayload);
        await loadSession(sessionPayload);
      }
      await updateScopedJobSession(current => current ? { ...current, regenerateRequested: null } : current);
      await clearEditedHtml('resume');
      await clearEditedHtml('cover-letter');
      showToast('Reloaded job from history. Regenerating...');
      runGeneration(mode);
      return;
    }
    if (e.data?.type === 'JPDA_ANALYZE_FIT_REQUESTED') {
      handleFitAnalysisRequest(e.data.id);
      return;
    }
    if (e.data?.type === 'JPDA_RECRUITER_MESSAGE_REQUESTED') {
      openRecruiterMessageFromSavedJob(e.data.id);
      return;
    }
    if (e.data?.type === 'JPDA_FOLLOW_UP_MESSAGE_REQUESTED') {
      openFollowUpMessageFromSavedJob(e.data.id);
      return;
    }
    if (e.data?.type === 'JPDA_APPLICATION_ANSWERS_REQUESTED') {
      openApplicationAnswersFromSavedJob(e.data.id);
      return;
    }
    if (e.data?.type === 'JPDA_REMINDER_TEXT_REQUESTED') {
      openReminderTextFromSavedJob(e.data.id);
    }
  });

  // Support
  dom.btnSupport.addEventListener('click', () => window.open(SUPPORT_URL, '_blank', 'noopener'));

  // Settings
  dom.btnSettings.addEventListener('click', () => openSettingsSection());
  dom.btnCloseSettings.addEventListener('click', async () => {
    dom.settingsView.classList.remove('visible');
    state.settings = await loadSettings();
    state.profile  = await loadProfile();
    await refreshSourceResumeState();
    const { docSettings: refreshedDoc } = await chrome.storage.sync.get(['docSettings']);
    state.docSettings = refreshedDoc || {};
    dom.mockBanner.classList.toggle('hidden', state.settings?.provider !== 'mock');
    await populateProfileStrip();
    if (state.autofillFields.length > 0) {
      const { matches, summary } = buildAutofillMatches(state.autofillFields, state.profile);
      state.autofillMatches = matches;
      updateAutofillStatus(state.autofillFields, summary);
    }
    refreshAutofillCard();
  });

  // Tabs
  dom.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  bindAppearanceControls();
  bindDraftSettingsControls();

  // Generation — same handler doubles as Stop when in generating state.
  // Shows a confirmation before overwriting an existing draft.
  dom.btnGenResume.addEventListener('click', async () => {
    if (dom.btnGenResume.classList.contains('btn-stop')) { stopGeneration(); return; }
    if (await confirmOverwrite('resume')) runGeneration('resume');
  });
  dom.btnGenCL.addEventListener('click', async () => {
    if (dom.btnGenCL.classList.contains('btn-stop')) { stopGeneration(); return; }
    if (await confirmOverwrite('cover-letter')) runGeneration('cover-letter');
  });
  dom.btnGenBoth.addEventListener('click', async () => {
    if (dom.btnGenBoth.classList.contains('btn-stop')) { stopGeneration(); return; }
    if (await confirmOverwrite('both')) runGeneration('both');
  });
  dom.btnAiJobInfo.addEventListener('click', runAiJobInfoExtraction);

  // Application Form
  dom.btnToggleAutofillTools.addEventListener('click', () => {
    setAutofillToolsExpanded(!state.autofillToolsExpanded);
  });
  dom.btnScanFormFields.addEventListener('click', scanFormFieldsOnPage);
  dom.btnReviewAutofill.addEventListener('click', openAutofillReview);

  // Autofill review overlay
  $('btn-close-autofill-review').addEventListener('click', closeAutofillReview);
  $('btn-cancel-autofill-review').addEventListener('click', closeAutofillReview);
  dom.btnFillPage.addEventListener('click', handleFillPage);
  dom.autofillReviewBody.addEventListener('change', e => {
    if (e.target.classList.contains('autofill-row-check')) updateFillPageButton();
  });
  dom.autofillReviewBody.addEventListener('click', e => {
    const btn = e.target.closest('.autofill-group-toggle');
    if (!btn) return;
    const section    = btn.closest('.autofill-review-section');
    if (!section) return;
    const checkboxes = Array.from(section.querySelectorAll('.autofill-row-check'));
    const allChecked = checkboxes.every(cb => cb.checked);
    checkboxes.forEach(cb => { cb.checked = !allChecked; });
    btn.textContent = allChecked ? 'Select all' : 'Deselect all';
    updateFillPageButton();
  });

  // Revision — button stays disabled until the user has typed something
  dom.fieldRevision.addEventListener('input', refreshRevisionButton);
  dom.btnApplyChanges.addEventListener('click', applyRevision);
  dom.btnRegenerate.addEventListener('click', resetToOriginal);

  // ATS Check
  dom.btnAtsScan.addEventListener('click', runAtsCheck);
  dom.btnAtsApply.addEventListener('click', applyAtsKeywords);

  // Inline editing
  dom.btnEditResume.addEventListener('click', () => toggleEditMode('resume'));
  dom.btnEditCL.addEventListener('click', () => toggleEditMode('cover-letter'));

  // Clear individual draft
  dom.btnClearResume.addEventListener('click', () => clearDraft('resume'));
  dom.btnClearCL.addEventListener('click', () => clearDraft('cover-letter'));

  // Save as PDF (via print dialog)
  dom.btnPrintBoth.addEventListener('click', () => printDraft('resume', 'cover-letter'));
  dom.btnPrintResume.addEventListener('click', () => printDraft('resume'));
  dom.btnPrintCL.addEventListener('click', () => printDraft('cover-letter'));
  dom.btnPrintMerged.addEventListener('click', () => printDraft('merged'));

  // Email assistant
  dom.btnPrepareEmail.addEventListener('click', openEmailAssistant);
  dom.btnCloseEmailAssistant.addEventListener('click', closeEmailAssistant);
  dom.btnRegenEmail.addEventListener('click', runEmailGeneration);
  dom.btnEmailErrorRetry.addEventListener('click', runEmailGeneration);
  dom.btnCopySubject.addEventListener('click', () => copyEmailField(dom.emailSubjectDisplay.value, 'Subject copied'));
  dom.btnCopyRecipient.addEventListener('click', () => copyEmailField(dom.emailRecipientDisplay.value, 'Email address copied'));
  dom.btnCopyBody.addEventListener('click', () => copyEmailField(dom.emailBodyDisplay.value, 'Email body copied'));
  dom.btnCopyChecklist.addEventListener('click', copyEmailChecklist);
  dom.btnCloseRecruiterMessage.addEventListener('click', closeRecruiterMessage);
  dom.btnRegenRecruiterMessage.addEventListener('click', runRecruiterMessageGeneration);
  dom.btnRecruiterErrorRetry.addEventListener('click', runRecruiterMessageGeneration);
  dom.btnCopyRecruiterSubject.addEventListener('click', () => copyEmailField(dom.recruiterSubjectDisplay.value, 'Subject copied'));
  dom.btnCopyRecruiterBody.addEventListener('click', () => copyEmailField(dom.recruiterBodyDisplay.value, 'Message copied'));
  dom.btnCloseFollowUpMessage.addEventListener('click', closeFollowUpMessage);
  dom.btnRegenFollowUpMessage.addEventListener('click', runFollowUpMessageGeneration);
  dom.btnFollowUpErrorRetry.addEventListener('click', runFollowUpMessageGeneration);
  dom.btnCopyFollowUpSubject.addEventListener('click', () => copyEmailField(dom.followUpSubjectDisplay.value, 'Subject copied'));
  dom.btnCopyFollowUpBody.addEventListener('click', () => copyEmailField(dom.followUpBodyDisplay.value, 'Message copied'));
  dom.btnCloseAppAnswers.addEventListener('click', closeApplicationAnswers);
  dom.btnRegenAppAnswers.addEventListener('click', runApplicationAnswersGeneration);
  dom.btnAppAnswersErrorRetry.addEventListener('click', runApplicationAnswersGeneration);
  dom.btnCloseReminderText.addEventListener('click', closeReminderText);
  dom.btnCopyReminderTitle.addEventListener('click', () => copyEmailField(dom.reminderTitleDisplay.value, 'Reminder title copied'));
  dom.btnCopyReminderBody.addEventListener('click', () => copyEmailField(dom.reminderBodyDisplay.value, 'Reminder text copied'));

  // Error Retry
  dom.btnErrorRetry.addEventListener('click', () => {
    if (state.lastRunMode) runGeneration(state.lastRunMode);
  });

  // Error → Open Settings (navigate iframe to the relevant section)
  dom.btnErrorSettings.addEventListener('click', () => {
    const section = dom.btnErrorSettings.dataset.section || 'provider';
    openSettingsSection(section);
  });

  // Privacy note → Open Settings (provider section)
  dom.btnPrivacySettings.addEventListener('click', () => openSettingsSection('provider'));

  dom.btnErrorDemo.addEventListener('click', async () => {
    await activateDemoMode();
    hideError();
  });

  // Sync inputs
  dom.fieldTitle.addEventListener('input', () => {
    state.jobData.jobTitle = dom.fieldTitle.value;
    markManualEntryIfEmpty();
    refreshJobInfoReviewNotice();
    syncJobChatToCurrentJob();
    refreshJobChatEntryPoints();
  });
  dom.fieldCompany.addEventListener('input', () => {
    state.jobData.company = dom.fieldCompany.value;
    markManualEntryIfEmpty();
    refreshJobInfoReviewNotice();
    syncJobChatToCurrentJob();
  });
  dom.fieldUrl.addEventListener('input', () => {
    state.jobData.sourceUrl = dom.fieldUrl.value;
    markManualEntryIfEmpty();
    syncJobChatToCurrentJob();
  });
  dom.fieldDesc.addEventListener('input', () => {
    state.jobData.description = dom.fieldDesc.value;
    maybeShowDescQualityNotice(dom.fieldDesc.value);
    markManualEntryIfEmpty();
    state.currentJobMeta.aiJobInfoAttemptedFor = '';
    syncJobChatToCurrentJob();
    refreshJobChatEntryPoints();
  });
}

// ── Core Logic ────────────────────────────────────────────────────────────

function parsePositiveInt(value) {
  const number = Number.parseInt(value || '', 10);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function capSessionScanText(value) {
  if (value === null || value === undefined) return value;
  const text = String(value);
  if (text.length <= SESSION_SCAN_TEXT_CAP_CHARS) return text;

  // Protect session storage from huge scanned pages while keeping enough text for normal generation.
  const keepChars = Math.max(0, SESSION_SCAN_TEXT_CAP_CHARS - SESSION_SCAN_TRUNCATION_MARKER.length);
  return text.slice(0, keepChars) + SESSION_SCAN_TRUNCATION_MARKER;
}

function capSessionScanPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  const capped = { ...payload };
  for (const field of ['pageText', 'selectedText', 'structuredData']) {
    if (field in capped) capped[field] = capSessionScanText(capped[field]);
  }
  return capped;
}

async function getScanTargetTab() {
  if (sourceTabId) {
    try {
      const tab = await chrome.tabs.get(sourceTabId);
      if (tab?.id) return tab;
    } catch (_) {
      // Source tab was closed. Fall back to the active tab.
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function persistScannedJobSession(response, tab, pendingMode = null) {
  if (!tab?.id) return false;

  return saveScopedJobSession({
    extractedData: capSessionScanPayload(response),
    sourceUrl: tab.url || '',
    sourceTitle: tab.title || '',
    sourceTabId: tab.id,
    ...(pendingMode ? { pendingMode } : {}),
  }, tab.id);
}

async function openFullPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageUrl = new URL(chrome.runtime.getURL('dashboard/dashboard.html'));
  pageUrl.searchParams.set('mode', 'full');

  const targetTabId = sourceTabId || (tab?.id && !isRestrictedUrl(tab.url) ? tab.id : null);
  if (targetTabId) pageUrl.searchParams.set('sourceTabId', String(targetTabId));

  await persistCurrentJobContextForFullPage(targetTabId);
  await chrome.tabs.create({ url: pageUrl.href, active: true });
}

async function persistCurrentJobContextForFullPage(targetTabId = sourceTabId) {
  const jobTitle = dom.fieldTitle.value.trim();
  const company = dom.fieldCompany.value.trim();
  const sourceUrl = dom.fieldUrl.value.trim();
  const description = dom.fieldDesc.value.trim();

  if (!jobTitle && !company && !sourceUrl && !description) return;

  await saveScopedJobSession({
    extractedData: {
      jobTitle,
      company,
      pageText: capSessionScanText(description),
      url: sourceUrl,
    },
    sourceUrl,
    sourceTitle: jobTitle || company || 'Job draft',
    sourceTabId: targetTabId,
  }, targetTabId);
}

function bindAppearanceControls() {
  const appearanceControls = document.getElementById('appearance-controls');
  if (appearanceControls) {
    document.addEventListener('click', e => {
      if (!appearanceControls.open) return;
      if (appearanceControls.contains(e.target)) return;
      appearanceControls.open = false;
    });
  }

  dom.templateOptions.forEach(opt => {
    opt.addEventListener('click', async () => {
      const nextTemplate = opt.dataset.template;
      if (nextTemplate === state.templateId) return;
      if (!await confirmTemplateRerenderIfNeeded()) return;

      dom.templateOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      state.templateId = nextTemplate;
      await clearEditedHtml('resume');
      await clearEditedHtml('cover-letter');
      updatePreviews();
      await persistAppearanceSettingsToSavedDraft();
    });
  });

  dom.colorDots.forEach(dot => {
    dot.addEventListener('click', async () => {
      const nextColor = dot.dataset.color;
      if (nextColor === state.accentColor) return;

      dom.colorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      state.accentColor = nextColor;
      applyAppearanceToRenderedDocuments();
      await persistAppearanceSettingsToSavedDraft();
    });
  });

  dom.selectSpacing.addEventListener('change', async () => {
    const nextSpacing = dom.selectSpacing.value;
    if (nextSpacing === state.spacingMode) return;

    state.spacingMode = nextSpacing;
    applyAppearanceToRenderedDocuments();
    await persistAppearanceSettingsToSavedDraft();
  });
}

function bindDraftSettingsControls() {
  dom.lengthPills.forEach(pill => {
    pill.addEventListener('click', () => {
      dom.lengthPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.clLength = pill.dataset.length;
    });
  });

  dom.rangeTone.addEventListener('input', () => {
    state.tone = Number(dom.rangeTone.value);
    dom.toneDescriptor.textContent = toneLabel(state.tone);
  });
}

function openSettingsSection(section = 'provider') {
  dom.settingsView.classList.add('visible');
  const overlayTitle = 'Settings';
  dom.settingsOverlayTitle.textContent = overlayTitle;
  dom.settingsView.setAttribute('aria-label', overlayTitle);

  const activateSection = () => {
    const nav = dom.settingsFrame.contentDocument?.querySelector(`.nav-btn[data-section="${section}"]`);
    if (!nav) return false;
    nav.click();
    return true;
  };

  if (activateSection()) return;

  const onLoad = () => {
    activateSection();
    dom.settingsFrame.removeEventListener('load', onLoad);
  };
  dom.settingsFrame.addEventListener('load', onLoad);
  setTimeout(activateSection, 100);
}

function hasExistingAiProviderSetup(settings) {
  if (!settings?.provider || settings.provider === 'mock') return false;
  if (settings.provider === 'ollama') return true;
  return !!settings.apiKey?.trim();
}

async function activateDemoMode() {
  const settings = await loadProviderSettings();
  const configs = {
    ...(settings.configs || {}),
    mock: { apiKey: '', modelName: '', endpoint: '' },
  };

  await saveProviderSettings({
    ...settings,
    activeProvider: 'mock',
    configs,
  });

  state.settings = await loadSettings();
  dom.mockBanner.classList.remove('hidden');
  try {
    dom.settingsFrame.contentWindow?.location.reload();
  } catch (e) {
    console.warn('Could not refresh settings frame after enabling Demo Mode:', e?.message || e);
  }
  showToast('Demo Mode enabled. Drafts will use mock/sample generation.');
}

async function runGeneration(mode) {
  if (!await validateForGeneration(mode)) return;

  currentAbortController = new AbortController();
  const { signal } = currentAbortController;
  const generationStartedAt = Date.now();

  state.lastRunMode = mode;
  setGenerating(true);
  hideError();
  await clearSavedGenerationReceipt();

  const toGenerate = mode === 'both' ? ['resume', 'cover-letter'] : [mode];

  try {
    for (const type of toGenerate) {
      startGenerationStatusMessages(type);

      let raw;
      if (type === 'resume') {
        raw = await generateResume(state.jobData, state.profile, state.settings, state.sourceResumeText, signal, state.tone, state.loadedFitContext);
      } else {
        raw = await generateCoverLetter(state.jobData, state.profile, state.settings, state.sourceResumeText, signal, state.tone, state.clLength, state.loadedFitContext);
      }

      const parsed = normalizeDraftContent(type, tryParseJson(raw));
      if (parsed) {
        state.drafts[type] = parsed;
        await clearEditedHtml(type);
        clearStaleMarkerForType(type);
      } else {
        throw new Error(`AI returned invalid content format for ${type}.`);
      }
      clearGenerationStatusMessages();
    }

    updatePreviews();
    state.originalDrafts = JSON.parse(JSON.stringify(state.drafts));

    if (mode === 'both') {
      dom.tabBtnMerged.classList.remove('hidden');
      dom.btnPrintMerged.classList.remove('hidden');
    } else {
      dom.tabBtnMerged.classList.add('hidden');
      dom.btnPrintMerged.classList.add('hidden');
    }

    switchTab(toGenerate[0]);
    state.generationReceipt = createGenerationReceipt(mode, generationStartedAt, Date.now());
    renderGenerationReceipt();
    showToast('✦ Drafts ready.');

    // Persist so draft survives the panel being closed and reopened. If quota
    // fails, the in-memory draft remains usable for export in the current view.
    await persistSavedDraftSnapshot(createSavedDraftSnapshot());
  } catch (e) {
    if (e.name === 'AbortError') {
      showToast('Generation stopped.');
    } else {
      showError(e);
    }
  } finally {
    currentAbortController = null;
    setGenerating(false);
    updateOutputPanelVisibility();
  }
}

function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
}

function createSavedDraftSnapshot(overrides = {}) {
  return compactSavedDraft({
    drafts:         state.drafts,
    originalDrafts: state.originalDrafts,
    jobData:        state.jobData,
    lastRunMode:    state.lastRunMode,
    templateId:     state.templateId,
    accentColor:    state.accentColor,
    spacingMode:    state.spacingMode,
    tone:           state.tone,
    clLength:       state.clLength,
    generationReceipt: state.generationReceipt,
    editedHtml:     getPersistableEditedHtml(),
    ...overrides,
  });
}

async function persistSavedDraftSnapshot(savedDraft, { toastOnQuota = true } = {}) {
  try {
    return saveScopedSavedDraft(savedDraft);
  } catch (err) {
    console.warn('Could not persist saved draft:', err?.message || err);
    if (toastOnQuota && isStorageQuotaError(err)) {
      showToast(storageQuotaMessage('savedDraft'));
    }
    return false;
  }
}

// Saved Jobs

function markManualEntryIfEmpty() {
  state.loadedFitContext = null;
  if (state.currentJobMeta?.rawContent) return;
  state.currentJobMeta = {
    sourceType: 'manual_entry',
    rawContent: '',
  };
}

function normalizeSavedJobUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '').toLowerCase();
}

function normalizeSavedJobText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function createSavedJobId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getCurrentSavedJobDraft() {
  const title = dom.fieldTitle.value.trim();
  const company = dom.fieldCompany.value.trim();
  const sourceUrl = dom.fieldUrl.value.trim();
  const cleanDescription = dom.fieldDesc.value.trim();
  const sourceType = state.currentJobMeta?.sourceType || 'manual_entry';
  const rawContent = String(state.currentJobMeta?.rawContent || cleanDescription);

  return {
    title,
    company,
    location: '',
    salaryText: '',
    sourceUrl,
    sourceType,
    rawContent,
    cleanDescription,
    status: 'saved',
    notes: '',
  };
}

function findSavedJobDuplicate(savedJobs, draft) {
  const draftUrl = normalizeSavedJobUrl(draft.sourceUrl);
  if (draftUrl) {
    return savedJobs.find(job => normalizeSavedJobUrl(job.sourceUrl) === draftUrl);
  }

  const draftTitle = normalizeSavedJobText(draft.title);
  const draftCompany = normalizeSavedJobText(draft.company);
  if (!draftTitle || !draftCompany) return null;

  return savedJobs.find(job =>
    normalizeSavedJobText(job.title) === draftTitle &&
    normalizeSavedJobText(job.company) === draftCompany
  );
}

function jobLookupDraft(jobData = {}) {
  return {
    title: jobData.jobTitle || jobData.title || '',
    company: jobData.company || '',
    sourceUrl: jobData.sourceUrl || '',
  };
}

function alreadySeenSignature(jobData = {}) {
  const draft = jobLookupDraft(jobData);
  const url = normalizeSavedJobUrl(draft.sourceUrl);
  if (url) return `url:${url}`;
  const title = normalizeSavedJobText(draft.title);
  const company = normalizeSavedJobText(draft.company);
  return title && company ? `role:${title}|${company}` : '';
}

function historyEntryJobData(entry = {}) {
  return {
    jobTitle: entry.jobData?.jobTitle || entry.jobTitle || '',
    title: entry.jobData?.title || entry.jobTitle || '',
    company: entry.jobData?.company || entry.company || '',
    sourceUrl: entry.jobData?.sourceUrl || entry.sourceUrl || '',
  };
}

function findJobHistoryDuplicate(historyEntries, draft) {
  const draftUrl = normalizeSavedJobUrl(draft.sourceUrl);
  if (draftUrl) {
    return historyEntries.find(entry => normalizeSavedJobUrl(historyEntryJobData(entry).sourceUrl) === draftUrl);
  }

  const draftTitle = normalizeSavedJobText(draft.title);
  const draftCompany = normalizeSavedJobText(draft.company);
  if (!draftTitle || !draftCompany) return null;

  return historyEntries.find(entry => {
    const entryJob = historyEntryJobData(entry);
    return normalizeSavedJobText(entryJob.jobTitle || entryJob.title) === draftTitle &&
      normalizeSavedJobText(entryJob.company) === draftCompany;
  });
}

function formatSeenDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function describeAlreadySeenResult(result = {}) {
  const parts = [];
  if (result.savedJob) {
    const status = result.savedJob.status ? `, status: ${result.savedJob.status}` : '';
    const savedDate = formatSeenDate(result.savedJob.createdAt);
    parts.push(`Saved in Jobs${savedDate ? ` on ${savedDate}` : ''}${status}`);
  }
  if (result.historyEntry) {
    const generatedDate = formatSeenDate(result.historyEntry.date);
    const docType = result.historyEntry.docType || 'draft';
    parts.push(`Generated ${docType}${generatedDate ? ` on ${generatedDate}` : ''}`);
  }
  return parts.join('\n');
}

async function findAlreadySeenJob(jobData = state.jobData) {
  const signature = alreadySeenSignature(jobData);
  if (!signature) return null;

  const data = await chrome.storage.local.get([SAVED_JOBS_KEY, 'jobHistory']);
  const savedJobs = Array.isArray(data[SAVED_JOBS_KEY]) ? data[SAVED_JOBS_KEY] : [];
  const historyEntries = Array.isArray(data.jobHistory) ? data.jobHistory : [];
  const draft = jobLookupDraft(jobData);
  const savedJob = findSavedJobDuplicate(savedJobs, draft) || null;
  const historyEntry = findJobHistoryDuplicate(historyEntries, draft) || null;

  if (!savedJob && !historyEntry) return null;
  return {
    signature,
    savedJob,
    historyEntry,
    summary: describeAlreadySeenResult({ savedJob, historyEntry }),
  };
}

function alreadySeenReviewDetails(alreadySeen, baseDetails = []) {
  if (!alreadySeen) return baseDetails;
  return [
    { label: 'Already in workspace', value: alreadySeen.summary || 'This posting appears in Jobs or History.' },
    ...baseDetails,
  ];
}

function alreadySeenWarningMessage(alreadySeen) {
  const summary = alreadySeen?.summary || 'This posting appears in Jobs or History.';
  return `${summary}. You can continue, but check whether you already applied before generating or sending anything again.`;
}

function alreadySeenWarningActions(alreadySeen) {
  const actions = [];
  if (alreadySeen?.savedJob) {
    actions.push('<button type="button" class="job-info-review-action" data-action="open-jobs">Open Jobs</button>');
  }
  if (alreadySeen?.historyEntry) {
    actions.push('<button type="button" class="job-info-review-action" data-action="open-history">Open History</button>');
  }
  return actions.length ? ` ${actions.join(' ')}` : '';
}

function showAlreadySeenJobWarning(alreadySeen, { force = false } = {}) {
  if (!alreadySeen?.signature) return false;
  if (!force && alreadySeenScanWarnings.has(alreadySeen.signature)) return false;
  alreadySeenScanWarnings.add(alreadySeen.signature);
  showJobInfoReviewNotice(
    alreadySeenWarningMessage(alreadySeen),
    'warning',
    alreadySeenWarningActions(alreadySeen)
  );
  return true;
}

async function saveCurrentJob() {
  const draft = getCurrentSavedJobDraft();

  if (!draft.title && !draft.company && !draft.cleanDescription && !draft.sourceUrl) {
    showToast('Add or scan a job before saving.');
    return;
  }

  const data = await chrome.storage.local.get(SAVED_JOBS_KEY);
  const savedJobs = Array.isArray(data[SAVED_JOBS_KEY]) ? data[SAVED_JOBS_KEY] : [];

  const duplicate = findSavedJobDuplicate(savedJobs, draft);
  if (duplicate) {
    showToast('This job is already saved.');
    return;
  }

  if (savedJobs.length >= MAX_SAVED_JOBS) {
    showToast(`Saved Jobs is full (${MAX_SAVED_JOBS}). Delete a job before saving another.`);
    return;
  }

  const now = new Date().toISOString();
  const savedJob = {
    id: createSavedJobId(),
    ...draft,
    createdAt: now,
    updatedAt: now,
  };
  const compactedJob = compactSavedJob(savedJob);
  const jobWasTruncated = wasTruncated(savedJob.rawContent, compactedJob.rawContent) ||
    wasTruncated(savedJob.cleanDescription, compactedJob.cleanDescription);

  try {
    await chrome.storage.local.set({ [SAVED_JOBS_KEY]: compactSavedJobs([compactedJob, ...savedJobs]) });
    showToast(jobWasTruncated
      ? 'This job description was very large, so Jobs saved a shortened copy.'
      : 'Saved to Jobs.');
  } catch (err) {
    console.warn('Could not save job:', err?.message || err);
    showToast(isStorageQuotaError(err)
      ? storageQuotaMessage('savedJobs')
      : 'Could not save this job. Please try again.');
  }
}

// ── Job History ───────────────────────────────────────────────────────────

function postFitAnalysisResult(payload) {
  const frame = document.getElementById('jobs-frame');
  frame?.contentWindow?.postMessage(payload, window.location.origin);
}

function fitAnalysisErrorMessage(error) {
  const message = error?.message || String(error || '');
  if (message === 'fit_no_job_description') {
    return 'Add a job description before analyzing fit.';
  }
  if (message === 'fit_missing_profile') {
    return 'Add profile details or upload a source resume before analyzing fit.';
  }
  return mapError(error).message;
}

async function handleFitAnalysisRequest(id) {
  if (!id) return;

  postFitAnalysisResult({ type: 'JPDA_ANALYZE_FIT_STARTED', id });
  currentFitAnalysisController?.abort();
  const controller = new AbortController();
  currentFitAnalysisController = controller;

  try {
    const data = await chrome.storage.local.get([SAVED_JOBS_KEY, 'sourceResumeText']);
    const savedJobs = Array.isArray(data[SAVED_JOBS_KEY]) ? data[SAVED_JOBS_KEY] : [];
    const index = savedJobs.findIndex(job => job.id === id);
    if (index === -1) throw new Error('Saved job not found.');

    const [profile, settings, { profiles, activeId }] = await Promise.all([
      loadProfile(),
      loadSettings(),
      loadProfiles(),
    ]);
    const activeProfileMeta = profiles.find(p => p.id === activeId) || {};
    const inferenceMode = activeProfileMeta.fitInferenceMode || 'transferable';
    const sourceResumeText = data.sourceResumeText || '';
    const fitAnalysis = await analyzeFit(
      savedJobs[index],
      profile,
      settings,
      sourceResumeText,
      controller.signal,
      inferenceMode
    );

    const updatedJobs = [...savedJobs];
    updatedJobs[index] = {
      ...updatedJobs[index],
      fitAnalysis,
      updatedAt: new Date().toISOString(),
    };

    await chrome.storage.local.set({ [SAVED_JOBS_KEY]: compactSavedJobs(updatedJobs) });
    postFitAnalysisResult({ type: 'JPDA_ANALYZE_FIT_DONE', id, fitAnalysis });
  } catch (error) {
    if (error?.name === 'AbortError') {
      postFitAnalysisResult({ type: 'JPDA_ANALYZE_FIT_ERROR', id, message: 'Fit analysis was stopped.' });
    } else if (isStorageQuotaError(error)) {
      postFitAnalysisResult({ type: 'JPDA_ANALYZE_FIT_ERROR', id, message: storageQuotaMessage('savedJobs') });
    } else {
      postFitAnalysisResult({ type: 'JPDA_ANALYZE_FIT_ERROR', id, message: fitAnalysisErrorMessage(error) });
    }
  } finally {
    if (currentFitAnalysisController === controller) currentFitAnalysisController = null;
  }
}

async function appendJobHistory(targets) {
  const docType = targets.includes('merged') || (targets.includes('resume') && targets.includes('cover-letter'))
    ? 'Resume + Cover Letter'
    : targets.includes('cover-letter') ? 'Cover Letter'
    : 'Resume';

  const entry = compactJobHistoryEntry({
    id:        Date.now(),
    jobTitle:  state.jobData.jobTitle  || '(untitled)',
    company:   state.jobData.company   || '',
    sourceUrl: state.jobData.sourceUrl || '',
    docType,
    date:      new Date().toISOString(),
    jobData:   { ...state.jobData },
  });

  const { jobHistory = [] } = await chrome.storage.local.get('jobHistory');
  const compactedHistory = [entry, ...jobHistory.map(compactJobHistoryEntry)];
  if (compactedHistory.length > 100) compactedHistory.splice(100);
  try {
    await chrome.storage.local.set({ jobHistory: compactedHistory });
  } catch (err) {
    console.warn('Could not save job history:', err?.message || err);
  }
  await syncJobHistorySummary(entry);
}

function trimSyncField(value, maxLength) {
  const text = String(value || '').trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function createJobHistorySummary(entry) {
  return {
    id: entry.id,
    jobTitle: trimSyncField(entry.jobTitle, MAX_SYNC_FIELD_LENGTHS.jobTitle),
    company: trimSyncField(entry.company, MAX_SYNC_FIELD_LENGTHS.company),
    sourceUrl: trimSyncField(entry.sourceUrl, MAX_SYNC_FIELD_LENGTHS.sourceUrl),
    docType: trimSyncField(entry.docType, MAX_SYNC_FIELD_LENGTHS.docType),
    date: entry.date,
  };
}

function syncPayloadBytes(summaries) {
  return new TextEncoder().encode(JSON.stringify({ [SYNC_HISTORY_SUMMARY_KEY]: summaries })).length;
}

function compactSyncedSummaries(summaries) {
  const compacted = summaries.slice(0, MAX_SYNC_HISTORY_SUMMARIES);
  while (compacted.length > 1 && syncPayloadBytes(compacted) > MAX_SYNC_HISTORY_BYTES) {
    compacted.pop();
  }
  return compacted;
}

async function syncJobHistorySummary(entry) {
  try {
    const summary = createJobHistorySummary(entry);
    const data = await chrome.storage.sync.get(SYNC_HISTORY_SUMMARY_KEY);
    const existing = Array.isArray(data[SYNC_HISTORY_SUMMARY_KEY])
      ? data[SYNC_HISTORY_SUMMARY_KEY]
      : [];
    const summaries = compactSyncedSummaries([
      summary,
      ...existing.filter(item => item?.id !== summary.id),
    ]);
    await chrome.storage.sync.set({ [SYNC_HISTORY_SUMMARY_KEY]: summaries });
  } catch (err) {
    console.warn('Could not sync lightweight job history summary:', err?.message || 'Unknown storage error');
  }
}

// ── Welcome Modal ─────────────────────────────────────────────────────────

function showWelcomeModal() {
  const overlay     = document.getElementById('welcome-overlay');
  const step1       = document.getElementById('welcome-step-1');
  const step2       = document.getElementById('welcome-step-2');
  const btnNext     = document.getElementById('welcome-btn-next');
  const btnSettings = document.getElementById('welcome-btn-settings');
  const btnDemo     = document.getElementById('welcome-btn-demo');
  const btnSkip     = document.getElementById('welcome-btn-skip');

  overlay.classList.remove('hidden');
  btnNext.focus();

  const dismiss = () => overlay.classList.add('hidden');

  btnNext.addEventListener('click', () => {
    step1.classList.add('hidden');
    step2.classList.remove('hidden');
    overlay.setAttribute('aria-labelledby', 'welcome-title-setup');
    btnSettings.focus();
  }, { once: true });

  btnSettings.addEventListener('click', () => {
    dismiss();
    openSettingsSection('provider');
  }, { once: true });

  btnDemo.addEventListener('click', async () => {
    await activateDemoMode();
    dismiss();
  }, { once: true });

  btnSkip.addEventListener('click', dismiss, { once: true });
}

// ── Confirm Dialog ────────────────────────────────────────────────────────

function showConfirmDialog(title, body, confirmLabel = 'Continue') {
  return showChoiceDialog(title, body, { primaryLabel: confirmLabel })
    .then(result => result === 'primary');
}

function showChoiceDialog(title, body, { primaryLabel = 'Continue', secondaryLabel = '', reviewDetails = [] } = {}) {
  return new Promise(resolve => {
    const overlay   = document.getElementById('confirm-overlay');
    const btnOk     = document.getElementById('confirm-btn-ok');
    const btnCancel = document.getElementById('confirm-btn-cancel');
    const btnSecondary = document.getElementById('confirm-btn-secondary');
    const review = document.getElementById('confirm-review');

    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent  = body;
    review.replaceChildren();
    review.classList.toggle('hidden', !reviewDetails.length);
    reviewDetails.forEach(({ label, value }) => {
      const row = document.createElement('div');
      row.className = 'confirm-review-row';
      if (label === 'Already in workspace') row.classList.add('confirm-review-row--warning');

      const rowLabel = document.createElement('span');
      rowLabel.className = 'confirm-review-label';
      rowLabel.textContent = label;

      const rowValue = document.createElement('span');
      rowValue.className = 'confirm-review-value';
      rowValue.textContent = value;

      row.append(rowLabel, rowValue);
      review.appendChild(row);
    });
    btnOk.textContent = primaryLabel;
    btnSecondary.textContent = secondaryLabel;
    btnSecondary.classList.toggle('hidden', !secondaryLabel);
    overlay.classList.remove('hidden');
    btnCancel.focus();

    const cleanup = result => {
      overlay.classList.add('hidden');
      overlay.removeEventListener('click', onBackdrop);
      btnOk.removeEventListener('click', onOk);
      btnSecondary.removeEventListener('click', onSecondary);
      btnCancel.removeEventListener('click', onCancel);
      resolve(result);
    };

    const onOk        = () => cleanup('primary');
    const onSecondary = () => cleanup('secondary');
    const onCancel    = () => cleanup('cancel');
    const onBackdrop  = e => { if (e.target === overlay) cleanup('cancel'); };

    btnOk.addEventListener('click', onOk);
    btnSecondary.addEventListener('click', onSecondary);
    btnCancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
  });
}

async function confirmOverwrite(mode) {
  const hasResume = !!state.drafts.resume;
  const hasCL    = !!state.drafts['cover-letter'];
  const affected  = mode === 'both'   ? (hasResume || hasCL)
                  : mode === 'resume' ? hasResume
                  : hasCL;

  if (!affected) return true;

  const label = mode === 'both'   ? 'resume and cover letter'
              : mode === 'resume' ? 'resume'
              :                     'cover letter';

  return showConfirmDialog(
    'Replace existing draft?',
    `You already have a ${label} draft. Generating a new one will replace it.`,
    'Replace'
  );
}

async function resetToOriginal() {
  const docType = state.currentTab;
  if (!state.originalDrafts?.[docType]) return;

  state.drafts[docType] = JSON.parse(JSON.stringify(state.originalDrafts[docType]));
  await clearEditedHtml(docType);
  updatePreviews();
  dom.fieldRevision.value = '';
  refreshRevisionButton();
  showToast('↩ Draft reset to original.');
}

async function applyRevision() {
  const request = dom.fieldRevision.value.trim();
  if (!request) return;

  const docType = state.currentTab;
  if (!state.drafts[docType]) return;
  if (!state.settings?.provider) {
    showError(new Error('no_provider'));
    return;
  }

  dom.btnApplyChanges.disabled = true;
  dom.btnApplyChanges.textContent = 'Applying…';
  dom.btnApplyChanges.classList.add('btn--loading');
  dom.btnRegenerate.disabled = true;

  try {
    const isAts = state.atsRevision;
    state.atsRevision = false;
    const raw = await reviseDraft(state.drafts[docType], request, docType, state.jobData, state.profile, state.settings, isAts);
    const parsed = normalizeDraftContent(docType, tryParseJson(raw));
    if (parsed) {
      state.drafts[docType] = parsed;
      await clearEditedHtml(docType);
      updatePreviews();
      dom.fieldRevision.value = '';
      showToast('✦ Changes applied.');
    } else {
      showToast('⚠️ Could not apply changes — try rephrasing your request.');
    }
  } catch (e) {
    state.atsRevision = false;
    showToast(`⚠️ ${mapError(e).message}`);
  } finally {
    dom.btnApplyChanges.classList.remove('btn--loading');
    dom.btnApplyChanges.textContent = 'Apply Changes';
    refreshRevisionButton();
    dom.btnRegenerate.disabled = !state.originalDrafts?.[docType];
  }
}

function hasUnsavedPreviewEdits() {
  return Boolean(state.hasEdits.resume || state.hasEdits['cover-letter']);
}

function hasManualPreviewEdits() {
  return Boolean(state.editedHtml.resume?.html || state.editedHtml['cover-letter']?.html || hasUnsavedPreviewEdits());
}

function updateManualEditNotice() {
  dom.manualEditNotice.classList.toggle('hidden', !hasManualPreviewEdits());
}

async function confirmTemplateRerenderIfNeeded() {
  if (!hasUnsavedPreviewEdits()) return true;

  return showConfirmDialog(
    'Change template?',
    'Changing templates rebuilds the preview and may discard direct edits. Continue?',
    'Continue'
  );
}

function getPreviewFrame(tab) {
  return tab === 'resume' ? dom.previewResumeFrame : dom.previewCLFrame;
}

function normalizeEditedHtmlEntry(entry) {
  if (!entry?.html || typeof entry.html !== 'string') return null;
  return {
    html: entry.html,
    updatedAt: entry.updatedAt || new Date().toISOString(),
    differsFromDraft: true,
  };
}

function getSanitizedIframeHtml(iframe) {
  const doc = iframe?.contentDocument;
  if (!doc?.documentElement) return '';

  const cloned = doc.documentElement.cloneNode(true);
  cloned.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  cloned.querySelectorAll('[data-jpda-edit-listener-attached]').forEach(el => {
    el.removeAttribute('data-jpda-edit-listener-attached');
  });
  cloned.querySelectorAll('#edit-mode-style').forEach(el => el.remove());

  return '<!DOCTYPE html>\n' + cloned.outerHTML;
}

function getPersistableEditedHtml() {
  const editedHtml = {};
  ['resume', 'cover-letter'].forEach(tab => {
    const entry = normalizeEditedHtmlEntry(state.editedHtml[tab]);
    if (entry) editedHtml[tab] = entry;
  });
  return editedHtml;
}

function scheduleEditedHtmlAutosave(tab) {
  clearTimeout(editedHtmlSaveTimers[tab]);
  editedHtmlSaveTimers[tab] = setTimeout(() => {
    persistEditedHtml(tab);
  }, EDITED_HTML_SAVE_DELAY_MS);
}

async function persistEditedHtml(tab) {
  clearTimeout(editedHtmlSaveTimers[tab]);
  editedHtmlSaveTimers[tab] = null;

  const html = getSanitizedIframeHtml(getPreviewFrame(tab));
  if (!html) return;
  if (html.length > MAX_EDITED_HTML_CHARS) {
    showToast('Manual edits are too large to auto-save, but export still uses the current preview.');
    return;
  }

  const entry = {
    html,
    updatedAt: new Date().toISOString(),
    differsFromDraft: true,
  };

  state.editedHtml[tab] = entry;
  state.hasEdits[tab] = true;
  updateManualEditNotice();

  try {
    const savedDraft = await loadScopedSavedDraft();
    if (!savedDraft) return;

    const saved = await persistSavedDraftSnapshot({
      ...savedDraft,
      editedHtml: {
        ...(savedDraft.editedHtml || {}),
        [tab]: entry,
      },
    }, { toastOnQuota: false });
    if (!saved) {
      showToast(storageQuotaMessage('editedHtml'));
    }
  } catch (err) {
    console.warn('Could not persist edited preview HTML:', err?.message || err);
    if (isStorageQuotaError(err)) {
      showToast(storageQuotaMessage('editedHtml'));
    }
  }
}

async function clearEditedHtml(tab) {
  clearTimeout(editedHtmlSaveTimers[tab]);
  editedHtmlSaveTimers[tab] = null;
  state.editedHtml[tab] = null;
  state.hasEdits[tab] = false;

  try {
    const savedDraft = await loadScopedSavedDraft();
    if (!savedDraft?.editedHtml?.[tab]) {
      updateManualEditNotice();
      return;
    }

    const editedHtml = { ...savedDraft.editedHtml };
    delete editedHtml[tab];
    await persistSavedDraftSnapshot({
      ...savedDraft,
      editedHtml,
    }, { toastOnQuota: false });
  } catch (err) {
    console.warn('Could not clear edited preview HTML:', err?.message || err);
  } finally {
    updateManualEditNotice();
  }
}

function restoreEditedHtml(tab) {
  const entry = normalizeEditedHtmlEntry(state.editedHtml[tab]);
  if (!entry) return false;

  const iframe = getPreviewFrame(tab);
  injectToIframe(iframe, entry.html);
  applyAppearanceToIframe(iframe);
  state.editedHtml[tab] = entry;
  state.hasEdits[tab] = true;
  updateManualEditNotice();
  return true;
}

function applyAppearanceToRenderedDocuments() {
  const frames = [];
  if (state.drafts.resume) frames.push(dom.previewResumeFrame);
  if (state.drafts['cover-letter']) frames.push(dom.previewCLFrame);
  if (state.drafts.resume && state.drafts['cover-letter']) frames.push(dom.previewMergedFrame);

  frames.forEach(frame => applyAppearanceToIframe(frame));
  refreshExportButtons();
}

function applyAppearanceToIframe(iframe) {
  const doc = iframe?.contentDocument;
  if (!doc?.documentElement) return;

  doc.documentElement.style.setProperty('--accent-color', state.accentColor);
  doc.documentElement.style.setProperty('--spacing-factor', state.spacingMode === 'compact' ? '0.8' : '1.0');

  let spacingStyle = doc.getElementById('jpda-spacing-style');
  if (!spacingStyle) {
    spacingStyle = doc.createElement('style');
    spacingStyle.id = 'jpda-spacing-style';
    doc.head.appendChild(spacingStyle);
  }
  spacingStyle.textContent = getSpacingCss(state.spacingMode);
}

async function persistAppearanceSettingsToSavedDraft() {
  if (!state.drafts.resume && !state.drafts['cover-letter']) return;

  try {
    const savedDraft = await loadScopedSavedDraft();
    if (!savedDraft) return;

    await persistSavedDraftSnapshot({
      ...savedDraft,
      templateId: state.templateId,
      accentColor: state.accentColor,
      spacingMode: state.spacingMode,
    }, { toastOnQuota: false });
  } catch (err) {
    console.warn('Could not persist appearance settings:', err?.message || err);
  }
}

function updatePreviews() {
  const options = {
    accentColor: state.accentColor,
    spacingMode: state.spacingMode
  };

  if (state.drafts.resume) {
    clearEditState('resume');
    dom.draftResumeEmpty.classList.add('hidden');
    dom.draftResumeContent.classList.remove('hidden');
    const resumeData = {
      ...state.drafts.resume,
      personalInfo: state.profile.personalInfo
    };
    const html = renderDocument(state.templateId, 'resume', resumeData, options);
    injectToIframe(dom.previewResumeFrame, html);
    restoreEditedHtml('resume');
    refreshExportButtons();
  }

  if (state.drafts['cover-letter']) {
    clearEditState('cover-letter');
    dom.draftCLEmpty.classList.add('hidden');
    dom.draftCLContent.classList.remove('hidden');
    // Map the draft to the expected format for cover letters
    const clData = {
      personalInfo: state.profile.personalInfo,
      content: state.drafts['cover-letter']
    };
    const html = renderDocument(state.templateId, 'cover-letter', clData, options);
    injectToIframe(dom.previewCLFrame, html);
    restoreEditedHtml('cover-letter');
  }

  if (state.drafts.resume && state.drafts['cover-letter']) {
    dom.draftMergedEmpty.classList.add('hidden');
    dom.draftMergedContent.classList.remove('hidden');
    const resumeData = {
      ...state.drafts.resume,
      personalInfo: state.profile.personalInfo
    };
    const clData = {
      personalInfo: state.profile.personalInfo,
      content: state.drafts['cover-letter']
    };
    const html = renderMergedDocument(state.templateId, resumeData, clData, options);
    injectToIframe(dom.previewMergedFrame, html);
  }

  refreshExportButtons();
  updateManualEditNotice();
}

function injectToIframe(iframe, html) {
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}

function toggleEditMode(tab) {
  const entering = !state.editMode[tab];
  state.editMode[tab] = entering;

  const iframe = tab === 'resume' ? dom.previewResumeFrame : dom.previewCLFrame;
  const btn    = tab === 'resume' ? dom.btnEditResume : dom.btnEditCL;
  const doc    = iframe.contentDocument;
  const page   = doc?.querySelector('.page-preview');

  if (!page) return;

  if (entering) {
    const style = doc.createElement('style');
    style.id = 'edit-mode-style';
    style.textContent = '.page-preview { overflow: visible !important; }';
    doc.head.appendChild(style);
    page.contentEditable = 'true';
    page.focus();
    if (!page.dataset.jpdaEditListenerAttached) {
      page.dataset.jpdaEditListenerAttached = 'true';
      page.addEventListener('input', () => {
        state.hasEdits[tab] = true;
        updateManualEditNotice();
        scheduleEditedHtmlAutosave(tab);
      });
    }
    btn.textContent = 'Done';
    btn.classList.add('editing');
    btn.title = 'Click to exit edit mode';
  } else {
    page.removeAttribute('contenteditable');
    const style = doc.getElementById('edit-mode-style');
    if (style) style.remove();
    btn.textContent = '✏ Edit';
    btn.classList.remove('editing');
    btn.title = 'Edit the document directly in the preview';
    if (state.hasEdits[tab]) persistEditedHtml(tab);
  }
}

function getIframeHtml(iframe) {
  return getSanitizedIframeHtml(iframe);
}

function clearEditState(tab) {
  state.editMode[tab] = false;
  state.hasEdits[tab] = false;
  const btn = tab === 'resume' ? dom.btnEditResume : dom.btnEditCL;
  if (btn) {
    btn.textContent = '✏ Edit';
    btn.classList.remove('editing');
    btn.title = 'Edit the document directly in the preview';
  }
}

function printDraft(...types) {
  // If no types specified, default to the currently active tab
  const targets = types.length ? types : [state.currentTab];

  // Validate we have content to print
  if (targets.includes('merged')) {
    if (!state.drafts.resume || !state.drafts['cover-letter']) {
      showToast('⚠️ Both resume and cover letter must be ready.');
      return;
    }
  } else {
    const validTargets = targets.filter(tab => !!state.drafts[tab]);
    if (!validTargets.length) {
      showToast(`⚠️ No content to print yet.`);
      return;
    }
  }

  // User is saving as PDF — record to history as a signal of a completed application
  appendJobHistory(targets);

  const options = {
    accentColor: state.accentColor,
    spacingMode: state.spacingMode
  };

  if (targets.includes('merged')) {
    const resumeData = { ...state.drafts.resume, personalInfo: state.profile.personalInfo };
    const clData = { personalInfo: state.profile.personalInfo, content: state.drafts['cover-letter'] };
    const mergedFilenameBase = getSuggestedFilenameBase(state.docSettings.filenamePattern, ['merged']);
    const html = withDocumentTitle(
      renderMergedDocument(state.templateId, resumeData, clData, options),
      mergedFilenameBase
    );
    const printWin = window.open('', '_blank');
    if (!printWin) {
      showToast('❌ Pop-up blocked! Please allow pop-ups for this extension.');
      return;
    }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
    showToast('🖨️ Opening print preview — choose "Save as PDF" for best results.');
    printWin.onload = () => {
      printWin.focus();
      setTimeout(() => { printWin.print(); }, 300);
    };
    return;
  }

  for (const tab of targets.filter(t => !!state.drafts[t])) {
    let html;
    if (state.hasEdits[tab]) {
      const iframe = tab === 'resume' ? dom.previewResumeFrame : dom.previewCLFrame;
      html = withDocumentTitle(
        getIframeHtml(iframe),
        getSuggestedFilenameBase(state.docSettings.filenamePattern, [tab])
      );
    } else {
      const draft = state.drafts[tab];
      const data = tab === 'resume'
        ? { ...draft, personalInfo: state.profile.personalInfo }
        : { personalInfo: state.profile.personalInfo, content: draft };
      html = withDocumentTitle(
        renderDocument(state.templateId, tab, data, options),
        getSuggestedFilenameBase(state.docSettings.filenamePattern, [tab])
      );
    }

    const printWin = window.open('', '_blank');
    if (!printWin) {
      showToast('❌ Pop-up blocked! Please allow pop-ups for this extension.');
      return;
    }

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();

    showToast('🖨️ Opening print preview — choose "Save as PDF" for best results.');

    printWin.onload = () => {
      printWin.focus();
      setTimeout(() => {
        printWin.print();
      }, 300);
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

// ── Draft Persistence ─────────────────────────────────────────────────────

function getSuggestedFilenameBase(pattern, targets) {
  const docType = targets.includes('merged') || (targets.includes('resume') && targets.includes('cover-letter'))
    ? 'Resume + Cover Letter'
    : targets.includes('cover-letter') ? 'Cover Letter'
    : 'Resume';

  return buildFilename(pattern, {
    jobTitle: state.jobData.jobTitle,
    company: state.jobData.company,
    name: state.profile?.personalInfo?.fullName,
    docType,
  });
}

function withDocumentTitle(html, title) {
  const safeTitle = escapeTitleText(title);
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  }
  return html.replace(/<head(\s[^>]*)?>/i, `$&\n      <title>${safeTitle}</title>`);
}

function escapeTitleText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function restoreSavedDraft(saved) {
  state.drafts         = saved.drafts         || { resume: null, 'cover-letter': null };
  state.originalDrafts = saved.originalDrafts || { resume: null, 'cover-letter': null };
  state.jobData        = saved.jobData        || state.jobData;
  state.currentJobMeta = {
    sourceType: state.jobData.sourceUrl ? 'extension_scan' : 'manual_entry',
    rawContent: state.jobData.description || '',
  };
  state.lastRunMode = saved.lastRunMode || null;
  state.templateId  = saved.templateId  || 'classic';
  state.accentColor = saved.accentColor || '#2563eb';
  state.spacingMode = saved.spacingMode || 'standard';
  state.tone        = saved.tone        ?? 30;
  state.clLength    = saved.clLength    || 'standard';
  state.generationReceipt = saved.generationReceipt || null;
  state.editedHtml = {
    resume: normalizeEditedHtmlEntry(saved.editedHtml?.resume),
    'cover-letter': normalizeEditedHtmlEntry(saved.editedHtml?.['cover-letter']),
  };

  // Restore form fields
  dom.fieldTitle.value   = state.jobData.jobTitle  || '';
  dom.fieldCompany.value = state.jobData.company   || '';
  dom.fieldUrl.value     = state.jobData.sourceUrl || '';
  dom.fieldDesc.value     = state.jobData.description || '';

  // Restore style controls
  dom.templateOptions.forEach(o => o.classList.toggle('active', o.dataset.template === state.templateId));
  dom.colorDots.forEach(d => d.classList.toggle('active', d.dataset.color === state.accentColor));
  dom.selectSpacing.value  = state.spacingMode;
  dom.rangeTone.value      = state.tone;
  dom.toneDescriptor.textContent = toneLabel(state.tone);
  dom.lengthPills.forEach(p => p.classList.toggle('active', p.dataset.length === state.clLength));

  // Restore merged tab
  if (state.lastRunMode === 'both') {
    dom.tabBtnMerged.classList.remove('hidden');
    dom.btnPrintMerged.classList.remove('hidden');
  }

  if (state.drafts.resume || state.drafts['cover-letter']) {
    updatePreviews();
    renderGenerationReceipt();
  }

  switchTab(state.drafts.resume ? 'resume' : 'cover-letter');
  syncJobChatToCurrentJob();
  refreshJobChatEntryPoints();
}

async function clearDraft(tab) {
  state.drafts[tab] = null;
  if (state.originalDrafts) state.originalDrafts[tab] = null;

  const emptyEl     = tab === 'resume' ? dom.draftResumeEmpty   : dom.draftCLEmpty;
  const contentEl   = tab === 'resume' ? dom.draftResumeContent : dom.draftCLContent;
  emptyEl.classList.remove('hidden');
  contentEl.classList.add('hidden');
  clearEditState(tab);
  await clearEditedHtml(tab);
  state.generationReceipt = null;
  dom.genStatus.classList.add('hidden');
  dom.genStatus.classList.remove('gen-status--complete');

  // If neither draft remains, also hide the merged tab
  if (!state.drafts.resume && !state.drafts['cover-letter']) {
    dom.draftMergedEmpty.classList.remove('hidden');
    dom.draftMergedContent.classList.add('hidden');
    dom.tabBtnMerged.classList.add('hidden');
    dom.btnPrintMerged.classList.add('hidden');
    await removeScopedSavedDraft();
  } else {
    const savedDraft = await loadScopedSavedDraft();
    if (savedDraft) {
      savedDraft.drafts[tab] = null;
      if (savedDraft.originalDrafts) savedDraft.originalDrafts[tab] = null;
      savedDraft.generationReceipt = null;
      await persistSavedDraftSnapshot(savedDraft, { toastOnQuota: false });
    }
  }

  refreshExportButtons();
  refreshJobChatEntryPoints();
  updateOutputPanelVisibility();
  showToast(`${tab === 'resume' ? 'Resume' : 'Cover letter'} draft cleared.`);
}

async function clearSession() {
  const fitCheckTabId = state.lastFitCheck?.tab?.id;

  await Promise.all([
    removeScopedSavedDraft(),
    removeScopedJobSession(),
  ]);

  state.drafts      = { resume: null, 'cover-letter': null };
  state.jobData     = { jobTitle: '', company: '', sourceUrl: '', description: '' };
  state.currentJobMeta = { sourceType: 'manual_entry', rawContent: '', aiJobInfoAttemptedFor: '' };
  state.lastRunMode = null;
  state.loadedFitContext = null;
  state.lastFitCheck = null;
  state.generationReceipt = null;
  state.editedHtml  = { resume: null, 'cover-letter': null };
  clearTimeout(editedHtmlSaveTimers.resume);
  clearTimeout(editedHtmlSaveTimers['cover-letter']);
  editedHtmlSaveTimers.resume = null;
  editedHtmlSaveTimers['cover-letter'] = null;

  dom.fieldTitle.value = '';
  dom.fieldCompany.value = '';
  dom.fieldUrl.value = '';
  dom.fieldDesc.value = '';
  dom.selectionNotice.classList.add('hidden');
  dom.sourceIndicator.textContent = '';
  dom.btnAiFitCheck.classList.add('hidden');
  if (fitCheckTabId) {
    chrome.tabs.sendMessage(fitCheckTabId, { type: 'REMOVE_FIT_CHECK_CARD' }).catch(() => {});
  }
  dom.genStatus.classList.add('hidden');
  syncJobChatToCurrentJob();
  dom.genStatus.classList.remove('gen-status--complete');

  dom.draftResumeEmpty.classList.remove('hidden');
  dom.draftResumeContent.classList.add('hidden');
  dom.draftCLEmpty.classList.remove('hidden');
  dom.draftCLContent.classList.add('hidden');
  dom.draftMergedEmpty.classList.remove('hidden');
  dom.draftMergedContent.classList.add('hidden');
  dom.tabBtnMerged.classList.add('hidden');
  dom.btnPrintMerged.classList.add('hidden');
  clearEditState('resume');
  clearEditState('cover-letter');
  updateManualEditNotice();

  refreshExportButtons();
  switchTab('resume');
  updateOutputPanelVisibility();
  refreshJobChatEntryPoints();
  showToast('Draft cleared.');
}

function refreshRevisionButton() {
  dom.btnApplyChanges.disabled = !state.drafts[state.currentTab] || !dom.fieldRevision.value.trim();
}

function switchTab(tab) {
  state.currentTab = tab;
  dom.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  dom.tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  refreshRevisionButton();
  dom.btnRegenerate.disabled = !state.originalDrafts?.[tab];
  refreshExportButtons();
}

async function validateForGeneration(mode) {
  if (!state.settings?.provider) {
    showError(new Error('no_provider'));
    return false;
  }
  if (!dom.fieldDesc.value.trim()) {
    showError(new Error('no_job_desc'));
    return false;
  }
  if (state.settings?.provider !== 'mock' && !state.profile?.personalInfo?.fullName) {
    showError(new Error('no_profile'));
    return false;
  }
  return true;
}

function setGenerating(on) {
  if (on) {
    state.generationReceipt = null;
    dom.genStatus.classList.remove('hidden', 'gen-status--complete');
    dom.genStatus.removeAttribute('aria-label');
    const spinner = dom.genStatus.querySelector('.spinner');
    if (spinner) spinner.classList.remove('hidden');
  } else {
    clearGenerationStatusMessages();
    if (state.generationReceipt) renderGenerationReceipt();
    else dom.genStatus.classList.add('hidden');
  }

  const allGenBtns = [dom.btnGenBoth, dom.btnGenResume, dom.btnGenCL];
  const modeMap = { both: dom.btnGenBoth, resume: dom.btnGenResume, 'cover-letter': dom.btnGenCL };
  const activeBtn = modeMap[state.lastRunMode];

  if (on) {
    allGenBtns.forEach(b => {
      if (b === activeBtn) {
        b.dataset.originalText = b.textContent;
        b.textContent = '■ Stop';
        b.classList.add('btn-stop');
        b.disabled = false;
      } else {
        b.disabled = true;
      }
    });
  } else {
    allGenBtns.forEach(b => {
      b.disabled = false;
      b.classList.remove('btn-stop');
      if (b.dataset.originalText) {
        b.textContent = b.dataset.originalText;
        delete b.dataset.originalText;
      }
    });
  }
}

function startGenerationStatusMessages(type) {
  clearGenerationStatusMessages();
  dom.genStatus.classList.remove('hidden', 'gen-status--complete');
  dom.genStatus.removeAttribute('aria-label');
  const spinner = dom.genStatus.querySelector('.spinner');
  if (spinner) spinner.classList.remove('hidden');

  const isResume = type === 'resume';
  dom.genStatusText.textContent = isResume
    ? 'Tailoring resume...'
    : 'Writing cover letter...';

  if (state.settings?.provider !== 'ollama') return;

  const messages = isResume
    ? [
        { delay: 15000, text: 'Local AI is tailoring the resume. Ollama can take a minute or two depending on your computer.' },
        { delay: 45000, text: 'Still tailoring the resume. Larger job descriptions and local models can take longer.' },
        { delay: 90000, text: 'Still tailoring the resume. You can stop this run if you want to try a smaller Ollama model.' },
      ]
    : [
        { delay: 15000, text: 'Local AI is drafting the cover letter. Ollama can take a minute or two depending on your computer.' },
        { delay: 45000, text: 'Still writing the cover letter. Smaller models are faster but may need a retry.' },
        { delay: 90000, text: 'Still writing the cover letter. You can stop this run if you want to try a smaller Ollama model.' },
      ];

  generationStatusTimers = messages.map(({ delay, text }) => setTimeout(() => {
    if (!dom.genStatus.classList.contains('hidden')) {
      dom.genStatusText.textContent = text;
    }
  }, delay));
}

function clearGenerationStatusMessages() {
  generationStatusTimers.forEach(timerId => clearTimeout(timerId));
  generationStatusTimers = [];
}

function clearJobChatPatienceTimers() {
  jobChatPatienceTimers.forEach(clearTimeout);
  jobChatPatienceTimers = [];
}

function startJobChatPatienceTimers(pendingEl) {
  if (state.settings?.provider !== 'ollama') return;
  const messages = [
    { delay: 10000, text: 'Ollama is thinking — this can take a moment depending on your computer.' },
    { delay: 30000, text: 'Still waiting. Larger models take longer on local hardware.' },
    { delay: 60000, text: 'Taking a while. Press Stop to cancel and try a smaller Ollama model like qwen2.5:3b.' },
  ];
  jobChatPatienceTimers = messages.map(({ delay, text }) =>
    setTimeout(() => {
      if (pendingEl.classList.contains('job-chat-msg--thinking')) pendingEl.textContent = text;
    }, delay)
  );
}

async function clearSavedGenerationReceipt() {
  try {
    const savedDraft = await loadScopedSavedDraft();
    if (!savedDraft?.generationReceipt) return;
    await persistSavedDraftSnapshot({
      ...savedDraft,
      generationReceipt: null,
    }, { toastOnQuota: false });
  } catch (err) {
    console.warn('Could not clear previous generation receipt:', err?.message || err);
  }
}

function createGenerationReceipt(mode, startedAt, completedAt) {
  const provider = state.settings?.provider || 'unknown';
  const modelName = state.settings?.modelName || defaultModelForProvider(provider);
  return {
    mode,
    provider,
    providerLabel: providerLabel(provider),
    modelName,
    modelLabel: modelLabel(provider, modelName),
    documentLabel: generatedDocumentLabel(mode),
    completedAt: new Date(completedAt).toISOString(),
    elapsedMs: Math.max(0, completedAt - startedAt),
  };
}

function renderGenerationReceipt(receipt = state.generationReceipt) {
  if (!receipt) {
    dom.genStatus.classList.add('hidden');
    return;
  }

  const spinner = dom.genStatus.querySelector('.spinner');
  if (spinner) spinner.classList.add('hidden');

  const provider = receipt.providerLabel || providerLabel(receipt.provider);
  const model = receipt.modelLabel || modelLabel(receipt.provider, receipt.modelName);
  const completedAt = formatCompletedAt(receipt.completedAt);
  const elapsed = formatElapsedTime(receipt.elapsedMs);

  dom.genStatus.classList.remove('hidden');
  dom.genStatus.classList.add('gen-status--complete');
  dom.genStatusText.textContent = `${receipt.documentLabel || 'Draft'} completed by ${provider} with ${model} at ${completedAt}. Took ${elapsed}.`;
}

function generatedDocumentLabel(mode) {
  if (mode === 'both') return 'Drafts';
  if (mode === 'resume') return 'Resume draft';
  if (mode === 'cover-letter') return 'Cover letter draft';
  return 'Draft';
}

function providerLabel(provider) {
  const labels = {
    mock: 'Demo Mode',
    openai: 'OpenAI',
    gemini: 'Gemini',
    openrouter: 'OpenRouter',
    ollama: 'Ollama',
  };
  return labels[provider] || provider || 'AI provider';
}

function defaultModelForProvider(provider) {
  const defaults = {
    mock: 'sample generator',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-2.5-flash',
    openrouter: 'anthropic/claude-3.5-haiku',
    ollama: 'llama3',
  };
  return defaults[provider] || 'selected model';
}

function modelLabel(provider, modelName) {
  if (provider === 'mock') return 'sample generator';
  return modelName || 'selected model';
}

function formatCompletedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'just now';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatElapsedTime(elapsedMs = 0) {
  const totalSeconds = Math.max(1, Math.round(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  if (!seconds) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function showError(err) {
  const mapped = mapError(err);
  // Only log to console.error for unexpected runtime errors, not validation messages
  if (err instanceof Error && mapped.action === 'retry') console.error('[JPDA]', err.message);
  else if (mapped.action !== 'settings') console.warn('[JPDA]', mapped.message);
  dom.genErrorMessage.textContent = `⚠️ ${mapped.message}`;
  dom.btnErrorRetry.classList.toggle('hidden', mapped.action !== 'retry');
  dom.btnErrorSettings.classList.toggle('hidden', mapped.action !== 'settings');
  const settingsSection = mapped.settingsSection || 'provider';
  dom.btnErrorSettings.dataset.section = settingsSection;
  const settingsButtonLabels = {
    provider: 'Open AI Provider',
    profile: 'Open My Profile',
    profiles: 'Open Manage Profiles',
    documents: 'Open Documents',
  };
  dom.btnErrorSettings.textContent = settingsButtonLabels[settingsSection] || 'Open Settings';
  dom.btnErrorDemo.classList.toggle('hidden', mapped.type !== 'setup_required');
  dom.genError.classList.remove('hidden');
  setGenerating(false);
}

function hideError() { dom.genError.classList.add('hidden'); }

function refreshExportButtons() {
  const hasResume = !!state.drafts.resume;
  const hasCL = !!state.drafts['cover-letter'];
  dom.btnPrintBoth.disabled = !(hasResume && hasCL);
  dom.btnPrintResume.disabled = !hasResume;
  dom.btnPrintCL.disabled = !hasCL;
  dom.btnPrintMerged.disabled = !(hasResume && hasCL);
  dom.btnAtsScan.disabled = !hasResume || !state.jobData.description;
  dom.btnPrepareEmail.disabled = !state.jobData.description;
  dom.btnPrepareEmail.title = state.jobData.description
    ? 'Prepare a draft application email using AI'
    : 'Scan or paste a job posting first';
}

// ── Application Email Assistant ───────────────────────────────────────────

function openEmailAssistant() {
  dom.emailAssistantView.classList.add('visible');
  runEmailGeneration();
}

function closeEmailAssistant() {
  dom.emailAssistantView.classList.remove('visible');
  if (currentEmailController) {
    currentEmailController.abort();
    currentEmailController = null;
  }
}

async function runEmailGeneration() {
  if (!state.jobData.description) {
    showToast('Scan or paste a job posting first.');
    return;
  }
  if (!state.settings?.provider) {
    setEmailState('error', 'No AI provider configured. Open Settings to set one up.');
    return;
  }

  if (currentEmailController) currentEmailController.abort();
  currentEmailController = new AbortController();

  setEmailState('loading');

  try {
    const options = {
      resumeGenerated: Boolean(state.drafts.resume),
      coverLetterGenerated: Boolean(state.drafts['cover-letter']),
      extraInstructions: dom.emailExtraInstructions.value.trim(),
    };

    const raw = await prepareApplicationEmail(
      state.jobData,
      state.profile,
      state.settings,
      options,
      currentEmailController.signal,
    );

    const parsed = tryParseJson(raw);
    if (!parsed) {
      setEmailState('error', 'AI returned an unreadable response. Try regenerating.');
      return;
    }

    const result = normalizeEmailResult(parsed);
    renderEmailPanel(result, options);
    setEmailState('result');
  } catch (err) {
    if (err?.name === 'AbortError') return;
    const msg = mapError(err).message;
    setEmailState('error', msg);
  }
}

function setEmailState(which, errorMsg) {
  dom.emailPanelLoading.classList.toggle('hidden', which !== 'loading');
  dom.emailPanelError.classList.toggle('hidden', which !== 'error');
  dom.emailPanelResult.classList.toggle('hidden', which !== 'result');
  dom.btnRegenEmail.disabled = which === 'loading';
  if (which === 'error' && errorMsg) dom.emailPanelErrorMsg.textContent = errorMsg;
}

function normalizeEmailResult(parsed) {
  const toArr = v => Array.isArray(v) ? v.filter(s => s != null).map(String) : (v ? [String(v)] : []);
  const toStr = (v, fallback = '') => (typeof v === 'string' && v.trim()) ? v.trim() : fallback;
  const method = ['email', 'website', 'unknown'].includes(parsed.applicationMethod)
    ? parsed.applicationMethod : 'unknown';

  const recipientEmail = (typeof parsed.recipientEmail === 'string' && parsed.recipientEmail.includes('@'))
    ? parsed.recipientEmail.trim() : null;

  const subject = toStr(parsed.subject, 'Application for [Job Title]');
  const emailBody = toStr(parsed.emailBody, 'Please find attached my resume for your review.');

  const mailtoUrl = buildMailtoUrl(recipientEmail, subject, emailBody);

  const screeningQuestions = toArr(parsed.screeningQuestions).map(q => {
    if (typeof q !== 'object' || !q) return null;
    return {
      question: toStr(q.question),
      suggestedAnswer: (typeof q.suggestedAnswer === 'string' && q.suggestedAnswer.trim()) ? q.suggestedAnswer.trim() : null,
      needsUserConfirmation: Boolean(q.needsUserConfirmation),
      reason: toStr(q.reason),
    };
  }).filter(q => q && q.question);

  return {
    hasSpecialInstructions: Boolean(parsed.hasSpecialInstructions),
    applicationMethod: method,
    recipientEmail,
    subject,
    emailBody,
    detectedInstructionsSummary: toArr(parsed.detectedInstructionsSummary),
    requiredItems: toArr(parsed.requiredItems),
    screeningQuestions,
    attachmentsReminder: toArr(parsed.attachmentsReminder),
    warnings: toArr(parsed.warnings),
    mailtoRecommended: recipientEmail !== null && method === 'email' && mailtoUrl !== null,
    mailtoUrl,
  };
}

function buildMailtoUrl(recipientEmail, subject, body) {
  if (!recipientEmail) return null;
  const url = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return url.length <= 2000 ? url : null;
}

function renderEmailPanel(result, options = {}) {
  // Context banner
  const banner = dom.emailContextBanner;
  banner.className = 'email-context-banner';
  if (result.hasSpecialInstructions) {
    banner.classList.add('email-context-banner--special');
    banner.textContent = 'Special application instructions found. Review carefully before sending.';
  } else {
    banner.classList.add('email-context-banner--generic');
    banner.textContent = 'No special application instructions were detected. A standard application email is shown below.';
  }

  // Document generation warnings
  const missing = [];
  if (!options.resumeGenerated) missing.push('You have not generated a resume yet — generate one before sending your application.');
  if (!options.coverLetterGenerated) missing.push('You have not generated a cover letter yet — consider generating one before sending.');
  if (missing.length) {
    dom.emailDocsMissing.textContent = missing.join(' ');
    dom.emailDocsMissing.classList.remove('hidden');
  } else {
    dom.emailDocsMissing.classList.add('hidden');
  }

  // Recipient
  if (result.recipientEmail) {
    dom.emailRecipientDisplay.value = result.recipientEmail;
    dom.emailRecipientGroup.classList.remove('hidden');
  } else {
    dom.emailRecipientGroup.classList.add('hidden');
  }

  // Subject and body
  dom.emailSubjectDisplay.value = result.subject;
  dom.emailBodyDisplay.value = result.emailBody;

  // Required checklist
  if (result.requiredItems.length) {
    dom.emailChecklist.innerHTML = result.requiredItems
      .map(item => `<li>${esc(item)}</li>`).join('');
    dom.emailChecklistGroup.classList.remove('hidden');
  } else {
    dom.emailChecklistGroup.classList.add('hidden');
  }

  // Screening questions
  if (result.screeningQuestions.length) {
    dom.emailQuestionsList.innerHTML = result.screeningQuestions.map(q => {
      const answer = q.suggestedAnswer
        ? `<div class="email-question-answer">${esc(q.suggestedAnswer)}</div>`
        : `<div class="email-question-answer">[Please confirm: fill in your answer]</div>`;
      const badge = q.needsUserConfirmation
        ? `<span class="email-confirm-badge">Needs your confirmation</span>`
        : '';
      return `<div class="email-question-card">
        <div class="email-question-text">${esc(q.question)}</div>
        ${answer}
        ${badge}
      </div>`;
    }).join('');
    dom.emailQuestionsGroup.classList.remove('hidden');
  } else {
    dom.emailQuestionsGroup.classList.add('hidden');
  }

  // Attachments
  if (result.attachmentsReminder.length) {
    dom.emailAttachmentsList.innerHTML = result.attachmentsReminder
      .map(item => `<li>${esc(item)}</li>`).join('');
    dom.emailAttachmentsGroup.classList.remove('hidden');
  } else {
    dom.emailAttachmentsGroup.classList.add('hidden');
  }

  // Warnings
  if (result.warnings.length) {
    dom.emailWarningsList.innerHTML = result.warnings
      .map(w => `<li>${esc(w)}</li>`).join('');
    dom.emailWarningsGroup.classList.remove('hidden');
  } else {
    dom.emailWarningsGroup.classList.add('hidden');
  }

  // mailto button
  if (result.mailtoRecommended && result.mailtoUrl) {
    dom.btnOpenEmailApp.href = result.mailtoUrl;
    dom.btnOpenEmailApp.classList.remove('hidden');
    dom.emailMailtoTooLong.classList.add('hidden');
  } else if (result.applicationMethod === 'email' && result.recipientEmail && !result.mailtoUrl) {
    dom.btnOpenEmailApp.classList.add('hidden');
    dom.emailMailtoTooLong.classList.remove('hidden');
  } else {
    dom.btnOpenEmailApp.classList.add('hidden');
    dom.emailMailtoTooLong.classList.add('hidden');
  }
}

function copyEmailField(text, label) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => showToast(label)).catch(() => showToast('Copy failed — try selecting and copying manually.'));
}

function copyEmailChecklist() {
  const items = [...dom.emailChecklist.querySelectorAll('li')]
    .map(li => `• ${li.textContent}`).join('\n');
  if (!items) return;
  navigator.clipboard.writeText(items).then(() => showToast('Checklist copied')).catch(() => showToast('Copy failed.'));
}

// Recruiter message

async function openRecruiterMessageFromSavedJob(id) {
  if (!id) return;

  const requestId = ++currentRecruiterRequestId;
  dom.jobsView.classList.remove('visible');
  dom.recruiterMessageView.classList.add('visible');
  currentRecruiterJob = null;
  setRecruiterState('loading');

  try {
    currentRecruiterJob = await loadSavedJobForRecruiterMessage(id);
    if (requestId !== currentRecruiterRequestId) return;
    await runRecruiterMessageGeneration();
  } catch (err) {
    if (requestId !== currentRecruiterRequestId) return;
    setRecruiterState('error', err?.message || 'Saved job could not be loaded.');
  }
}

function closeRecruiterMessage() {
  currentRecruiterRequestId += 1;
  dom.recruiterMessageView.classList.remove('visible');
  currentRecruiterJob = null;
  if (currentRecruiterController) {
    currentRecruiterController.abort();
    currentRecruiterController = null;
  }
}

async function loadSavedJobForRecruiterMessage(id) {
  const data = await chrome.storage.local.get(SAVED_JOBS_KEY);
  const savedJobs = Array.isArray(data[SAVED_JOBS_KEY]) ? data[SAVED_JOBS_KEY] : [];
  const job = savedJobs.find(item => item.id === id);
  if (!job) throw new Error('Saved job not found.');

  return {
    id: job.id,
    jobTitle: job.title || '',
    company: job.company || '',
    sourceUrl: job.sourceUrl || '',
    description: job.cleanDescription || job.rawContent || '',
  };
}

async function runRecruiterMessageGeneration() {
  if (!currentRecruiterJob) {
    setRecruiterState('error', 'Saved job could not be loaded.');
    return;
  }

  state.settings = await loadSettings();
  state.profile = await loadProfile();
  await refreshSourceResumeState();

  if (!state.settings?.provider) {
    setRecruiterState('error', 'No AI provider configured. Open Settings to set one up.');
    return;
  }

  if (currentRecruiterController) currentRecruiterController.abort();
  const controller = new AbortController();
  currentRecruiterController = controller;

  setRecruiterState('loading');

  try {
    const raw = await generateRecruiterMessage(
      currentRecruiterJob,
      state.profile,
      state.settings,
      controller.signal,
      state.sourceResumeText
    );
    const parsed = tryParseJson(raw);
    if (!parsed) {
      setRecruiterState('error', 'AI returned an unreadable response. Try regenerating.');
      return;
    }

    renderRecruiterPanel(normalizeRecruiterMessageResult(parsed));
    setRecruiterState('result');
  } catch (err) {
    if (err?.name === 'AbortError') return;
    setRecruiterState('error', mapError(err).message);
  } finally {
    if (currentRecruiterController === controller) currentRecruiterController = null;
  }
}

function setRecruiterState(which, errorMsg) {
  dom.recruiterPanelLoading.classList.toggle('hidden', which !== 'loading');
  dom.recruiterPanelError.classList.toggle('hidden', which !== 'error');
  dom.recruiterPanelResult.classList.toggle('hidden', which !== 'result');
  dom.btnRegenRecruiterMessage.disabled = which === 'loading';
  if (which === 'error' && errorMsg) dom.recruiterPanelErrorMsg.textContent = errorMsg;
}

function normalizeRecruiterMessageResult(parsed) {
  const toArr = v => Array.isArray(v)
    ? v.filter(s => s != null).map(String).map(s => s.trim()).filter(Boolean)
    : (v ? [String(v).trim()].filter(Boolean) : []);
  const toStr = v => (typeof v === 'string' && v.trim()) ? v.trim() : '';
  return {
    subject: toStr(parsed.subject),
    messageBody: toStr(parsed.messageBody || parsed.body || parsed.message) || 'Hello,\n\nI am interested in this opportunity and would appreciate the chance to connect.\n\nThank you.',
    warnings: toArr(parsed.warnings),
    notes: toArr(parsed.notes),
  };
}

function renderRecruiterPanel(result) {
  dom.recruiterContextBanner.textContent = 'Initial outreach draft. Review before copying. Nothing is sent automatically.';

  if (result.subject) {
    dom.recruiterSubjectDisplay.value = result.subject;
    dom.recruiterSubjectGroup.classList.remove('hidden');
  } else {
    dom.recruiterSubjectDisplay.value = '';
    dom.recruiterSubjectGroup.classList.add('hidden');
  }

  dom.recruiterBodyDisplay.value = result.messageBody;

  if (result.warnings.length) {
    dom.recruiterWarningsList.innerHTML = result.warnings
      .map(warning => `<li>${esc(warning)}</li>`).join('');
    dom.recruiterWarningsGroup.classList.remove('hidden');
  } else {
    dom.recruiterWarningsGroup.classList.add('hidden');
  }

  if (result.notes.length) {
    dom.recruiterNotesList.innerHTML = result.notes
      .map(note => `<li>${esc(note)}</li>`).join('');
    dom.recruiterNotesGroup.classList.remove('hidden');
  } else {
    dom.recruiterNotesGroup.classList.add('hidden');
  }
}

// Follow-up message

async function openFollowUpMessageFromSavedJob(id) {
  if (!id) return;

  const requestId = ++currentFollowUpRequestId;
  dom.jobsView.classList.remove('visible');
  dom.followUpMessageView.classList.add('visible');
  currentFollowUpJob = null;
  setFollowUpState('loading');

  try {
    currentFollowUpJob = await loadSavedJobForFollowUp(id);
    if (requestId !== currentFollowUpRequestId) return;
    await runFollowUpMessageGeneration();
  } catch (err) {
    if (requestId !== currentFollowUpRequestId) return;
    setFollowUpState('error', err?.message || 'Saved job could not be loaded.');
  }
}

function closeFollowUpMessage() {
  currentFollowUpRequestId += 1;
  dom.followUpMessageView.classList.remove('visible');
  currentFollowUpJob = null;
  if (currentFollowUpController) {
    currentFollowUpController.abort();
    currentFollowUpController = null;
  }
}

async function loadSavedJobForFollowUp(id) {
  const data = await chrome.storage.local.get(SAVED_JOBS_KEY);
  const savedJobs = Array.isArray(data[SAVED_JOBS_KEY]) ? data[SAVED_JOBS_KEY] : [];
  const job = savedJobs.find(item => item.id === id);
  if (!job) throw new Error('Saved job not found.');

  return {
    id: job.id,
    jobTitle: job.title || '',
    company: job.company || '',
    sourceUrl: job.sourceUrl || '',
    description: job.cleanDescription || job.rawContent || '',
    status: job.status || 'saved',
  };
}

async function runFollowUpMessageGeneration() {
  if (!currentFollowUpJob) {
    setFollowUpState('error', 'Saved job could not be loaded.');
    return;
  }

  state.settings = await loadSettings();
  state.profile = await loadProfile();
  await refreshSourceResumeState();

  if (!state.settings?.provider) {
    setFollowUpState('error', 'No AI provider configured. Open Settings to set one up.');
    return;
  }

  if (currentFollowUpController) currentFollowUpController.abort();
  const controller = new AbortController();
  currentFollowUpController = controller;

  setFollowUpState('loading');

  try {
    const raw = await generateFollowUpMessage(
      currentFollowUpJob,
      state.profile,
      state.settings,
      controller.signal,
      state.sourceResumeText
    );
    const parsed = tryParseJson(raw);
    if (!parsed) {
      setFollowUpState('error', 'AI returned an unreadable response. Try regenerating.');
      return;
    }

    renderFollowUpPanel(normalizeFollowUpResult(parsed));
    setFollowUpState('result');
  } catch (err) {
    if (err?.name === 'AbortError') return;
    setFollowUpState('error', mapError(err).message);
  } finally {
    if (currentFollowUpController === controller) currentFollowUpController = null;
  }
}

function setFollowUpState(which, errorMsg) {
  dom.followUpPanelLoading.classList.toggle('hidden', which !== 'loading');
  dom.followUpPanelError.classList.toggle('hidden', which !== 'error');
  dom.followUpPanelResult.classList.toggle('hidden', which !== 'result');
  dom.btnRegenFollowUpMessage.disabled = which === 'loading';
  if (which === 'error' && errorMsg) dom.followUpPanelErrorMsg.textContent = errorMsg;
}

function normalizeFollowUpResult(parsed) {
  const toArr = v => Array.isArray(v)
    ? v.filter(s => s != null).map(String).map(s => s.trim()).filter(Boolean)
    : (v ? [String(v).trim()].filter(Boolean) : []);
  const toStr = v => (typeof v === 'string' && v.trim()) ? v.trim() : '';
  return {
    subject: toStr(parsed.subject),
    messageBody: toStr(parsed.messageBody || parsed.body || parsed.message) || 'Hello,\n\nI wanted to follow up on my interest in this opportunity and would welcome the chance to connect.\n\nThank you.',
    warnings: toArr(parsed.warnings),
    notes: toArr(parsed.notes),
  };
}

function followUpStatusLabel(status) {
  if (status === 'applied') return 'Application follow-up draft. Review before copying. Nothing is sent automatically.';
  if (status === 'rejected') return 'Post-outcome follow-up draft. Review before copying. Nothing is sent automatically.';
  return 'Interest follow-up draft. Review before copying. Nothing is sent automatically.';
}

function renderFollowUpPanel(result) {
  dom.followUpContextBanner.textContent = followUpStatusLabel(currentFollowUpJob?.status);

  if (result.subject) {
    dom.followUpSubjectDisplay.value = result.subject;
    dom.followUpSubjectGroup.classList.remove('hidden');
  } else {
    dom.followUpSubjectDisplay.value = '';
    dom.followUpSubjectGroup.classList.add('hidden');
  }

  dom.followUpBodyDisplay.value = result.messageBody;

  if (result.warnings.length) {
    dom.followUpWarningsList.innerHTML = result.warnings
      .map(warning => `<li>${esc(warning)}</li>`).join('');
    dom.followUpWarningsGroup.classList.remove('hidden');
  } else {
    dom.followUpWarningsGroup.classList.add('hidden');
  }

  if (result.notes.length) {
    dom.followUpNotesList.innerHTML = result.notes
      .map(note => `<li>${esc(note)}</li>`).join('');
    dom.followUpNotesGroup.classList.remove('hidden');
  } else {
    dom.followUpNotesGroup.classList.add('hidden');
  }
}

// Application answers

async function openApplicationAnswersFromSavedJob(id) {
  if (!id) return;

  const requestId = ++currentAppAnswersRequestId;
  dom.jobsView.classList.remove('visible');
  dom.appAnswersView.classList.add('visible');
  currentAppAnswersJob = null;
  setAppAnswersState('loading');

  try {
    currentAppAnswersJob = await loadSavedJobForAnswers(id);
    if (requestId !== currentAppAnswersRequestId) return;
    await runApplicationAnswersGeneration();
  } catch (err) {
    if (requestId !== currentAppAnswersRequestId) return;
    setAppAnswersState('error', err?.message || 'Saved job could not be loaded.');
  }
}

function closeApplicationAnswers() {
  currentAppAnswersRequestId += 1;
  dom.appAnswersView.classList.remove('visible');
  currentAppAnswersJob = null;
  if (currentAppAnswersController) {
    currentAppAnswersController.abort();
    currentAppAnswersController = null;
  }
}

async function loadSavedJobForAnswers(id) {
  const data = await chrome.storage.local.get(SAVED_JOBS_KEY);
  const savedJobs = Array.isArray(data[SAVED_JOBS_KEY]) ? data[SAVED_JOBS_KEY] : [];
  const job = savedJobs.find(item => item.id === id);
  if (!job) throw new Error('Saved job not found.');

  return {
    id: job.id,
    jobTitle: job.title || '',
    company: job.company || '',
    sourceUrl: job.sourceUrl || '',
    description: job.cleanDescription || job.rawContent || '',
  };
}

async function runApplicationAnswersGeneration() {
  if (!currentAppAnswersJob) {
    setAppAnswersState('error', 'Saved job could not be loaded.');
    return;
  }

  state.settings = await loadSettings();
  state.profile = await loadProfile();
  await refreshSourceResumeState();

  if (!state.settings?.provider) {
    setAppAnswersState('error', 'No AI provider configured. Open Settings to set one up.');
    return;
  }

  if (currentAppAnswersController) currentAppAnswersController.abort();
  const controller = new AbortController();
  currentAppAnswersController = controller;

  setAppAnswersState('loading');

  try {
    const raw = await generateApplicationAnswers(
      currentAppAnswersJob,
      state.profile,
      state.settings,
      controller.signal,
      state.sourceResumeText
    );
    const parsed = tryParseJson(raw);
    if (!parsed) {
      setAppAnswersState('error', 'AI returned an unreadable response. Try regenerating.');
      return;
    }

    renderAnswersPanel(normalizeAnswersResult(parsed));
    setAppAnswersState('result');
  } catch (err) {
    if (err?.name === 'AbortError') return;
    setAppAnswersState('error', mapError(err).message);
  } finally {
    if (currentAppAnswersController === controller) currentAppAnswersController = null;
  }
}

function setAppAnswersState(which, errorMsg) {
  dom.appAnswersPanelLoading.classList.toggle('hidden', which !== 'loading');
  dom.appAnswersPanelError.classList.toggle('hidden', which !== 'error');
  dom.appAnswersPanelResult.classList.toggle('hidden', which !== 'result');
  dom.btnRegenAppAnswers.disabled = which === 'loading';
  if (which === 'error' && errorMsg) dom.appAnswersPanelErrorMsg.textContent = errorMsg;
}

function normalizeAnswersResult(parsed) {
  const toArr = v => Array.isArray(v)
    ? v.filter(s => s != null).map(String).map(s => s.trim()).filter(Boolean)
    : (v ? [String(v).trim()].filter(Boolean) : []);
  const toStr = v => (typeof v === 'string' && v.trim()) ? v.trim() : null;

  const rawAnswers = Array.isArray(parsed.answers) ? parsed.answers : [];

  const answers = PRESET_QUESTIONS.map((question, i) => {
    const found = rawAnswers[i] || rawAnswers.find(a => String(a?.question || '').includes(question.slice(0, 20))) || {};
    const needsUserInput = Boolean(found.needsUserInput);
    return {
      question,
      answer: needsUserInput ? null : (toStr(found.answer) || null),
      needsUserInput,
      inputNeeded: toStr(found.inputNeeded),
      warnings: toArr(found.warnings),
    };
  });

  return {
    answers,
    notes: toArr(parsed.notes),
    warnings: toArr(parsed.warnings),
  };
}

function renderAnswersPanel(result) {
  dom.appAnswersContextBanner.textContent = 'Review each answer before copying. Nothing is submitted automatically.';

  const cards = result.answers.map(item => {
    const warningHtml = item.warnings.length
      ? `<ul class="app-answers-card-warnings">${item.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>`
      : '';

    if (item.needsUserInput) {
      const needsText = item.inputNeeded
        ? esc(item.inputNeeded)
        : 'Add your own answer below, then copy it.';
      return `
        <div class="app-answers-card">
          <div class="app-answers-question">${esc(item.question)}</div>
          <div class="app-answers-needs-input">Needs your input: ${needsText}</div>
          <textarea class="app-answers-textarea" aria-label="${esc('Your answer: ' + item.question)}" placeholder="Type your answer here…"></textarea>
          ${warningHtml}
          <div class="app-answers-card-footer">
            <button class="btn-copy app-answers-copy-btn" type="button">Copy answer</button>
          </div>
        </div>`;
    }

    return `
      <div class="app-answers-card">
        <div class="app-answers-question">${esc(item.question)}</div>
        <textarea class="app-answers-textarea" readonly aria-label="${esc('Suggested answer: ' + item.question)}">${esc(item.answer || '')}</textarea>
        ${warningHtml}
        <div class="app-answers-card-footer">
          <button class="btn-copy app-answers-copy-btn" type="button">Copy answer</button>
        </div>
      </div>`;
  });

  if (result.warnings.length) {
    const warningBlock = `<div class="app-answers-top-warnings email-section email-section--warning">
      <ul class="email-list email-list--warning">${result.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
    </div>`;
    cards.unshift(warningBlock);
  }

  if (result.notes.length) {
    const notesBlock = `<div class="app-answers-top-notes email-section">
      <ul class="email-list">${result.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    </div>`;
    cards.push(notesBlock);
  }

  dom.appAnswersList.innerHTML = cards.join('');

  dom.appAnswersList.querySelectorAll('.app-answers-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const textarea = btn.closest('.app-answers-card')?.querySelector('.app-answers-textarea');
      if (textarea) copyEmailField(textarea.value, 'Answer copied');
    });
  });
}

// Reminder text

async function openReminderTextFromSavedJob(id) {
  if (!id) return;

  const requestId = ++currentReminderRequestId;
  dom.jobsView.classList.remove('visible');
  dom.reminderTextView.classList.add('visible');
  dom.reminderPanelError.classList.add('hidden');
  dom.reminderPanelResult.classList.add('hidden');

  try {
    const job = await loadSavedJobForReminder(id);
    if (requestId !== currentReminderRequestId) return;
    renderReminderPanel(computeReminderResult(job));
    dom.reminderPanelResult.classList.remove('hidden');
  } catch (err) {
    if (requestId !== currentReminderRequestId) return;
    dom.reminderPanelErrorMsg.textContent = err?.message || 'Saved job could not be loaded.';
    dom.reminderPanelError.classList.remove('hidden');
  }
}

function closeReminderText() {
  currentReminderRequestId += 1;
  dom.reminderTextView.classList.remove('visible');
}

async function loadSavedJobForReminder(id) {
  const data = await chrome.storage.local.get(SAVED_JOBS_KEY);
  const savedJobs = Array.isArray(data[SAVED_JOBS_KEY]) ? data[SAVED_JOBS_KEY] : [];
  const job = savedJobs.find(item => item.id === id);
  if (!job) throw new Error('Saved job not found.');
  return {
    id: job.id,
    jobTitle: job.title || '',
    company: job.company || '',
    status: job.status || 'saved',
  };
}

function computeReminderResult(job) {
  const status = job.status;
  const title = job.jobTitle || 'this role';
  const company = job.company || 'this organization';

  function addDays(d, n) {
    const result = new Date(d);
    result.setDate(result.getDate() + n);
    return result;
  }

  function formatDate(d) {
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  const today = new Date();

  if (status === 'applied') {
    return {
      timing: 'Follow up about 7 days after applying, unless the posting gave a different timeline.',
      suggestedDate: formatDate(addDays(today, 7)),
      reminderTitle: `Follow up on ${title} at ${company}`,
      reminderText: `Check in politely about the hiring timeline or next steps for the ${title} role at ${company}.`,
    };
  }

  if (status === 'ready_to_apply') {
    return {
      timing: 'Apply within the next 1–2 days if you are still interested.',
      suggestedDate: formatDate(addDays(today, 1)),
      reminderTitle: `Apply for ${title} at ${company}`,
      reminderText: `Review your resume and cover letter and submit the application for ${title} at ${company}.`,
    };
  }

  if (status === 'rejected') {
    return {
      timing: 'No follow-up reminder recommended by default.',
      suggestedDate: null,
      reminderTitle: 'No reminder suggested',
      reminderText: `You may archive this job or keep it for reference. Consider looking for similar roles.`,
    };
  }

  // saved / needs_review / unknown
  return {
    timing: 'Review this saved job within 2–3 days.',
    suggestedDate: formatDate(addDays(today, 3)),
    reminderTitle: `Review saved job: ${title} at ${company}`,
    reminderText: `Review the job posting, decide whether to apply, and prepare application materials if it still looks like a good fit.`,
  };
}

function renderReminderPanel(result) {
  dom.reminderTimingNote.textContent = result.timing;

  if (result.suggestedDate) {
    dom.reminderDateDisplay.textContent = result.suggestedDate;
    dom.reminderDateGroup.classList.remove('hidden');
  } else {
    dom.reminderDateGroup.classList.add('hidden');
  }

  dom.reminderTitleDisplay.value = result.reminderTitle;
  dom.reminderBodyDisplay.value = result.reminderText;
}

// ── ATS Check ─────────────────────────────────────────────────────────────

async function runAtsCheck() {
  if (!state.drafts.resume || !state.jobData.description) return;
  if (!state.settings?.provider) {
    showError(new Error('no_provider'));
    return;
  }

  dom.atsStatus.classList.remove('hidden');
  dom.atsResults.classList.add('hidden');
  dom.atsEmpty.classList.add('hidden');
  dom.btnAtsScan.disabled = true;

  try {
    const keywords = await extractAtsKeywords(state.jobData.description, state.settings);
    if (!keywords.length) {
      showToast('⚠️ Could not extract keywords from job description.');
      dom.atsEmpty.classList.remove('hidden');
      return;
    }

    const resumeText = JSON.stringify(state.drafts.resume).toLowerCase();
    const keywordMatches = kw => {
      const lower = kw.toLowerCase();
      if (resumeText.includes(lower)) return true;
      const words = lower.split(/\s+/).filter(w => w.length > 2);
      return words.length > 1 && words.every(w => resumeText.includes(w));
    };
    const matched = keywords.filter(keywordMatches);
    const missing  = keywords.filter(k => !keywordMatches(k));
    renderAtsResults(matched, missing, keywords.length);
  } catch {
    showToast('⚠️ ATS scan failed.');
    dom.atsEmpty.classList.remove('hidden');
  } finally {
    dom.atsStatus.classList.add('hidden');
    dom.btnAtsScan.disabled = !state.drafts.resume || !state.jobData.description;
  }
}

function renderAtsResults(matched, missing, total) {
  dom.atsResults.classList.remove('hidden');
  dom.atsScore.textContent = `${matched.length} of ${total} keywords matched`;

  // Matched — display only
  if (matched.length) {
    dom.atsMatchedGroup.classList.remove('hidden');
    dom.atsMatchedChips.innerHTML = matched.map(k => {
      const span = document.createElement('span');
      span.className = 'ats-chip ats-chip--matched';
      span.textContent = k;
      return span.outerHTML;
    }).join('');
  } else {
    dom.atsMatchedGroup.classList.add('hidden');
  }

  // Missing — interactive buttons, all pre-selected by default
  if (missing.length) {
    dom.atsMissingGroup.classList.remove('hidden');
    dom.atsMissingChips.innerHTML = '';
    missing.forEach(k => {
      const btn = document.createElement('button');
      btn.className = 'ats-chip ats-chip--missing';
      btn.type = 'button';
      btn.textContent = k;
      btn.addEventListener('click', () => {
        btn.classList.toggle('ats-chip--deselected');
        updateAtsApplyButton();
      });
      dom.atsMissingChips.appendChild(btn);
    });
    dom.atsApplyRow.classList.remove('hidden');
    updateAtsApplyButton();
  } else {
    dom.atsMissingGroup.classList.add('hidden');
    dom.atsApplyRow.classList.add('hidden');
  }
}

function updateAtsApplyButton() {
  const count = dom.atsMissingChips.querySelectorAll('.ats-chip--missing:not(.ats-chip--deselected)').length;
  dom.btnAtsApply.textContent = `Apply ${count} keyword${count !== 1 ? 's' : ''} to resume`;
  dom.btnAtsApply.disabled = count === 0;
}

function applyAtsKeywords() {
  const selected = Array.from(
    dom.atsMissingChips.querySelectorAll('.ats-chip--missing:not(.ats-chip--deselected)')
  ).map(el => el.textContent.trim());

  if (!selected.length) return;

  switchTab('resume');
  state.atsRevision = true;
  dom.fieldRevision.value = `Naturally incorporate the following keywords into the resume where they genuinely apply to my experience: ${selected.join(', ')}`;
  refreshRevisionButton();
  document.getElementById('card-revision').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  dom.fieldRevision.focus();
  showToast('✦ Keywords added to Refine — review and click Apply Changes.');
}

let toastTimer;
function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.remove('hidden');
  // Small delay to allow 'hidden' removal to take effect before adding 'show' for transition
  requestAnimationFrame(() => {
    dom.toast.classList.add('show');
  });

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
    // Wait for transition to finish before hiding
    setTimeout(() => {
      if (!dom.toast.classList.contains('show')) {
        dom.toast.classList.add('hidden');
      }
    }, 400);
  }, 3000);
}

async function loadSettings() {
  const stored = await loadProviderSettings();
  const provider = stored.activeProvider || '';
  if (!provider) return null;
  const config = (stored.configs || {})[provider] || {};
  return {
    provider,
    apiKey:          config.apiKey    || '',
    modelName:       config.modelName || '',
    endpoint:        config.endpoint  || '',
    simulateFailure: stored.simulateFailure || 'none',
  };
}

async function populateProfileStrip() {
  const { profiles, activeId } = await loadProfiles();
  state.profileIndex = profiles;  // keep in sync for Fit Check profile selector
  const activeProfile = profiles.find(p => p.id === activeId) || profiles[0];
  dom.profileSwitcher.textContent = activeProfile?.name || 'General';
  dom.profileSwitcher.dataset.profileId = activeProfile?.id || '';
  dom.profileMenuList.innerHTML = '';

  profiles.forEach(p => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'profile-menu-option';
    btn.dataset.profileId = p.id;
    btn.textContent = p.name;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', String(p.id === activeProfile?.id));
    btn.classList.toggle('active', p.id === activeProfile?.id);
    dom.profileMenuList.appendChild(btn);
  });
}

function openProfileMenu() {
  dom.profileMenuList.classList.remove('hidden');
  dom.profileSwitcher.setAttribute('aria-expanded', 'true');
}

function closeProfileMenu() {
  dom.profileMenuList.classList.add('hidden');
  dom.profileSwitcher.setAttribute('aria-expanded', 'false');
}

function toggleProfileMenu() {
  if (dom.profileMenuList.classList.contains('hidden')) openProfileMenu();
  else closeProfileMenu();
}

async function switchToProfile(profileId) {
  if (!profileId) return;
  if (profileId === dom.profileSwitcher.dataset.profileId) {
    closeProfileMenu();
    return;
  }

  clearUndoSnapshot();
  clearAllStaleMarkers();

  state.profile = await switchProfile(profileId);
  await refreshSourceResumeState();
  await populateProfileStrip();
  closeProfileMenu();

  // Re-run autofill matching so the review overlay reflects the new profile,
  // consistent with the same logic in the settings-close handler.
  if (state.autofillFields.length > 0) {
    const { matches, summary } = buildAutofillMatches(state.autofillFields, state.profile);
    state.autofillMatches = matches;
    updateAutofillStatus(state.autofillFields, summary);
  }
  refreshAutofillCard();

  showToast('✦ Profile switched.');
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark')  root.dataset.theme = 'dark';
  else if (theme === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;

  const icons  = { light: '☀️', dark: '🌙', system: '🖥️' };
  const labels = { light: 'Switch to dark mode', dark: 'Switch to system theme', system: 'Switch to light mode' };
  const t = (theme === 'light' || theme === 'dark') ? theme : 'system';
  dom.btnTheme.textContent = icons[t];
  dom.btnTheme.title       = labels[t];
  dom.btnTheme.setAttribute('aria-label', labels[t]);
  syncEmbeddedTheme(theme);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || 'system';
  const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
}

function syncEmbeddedTheme(theme) {
  [dom.settingsFrame, document.getElementById('history-frame')].forEach(frame => {
    const root = frame?.contentDocument?.documentElement;
    if (!root) return;
    if (theme === 'dark') root.dataset.theme = 'dark';
    else if (theme === 'light') root.dataset.theme = 'light';
    else delete root.dataset.theme;
  });
}

function toneLabel(value) {
  if (value <= 20) return 'Formal';
  if (value <= 40) return 'Professional';
  if (value <= 60) return 'Balanced';
  if (value <= 80) return 'Conversational';
  return 'Casual';
}

function tryParseJson(str) {
  try {
    if (typeof str !== 'string') return null;
    // Robust parsing: find the first { and last }
    const start = str.indexOf('{');
    const end = str.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(str.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeDraftContent(type, parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return type === 'cover-letter'
    ? normalizeCoverLetterDraft(parsed)
    : normalizeResumeDraft(parsed);
}

function normalizeEducationDraft(edu, index) {
  const profileEdu = state.profile?.education?.[index] ?? {};
  return {
    institution: String(edu?.institution || profileEdu.institution || ''),
    credential:  String(edu?.credential  || edu?.degree || profileEdu.credential || ''),
    location:    String(edu?.location    || profileEdu.location    || ''),
    dates: String(
      edu?.dates          ||
      edu?.date           ||
      edu?.year           ||
      edu?.graduationYear ||
      profileEdu.dates    ||
      profileEdu.year     ||
      ''
    ),
    notes: toStringArray(edu?.notes),
  };
}

function normalizeResumeDraft(parsed) {
  const experience = toArray(parsed.experience).map(exp => ({
    jobTitle: String(exp?.jobTitle || ''),
    employer: String(exp?.employer || ''),
    location: String(exp?.location || ''),
    startDate: normalizeProfileDatePart(exp?.startDate || ''),
    endDate: normalizeProfileDatePart(exp?.endDate || ''),
    bulletPoints: toStringArray(exp?.bulletPoints || exp?.bullets || exp?.responsibilities),
  }));

  return {
    headline: String(parsed.headline || ''),
    summary: String(parsed.summary || parsed.professionalSummary || ''),
    skills: toStringArray(parsed.skills),
    experience,
    education: toArray(parsed.education).map((edu, i) => normalizeEducationDraft(edu, i)),
    certifications: toStringArray(parsed.certifications),
    projects: toArray(parsed.projects).map(project => ({
      name: String(project?.name || ''),
      role: String(project?.role || ''),
      description: String(project?.description || ''),
      technologies: toStringArray(project?.technologies),
    })),
  };
}

function normalizeCoverLetterDraft(parsed) {
  const draft = parsed.content && typeof parsed.content === 'object' ? parsed.content : parsed;
  const paragraphs = toParagraphs(draft.paragraphs || draft.body || draft.letterBody || draft.letter);

  if (!paragraphs.length) return null;

  return {
    greeting: String(draft.greeting || 'Dear Hiring Manager,'),
    paragraphs,
    closing: String(draft.closing || 'Sincerely,'),
    signOff: String(draft.signOff || draft.signature || state.profile?.personalInfo?.fullName || ''),
  };
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/\n|;|•| - /)
      .map(item => item.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

function toParagraphs(value) {
  if (Array.isArray(value)) return toStringArray(value);
  if (typeof value === 'string') {
    return value
      .split(/\n{2,}/)
      .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }
  return [];
}

// ── Feature Tour ──────────────────────────────────────────────────────────

const TOUR_STEPS = [
  {
    target: '#card-job-info',
    title: 'Job Info',
    body: 'Start here. Fill in the job title and employer. If you scan a page or use the context menu, these fields can fill from the job posting automatically.',
  },
  {
    target: '#card-job-desc',
    title: 'Job Description',
    body: 'Paste the full job posting here. The more detail the AI has, the more precisely it tailors your documents to this specific role.',
  },
  {
    target: '#card-application-form',
    title: 'Application Autofill',
    body: 'Use this optional helper on application pages with repetitive form fields. It never submits the form and always asks you to review before anything is filled.',
  },
  {
    target: '#card-generate',
    title: 'Generate',
    body: 'Choose cover letter length and tone, then generate a tailored resume, cover letter, or both. A Stop button appears while the AI is working.',
  },
  {
    target: '#appearance-controls',
    title: 'Appearance',
    body: 'Change template, accent colour, and spacing from the Preview area. These controls update the rendered document without regenerating the text.',
  },
  {
    target: '#card-drafts',
    title: 'Preview',
    body: 'Your tailored documents appear here. Switch tabs to review each draft, then use Edit in the preview for final wording changes before saving.',
  },
  {
    target: '#card-ats',
    title: 'ATS Check',
    body: 'After a resume is generated, scan the job description for important keywords. Missing terms appear as selectable chips you can send to Refine.',
  },
  {
    target: '#card-revision',
    title: 'Refine',
    body: 'Not quite right? Type what you\'d like changed, such as "more confident tone" or "emphasise leadership", and the AI revises the current document.',
  },
  {
    target: '#card-save',
    title: 'Export and email',
    body: 'When you\'re happy, open the browser print dialog and choose "Save as PDF." You can also prepare a reviewed application email from this card.',
  },
  {
    target: '#btn-settings',
    title: 'AI settings',
    body: 'Set up your AI provider and document preferences here. Profile details now have their own dashboard shortcuts.',
  },
  {
    target: '#profile-strip',
    title: 'Profile Select',
    body: 'Choose which saved profile the AI should use for this application. Profiles let you maintain separate sets of personal details for different roles or CVs.',
  },
  {
    target: '#btn-open-profile',
    title: 'My Profile',
    body: 'Edit the personal details the AI uses to write your resume and cover letter — name, contact info, work history, skills, and more.',
  },
  {
    target: '#btn-open-full-page',
    title: 'Full Page',
    body: 'Open the workspace in a full browser tab for more screen space. The current job context carries over automatically so you can pick up right where you left off.',
  },
  {
    target: '#btn-history',
    title: 'History',
    body: 'Browse previously generated jobs. Select any entry to reload the job details and regenerate tailored documents for that role.',
  },
  {
    target: '#btn-jobs',
    title: 'Saved Jobs',
    body: 'Open your saved application queue to compare fit, track status, add notes, and launch application-material actions for a saved role.',
  },
];

let tourIndex = 0;
let currentTourSteps = TOUR_STEPS;

function isDashboardTourTargetAvailable(selector) {
  const el = document.querySelector(selector);
  if (!el) return false;
  if (el.closest('[hidden], .hidden')) return false;
  return el.getClientRects().length > 0;
}

function startTour() {
  dom.settingsView.classList.remove('visible');
  currentTourSteps = TOUR_STEPS.filter(step => isDashboardTourTargetAvailable(step.target));
  if (!currentTourSteps.length) return;
  tourIndex = 0;
  $('tour-overlay').classList.remove('hidden');
  showTourStep(0);

  document.addEventListener('keydown', tourKeyHandler);
}

function showTourStep(index) {
  tourIndex = index;
  const step = currentTourSteps[index];
  const targetEl = document.querySelector(step.target);
  if (!targetEl) { endTour(); return; }

  $('tour-step-count').textContent = `${index + 1} of ${currentTourSteps.length}`;
  $('tour-title').textContent = step.title;
  $('tour-body').textContent = step.body;
  $('tour-btn-prev').style.visibility = index === 0 ? 'hidden' : 'visible';
  $('tour-btn-next').textContent = index === currentTourSteps.length - 1 ? 'Finish' : 'Next →';

  // Scroll to element, then position once scroll settles
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => positionTourElements(targetEl), 320);
}

function positionTourElements(targetEl) {
  const rect = targetEl.getBoundingClientRect();
  const spotlight = $('tour-spotlight');
  const tooltip   = $('tour-tooltip');
  const pad = 6;
  const gap = 12;

  spotlight.style.top    = (rect.top    - pad) + 'px';
  spotlight.style.left   = (rect.left   - pad) + 'px';
  spotlight.style.width  = (rect.width  + pad * 2) + 'px';
  spotlight.style.height = (rect.height + pad * 2) + 'px';
  spotlight.style.borderRadius = getComputedStyle(targetEl).borderRadius;

  const viewH    = window.innerHeight;
  const viewW    = window.innerWidth;
  const tipW     = tooltip.offsetWidth  || 288;
  const tipH     = tooltip.offsetHeight || 160;
  positionTourBlurPanels({
    top:    Math.max(0, rect.top - pad),
    left:   Math.max(0, rect.left - pad),
    right:  Math.min(viewW, rect.right + pad),
    bottom: Math.min(viewH, rect.bottom + pad),
  }, viewW, viewH);

  // Prefer below, fall back to above, then centre vertically if neither fits
  let top;
  if (rect.bottom + pad + gap + tipH <= viewH - 8) {
    top = rect.bottom + pad + gap;
  } else if (rect.top - pad - gap - tipH >= 8) {
    top = rect.top - pad - gap - tipH;
  } else {
    top = Math.max(8, (viewH - tipH) / 2);
  }

  let left = rect.left + rect.width / 2 - tipW / 2;
  left = Math.max(8, Math.min(left, viewW - tipW - 8));

  tooltip.style.top  = top  + 'px';
  tooltip.style.left = left + 'px';
}

function positionTourBlurPanels(hole, viewW, viewH) {
  const panels = {
    top:    document.querySelector('.tour-blur-panel--top'),
    right:  document.querySelector('.tour-blur-panel--right'),
    bottom: document.querySelector('.tour-blur-panel--bottom'),
    left:   document.querySelector('.tour-blur-panel--left'),
  };

  Object.assign(panels.top.style, {
    top: '0px',
    left: '0px',
    width: viewW + 'px',
    height: hole.top + 'px',
  });
  Object.assign(panels.right.style, {
    top: hole.top + 'px',
    left: hole.right + 'px',
    width: Math.max(0, viewW - hole.right) + 'px',
    height: Math.max(0, hole.bottom - hole.top) + 'px',
  });
  Object.assign(panels.bottom.style, {
    top: hole.bottom + 'px',
    left: '0px',
    width: viewW + 'px',
    height: Math.max(0, viewH - hole.bottom) + 'px',
  });
  Object.assign(panels.left.style, {
    top: hole.top + 'px',
    left: '0px',
    width: hole.left + 'px',
    height: Math.max(0, hole.bottom - hole.top) + 'px',
  });
}

function endTour() {
  $('tour-overlay').classList.add('hidden');
  document.removeEventListener('keydown', tourKeyHandler);
}

function tourKeyHandler(e) {
  if (e.key === 'Escape') endTour();
  if (e.key === 'ArrowRight' && tourIndex < currentTourSteps.length - 1) showTourStep(tourIndex + 1);
  if (e.key === 'ArrowLeft'  && tourIndex > 0) showTourStep(tourIndex - 1);
}

// Start app
init();
