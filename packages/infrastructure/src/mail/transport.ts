import nodemailer, { type Transporter } from 'nodemailer';
import { getServerConfig } from '../config';

/**
 * Gmail SMTP transport, created once per process.
 *
 * Nodemailer pools connections behind a transporter, so building a new one per
 * email would open a fresh TLS handshake to Gmail every time — slow, and it
 * counts against the same connection limits that get an account throttled.
 *
 * ── What Gmail requires ──────────────────────────────────────────────────
 *
 * `GMAIL_APP_PASSWORD` is an APP PASSWORD, not the account password. Google
 * only issues one when 2-Step Verification is on, and rejects the account
 * password outright. If sending fails with "Username and Password not
 * accepted", that is almost always the cause.
 *
 * Free Gmail allows roughly 500 recipients a day, Workspace about 2,000. That
 * is ample for password resets and nowhere near enough for a mailing list, so
 * nothing bulk should ever be routed through here.
 */

let cached: Transporter | null = null;

export function getMailTransport(): Transporter {
  if (cached) return cached;

  const { mail } = getServerConfig();

  // Checked HERE rather than in the config, so an unset mail credential fails
  // the password-reset email and leaves the rest of the portal running.
  if (!mail.user || !mail.appPassword) {
    throw new Error(
      'Email is not configured: set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local. ' +
        'GMAIL_APP_PASSWORD must be an App Password from a Google account with ' +
        '2-Step Verification enabled — the account password will not work.',
    );
  }

  cached = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: mail.user, pass: mail.appPassword },
    // Reuse one connection across sends rather than reconnecting per message.
    pool: true,
    maxConnections: 1,
    // Gmail is occasionally slow to answer; without a ceiling a hung SMTP
    // session would hold a serverless function open until the platform kills
    // it, and the caller would see a timeout with no explanation.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return cached;
}

/** Only for tests, which must not share a live transport between cases. */
export function resetMailTransport(): void {
  cached = null;
}
