import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type {
  IUnitRepository,
  ProjectId,
  TransactionContext,
  Unit,
  UnitId,
} from '@sfsr/domain';
import { UnitMapper } from '../mappers/unit.mapper';
import { isFirestoreTransaction } from './transaction';

/**
 * Shared CRUD for Firestore-backed repositories.
 *
 * Written once here and inherited by every concrete repository, rather than
 * repeated fifteen times (Development Plan.md §3.9, Inheritance).
 */
export abstract class FirestoreRepository<T> {
  protected constructor(
    protected readonly db: Firestore,
    protected readonly collectionName: string,
  ) {}

  protected abstract toDomain(id: string, raw: DocumentData): T;
  protected abstract toPersistence(entity: T): DocumentData;
  protected abstract idOf(entity: T): string;

  protected async getById(id: string, ctx?: TransactionContext): Promise<T | null> {
    const ref = this.db.collection(this.collectionName).doc(id);
    const snap = isFirestoreTransaction(ctx) ? await ctx.tx.get(ref) : await ref.get();
    const data = snap.data();
    return snap.exists && data ? this.toDomain(snap.id, data) : null;
  }

  protected async put(entity: T, ctx?: TransactionContext): Promise<void> {
    const ref = this.db.collection(this.collectionName).doc(this.idOf(entity));
    const data = this.toPersistence(entity);
    if (isFirestoreTransaction(ctx)) {
      ctx.tx.set(ref, data, { merge: true });
    } else {
      await ref.set(data, { merge: true });
    }
  }
}

export class FirestoreUnitRepository extends FirestoreRepository<Unit> implements IUnitRepository {
  private readonly mapper = new UnitMapper();

  constructor(db: Firestore) {
    super(db, 'units');
  }

  protected override toDomain(id: string, raw: DocumentData): Unit {
    return this.mapper.toDomain(id, raw);
  }

  protected override toPersistence(unit: Unit): DocumentData {
    return this.mapper.toPersistence(unit);
  }

  protected override idOf(unit: Unit): string {
    return unit.id.value;
  }

  async findById(id: UnitId, ctx?: TransactionContext): Promise<Unit | null> {
    return this.getById(id.value, ctx);
  }

  async findAvailableByProject(projectId: ProjectId): Promise<Unit[]> {
    const snap = await this.db
      .collection(this.collectionName)
      .where('projectId', '==', projectId.value)
      .where('status', '==', 'Available')
      .get();
    return snap.docs.map((doc) => this.mapper.toDomain(doc.id, doc.data()));
  }

  async save(unit: Unit, ctx?: TransactionContext): Promise<void> {
    return this.put(unit, ctx);
  }
}
