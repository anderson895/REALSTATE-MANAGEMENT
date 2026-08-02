import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { IUnitOfWork, TransactionContext } from '@sfsr/domain';

/**
 * The concrete shape behind the domain's opaque `TransactionContext`.
 * Only infrastructure ever unwraps it.
 */
export interface FirestoreTransactionContext extends TransactionContext {
  readonly tx: Transaction;
}

export function isFirestoreTransaction(
  ctx: TransactionContext | undefined,
): ctx is FirestoreTransactionContext {
  return ctx !== undefined && 'tx' in ctx;
}

/**
 * One atomic boundary per use case.
 *
 * Centralising `runTransaction` here keeps `runTransaction` calls out of the
 * services, which is what lets the domain be tested against in-memory fakes
 * (Development Plan.md §5.6.3).
 *
 * Firestore requires every read in a transaction to happen before any write,
 * and may retry the callback on contention — so the callback must stay free of
 * side effects outside the transaction.
 */
export class FirestoreUnitOfWork implements IUnitOfWork {
  constructor(private readonly db: Firestore) {}

  async execute<T>(work: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async (tx) => {
      const ctx: FirestoreTransactionContext = { kind: 'transaction', tx };
      return work(ctx);
    });
  }
}
