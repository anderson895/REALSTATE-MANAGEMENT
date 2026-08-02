import type { DocumentData } from 'firebase-admin/firestore';
import {
  Money,
  ProjectId,
  ReservationNumber,
  Unit,
  UnitId,
  type UnitStatus,
  type UnitType,
} from '@sfsr/domain';

/**
 * Translates between the Firestore document shape and the `Unit` entity.
 *
 * Kept separate on purpose. Letting a raw document flow into the domain is how
 * a `Money` object degrades back into a float somewhere downstream
 * (Development Plan.md §5.6.2).
 */
export class UnitMapper {
  toDomain(id: string, raw: DocumentData): Unit {
    return Unit.reconstitute({
      id: new UnitId(id),
      projectId: new ProjectId(String(raw.projectId)),
      // null for The Legaspi Place and Emerald Park — those sheets have no
      // Tower column (Development Plan.md §12.5).
      tower: raw.tower ? String(raw.tower) : null,
      floor: Number(raw.floor),
      unitNo: String(raw.unitNo),
      unitType: raw.unitType as UnitType,
      areaSqm: Number(raw.areaSqm),
      pricePerSqm: Money.fromCentavos(Number(raw.pricePerSqmCentavos)),
      purchasePrice: Money.fromCentavos(Number(raw.purchasePriceCentavos)),
      status: raw.status as UnitStatus,
      currentReservation: raw.currentReservation
        ? ReservationNumber.parse(String(raw.currentReservation))
        : null,
    });
  }

  toPersistence(unit: Unit): DocumentData {
    return {
      projectId: unit.projectId.value,
      tower: unit.tower,
      floor: unit.floor,
      unitNo: unit.unitNo,
      unitType: unit.unitType,
      areaSqm: unit.areaSqm,
      // Always integers. Never a float (§3.5).
      pricePerSqmCentavos: unit.pricePerSqm.toCentavos(),
      purchasePriceCentavos: unit.purchasePrice.toCentavos(),
      status: unit.status,
      currentReservation: unit.currentReservation?.value ?? null,
    };
  }
}
