import type {
  ClientId,
  DomainEvent,
  IAuditLogger,
  IReservationRepository,
  IUnitOfWork,
  IUnitRepository,
  ProjectId,
  Reservation,
  ReservationNumber,
  TransactionContext,
  Unit,
  UnitId,
} from '@sfsr/domain';
import { ReservationNumber as ReservationNumberVO } from '@sfsr/domain';

/**
 * In-memory implementations of the domain ports, for tests.
 *
 * These substitute for the Firestore adapters (Liskov, §3.10 L). The entities
 * they store and return are the real production classes, so the business rules
 * under test are the shipped rules — only the storage is swapped.
 *
 * Lets the whole domain suite run with no emulator, no Java, and no network,
 * which matters when a panel asks to see the tests run live (§11.1).
 */

const TX: TransactionContext = { kind: 'transaction' };

/**
 * Runs the callback directly. There is no rollback: these fakes exist to
 * verify business rules, not transactional semantics. Atomicity is a Firestore
 * behaviour and is covered by the emulator tests instead.
 */
export class InMemoryUnitOfWork implements IUnitOfWork {
  async execute<T>(work: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return work(TX);
  }
}

export class InMemoryUnitRepository implements IUnitRepository {
  private readonly units = new Map<string, Unit>();

  seed(...units: Unit[]): this {
    for (const unit of units) {
      this.units.set(unit.id.value, unit);
    }
    return this;
  }

  async findById(id: UnitId): Promise<Unit | null> {
    return this.units.get(id.value) ?? null;
  }

  async findAvailableByProject(projectId: ProjectId): Promise<Unit[]> {
    return [...this.units.values()].filter(
      (u) => u.projectId.value === projectId.value && u.isAvailable(),
    );
  }

  async save(unit: Unit): Promise<void> {
    this.units.set(unit.id.value, unit);
  }
}

export class InMemoryReservationRepository implements IReservationRepository {
  private readonly reservations = new Map<string, Reservation>();
  private sequence = 0;

  seed(...reservations: Reservation[]): this {
    for (const reservation of reservations) {
      this.reservations.set(reservation.number.value, reservation);
    }
    return this;
  }

  async findByNumber(number: ReservationNumber): Promise<Reservation | null> {
    return this.reservations.get(number.value) ?? null;
  }

  async findByClient(clientId: ClientId): Promise<Reservation[]> {
    return [...this.reservations.values()].filter((r) => r.clientId.value === clientId.value);
  }

  async nextNumber(year: number): Promise<ReservationNumber> {
    this.sequence += 1;
    return ReservationNumberVO.create(year, this.sequence);
  }

  async save(reservation: Reservation): Promise<void> {
    this.reservations.set(reservation.number.value, reservation);
  }
}

export interface RecordedAudit {
  readonly event: DomainEvent;
  readonly actor: string;
}

export class InMemoryAuditLogger implements IAuditLogger {
  readonly entries: RecordedAudit[] = [];

  async record(events: readonly DomainEvent[], actor: string): Promise<void> {
    for (const event of events) {
      this.entries.push({ event, actor });
    }
  }

  types(): string[] {
    return this.entries.map((e) => e.event.type);
  }
}
