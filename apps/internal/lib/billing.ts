import type { ReservationStatus } from '@sfsr/domain';
import type { SummaryCard } from './documentation';

/**
 * The Billing Section dashboard, mapped to the statuses that exist.
 *
 * INTERNAL.xls sheet `USER INTERFACE` draws it as "Dashboard Overview —
 * overview of billing operations and collections across all projects": a strip
 * of counters, each with a count AND a peso figure, then the queues.
 *
 * ── Why the cards are not the same six as Documentation's ────────────────
 *
 * The layout is deliberately identical — same tiles, same per-project split,
 * same queue underneath — because it is one product and a Billing clerk should
 * not have to re-learn a screen when they sit at a different desk. What the
 * tiles COUNT is different, because the desks watch different things:
 * Documentation looks at documents, Billing looks at money.
 */

export const BILLING_CARDS: readonly SummaryCard[] = [
  {
    key: 'awaiting',
    label: 'Awaiting Payment Check',
    tone: 'amber',
    status: 'PendingPaymentVerification',
    href: '/reservations',
  },
  {
    key: 'cleared',
    label: 'Payment Cleared',
    tone: 'emerald',
    status: 'PaymentVerified',
    href: '/reservations',
  },
  {
    key: 'withDocs',
    label: 'With Documentation',
    tone: 'sky',
    status: 'DocumentsVerified',
    href: '/reservations',
  },
  {
    key: 'incomplete',
    label: 'Incomplete Requirements',
    tone: 'violet',
    status: 'DeficiencyNoted',
    href: '/reservations',
  },
  {
    key: 'approved',
    label: 'Approved Accounts',
    tone: 'navy',
    // Contract management is not built; the card counts something real and
    // links nowhere rather than to a 404.
    status: 'Approved',
    href: null,
  },
  {
    key: 'cancelled',
    label: 'Notice of Cancellation',
    tone: 'rose',
    status: 'Cancelled',
    href: null,
  },
];

/**
 * What sits on Billing's desk right now.
 *
 * Only the statuses where the fee is still outstanding. `PaymentVerified` and
 * everything past it have been cleared by this desk already, and a queue that
 * kept showing them would be a list of work that is finished.
 *
 * `DeficiencyNoted` stays: a deficiency raised over a payment comes straight
 * back here, and the buyer's correction has to land somewhere a clerk is
 * looking.
 */
export const PAYMENT_QUEUE_STATUSES: readonly ReservationStatus[] = [
  'PendingPaymentVerification',
  'DeficiencyNoted',
];
