import type { DeliveryRecipient } from './model';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseRecipientEmails(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[\s,;]+/)
    .map((recipient) => recipient.trim().toLowerCase())
    .filter(Boolean)
    .filter((recipient) => {
      if (seen.has(recipient)) return false;
      seen.add(recipient);
      return true;
    });
}

export function invalidRecipientEmails(value: string) {
  return parseRecipientEmails(value).filter((email) => !emailPattern.test(email));
}

export function upsertSentRecipients(current: DeliveryRecipient[], recipients: string[]) {
  const next = [...current];

  recipients.forEach((email) => {
    const existingIndex = next.findIndex((recipient) => recipient.email.toLowerCase() === email);
    const sentRecipient: DeliveryRecipient = { email, status: 'sent', at: 'Just now' };

    if (existingIndex >= 0) {
      next[existingIndex] = sentRecipient;
      return;
    }

    next.push(sentRecipient);
  });

  return next;
}
