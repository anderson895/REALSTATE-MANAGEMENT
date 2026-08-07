'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { FieldValue } from 'firebase-admin/firestore';
import { can } from '@sfsr/domain';
import { getAdminFirestore } from '@sfsr/infrastructure/server';
import { requireModule, toActor } from '@/lib/session';

const ACTIONS = ['confirm', 'complete', 'cancel'] as const;
type SchedulingAction = (typeof ACTIONS)[number];

function isAction(value: string): value is SchedulingAction {
  return (ACTIONS as readonly string[]).includes(value);
}

/**
 * Claiming and closing a tripping request.
 *
 * ── Why this runs in a transaction ────────────────────────────────────────
 *
 * INTERNAL.xls, WEB PORTAL TO INTERNAL item 1: "ACCEPT/CONFIRM TRIPPING
 * REQUEST (FIRST SALES AGENT TO ACCEPT)". First is the whole rule. Two agents
 * opening the same queue and pressing Accept in the same second must not both
 * come away believing the visit is theirs, so the status is re-read inside the
 * transaction and the write only lands if it is still `Requested`. The loser
 * is told who took it rather than being left with a silent no-op.
 *
 * There is no approver — the sheet marks that column N/A. Nobody signs this
 * off; whoever gets there first owns the callback.
 */
export async function processTripping(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const raw = String(formData.get('action') ?? '');

  if (!id || !isAction(raw)) {
    redirect(`/scheduling?error=${encodeURIComponent('Unknown action.')}`);
  }
  const action: SchedulingAction = raw;

  const session = await requireModule('SCHEDULING');
  if (!can(toActor(session), 'SCHEDULING', 'modify')) {
    redirect(
      `/scheduling?error=${encodeURIComponent('Your role can view this queue but not act on it.')}`,
    );
  }

  const db = getAdminFirestore();
  const ref = db.collection('trippings').doc(id);
  let error: string | null = null;

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('MISSING');
      const current = String(snap.data()?.status ?? 'Requested');

      if (action === 'confirm') {
        if (current !== 'Requested') {
          const taker = snap.data()?.confirmedByName;
          throw new Error(
            taker ? `TAKEN:${taker}` : `STATE:This request is already ${current.toLowerCase()}.`,
          );
        }
        tx.update(ref, {
          status: 'Confirmed',
          confirmedBy: session.employeeId,
          confirmedByName: session.displayName,
          confirmedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      if (action === 'complete') {
        if (current !== 'Confirmed') {
          throw new Error('STATE:Only a confirmed visit can be marked complete.');
        }
        tx.update(ref, { status: 'Completed', completedAt: FieldValue.serverTimestamp() });
        return;
      }

      if (current === 'Completed' || current === 'Cancelled') {
        throw new Error(`STATE:This request is already ${current.toLowerCase()}.`);
      }
      tx.update(ref, {
        status: 'Cancelled',
        cancelledBy: session.employeeId,
        cancelledAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    if (message === 'MISSING') {
      error = 'That request no longer exists.';
    } else if (message.startsWith('TAKEN:')) {
      error = `${message.slice(6)} accepted this request first.`;
    } else if (message.startsWith('STATE:')) {
      error = message.slice(6);
    } else {
      console.error(`Tripping ${id} / ${action} failed:`, cause);
      error = 'Could not update that request. Please try again.';
    }
  }

  if (!error) revalidatePath('/scheduling');

  redirect(
    error
      ? `/scheduling?error=${encodeURIComponent(error)}`
      : `/scheduling?done=${encodeURIComponent(action)}`,
  );
}
