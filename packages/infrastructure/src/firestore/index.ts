export { FirestoreRepository, FirestoreUnitRepository } from './unit.repository';
export { FirestoreReservationRepository } from './reservation.repository';
export { FirestoreAuditLogger } from './audit.logger';
export {
  FirestoreUnitOfWork,
  isFirestoreTransaction,
  type FirestoreTransactionContext,
} from './transaction';

export {
  listProjects,
  getProject,
  listUnits,
  getUnit,
  listAvailableParking,
  countUnitsByStatus,
  countUnitsByProject,
  UNIT_STATUSES,
  type UnitStatusCounts,
  MAX_UNITS_PER_QUERY,
  type ProjectSummary,
  type ProjectStats,
  type UnitRow,
  type UnitFilters,
  type ParkingRow,
} from './catalog.queries';

export {
  listReservationsByStatus,
  countReservationsByStatus,
  getReservation,
  getReservationDetail,
  MAX_RESERVATIONS_PER_QUERY,
  type ReservationRow,
  type ReservationBuyer,
  type ReservationPayment,
  type ReservationDocument,
  type ReservationDetail,
  type UploadedFileRef,
} from './reservation.queries';
