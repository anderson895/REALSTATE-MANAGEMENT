import 'server-only';

/**
 * SFSR-REMS infrastructure — SERVER-ONLY entry point.
 *
 * Adapters implementing the ports declared in @sfsr/domain: Firestore
 * repositories, the audit logger, the unit of work, and session handling.
 * This is the only layer that knows a database or a vendor SDK exists
 * (Development Plan.md §5.5, §5.6).
 *
 * The `server-only` import at the top turns an accidental client import into a
 * build error naming this file, instead of a confusing module-not-found deep
 * inside grpc.
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
} from './firestore';

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
