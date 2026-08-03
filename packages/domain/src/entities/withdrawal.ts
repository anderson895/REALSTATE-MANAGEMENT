import type { ReservationStatus } from './reservation';

/**
 * Voluntary withdrawal of a reservation, initiated by the buyer.
 *
 * ── Why a REQUEST, and not a status change ───────────────────────────────
 *
 * Both source documents point at this shape once they are read precisely.
 *
 * RESERVATION.doc, Terms clause 5 — which the buyer accepts in Step 7 — names
 * the action: "voluntary withdrawal of the reservation application MAY RESULT
 * IN cancellation of the reservation IN ACCORDANCE WITH COMPANY POLICY". Not
 * "cancels the reservation". The buyer supplies the intent; the company
 * applies its policy; cancellation may follow.
 *
 * Development Plan.md §8.4 supplies that policy: `Cancelled` is reachable only
 * from `Expired`, and only through "authorized personnel … upon management
 * approval … through the Internal Management System". `Reservation.cancel()`
 * enforces it by demanding two distinct employees — "what stops a single staff
 * member cancelling a live reservation outright".
 *
 * A buyer pressing a button is a single person. Letting that press move the
 * status would delete a safeguard standing in front of a ₱50,000 forfeiture
 * that clause 4 declares NON-REFUNDABLE.
 *
 * So the request is recorded BESIDE the status. The reservation carries on
 * through its normal workflow, flagged, until staff act on it through the
 * supervised path that already exists.
 */

/**
 * Statuses a buyer may still ask to withdraw from.
 *
 * Everything up to approval. From `Approved` onward contract preparation has
 * begun and withdrawal stops being a form action; `Cancelled`, `Completed` and
 * `Expired` are already finished.
 */
const WITHDRAWABLE: readonly ReservationStatus[] = [
  'PendingPaymentVerification',
  'PaymentVerified',
  'DocumentsVerified',
  'DeficiencyNoted',
];

export function canRequestWithdrawal(status: ReservationStatus | string): boolean {
  return (WITHDRAWABLE as readonly string[]).includes(status);
}

/** Longest reason stored. Beyond this it is a conversation, not a form field. */
export const MAX_WITHDRAWAL_REASON = 500;
