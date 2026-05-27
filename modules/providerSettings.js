// modules/providerSettings.js
// Local-only provider settings storage so API keys do not sync.

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

  return normalizeProviderSettings(null);
}

export async function saveProviderSettings(settings) {
  await chrome.storage.local.set({ [PROVIDER_SETTINGS_KEY]: normalizeProviderSettings(settings) });
}
