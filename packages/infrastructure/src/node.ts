/**
 * SFSR-REMS infrastructure — NODE entry point (CLI scripts, seeds, tests).
 *
 * Identical surface to `@sfsr/infrastructure/server`, minus the `server-only`
 * guard. That guard throws outside a React Server Component context, which is
 * correct for the apps and wrong for a plain `node` script.
 *
 * Use `/server` from Next.js app code — the guard turns an accidental client
 * import into a clear build error. Use `/node` from anything under scripts/.
 */

export { publicConfig, getServerConfig, type ServerConfig } from './config';
export { getAdminApp, getAdminAuth, getAdminFirestore } from './firebase/admin';

export {
  FirestoreRepository,
  FirestoreUnitRepository,
  FirestoreReservationRepository,
  FirestoreAuditLogger,
  FirestoreUnitOfWork,
  isFirestoreTransaction,
  type FirestoreTransactionContext,
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
} from './firestore';

export {
  createUploadTicket,
  signedUrlFor,
  deleteAsset,
  ACCEPTED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  type AssetKind,
  type UploadTicket,
  type SignedAssetOptions,
} from './cloudinary/storage';

export {
  verifyCaptcha,
  captchaConfigured,
  captchaBypassed,
  type CaptchaResult,
} from './captcha/recaptcha';

export { UnitMapper } from './mappers/unit.mapper';
export { ReservationMapper } from './mappers/reservation.mapper';

export {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  resolveUsername,
  createSessionCookie,
  verifySessionCookie,
  toSession,
  type UsernameRecord,
  type Session,
  type EmployeeSession,
  type ClientSession,
} from './auth';

export { sendMail, otpEmail, getMailTransport, type MailMessage } from './mail';
