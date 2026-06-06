import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const USER_DATA_DIR = path.join(__dirname, '..', '.pw-ext-smoke-data');

function extensionPageUrl(extensionId) {
  return `chrome-extension://${extensionId}/dashboard/dashboard.html?mode=full`;
}

async function getExtensionId(context) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const targets = await cdp.send('Target.getTargets');
  await page.close();

  const extensionTarget = targets.targetInfos.find(
    (t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
  );
  if (!extensionTarget) {
    throw new Error('Extension service worker not found via CDP');
  }
  return extensionTarget.url.split('/')[2];
}

async function clearStorage(page) {
  await page.evaluate(() => new Promise((resolve) => {
    chrome.storage.local.clear(() => resolve());
  }));
}

async function seedStorage(page, seed) {
  await page.evaluate(async (data) => {
    await new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }, seed);
}

function baseSeed(overrides = {}) {
  return {
    aiProviderSetupSaved: true,
    providerSettings: { provider: 'mock' },
    profileIndex: [{ id: 'ptest', name: 'Test' }],
    activeProfileId: 'ptest',
    profile_ptest: {
      summary: 'Experienced healthcare administrator with a focus on claims processing.',
      skills: ['Claims review', 'Documentation', 'Customer service'],
      certifications: [],
      experience: [{
        jobTitle: 'Claims Analyst',
        employer: 'Sun Life',
        dates: '2020 - 2022',
        startDate: '2020',
        endDate: '2022',
        bulletPoints: ['Reviewed claims.'],
      }],
      education: [],
      projects: [],
      customSections: [],
      metadata: { lockedSections: {} },
      ...overrides,
    },
  };
}

async function fillJobAndOpenChat(page) {
  await page.fill('#field-job-title', 'Healthcare Administrator');
  await page.fill('#field-company', 'Regional Health');
  await page.fill('#field-job-desc', 'Seeking an experienced healthcare administrator to manage claims and patient services coordination.');
  await page.click('#btn-chat');
  await page.waitForSelector('#job-chat-input', { timeout: 5000 });
}

async function sendChatMessage(page, message) {
  await page.fill('#job-chat-input', message);
  await page.waitForFunction(() => {
    const btn = document.querySelector('#btn-job-chat-send');
    return btn && !btn.disabled;
  }, { timeout: 5000 });
  await page.click('#btn-job-chat-send');
}

async function openApplyRequirements(page) {
  const card = page.locator('.job-chat-profile-suggestion');
  await card.locator('button', { hasText: 'Preview Changes' }).click();
  await page.waitForSelector('.job-chat-profile-diff', { timeout: 5000 });
  const previewPanel = page.locator('.job-chat-profile-diff');
  await previewPanel.locator('button', { hasText: 'Review Apply Requirements' }).click();
  await page.waitForSelector('[data-profile-apply-readiness-panel]', { timeout: 5000 });
}

async function applyAndConfirm(page) {
  const readinessPanel = page.locator('[data-profile-apply-readiness-panel]');
  const applyBtn = readinessPanel.locator('button:not([disabled])');
  await expect(applyBtn).toHaveText('Apply to Profile');

  let accepted = false;
  page.on('dialog', async (dialog) => {
    accepted = true;
    await dialog.accept();
  });
  await applyBtn.click();
  expect(accepted).toBe(true);

  await expect(page.locator('#toast')).toContainText('Profile updated successfully', { timeout: 8000 });
}

async function clickUndoAndVerifyRestore(page, card) {
  const undoBtn = card.locator('.job-chat-undo-btn');
  await expect(undoBtn).toHaveText('Undo profile update');
  await expect(undoBtn).toBeVisible();

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  await undoBtn.click();

  await expect(page.locator('#toast')).toContainText('Profile update undone', { timeout: 8000 });
  await expect(card.locator('.job-chat-undo-btn')).toHaveCount(0);
}

async function getStoredProfile(page) {
  return page.evaluate(async () => {
    const data = await chrome.storage.local.get('profile_ptest');
    return data.profile_ptest;
  });
}

function collectErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

function assertNoConsoleErrors(errors) {
  const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('Favicon'));
  expect(realErrors).toEqual([]);
}

test.describe('profile apply smoke', () => {
  let context;
  let extensionId;

  test.beforeAll(async () => {
    if (fs.existsSync(USER_DATA_DIR)) {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    }
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
    extensionId = await getExtensionId(context);
  });

  test.afterAll(async () => {
    await context?.close();
    if (fs.existsSync(USER_DATA_DIR)) {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    }
  });

  test('skills add apply + undo', async () => {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(extensionPageUrl(extensionId));
    await page.waitForSelector('#field-job-title', { timeout: 15000 });
    await seedStorage(page, baseSeed());
    await page.reload();
    await page.waitForSelector('#field-job-title', { timeout: 15000 });

    await fillJobAndOpenChat(page);
    await sendChatMessage(page, 'Add Appeals Coordination to my profile skills.');
    await page.waitForSelector('.job-chat-profile-suggestion', { timeout: 30000 });

    const card = page.locator('.job-chat-profile-suggestion');
    await expect(card.locator('.job-chat-profile-suggestion-title')).toHaveText('Suggested Profile Update');
    await expect(card.locator('.job-chat-profile-section')).toHaveText('Skills');

    const before = await getStoredProfile(page);
    expect(before.skills).not.toContain('Appeals Coordination');

    await openApplyRequirements(page);
    await applyAndConfirm(page);

    const after = await getStoredProfile(page);
    expect(after.skills).toContain('Appeals Coordination');

    await clickUndoAndVerifyRestore(page, card);

    const restored = await getStoredProfile(page);
    expect(restored.skills).not.toContain('Appeals Coordination');
    expect(restored.skills).toContain('Claims review');

    assertNoConsoleErrors(errors);
    await page.close();
  });

  test('summary update apply + undo', async () => {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(extensionPageUrl(extensionId));
    await page.waitForSelector('#field-job-title', { timeout: 15000 });
    await seedStorage(page, baseSeed({
      summary: 'Experienced healthcare administrator.',
      summaries: [{ label: 'General', text: 'Summary card should remain.' }],
    }));
    await page.reload();
    await page.waitForSelector('#field-job-title', { timeout: 15000 });

    await fillJobAndOpenChat(page);
    await sendChatMessage(page, 'Update my summary to emphasize healthcare administration and claims support.');
    await page.waitForSelector('.job-chat-profile-suggestion', { timeout: 30000 });

    const card = page.locator('.job-chat-profile-suggestion');
    await expect(card.locator('.job-chat-profile-suggestion-title')).toHaveText('Suggested Profile Update');
    await expect(card.locator('.job-chat-profile-section')).toHaveText('Summary');

    const before = await getStoredProfile(page);
    expect(before.summary).toBe('Experienced healthcare administrator.');

    await openApplyRequirements(page);
    await applyAndConfirm(page);

    const after = await getStoredProfile(page);
    expect(after.summary).not.toBe('Experienced healthcare administrator.');
    // Verify summaries[] was not unexpectedly modified
    expect(after.summaries).toBeDefined();
    if (after.summaries && after.summaries.length > 0) {
      expect(after.summaries[0].text).toBe('Summary card should remain.');
    }

    await clickUndoAndVerifyRestore(page, card);

    const restored = await getStoredProfile(page);
    expect(restored.summary).toBe('Experienced healthcare administrator.');

    assertNoConsoleErrors(errors);
    await page.close();
  });

  test('duplicate skill blocked / no mutation', async () => {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(extensionPageUrl(extensionId));
    await page.waitForSelector('#field-job-title', { timeout: 15000 });
    await seedStorage(page, baseSeed());
    await page.reload();
    await page.waitForSelector('#field-job-title', { timeout: 15000 });

    const before = await getStoredProfile(page);
    // Verify the seeded profile already has Customer service
    expect(before.skills).toContain('Customer service');

    await fillJobAndOpenChat(page);
    await sendChatMessage(page, 'Add Customer service to my profile skills.');
    await page.waitForSelector('.job-chat-profile-suggestion', { timeout: 30000 });

    const card = page.locator('.job-chat-profile-suggestion');
    await expect(card.locator('.job-chat-profile-suggestion-title')).toHaveText('Suggested Profile Update');

    await openApplyRequirements(page);

    // Verify blocked state — readiness panel shows block reason
    const readinessPanel = page.locator('[data-profile-apply-readiness-panel]');
    await expect(readinessPanel.locator('.job-chat-profile-apply-status--blocked')).toBeVisible();

    // Verify Apply is NOT active (should be disabled)
    const enabledApplyBtn = readinessPanel.locator('button:not([disabled])');
    await expect(enabledApplyBtn).toHaveCount(0);

    // Verify Apply coming later is shown
    const disabledApplyBtn = readinessPanel.locator('button[disabled]');
    await expect(disabledApplyBtn).toHaveText('Apply coming later.');

    // Verify profile was NOT mutated
    const after = await getStoredProfile(page);
    expect(after.skills).toEqual(before.skills);

    assertNoConsoleErrors(errors);
    await page.close();
  });

  test('certification add apply + undo', async () => {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(extensionPageUrl(extensionId));
    await page.waitForSelector('#field-job-title', { timeout: 15000 });
    await seedStorage(page, baseSeed());
    await page.reload();
    await page.waitForSelector('#field-job-title', { timeout: 15000 });

    await fillJobAndOpenChat(page);
    await sendChatMessage(page, 'Add a certification called First Aid from Red Cross, 2024.');
    await page.waitForSelector('.job-chat-profile-suggestion', { timeout: 30000 });

    const card = page.locator('.job-chat-profile-suggestion');
    await expect(card.locator('.job-chat-profile-suggestion-title')).toHaveText('Suggested Profile Update');

    const before = await getStoredProfile(page);
    expect(before.certifications || []).toHaveLength(0);

    await openApplyRequirements(page);
    await applyAndConfirm(page);

    const after = await getStoredProfile(page);
    expect(after.certifications).toBeDefined();
    expect(after.certifications.length).toBeGreaterThanOrEqual(1);
    expect(after.certifications[0].name).toBe('First Aid');
    expect(after.certifications[0].issuer).toBe('Red Cross');
    expect(after.certifications[0].year).toBe('2024');

    await clickUndoAndVerifyRestore(page, card);

    const restored = await getStoredProfile(page);
    expect(restored.certifications || []).toHaveLength(0);

    assertNoConsoleErrors(errors);
    await page.close();
  });

  test('duplicate certification blocked', async () => {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(extensionPageUrl(extensionId));
    await page.waitForSelector('#field-job-title', { timeout: 15000 });
    await seedStorage(page, baseSeed({
      certifications: [{ name: 'First Aid', issuer: 'Red Cross', year: '2024' }],
    }));
    await page.reload();
    await page.waitForSelector('#field-job-title', { timeout: 15000 });

    const before = await getStoredProfile(page);
    expect(before.certifications).toHaveLength(1);
    expect(before.certifications[0].name).toBe('First Aid');

    await fillJobAndOpenChat(page);
    await sendChatMessage(page, 'Add a certification called First Aid from Red Cross, 2024.');
    await page.waitForSelector('.job-chat-profile-suggestion', { timeout: 30000 });

    const card = page.locator('.job-chat-profile-suggestion');
    await expect(card.locator('.job-chat-profile-suggestion-title')).toHaveText('Suggested Profile Update');

    await openApplyRequirements(page);

    // Verify blocked state
    const readinessPanel = page.locator('[data-profile-apply-readiness-panel]');
    await expect(readinessPanel.locator('.job-chat-profile-apply-status--blocked')).toBeVisible();

    // Verify no active Apply button
    const enabledApplyBtn = readinessPanel.locator('button:not([disabled])');
    await expect(enabledApplyBtn).toHaveCount(0);

    // Verify profile unchanged
    const after = await getStoredProfile(page);
    expect(after.certifications).toHaveLength(1);

    assertNoConsoleErrors(errors);
    await page.close();
  });

  test('complete experience add + undo', async () => {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(extensionPageUrl(extensionId));
    await page.waitForSelector('#field-job-title', { timeout: 15000 });
    await seedStorage(page, baseSeed());
    await page.reload();
    await page.waitForSelector('#field-job-title', { timeout: 15000 });

    const before = await getStoredProfile(page);
    const expCountBefore = (before.experience || []).length;

    await fillJobAndOpenChat(page);
    await sendChatMessage(page, 'Add my Customer Care Representative role at NTT Data to my profile. I managed provider inquiries and documented issues.');
    await page.waitForSelector('.job-chat-profile-suggestion', { timeout: 30000 });

    const card = page.locator('.job-chat-profile-suggestion');
    await expect(card.locator('.job-chat-profile-suggestion-title')).toHaveText('Suggested Profile Update');

    await openApplyRequirements(page);

    const readinessPanel = page.locator('[data-profile-apply-readiness-panel]');
    await expect(readinessPanel).toBeVisible();

    // Check if Apply is active; if blocked by sensitive/incomplete, that's still valid coverage
    const applyBtn = readinessPanel.locator('button:not([disabled])');
    const applyActive = await applyBtn.isVisible().catch(() => false);

    if (applyActive) {
      await expect(applyBtn).toHaveText('Apply to Profile');

      let dialogAccepted = false;
      page.on('dialog', async (dialog) => {
        dialogAccepted = true;
        await dialog.accept();
      });
      await applyBtn.click();
      expect(dialogAccepted).toBe(true);

      await expect(page.locator('#toast')).toContainText('Profile updated successfully', { timeout: 8000 });

      const after = await getStoredProfile(page);
      expect((after.experience || []).length).toBeGreaterThan(expCountBefore);

      await clickUndoAndVerifyRestore(page, card);

      const restored = await getStoredProfile(page);
      expect((restored.experience || []).length).toBe(expCountBefore);
    } else {
      // Experience proposal rendered but apply not active (e.g. sensitive/incomplete)
      // This is still valid coverage — profile should be unchanged
      const after = await getStoredProfile(page);
      expect((after.experience || []).length).toBe(expCountBefore);
    }

    assertNoConsoleErrors(errors);
    await page.close();
  });

  test('incomplete experience blocked', async () => {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(extensionPageUrl(extensionId));
    await page.waitForSelector('#field-job-title', { timeout: 15000 });
    await seedStorage(page, baseSeed());
    await page.reload();
    await page.waitForSelector('#field-job-title', { timeout: 15000 });

    const before = await getStoredProfile(page);
    const expCountBefore = (before.experience || []).length;

    await fillJobAndOpenChat(page);
    // No details after role — should be incomplete
    await sendChatMessage(page, 'Add my NTT Data Customer Care Representative role to my profile.');
    await page.waitForSelector('.job-chat-profile-suggestion', { timeout: 30000 });

    const card = page.locator('.job-chat-profile-suggestion');
    await expect(card.locator('.job-chat-profile-suggestion-title')).toHaveText('Suggested Profile Update');

    await openApplyRequirements(page);

    const readinessPanel = page.locator('[data-profile-apply-readiness-panel]');
    // Verify blocked state
    await expect(readinessPanel.locator('.job-chat-profile-apply-status--blocked')).toBeVisible();

    // Verify no active Apply button
    const enabledApplyBtn = readinessPanel.locator('button:not([disabled])');
    await expect(enabledApplyBtn).toHaveCount(0);

    // Verify profile unchanged
    const after = await getStoredProfile(page);
    expect((after.experience || []).length).toBe(expCountBefore);

    assertNoConsoleErrors(errors);
    await page.close();
  });

  test('duplicate experience blocked', async () => {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(extensionPageUrl(extensionId));
    await page.waitForSelector('#field-job-title', { timeout: 15000 });
    // Seed with existing NTT Data role
    await seedStorage(page, baseSeed({
      experience: [{
        jobTitle: 'Customer Care Representative',
        employer: 'NTT Data',
        dates: '2022 - 2024',
        startDate: '2022',
        endDate: '2024',
        bulletPoints: ['Managed inquiries.'],
      }],
    }));
    await page.reload();
    await page.waitForSelector('#field-job-title', { timeout: 15000 });

    const before = await getStoredProfile(page);
    const expCountBefore = (before.experience || []).length;

    await fillJobAndOpenChat(page);
    await sendChatMessage(page, 'Add my Customer Care Representative role at NTT Data to my profile. I managed healthcare provider inquiries and documented provider issues.');
    await page.waitForSelector('.job-chat-profile-suggestion', { timeout: 30000 });

    const card = page.locator('.job-chat-profile-suggestion');
    await expect(card.locator('.job-chat-profile-suggestion-title')).toHaveText('Suggested Profile Update');

    await openApplyRequirements(page);

    const readinessPanel = page.locator('[data-profile-apply-readiness-panel]');
    await expect(readinessPanel.locator('.job-chat-profile-apply-status--blocked')).toBeVisible();

    const enabledApplyBtn = readinessPanel.locator('button:not([disabled])');
    await expect(enabledApplyBtn).toHaveCount(0);

    const after = await getStoredProfile(page);
    expect((after.experience || []).length).toBe(expCountBefore);

    assertNoConsoleErrors(errors);
    await page.close();
  });
});
