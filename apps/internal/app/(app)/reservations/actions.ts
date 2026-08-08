'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { DomainError, EmployeeId, ReservationNumber } from '@sfsr/domain';
import { requireModule, toActor } from '@/lib/session';
import {
  canTakeAction,
  isReservationAction,
  moduleFor,
  reservationWorkflow,
  type ReservationAction,
} from '@/lib/reservations';

/**
 * The single entry point for every reservation transition the Internal system
 * can perform.
 *
 * One action rather than four because the shape is identical each time —
 * authorise, transition, revalidate, report — and the branch that differs is
 * three lines. The entity is what actually enforces the order of the stages;
 * everything here is authorisation and plumbing.
 *
 * Layer 2 of three (Development Plan.md §3.3). `proxy.ts` checks the cookie
 * exists, this re-checks the RBAC grant even though the button was only drawn
 * for someone who has it, and the Security Rules seal the collection from the
 * browser regardless.
 */
export async function processReservation(formData: FormData): Promise<void> {
  const number = String(formData.get('number') ?? '');
  const rawAction = String(formData.get('action') ?? '');
  const reason = String(formData.get('reason') ?? '');
  const requested = String(formData.get('returnTo') ?? '');

  // Only ever redirect within this app — a returnTo from the form is input.
  const returnTo =
    requested.startsWith('/') && !requested.startsWith('//')
      ? requested
      : `/reservations/${number}`;

  if (!isReservationAction(rawAction)) {
    redirect(`${returnTo}?error=${encodeURIComponent('Unknown action.')}`);
  }
  const action: ReservationAction = rawAction;

  const gate = moduleFor(action);
  const session = await requireModule(gate);
  const actor = toActor(session);

  /*
   * Both gates at once: the module grant, and the desk that owns the step.
   *
   * `approve` is granted by the supervisor flag rather than the module row —
   * "All Supervisor per personnel is the approver of the transaction" — and
   * the two verifications are split between Billing and Documentation, so
   * neither desk can sign off the other's half. See `canTakeAction`.
   */
  if (!canTakeAction(actor, action)) {
    redirect(
      `${returnTo}?error=${encodeURIComponent('Your role cannot perform that action.')}`,
    );
  }

  let error: string | null = null;
  try {
    const workflow = reservationWorkflow();
    const ref = ReservationNumber.parse(number);
    const by = new EmployeeId(session.employeeId);
    const at = new Date();

    switch (action) {
      case 'verifyPayment':
        await workflow.verifyPayment(ref, by, at);
        break;
      case 'verifyDocuments':
        await workflow.verifyDocuments(ref, by, at);
        break;
      case 'approve':
        await workflow.approve(ref, by, session.isSupervisor, at);
        break;
      case 'noteDeficiency':
        await workflow.noteDeficiency(ref, reason, by, at);
        break;
      case 'markExpired':
        // The workflow re-checks the deadline itself, so a stale screen
        // offering this button cannot expire a reservation early.
        await workflow.markExpired(ref, by, at);
        break;
    }
  } catch (cause) {
    // A domain error is a rule saying no — a stale queue, a missing reason, a
    // unit taken meanwhile. That is a normal outcome and its message is
    // already written for a human, so it is shown as-is.
    if (cause instanceof DomainError) {
      error = cause.message;
    } else {
      console.error(`Reservation ${number} / ${action} failed:`, cause);
      error = 'Could not complete that step. Please try again.';
    }
  }

  if (!error) {
    // verifyPayment holds the unit and approve sells it, so the cached
    // inventory figures on the dashboard are stale the moment either lands.
    // `updateTag` rather than `revalidateTag` because this is a Server Action
    // and the employee who just approved must see their own write on the next
    // screen, not one revalidation later.
    updateTag('units');
    updateTag('projects');
    revalidatePath('/reservations');
    revalidatePath('/approvals');
    revalidatePath(`/reservations/${number}`);
  }

  redirect(
    error
      ? `${returnTo}?error=${encodeURIComponent(error)}`
      : `${returnTo}?done=${encodeURIComponent(action)}`,
  );
}
