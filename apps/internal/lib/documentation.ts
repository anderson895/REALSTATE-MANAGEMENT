import type { ReservationStatus } from '@sfsr/domain';

/**
 * The Documentation Department dashboard, mapped to the statuses that exist.
 *
 * INTERNAL.xls sheet `USER INTERFACE` heads that screen with six counters. It
 * names them in the department's own language — "Documents for Review" — while
 * the database speaks the state machine's — `PaymentVerified`. This table is
 * the translation, and it is the only place the two vocabularies meet.
 *
 * Every figure is a live count() aggregation over the status, so a card cannot
 * disagree with the queue underneath it.
 */

export interface SummaryCard {
  readonly key: string;
  /** The sheet's wording, not the status name. */
  readonly label: string;
  readonly tone: 'navy' | 'emerald' | 'amber' | 'sky' | 'rose' | 'violet';
  /** Which reservation status this counts; null for the client tally. */
  readonly status: ReservationStatus | null;
  /** Where "View details" goes, or null when there is no screen for it yet. */
  readonly href: string | null;
}

/**
 * The six cards, in the sheet's order.
 *
 * "Notice of Cancellation" counts `Cancelled` rather than a notice queue of its
 * own — RESERVATION.doc has no such queue, and the sheet's card shows a number,
 * not a list. `Expired` is deliberately NOT folded in with it: a reservation
 * that lapsed on the 30-day documentary deadline was never cancelled by anyone,
 * and the Expired Reservation Report is a separate line in the same document.
 */
export const SUMMARY_CARDS: readonly SummaryCard[] = [
  {
    key: 'new',
    label: 'New Reservations',
    tone: 'violet',
    status: 'PendingPaymentVerification',
    href: '/reservations',
  },
  {
    key: 'review',
    label: 'Documents for Review',
    tone: 'emerald',
    status: 'PaymentVerified',
    href: '/reservations',
  },
  {
    key: 'incomplete',
    label: 'Incomplete Requirements',
    tone: 'amber',
    status: 'DeficiencyNoted',
    href: '/reservations',
  },
  {
    key: 'signing',
    label: 'Clients Due for Contract Signing',
    tone: 'sky',
    status: 'Approved',
    // Contract management is not built. A card that counts something real but
    // links nowhere is honest; one that links to a 404 is not.
    href: null,
  },
  {
    key: 'cancelled',
    label: 'Notice of Cancellation',
    tone: 'rose',
    status: 'Cancelled',
    href: null,
  },
  {
    key: 'clients',
    label: 'Active Client Masterfiles',
    tone: 'navy',
    status: null,
    href: null,
  },
];

/**
 * The statuses this desk actually works.
 *
 * Narrower than the six cards above: the cards report on the whole pipeline so
 * the department can see what is coming, but only these three are sitting in
 * front of Documentation right now. `Approved` and `Cancelled` have left the
 * desk — showing them in the queue would invite an action on a record this
 * role can no longer move.
 */
export const DOCUMENT_QUEUE_STATUSES: readonly ReservationStatus[] = [
  'PendingPaymentVerification',
  'PaymentVerified',
  'DeficiencyNoted',
];

/**
 * The colour a document type is drawn in.
 *
 * The sheet gives each type its own pill — Reservation Form blue, Valid ID
 * green, TIN/BIR violet, Proof of Payment amber, Marriage Certificate rose.
 * The point is scanning: a reviewer working down the column sees the SHAPE of
 * the queue before reading a word of it.
 *
 * Matched loosely on the stored string rather than an enum because `docType`
 * is free text on the document record — the Portal writes "Government ID" and
 * nothing constrains what a later screen might write.
 */
export function documentTypeTone(
  docType: string | null,
): 'sky' | 'emerald' | 'violet' | 'amber' | 'rose' | 'neutral' {
  if (!docType) return 'neutral';
  const value = docType.toLowerCase();
  if (value.includes('reservation')) return 'sky';
  if (value.includes('id') || value.includes('passport')) return 'emerald';
  if (value.includes('tin') || value.includes('bir')) return 'violet';
  if (value.includes('payment') || value.includes('receipt')) return 'amber';
  if (value.includes('marriage') || value.includes('birth')) return 'rose';
  return 'neutral';
}

/** How the document's own validation state is worded on screen. */
export function documentStatusTone(status: string | null): 'amber' | 'emerald' | 'rose' | 'neutral' {
  if (!status) return 'neutral';
  const value = status.toLowerCase();
  if (value.includes('pending')) return 'amber';
  if (value.includes('valid') || value.includes('verified')) return 'emerald';
  if (value.includes('reject') || value.includes('invalid')) return 'rose';
  return 'neutral';
}
