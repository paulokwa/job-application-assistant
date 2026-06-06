import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const USER_DATA_DIR = path.join(__dirname, '..', '.pw-ext-smoke-data');

const STORAGE_SEED = {
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
  },
};

async function seedExtensionStorage(page) {
  await page.evaluate(async (seed) => {
    await new Promise((resolve, reject) => {
      chrome.storage.local.set(seed, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  }, STORAGE_SEED);
}

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

  test('profile apply: skills add success', async () => {
    const errors = [];
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    // Step 1: Open dashboard, seed storage, reload
    await page.goto(extensionPageUrl(extensionId));
    await page.waitForSelector('#field-job-title', { timeout: 15000 });
    await seedExtensionStorage(page);
    await page.reload();
    await page.waitForSelector('#field-job-title', { timeout: 15000 });

    // Step 2: Fill job context to enable Job Chat
    await page.fill('#field-job-title', 'Healthcare Administrator');
    await page.fill('#field-company', 'Regional Health');
    await page.fill('#field-job-desc', 'Seeking an experienced healthcare administrator to manage claims and patient services coordination.');

    // Step 3: Open Job Chat
    await page.click('#btn-chat');
    await page.waitForSelector('#job-chat-input', { timeout: 5000 });

    // Step 4: Send profile update message
    await page.fill('#job-chat-input', 'Add Appeals Coordination to my profile skills.');
    await page.waitForFunction(() => {
      const btn = document.querySelector('#btn-job-chat-send');
      return btn && !btn.disabled;
    }, { timeout: 5000 });
    await page.click('#btn-job-chat-send');

    // Step 5: Wait for the profile suggestion card
    await page.waitForSelector('.job-chat-profile-suggestion', { timeout: 30000 });

    // Verify card elements
    const card = page.locator('.job-chat-profile-suggestion');
    await expect(card.locator('.job-chat-profile-suggestion-title')).toHaveText('Suggested Profile Update');
    await expect(card.locator('.job-chat-profile-section')).toHaveText('Skills');

    // Verify profile has NOT been changed yet
    const profileBeforeApply = await page.evaluate(async () => {
      const data = await chrome.storage.local.get('profile_ptest');
      return data.profile_ptest;
    });
    expect(profileBeforeApply.skills).not.toContain('Appeals Coordination');

    // Step 6: Open Preview Changes
    await card.locator('button', { hasText: 'Preview Changes' }).click();
    await page.waitForSelector('.job-chat-profile-diff', { timeout: 5000 });

    // Step 7: Open Review Apply Requirements
    const previewPanel = page.locator('.job-chat-profile-diff');
    await previewPanel.locator('button', { hasText: 'Review Apply Requirements' }).click();
    await page.waitForSelector('[data-profile-apply-readiness-panel]', { timeout: 5000 });

    // Step 8: Confirm Apply to Profile is active (not disabled)
    const readinessPanel = page.locator('[data-profile-apply-readiness-panel]');
    const applyBtn = readinessPanel.locator('button:not([disabled])');
    await expect(applyBtn).toHaveText('Apply to Profile');

    // Step 9: Register dialog handler, click Apply
    let dialogAccepted = false;
    page.on('dialog', async (dialog) => {
      dialogAccepted = true;
      await dialog.accept();
    });
    await applyBtn.click();

    // Step 10: Verify confirmation dialog was shown and accepted
    expect(dialogAccepted).toBe(true);

    // Step 11: Verify success — toast or applied notice
    await expect(page.locator('#toast')).toContainText('Profile updated successfully', { timeout: 8000 });

    // Step 12: Read storage and verify
    const storedProfile = await page.evaluate(async () => {
      const data = await chrome.storage.local.get('profile_ptest');
      return data.profile_ptest;
    });
    expect(storedProfile.skills).toContain('Appeals Coordination');

    // Step 13: Verify Undo button appears
    const undoBtn = card.locator('.job-chat-undo-btn');
    await expect(undoBtn).toHaveText('Undo profile update');
    await expect(undoBtn).toBeVisible();

    // Step 14: Click Undo and accept the confirm dialog
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await undoBtn.click();

    // Step 15: Verify undo success toast
    await expect(page.locator('#toast')).toContainText('Profile update undone', { timeout: 8000 });

    // Step 16: Verify storage is restored
    const restoredProfile = await page.evaluate(async () => {
      const data = await chrome.storage.local.get('profile_ptest');
      return data.profile_ptest;
    });
    expect(restoredProfile.skills).not.toContain('Appeals Coordination');
    expect(restoredProfile.skills).toContain('Claims review');
    expect(restoredProfile.skills).toContain('Documentation');

    // Step 17: Verify Undo button is removed
    await expect(card.locator('.job-chat-undo-btn')).toHaveCount(0);

    // Step 18: Verify no console errors
    const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('Favicon'));
    expect(realErrors).toEqual([]);

    await page.close();
  });
});
