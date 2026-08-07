/**
 * Outgoing email — Nodemailer over Gmail SMTP.
 *
 * Deliberately NOT Firebase's built-in reset email. That one sends a fixed
 * Google template with no branding and wording nobody here controls; owning
 * the send is the whole reason this module exists.
 *
 * Server-only: it holds SMTP credentials. Reached through
 * `@sfsr/infrastructure/server` or `/node`, never from a client component.
 */

export { sendMail, type MailMessage } from './send';
export { getMailTransport, resetMailTransport } from './transport';
export { otpEmail } from './templates/otp';
