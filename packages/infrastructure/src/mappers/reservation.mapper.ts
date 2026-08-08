import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import {
  ClientId,
  EmployeeId,
  ParkingSlotId,
  Reservation,
  ReservationNumber,
  UnitId,
  type VerificationRecord,
  type DownPaymentTier,
  type FinancingOption,
  type PaymentTerm,
  type ReservationStatus,
} from '@sfsr/domain';

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(String(value));
}

function toDateOrNull(value: unknown): Date | null {
  return value == null ? null : toDate(value);
}

/**
 * `{ by, at }` from the stored pair, or null.
 *
 * Both halves must be present. A record with a name and no timestamp — or the
 * reverse — is a half-written verification, and treating it as done would let
 * the approval gate open on it.
 */
function toVerification(by: unknown, at: unknown): VerificationRecord | null {
  if (by == null || at == null) return null;
  const id = String(by).trim();
  if (id === '') return null;
  return { by: new EmployeeId(id), at: toDate(at) };
}

/** Firestore document ↔ `Reservation` entity (Development Plan.md §5.6.2). */
export class ReservationMapper {
  toDomain(id: string, raw: DocumentData): Reservation {
    return Reservation.reconstitute({
      number: ReservationNumber.parse(id),
      clientId: new ClientId(String(raw.clientId)),
      unitId: new UnitId(String(raw.unitId)),
      parkingSlotId: raw.parkingSlotId ? new ParkingSlotId(String(raw.parkingSlotId)) : null,
      salesAgentId: raw.salesAgentId ? String(raw.salesAgentId) : null,
      terms: {
        downPaymentTier: Number(raw.downPaymentTier) as DownPaymentTier,
        paymentTerm: raw.paymentTerm as PaymentTerm,
        financingOption: raw.financingOption as FinancingOption,
      },
      reservedAt: toDate(raw.reservedAt),
      status: raw.status as ReservationStatus,
      deficiencyDueAt: toDateOrNull(raw.deficiencyDueAt),
      deficiencyReason: raw.deficiencyReason ? String(raw.deficiencyReason) : null,
      paymentVerified: toVerification(raw.paymentVerifiedBy, raw.paymentVerifiedAt),
      documentsVerified: toVerification(raw.documentsVerifiedBy, raw.documentsVerifiedAt),
      approved: toVerification(raw.approvedBy, raw.approvedAt),
    });
  }

  toPersistence(reservation: Reservation): DocumentData {
    return {
      clientId: reservation.clientId.value,
      unitId: reservation.unitId.value,
      parkingSlotId: reservation.parkingSlotId?.value ?? null,
      salesAgentId: reservation.salesAgentId,
      downPaymentTier: reservation.terms.downPaymentTier,
      paymentTerm: reservation.terms.paymentTerm,
      financingOption: reservation.terms.financingOption,
      reservedAt: Timestamp.fromDate(reservation.reservedAt),
      status: reservation.status,
      deficiencyDueAt: reservation.deficiencyDueAt
        ? Timestamp.fromDate(reservation.deficiencyDueAt)
        : null,
      deficiencyReason: reservation.deficiencyReason,
      /*
       * The two verification tracks, flat rather than nested.
       *
       * Firestore can only index and filter on a top-level field, and the
       * Documentation dashboard wants "everything Billing has cleared but
       * Documentation has not". Nested under a `verification` map that query
       * would need a composite index on a sub-field for every combination.
       */
      paymentVerifiedBy: reservation.paymentVerified?.by.value ?? null,
      paymentVerifiedAt: reservation.paymentVerified
        ? Timestamp.fromDate(reservation.paymentVerified.at)
        : null,
      documentsVerifiedBy: reservation.documentsVerified?.by.value ?? null,
      documentsVerifiedAt: reservation.documentsVerified
        ? Timestamp.fromDate(reservation.documentsVerified.at)
        : null,
      approvedBy: reservation.approved?.by.value ?? null,
      approvedAt: reservation.approved ? Timestamp.fromDate(reservation.approved.at) : null,
      // Denormalised for the Expired Reservation Report, which filters on it.
      documentDeadline: Timestamp.fromDate(reservation.documentDeadline),
    };
  }
}
