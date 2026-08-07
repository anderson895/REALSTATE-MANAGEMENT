import { getServerConfig } from '../config';
import { getMailTransport } from './transport';

/**
 * One place every outgoing email goes through.
 *
 * The From: header is built here rather than by each caller, so a feature
 * added later cannot send mail that looks like it came from somewhere else.
 */

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  /**
   * Plain-text alternative. Required, not optional.
   *
   * A message with no text part scores badly with spam filters and is
   * unreadable in a client that blocks HTML — and for an email whose entire
   * job is to carry six digits, the text version is the one that always
   * works.
   */
  readonly text: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const { mail } = getServerConfig();

  await getMailTransport().sendMail({
    from: `"${mail.fromName}" <${mail.user}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
