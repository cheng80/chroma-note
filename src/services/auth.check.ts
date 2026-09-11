import { authErrorCode, mapAuthError } from './auth-error.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(authErrorCode({ status: 429 }, 'send') === 'rate_limited', '429 must map to rate_limited');
assert(authErrorCode({ code: 'otp_expired' }, 'send') === 'otp_expired', 'known codes must survive operation defaults');
assert(authErrorCode({ code: 'rate_limited' }, 'verify') === 'rate_limited', 'known rate limits must survive verification mapping');
assert(authErrorCode({ message: 'invalid email' }, 'send') === 'email_invalid', 'invalid email must map correctly');
assert(authErrorCode({ message: 'OTP has expired' }, 'verify') === 'otp_expired', 'expired OTP must map correctly');
assert(authErrorCode({ message: 'invalid token' }, 'verify') === 'otp_invalid', 'invalid OTP must map correctly');
assert(authErrorCode(new TypeError('fetch failed'), 'send') === 'offline', 'network failures must map to offline');
assert(!mapAuthError({ message: 'server detail: secret' }, 'send').message.includes('secret'), 'raw server messages must not cross the auth boundary');
