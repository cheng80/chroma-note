import type { Session } from '@supabase/supabase-js';

import { mapAuthError, type AuthServiceError } from './auth-error';
import { getSupabase } from './supabase';

export { authErrorCode, mapAuthError } from './auth-error';
export type { AuthErrorCode, AuthServiceError } from './auth-error';

export type AuthServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: AuthServiceError };

export interface EmailOtpSent {
  resendAvailableAt: number;
}

const OTP_RESEND_COOLDOWN_MS = 60_000;
let resendCooldown: { email: string; availableAt: number } | null = null;

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function sendEmailOtp(email: string): Promise<AuthServiceResult<EmailOtpSent>> {
  const normalizedEmail = email.trim();
  if (!validEmail(normalizedEmail)) return { data: null, error: { code: 'email_invalid', message: 'Enter a valid email address.' } };
  if (resendCooldown?.email === normalizedEmail && Date.now() < resendCooldown.availableAt) {
    return { data: null, error: { code: 'rate_limited', message: 'Please wait before requesting another code.' } };
  }

  try {
    const { error } = await getSupabase().auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: true },
    });
    if (error) return { data: null, error: mapAuthError(error, 'send') };

    resendCooldown = { email: normalizedEmail, availableAt: Date.now() + OTP_RESEND_COOLDOWN_MS };
    return { data: { resendAvailableAt: resendCooldown.availableAt }, error: null };
  } catch (error) {
    return { data: null, error: mapAuthError(error, 'send') };
  }
}

export async function verifyEmailOtp(email: string, code: string): Promise<AuthServiceResult<Session>> {
  const normalizedEmail = email.trim();
  if (!validEmail(normalizedEmail)) return { data: null, error: { code: 'email_invalid', message: 'Enter a valid email address.' } };
  if (!/^\d{6}$/.test(code.trim())) return { data: null, error: { code: 'otp_invalid', message: 'Enter the six-digit code.' } };

  try {
    const { data, error } = await getSupabase().auth.verifyOtp({ email: normalizedEmail, token: code.trim(), type: 'email' });
    if (error || !data.session) return { data: null, error: mapAuthError(error, 'verify') };
    resendCooldown = null;
    return { data: data.session, error: null };
  } catch (error) {
    return { data: null, error: mapAuthError(error, 'verify') };
  }
}

export async function signOut(): Promise<AuthServiceResult<void>> {
  try {
    const { error } = await getSupabase().auth.signOut();
    if (error) return { data: null, error: mapAuthError(error, 'sign_out') };
    resendCooldown = null;
    return { data: undefined, error: null };
  } catch (error) {
    return { data: null, error: mapAuthError(error, 'sign_out') };
  }
}
