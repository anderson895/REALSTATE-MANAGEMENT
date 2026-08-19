import type { MailMessage } from '../send';

/**
 * The username reminder email.
 *
 * ── Why the username is emailed and never shown on screen ────────────────
 *
 * The form that triggers this takes an email address and answers the same way
 * whatever is typed — "if that address is registered, the username is on its
 * way". Printing the username back into the page instead would turn the form
 * into a lookup anybody could run: type addresses, collect the usernames of
 * St. Francis Square Realty's buyers. Sending it to the mailbox means only
 * someone who can already read that mailbox learns anything.
 *
 * Same 2005 markup as the OTP email next door, and for the same reason: Outlook
 * renders through Word's HTML engine and Gmail strips `<style>` in some views,
 * so inline styles on tables are what survives.
 */

const BRAND = '#234b31';
const INK = '#1a1a1a';
const MUTED = '#6b7280';

export function usernameReminderEmail({
  to,
  usernames,
  firstName,
  signInUrl,
}: {
  to: string;
  /** Every client username on this address — see findClientUsernamesByEmail. */
  usernames: readonly string[];
  firstName?: string;
  signInUrl: string;
}): MailMessage {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const several = usernames.length > 1;

  const lead = several
    ? 'These are the usernames registered to this email address:'
    : 'This is the username registered to this email address:';

  const rows = usernames
    .map(
      (username) =>
        `<tr><td align="center" style="background:#eef4ef;border-radius:10px;padding:16px 12px;">
              <div style="font-size:22px;font-weight:700;letter-spacing:.06em;color:${BRAND};font-family:'Courier New',monospace;">${username}</div>
            </td></tr>
            <tr><td style="height:8px;line-height:8px;">&nbsp;</td></tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f3;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;">

        <tr><td style="background:${BRAND};padding:20px 28px;">
          <div style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.04em;">ST. FRANCIS SQUARE REALTY</div>
          <div style="color:rgba(255,255,255,.7);font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin-top:2px;">Client Portal</div>
        </td></tr>

        <tr><td style="padding:28px;">
          <p style="margin:0 0 14px;font-size:15px;color:${INK};">${greeting}</p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:${INK};">${lead}</p>

          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>

          <p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:${INK};">
            <a href="${signInUrl}" style="color:${BRAND};font-weight:600;">Sign in to your account &rarr;</a>
          </p>

          <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">
            Forgotten your password as well? Use <strong>Forgot password</strong> on the sign-in
            page — you will need the username above to finish signing in afterwards.
          </p>
          <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">
            If you did not ask for this, you can ignore this email — nothing has changed on your
            account, and no one has been given access to it.
          </p>
        </td></tr>

        <tr><td style="border-top:1px solid #e5e7eb;padding:16px 28px;">
          <p style="margin:0;font-size:11px;line-height:1.6;color:${MUTED};">
            Sent to ${to}. St. Francis Square Realty Corporation.<br />
            Please do not reply to this message — this mailbox is not monitored.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    greeting,
    '',
    lead,
    '',
    ...usernames.map((username) => `    ${username}`),
    '',
    `Sign in: ${signInUrl}`,
    '',
    'Forgotten your password as well? Use "Forgot password" on the sign-in page —',
    'you will need the username above to finish signing in afterwards.',
    '',
    'If you did not ask for this, you can ignore this email — nothing has changed',
    'on your account, and no one has been given access to it.',
    '',
    `Sent to ${to}. St. Francis Square Realty Corporation.`,
    'Please do not reply to this message — this mailbox is not monitored.',
  ].join('\n');

  return {
    to,
    subject: several
      ? 'Your St. Francis Square Realty usernames'
      : 'Your St. Francis Square Realty username',
    html,
    text,
  };
}
