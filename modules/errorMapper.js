/**
 * modules/errorMapper.js
 * Maps technical API errors to friendly user-facing messages.
 */

export const ErrorType = {
  BILLING: 'billing',
  UNAUTHORIZED: 'unauthorized',
  QUOTA: 'quota',
  RATE_LIMIT: 'rate_limit',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  MODEL_NOT_FOUND: 'model_not_found',
  UNKNOWN: 'unknown'
};

/**
 * Categorizes an error and provides a friendly message.
 * @param {Error|string|Object} error - The caught error
 * @returns {{ message: string, type: string, action: 'settings'|'retry'|'none' }}
 */
export function mapError(error) {
  const msg = (error?.message || String(error)).toLowerCase();

  // 0. Manual Input Validation (Proactive Instructions)
  if (msg === 'no_job_desc') {
    return {
      type: 'validation',
      message: 'The Job Description is empty. To proceed, you can copy and paste the job text here, or right-click on the job posting and select "Job Application Assistant → Create Both" to capture it automatically.',
      action: 'none'
    };
  }
  if (msg === 'no_profile') {
    return {
      type: 'validation',
      message: 'Your profile is missing. Please go to Settings → My Profile and add your professional details (or upload your resume for auto-fill) before generating.',
      action: 'settings',
      settingsSection: 'profile',
    };
  }

  if (msg === 'no_provider') {
    return {
      type: 'setup_required',
      message: 'AI setup required. Real draft generation needs a connected AI provider/API key or local Ollama.',
      action: 'settings',
      settingsSection: 'provider',
    };
  }

  // 1. Ollama-specific errors (must come before generic 401/403 check)
  if (msg.includes('ollama error')) {
    if (msg.includes('403') || msg.includes('forbidden')) {
      return {
        type: 'ollama_cors',
        message: 'Ollama blocked the request (CORS). To allow the extension to reach Ollama, set OLLAMA_ORIGINS=chrome-extension://* as an environment variable and restart Ollama.',
        action: 'retry',
      };
    }
    if (msg.includes('404')) {
      return {
        type: 'ollama_model',
        message: 'Ollama is running but the selected model is not installed. Open a terminal and run `ollama pull <model-name>`, or choose a different model in Settings → AI Provider.',
        action: 'retry',
      };
    }
    return {
      type: 'ollama_error',
      message: error?.message || 'Could not reach Ollama. Make sure it is running and the endpoint in Settings is correct.',
      action: 'retry',
    };
  }

  // 2. Billing / Payment
  if (msg.includes('billing') || msg.includes('payment')) {
    return {
      type: ErrorType.BILLING,
      message: 'The AI service is not available right now because billing appears to be disabled on the connected API project.',
      action: 'settings',
      settingsSection: 'provider',
    };
  }

  // 2. Unauthorized / Invalid Key
  if (msg.includes('api key') || msg.includes('unauthorized') || msg.includes('401') || msg.includes('403')) {
    return {
      type: ErrorType.UNAUTHORIZED,
      message: 'The API key appears to be missing or invalid. Please check your extension settings.',
      action: 'settings',
      settingsSection: 'provider',
    };
  }

  // 3. Quota / Request Limit
  if (msg.includes('quota') || msg.includes('limit') && msg.includes('reached')) {
    return {
      type: ErrorType.QUOTA,
      message: 'The AI request limit has been reached for this API project. Please try again later or check your quota.',
      action: 'retry'
    };
  }

  // 4. Rate Limit
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
    return {
      type: ErrorType.RATE_LIMIT,
      message: 'Too many requests were sent in a short time. Please wait a moment and try again.',
      action: 'retry'
    };
  }

  // 5. Network / Reachability / Blocking
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch') || msg.includes('cannot reach') || msg.includes('blocked')) {
    const isBlocked = msg.includes('blocked');
    return {
      type: ErrorType.NETWORK,
      message: isBlocked 
        ? 'The request was blocked by the browser. This is often caused by ad-blockers or security extensions. Please try disabling them for the extension.' 
        : 'The app could not reach the AI service. Please check your internet connection and try again.',
      action: 'retry'
    };
  }

  // 6. Timeout
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('took too long')) {
    return {
      type: ErrorType.TIMEOUT,
      message: 'The AI service took too long to respond. Please try again.',
      action: 'retry'
    };
  }

  // 7. Model Not Found (404)
  if (msg.includes('404') || msg.includes('model') && (msg.includes('not found') || msg.includes('invalid'))) {
    return {
      type: ErrorType.MODEL_NOT_FOUND,
      message: error?.message || 'The selected AI model was not found or is invalid. Please check your model settings.',
      action: 'settings',
      settingsSection: 'provider',
    };
  }

  // 8. Unknown / Fallback
  const friendlyMsg = error?.message ? `Something went wrong: ${error.message}` : 'Something went wrong while contacting the AI service.';
  return {
    type: ErrorType.UNKNOWN,
    message: friendlyMsg,
    action: 'retry'
  };
}
