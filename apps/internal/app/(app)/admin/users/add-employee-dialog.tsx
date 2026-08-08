'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, UserPlus } from 'lucide-react';
import type { InternalRole } from '@sfsr/domain';
import { FormError, Modal, TextField } from '@sfsr/ui';
import { DEFAULT_DEPARTMENTS, defaultPositionFor, type EmployeeRank } from '@/lib/employees';
import { createEmployee, suggestEmployeeUsername, type CreatedEmployee } from './actions';
import { RoleFields, type RoleFieldsValue } from './employee-fields';

/**
 * Add an employee, in a dialog.
 *
 * ── Why a dialog rather than a panel on the page ─────────────────────────
 *
 * It was a panel, permanently open above the roster, and it was the largest
 * thing on a screen whose actual job is the roster. Adding staff happens a
 * handful of times a year; reading the list happens every time anyone opens
 * this page. The form now costs one button until it is wanted.
 *
 * The handover panel stays INSIDE the dialog rather than replacing the page,
 * because it holds the one and only sight of the temporary password.
 */
export function AddEmployeeDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<CreatedEmployee | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [fields, setFields] = useState<RoleFieldsValue>({
    // Marketing first, because it is the role RBAC.xls leaves with no seeded
    // account at all and therefore the one this screen exists to create.
    role: 'MARKETING' as InternalRole,
    rank: 'Staff' as EmployeeRank,
    department: DEFAULT_DEPARTMENTS.MARKETING,
    position: defaultPositionFor('MARKETING', 'Staff'),
  });

  function reset() {
    setErrors({});
    setCreated(null);
    setFirstName('');
    setLastName('');
    setUsername('');
    setFields({
      role: 'MARKETING' as InternalRole,
      rank: 'Staff' as EmployeeRank,
      department: DEFAULT_DEPARTMENTS.MARKETING,
      position: defaultPositionFor('MARKETING', 'Staff'),
    });
  }

  /** Suggested once both names are present and the field is still empty. */
  function suggest() {
    if (username.trim() !== '' || !firstName.trim() || !lastName.trim()) return;
    startTransition(async () => {
      const suggestion = await suggestEmployeeUsername(firstName, lastName);
      if (suggestion) setUsername(suggestion);
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const result = await createEmployee({ firstName, lastName, username, ...fields });

      if (!result.ok) {
        setErrors(result.fieldErrors);
        return;
      }

      setCreated(result.employee);
      // The roster behind the dialog is a server component — refresh it rather
      // than splicing the new row in, so what is on screen is what was written.
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Cleared on close, not on open: a form that resets as it appears
        // flickers, and a dialog reopened after a failed submit should not
        // still be showing last time's errors.
        if (!next) reset();
      }}
      size="lg"
      title={created ? 'Account created' : 'Add an employee'}
      description={
        created
          ? undefined
          : 'Creates the Firebase Auth user, its role claims, the employee record and the username index in one step — the same four records the seed writes.'
      }
      trigger={
        <button
          type="button"
          className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-navy-800 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700"
        >
          <UserPlus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Add employee
        </button>
      }
    >
      {created ? (
        <Handover
          employee={created}
          onAddAnother={() => {
            reset();
          }}
          onClose={() => setOpen(false)}
        />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {errors.form ? <FormError>{errors.form}</FormError> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="First name"
              name="firstName"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              onBlur={suggest}
              error={errors.firstName}
              autoComplete="off"
            />
            <TextField
              label="Last name"
              name="lastName"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              onBlur={suggest}
              error={errors.lastName}
              autoComplete="off"
            />
          </div>

          <RoleFields value={fields} onChange={setFields} errors={errors} />

          <TextField
            label="Username"
            name="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={errors.username}
            hint="6–20 characters, letters and numbers only. This is what they type at the login screen — there is no email."
            autoComplete="off"
          />

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/**
 * The one and only sight of the temporary password.
 *
 * Deliberately a whole panel rather than a toast, and it does not close itself.
 * Firebase Auth stores a hash and there is no way to show this string again —
 * if the administrator misses it, the account has to be reset. A message that
 * fades after four seconds is the wrong shape for something unrecoverable.
 */
function Handover({
  employee,
  onAddAnother,
  onClose,
}: {
  employee: CreatedEmployee;
  onAddAnother: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
          {employee.fullName} can now sign in
        </p>

        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="Employee ID" value={employee.employeeId} />
          <Row label="Role" value={employee.roleLabel} />
          <Row label="Username" value={employee.username} />
        </dl>

        <div className="mt-3 rounded-lg border border-emerald-300 bg-white px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
            <KeyRound className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Temporary password
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <code className="tabular select-all text-base font-semibold tracking-wide text-navy-800">
              {employee.temporaryPassword}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(employee.temporaryPassword).then(
                  () => setCopied(true),
                  // A denied clipboard permission must not read as "copied".
                  () => setCopied(false),
                );
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            Write this down or hand it over now. It is not stored anywhere and cannot be shown
            again — the account has to be reset in Firebase if it is lost.
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onAddAnother}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          Add another
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="text-sm font-medium text-navy-800">{value}</dd>
    </div>
  );
}
