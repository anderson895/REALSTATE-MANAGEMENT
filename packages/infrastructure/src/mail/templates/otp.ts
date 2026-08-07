import type { MailMessage } from '../send';

/**
 * The password-reset code email.
 *
 * ── Why the markup looks like 2005 ───────────────────────────────────────
 *
 * Inline styles on tables, not a stylesheet and not flexbox. Email clients are
 * not browsers: Outlook renders through Word's HTML engine, Gmail strips
 * `<style>` blocks in some views, and neither supports flex or grid reliably.
 * Anything modern here degrades to an unstyled wall of text in the clients
 * most Filipino buyers actually use.
 *
 * The palette is the portal's own — #234b31 and the gold accent — because the
 * point of leaving Firebase's built-in email was to own how this looks.
 */

const BRAND = '#234b31';
const INK = '#1a1a1a';
const MUTED = '#6b7280';

export function otpEmail({
  to,
  code,
  firstName,
  ttlMinutes,
}: {
  to: string;
  code: string;
  firstName?: string;
  ttlMinutes: number;
}): MailMessage {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

  /*
   * Spaced digits in the HTML for legibility, unspaced in the text part.
   *
   * Someone reading the plain-text version is likely to copy and paste, and a
   * pasted "1 2 3 4 5 6" fails the form. The HTML version is read off the
   * screen and retyped, where the spacing helps.
   */
  const spaced = code.split('').join(' ');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f7f8fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;">

        <tr><td style="background:${BRAND};padding:20px 28px;">
          <div style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.04em;">ST. FRANCIS SQUARE REALTY</div>
          <div style="color:rgba(255,255,255,.7);font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin-top:2px;">Client Portal</div>
        </td></tr>

        <tr><td style="padding:28px;">
          <p style="margin:0 0 14px;font-size:15px;color:${INK};">${greeting}</p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:${INK};">
            Use this code to reset your St. Francis Square Realty password.
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr><td align="center" style="background:#eef4ef;border-radius:10px;padding:20px 12px;">
              <div style="font-size:30px;font-weight:700;letter-spacing:.34em;color:${BRAND};font-family:'Courier New',monospace;">${spaced}</div>
            </td></tr>
          </table>

          <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">
            The code expires in ${ttlMinutes} minutes and can be used once.
          </p>
          <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">
            If you did not ask to reset your password, you can ignore this email —
            nothing has changed on your account.
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
    'Use this code to reset your St. Francis Square Realty password:',
    '',
    `    ${code}`,
    '',
    `The code expires in ${ttlMinutes} minutes and can be used once.`,
    '',
    'If you did not ask to reset your password, you can ignore this email —',
    'nothing has changed on your account.',
    '',
    `Sent to ${to}. St. Francis Square Realty Corporation.`,
    'Please do not reply to this message — this mailbox is not monitored.',
  ].join('\n');

  return { to, subject: `${code} is your password reset code`, html, text };
}
