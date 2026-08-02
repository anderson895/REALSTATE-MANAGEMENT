import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { DomainEvent, IAuditLogger, TransactionContext } from '@sfsr/domain';
import { isFirestoreTransaction } from './transaction';

/**
 * Append-only audit trail.
 *
 * There is no update or delete method here, and the Security Rules grant only
 * `create` on this collection — to every role, including IT Administrator.
 * `RBAC.xls` assigns "audit trail monitoring" to IT and "audit trail reports"
 * to Account Receivables; a log an administrator can edit provides no
 * assurance to either (Development Plan.md §3.6).
 *
 * Writes happen inside the caller's transaction, so an approval and its audit
 * entry commit together or not at all.
 */
export class FirestoreAuditLogger implements IAuditLogger {
  constructor(private readonly db: Firestore) {}

  async record(
    events: readonly DomainEvent[],
    actor: string,
    ctx?: TransactionContext,
  ): Promise<void> {
    if (events.length === 0) return;

    const collection = this.db.collection('auditLogs');

    for (const event of events) {
      const ref = collection.doc();
      const entry = {
        type: event.type,
        actor,
        payload: event.payload,
        occurredAt: Timestamp.fromDate(event.occurredAt),
        recordedAt: FieldValue.serverTimestamp(),
      };

      if (isFirestoreTransaction(ctx)) {
        ctx.tx.create(ref, entry);
      } else {
        await ref.create(entry);
      }
    }
  }
}
