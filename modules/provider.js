// modules/provider.js
// Unified AI provider abstraction — OpenAI, Gemini, Ollama, Mock.

import { validateOllamaEndpoint } from './url.js';




/**
 * Calls the configured AI provider with system + user prompts.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} settings - { provider, apiKey, modelName, endpoint }
 * @returns {Promise<string>} - The AI response text
 */
export async function callAI(systemPrompt, userPrompt, settings, signal) {
  const { provider, apiKey, modelName, endpoint, simulateFailure } = settings;

  // ── Failure Simulation for Testing ──
  if (simulateFailure && simulateFailure !== 'none') {
    // Artificial delay to make it feel real
    await new Promise(r => setTimeout(r, 600));
    switch (simulateFailure) {
      case 'billing':      throw new Error('Quota exceeded: Billing is disabled on this project.');
      case 'unauthorized': throw new Error('Invalid API key: Unauthorized access.');
      case 'quota':        throw new Error('User rate limit exceeded: Quota fully consumed.');
      case 'rate_limit':   throw new Error('Too many requests: Rate limit hit (429).');
      case 'network':      throw new Error('Failed to fetch: Network is unreachable.');
      case 'timeout':      throw new Error('The request timed out after 30 seconds.');
      default:             throw new Error('An unknown server error occurred.');
    }
  }

  switch (provider) {
    case 'mock':     return callMock(systemPrompt, userPrompt, settings);
    case 'openai':      return callOpenAI(systemPrompt, userPrompt, apiKey, modelName || 'gpt-4o-mini', signal);
    case 'gemini':      return callGemini(systemPrompt, userPrompt, apiKey, modelName || 'gemini-2.5-flash', signal);
    case 'openrouter':  return callOpenRouter(systemPrompt, userPrompt, apiKey, modelName || 'anthropic/claude-3.5-haiku', signal);
    case 'ollama':      return callOllama(systemPrompt, userPrompt, endpoint || 'http://localhost:11434', modelName || 'llama3', signal);
    default:
      throw new Error(`Unknown AI provider: "${provider}". Please check your settings.`);
  }
}

// ── Mock (local, no API) ──────────────────────────────────────────────────

async function callMock(systemPrompt, userPrompt, settings) {
  // If simulateFailure was 'none' or null, we proceed to mock response.
  return '[Mock Mode] Simulated AI response. No real API was called.';
}

// ── OpenAI ────────────────────────────────────────────────────────────────

async function callOpenAI(systemPrompt, userPrompt, apiKey, model, signal) {
  if (!apiKey) throw new Error('OpenAI API key is not set. Please configure it in Settings.');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.7,
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ── Gemini ────────────────────────────────────────────────────────────────

async function callGemini(systemPrompt, userPrompt, apiKey, model, signal) {
  if (!apiKey) throw new Error('Gemini API key is not set. Please configure it in Settings.');

  if (!model || !/^[a-zA-Z0-9\-._/]+$/.test(model)) {
    throw new Error(`Invalid Gemini model name: "${model}". Please check your model settings.`);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    let errMsg = err?.error?.message || response.statusText;
    
    // Auto-fetch available models if 404 to help the user
    if (response.status === 404) {
       try {
         const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
         const listData = await listRes.json();
         if (listData && listData.models) {
            const valid = listData.models
              .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
              .map(m => m.name.replace('models/', ''))
              .slice(0, 10); // Show top 10
            errMsg += `\n\nValid models detected for your key: ${valid.join(', ')}`;
         }
       } catch (e) {
         // silently fail if we can't fetch models
       }
    }
    
    throw new Error(`Gemini error ${response.status}: ${errMsg}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// ── OpenRouter ────────────────────────────────────────────────────────────

async function callOpenRouter(systemPrompt, userPrompt, apiKey, model, signal) {
  if (!apiKey) throw new Error('OpenRouter API key is not set. Please configure it in Settings.');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Title': 'Job Application Assistant',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.7,
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenRouter error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ── Ollama (local) ────────────────────────────────────────────────────────

async function callOllama(systemPrompt, userPrompt, endpoint, model, signal) {
  const safeBase = validateOllamaEndpoint(endpoint);
  const url = safeBase + '/api/chat';
  const wantsJson = expectsJsonObject(systemPrompt, userPrompt);
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    stream: false,
    think: false,
    options: {
      temperature: wantsJson ? 0.2 : 0.7,
    },
  };

  if (wantsJson) body.format = 'json';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const detail = await readOllamaError(response);
    const suffix = detail ? ` ${detail}` : ` ${response.statusText}`;
    throw new Error(`Ollama error ${response.status}:${suffix}. Is Ollama running at ${safeBase}?`);
  }

  const data = await response.json();
  return data.message?.content?.trim() || '';
}

async function readOllamaError(response) {
  const text = await response.text().catch(() => '');
  if (!text) return '';

  try {
    const json = JSON.parse(text);
    return String(json?.error || json?.message || text).trim();
  } catch (_) {
    return text.trim();
  }
}

function expectsJsonObject(systemPrompt = '', userPrompt = '') {
  const prompt = `${systemPrompt}\n${userPrompt}`.toLowerCase();
  return prompt.includes('valid json only')
    || prompt.includes('json object')
    || prompt.includes('structured json')
    || prompt.includes('return the complete revised json')
    || prompt.includes('raw json object');
}
