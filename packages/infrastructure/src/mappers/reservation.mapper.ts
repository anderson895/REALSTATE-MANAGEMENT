import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import {
  ClientId,
  ParkingSlotId,
  Reservation,
  ReservationNumber,
  UnitId,
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
      // Denormalised for the Expired Reservation Report, which filters on it.
      documentDeadline: Timestamp.fromDate(reservation.documentDeadline),
    };
  }
}
