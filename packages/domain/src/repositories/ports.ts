import type { Reservation } from '../entities/reservation';
import type { Unit } from '../entities/unit';
import type { DomainEvent } from '../events/domain-event';
import type { ClientId, ProjectId, ReservationNumber, UnitId } from '../value-objects/identifiers';

/**
 * Repository ports.
 *
 * The domain DECLARES what it needs; @sfsr/infrastructure supplies Firestore
 * implementations. Nothing in this file may import a vendor SDK — the ESLint
 * boundary rule fails the build if it does (Development Plan.md §5.5).
 *
 * The payoff is testability: services depend on these interfaces, so their
 * tests inject in-memory fakes and run with no emulator, no Java, no network.
 */

/**
 * Opaque transaction handle.
 *
 * The domain passes it from the unit of work into repository calls without
 * ever inspecting it. Only infrastructure knows it wraps a Firestore
 * transaction, which is what keeps the domain free of vendor types.
 */
export interface TransactionContext {
  readonly kind: 'transaction';
}

export interface IUnitOfWork {
  /** Runs `work` atomically. Everything commits, or nothing does. */
  execute<T>(work: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}

export interface IUnitRepository {
  findById(id: UnitId, ctx?: TransactionContext): Promise<Unit | null>;
  findAvailableByProject(projectId: ProjectId): Promise<Unit[]>;
  save(unit: Unit, ctx?: TransactionContext): Promise<void>;
}

export interface IReservationRepository {
  findByNumber(number: ReservationNumber, ctx?: TransactionContext): Promise<Reservation | null>;
  findByClient(clientId: ClientId): Promise<Reservation[]>;
  /**
   * Allocates the next gap-free reference for the given year.
   * Must run inside a transaction so concurrent submissions cannot collide
   * (Development Plan.md §8.6).
   */
  nextNumber(year: number, ctx: TransactionContext): Promise<ReservationNumber>;
  save(reservation: Reservation, ctx?: TransactionContext): Promise<void>;
}

export interface IAuditLogger {
  /**
   * Appends domain events to the immutable audit trail.
   * Called inside the same transaction as the state change, so an approval
   * and its audit entry commit together or not at all (§3.6).
   */
  record(events: readonly DomainEvent[], actor: string, ctx?: TransactionContext): Promise<void>;
}

/** Files uploaded by buyers — IDs, receipts, contracts. */
export interface IDocumentStorage {
  /** Time-limited URL for an authenticated (non-public) asset. */
  signedUrl(publicId: string, expiresInSeconds: number): Promise<string>;
  delete(publicId: string): Promise<void>;
}

export interface OcrResult {
  readonly text: string;
  readonly confidence: number;
}

export interface IOcrEngine {
  extractText(imageUrl: string): Promise<OcrResult>;
}
