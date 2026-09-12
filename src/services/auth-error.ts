export type AuthErrorCode = 'email_invalid' | 'send_failed' | 'otp_invalid' | 'otp_expired' | 'rate_limited' | 'offline';
export type AuthOperation = 'send' | 'verify' | 'sign_out';

export interface AuthServiceError {
  code: AuthErrorCode;
  message: string;
}

const knownErrorCodes = new Set<AuthErrorCode>([
  'email_invalid',
  'send_failed',
  'otp_invalid',
  'otp_expired',
  'rate_limited',
  'offline',
]);

function isOffline(error?: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const details = error as { name?: unknown; status?: unknown } | null;
  return error instanceof TypeError || (details?.name === 'AuthRetryableFetchError' && details.status === 0);
}

export function authErrorCode(error: unknown, operation: AuthOperation = 'send'): AuthErrorCode {
  return mapAuthError(error, operation).code;
}

export function mapAuthError(error: unknown, operation: AuthOperation = 'send'): AuthServiceError {
  const details = error as { code?: unknown; message?: unknown; status?: unknown } | null;
  const knownCode = typeof details?.code === 'string' && knownErrorCodes.has(details.code as AuthErrorCode)
    ? details.code as AuthErrorCode
    : null;
  if (knownCode) return { code: knownCode, message: safeMessage(knownCode) };
  if (isOffline(error)) return { code: 'offline', message: 'Check your connection and try again.' };

  const status = typeof details?.status === 'number' ? details.status : undefined;
  const code = typeof details?.code === 'string' ? details.code.toLowerCase() : '';
  const message = typeof details?.message === 'string' ? details.message.toLowerCase() : '';
  const text = `${code} ${message}`;

  if ((text.includes('invalid email') || text.includes('email is invalid')) && operation !== 'sign_out') {
    return { code: 'email_invalid', message: safeMessage('email_invalid') };
  }
  if (status === 429 || text.includes('rate limit') || text.includes('too many')) {
    return { code: 'rate_limited', message: safeMessage('rate_limited') };
  }
  if (operation === 'verify' && (text.includes('expired') || text.includes('session_expired'))) {
    return { code: 'otp_expired', message: safeMessage('otp_expired') };
  }
  if (operation === 'verify') return { code: 'otp_invalid', message: safeMessage('otp_invalid') };
  return { code: 'send_failed', message: safeMessage('send_failed') };
}

function safeMessage(code: AuthErrorCode) {
  return {
    email_invalid: 'Enter a valid email address.',
    send_failed: 'We could not complete that request. Try again.',
    otp_invalid: 'The code could not be verified.',
    otp_expired: 'The code is incorrect or expired. Check it or request a new one.',
    rate_limited: 'Please wait before trying again.',
    offline: 'Check your connection and try again.',
  }[code];
}
