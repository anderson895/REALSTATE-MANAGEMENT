import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import {
  ReservationNumber,
  type ClientId,
  type IReservationRepository,
  type Reservation,
  type TransactionContext,
} from '@sfsr/domain';
import { ReservationMapper } from '../mappers/reservation.mapper';
import { FirestoreRepository } from './unit.repository';
import { isFirestoreTransaction } from './transaction';

export class FirestoreReservationRepository
  extends FirestoreRepository<Reservation>
  implements IReservationRepository
{
  private readonly mapper = new ReservationMapper();

  constructor(db: Firestore) {
    super(db, 'reservations');
  }

  protected override toDomain(id: string, raw: DocumentData): Reservation {
    return this.mapper.toDomain(id, raw);
  }

  protected override toPersistence(reservation: Reservation): DocumentData {
    return this.mapper.toPersistence(reservation);
  }

  protected override idOf(reservation: Reservation): string {
    return reservation.number.value;
  }

  async findByNumber(
    number: ReservationNumber,
    ctx?: TransactionContext,
  ): Promise<Reservation | null> {
    return this.getById(number.value, ctx);
  }

  async findByClient(clientId: ClientId): Promise<Reservation[]> {
    const snap = await this.db
      .collection(this.collectionName)
      .where('clientId', '==', clientId.value)
      .orderBy('reservedAt', 'desc')
      .get();
    return snap.docs.map((doc) => this.mapper.toDomain(doc.id, doc.data()));
  }

  /**
   * Allocates the next reference for the year, gap-free.
   *
   * Reads and increments a counter document inside the caller's transaction.
   * Two buyers submitting in the same second therefore serialise here rather
   * than both receiving RES-2026-000001 (Development Plan.md §8.6).
   */
  async nextNumber(year: number, ctx: TransactionContext): Promise<ReservationNumber> {
    if (!isFirestoreTransaction(ctx)) {
      throw new Error('nextNumber must run inside a Firestore transaction.');
    }
    const ref = this.db.collection('counters').doc(`reservations-${year}`);
    const snap = await ctx.tx.get(ref);
    const current = snap.exists ? Number(snap.data()?.value ?? 0) : 0;
    const next = current + 1;
    ctx.tx.set(ref, { value: next, year }, { merge: true });
    return ReservationNumber.create(year, next);
  }

  async save(reservation: Reservation, ctx?: TransactionContext): Promise<void> {
    return this.put(reservation, ctx);
  }
}
