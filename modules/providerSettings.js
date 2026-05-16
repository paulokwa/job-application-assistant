// modules/providerSettings.js
// Local-first provider settings storage. Old sync values are copied into local
// storage on read, but future writes stay local so API keys do not sync.

const PROVIDER_SETTINGS_KEY = 'providerSettings';

export function normalizeProviderSettings(raw) {
  if (!raw) return { activeProvider: '', configs: {}, simulateFailure: 'none' };
  if (raw.configs !== undefined) {
    return {
      ...raw,
      configs: raw.configs || {},
      simulateFailure: raw.simulateFailure || 'none',
    };
  }

  const provider = raw.provider || '';
  const configs = {};
  if (provider) {
    configs[provider] = {
      apiKey: raw.apiKey || '',
      modelName: raw.modelName || '',
      endpoint: raw.endpoint || '',
    };
  }

  return { activeProvider: provider, configs, simulateFailure: raw.simulateFailure || 'none' };
}

export async function loadProviderSettings() {
  const localData = await chrome.storage.local.get([PROVIDER_SETTINGS_KEY]);
  if (localData[PROVIDER_SETTINGS_KEY]) {
    return normalizeProviderSettings(localData[PROVIDER_SETTINGS_KEY]);
  }

  const syncData = await chrome.storage.sync.get([PROVIDER_SETTINGS_KEY]);
  if (syncData[PROVIDER_SETTINGS_KEY]) {
    const migrated = normalizeProviderSettings(syncData[PROVIDER_SETTINGS_KEY]);
    await chrome.storage.local.set({ [PROVIDER_SETTINGS_KEY]: migrated });
    return migrated;
  }

  return normalizeProviderSettings(null);
}

export async function saveProviderSettings(settings) {
  await chrome.storage.local.set({ [PROVIDER_SETTINGS_KEY]: normalizeProviderSettings(settings) });
}
