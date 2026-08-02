/**
 * Google reCAPTCHA v2 verification — SERVER ONLY.
 *
 * ── Why this has to happen on the server ──────────────────────────────────
 *
 * The widget in the browser produces a token. The token proves nothing on its
 * own: a bot can post whatever string it likes to our register endpoint. The
 * check that matters is this one — we send the token plus our SECRET to
 * Google, and Google tells us whether it issued that token, once, recently.
 *
 * Without this step the checkbox is decorative. That is exactly what the
 * registration form had before: `notARobot: z.literal(true)`, which any bot
 * satisfies by sending `true`.
 *
 * See Development Plan.md §12.33.
 */

const VERIFY_ENDPOINT = 'https://www.google.com/recaptcha/api/siteverify';

export interface CaptchaResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * True when reCAPTCHA is deliberately switched off for local development.
 *
 * Guarded by NODE_ENV so the flag cannot weaken a production deployment even
 * if it is left set in the environment by mistake.
 */
export function captchaBypassed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.RECAPTCHA_DISABLED === 'true';
}

export function captchaConfigured(): boolean {
  return Boolean(process.env.RECAPTCHA_SECRET_KEY?.trim());
}

/**
 * Verifies a reCAPTCHA v2 token.
 *
 * FAILS CLOSED. A missing secret rejects the request rather than waving it
 * through — a silent fallback would turn a misconfigured deployment into an
 * open registration endpoint, and nothing in the UI would show it.
 */
export async function verifyCaptcha(token: string, remoteIp?: string): Promise<CaptchaResult> {
  if (captchaBypassed()) {
    console.warn(
      '[recaptcha] BYPASSED — RECAPTCHA_DISABLED=true in a non-production environment. ' +
        'Registration is unprotected. This flag is ignored when NODE_ENV=production.',
    );
    return { ok: true };
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secret) {
    console.error(
      '[recaptcha] RECAPTCHA_SECRET_KEY is not set. Rejecting registration. ' +
        'Set the key, or set RECAPTCHA_DISABLED=true for local development only.',
    );
    return { ok: false, reason: 'CAPTCHA is not configured on this server.' };
  }

  if (!token || token.trim().length === 0) {
    return { ok: false, reason: 'Please complete the "I am not a robot" check.' };
  }

  const params = new URLSearchParams({ secret, response: token });
  if (remoteIp) params.set('remoteip', remoteIp);

  let body: { success?: boolean; 'error-codes'?: string[] };
  try {
    const response = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      // Google is normally fast; if it is not, do not hang the registration.
      signal: AbortSignal.timeout(10_000),
    });
    body = (await response.json()) as typeof body;
  } catch {
    // Network failure reaching Google. Fail closed: an attacker who can block
    // our outbound request must not thereby disable the check.
    return { ok: false, reason: 'Could not verify the CAPTCHA. Please try again.' };
  }

  if (body.success === true) return { ok: true };

  const codes = body['error-codes'] ?? [];

  // The two a real person actually hits: the token is only valid for about
  // two minutes, and it may be redeemed once.
  if (codes.includes('timeout-or-duplicate')) {
    return { ok: false, reason: 'The CAPTCHA expired. Please tick the box again.' };
  }
  if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) {
    console.error('[recaptcha] Server secret rejected by Google:', codes.join(', '));
    return { ok: false, reason: 'CAPTCHA is misconfigured on this server.' };
  }

  return { ok: false, reason: 'CAPTCHA verification failed. Please try again.' };
}
