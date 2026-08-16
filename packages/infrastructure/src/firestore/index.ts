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
  computeProjectStats,
  recomputeProjectStats,
  unitPrefixInUse,
  nextUnitId,
  unitNumberTaken,
  type UnitIdAllocation,
} from './catalog.mutations';

export {
  listReservationsByStatus,
  countReservationsByStatus,
  getReservation,
  getReservationDetail,
  resolveEmployeeNames,
  MAX_RESERVATIONS_PER_QUERY,
  type ReservationRow,
  type ReservationBuyer,
  type ReservationPayment,
  type ReservationDocument,
  type DocumentNameCheck,
  type DocumentFormatCheck,
  type ReservationDetail,
  type UploadedFileRef,
} from './reservation.queries';

export {
  listTrippings,
  MAX_TRIPPINGS_PER_QUERY,
  TRIPPING_STATUSES,
  type TrippingRow,
  type TrippingStatus,
} from './tripping.queries';

export {
  listEmployees,
  getEmployee,
  activeEmployeeIdsWithRole,
  isUsernameTaken,
  allocateEmployeeId,
  formatEmployeeId,
  MAX_EMPLOYEES_PER_QUERY,
  type EmployeeRow,
} from './employee.queries';

export {
  listAnnouncements,
  getAnnouncement,
  toAnnouncementRow,
  ANNOUNCEMENT_STATUSES,
  MAX_ANNOUNCEMENTS_PER_QUERY,
  type AnnouncementRow,
  type AnnouncementImage,
  type AnnouncementStatus,
} from './announcement.queries';

export {
  listDocumentQueue,
  listPaymentQueue,
  sumCollectedCentavos,
  getClientMasterfile,
  searchClients,
  listMasterfileProjects,
  listProjectMasterfiles,
  countClients,
  countDocumentQueue,
  countReservationsByStatusAndProject,
  MAX_DOCUMENT_QUEUE,
  type DocumentQueueRow,
  type PaymentQueueRow,
  type ClientMasterfileRow,
  type MasterfileProject,
  type ProjectMasterfileRow,
  type StatusByProject,
} from './documentation.queries';
