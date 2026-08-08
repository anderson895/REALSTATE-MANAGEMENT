'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { isInternalRole, type InternalRole } from '@sfsr/domain';
import { FormError, Modal, TextField } from '@sfsr/ui';
import { isEmployeeRank, type EmployeeRank } from '@/lib/employees';
import { updateEmployee } from './actions';
import { RoleFields, type RoleFieldsValue } from './employee-fields';

export interface EditableEmployee {
  readonly id: string;
  readonly fullName: string;
  readonly username: string;
  readonly role: string;
  readonly userRole: string;
  readonly department: string;
  readonly position: string;
}

/**
 * Edit an existing account.
 *
 * ── What is missing from this form, on purpose ───────────────────────────
 *
 * The username. It is the key into the `usernames` index, it is what the person
 * types at the login screen, and it is what half the seeded accounts are known
 * by. Renaming it means moving an index entry, invalidating a live session, and
 * leaving audit entries written under a name that no longer resolves. It is
 * shown, greyed, so nobody hunts for the control that would change it.
 *
 * ── The warning under the role, and why it is worth the space ────────────
 *
 * Changing role, rank or department rewrites the account's auth claims, and the
 * server then revokes its refresh tokens so the change actually takes effect
 * rather than waiting up to five days for a session cookie to expire. That
 * signs the person OUT — possibly mid-task. An administrator fixing a job title
 * should know which of these fields does that and which does not.
 */
export function EditEmployeeDialog({ employee }: { employee: EditableEmployee }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [fullName, setFullName] = useState(employee.fullName);
  const [fields, setFields] = useState<RoleFieldsValue>(() => initialFields(employee));

  function reset() {
    setErrors({});
    setFullName(employee.fullName);
    setFields(initialFields(employee));
  }

  const claimsMoving =
    fields.role !== employee.role ||
    fields.rank !== employee.userRole ||
    fields.department !== employee.department;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const result = await updateEmployee(employee.id, { fullName, ...fields });

      if (!result.ok) {
        setErrors(result.fieldErrors);
        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Discard an abandoned edit, so reopening shows what is stored rather
        // than what somebody half-typed and thought better of.
        if (!next) reset();
      }}
      size="lg"
      title={`Edit ${employee.fullName}`}
      description={`${employee.id} · ${employee.username}. Every change is recorded in the audit trail with its previous value.`}
      trigger={
        <button
          type="button"
          aria-label={`Edit ${employee.fullName}`}
          className="flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium text-neutral-600 transition-colors hover:border-navy-300 hover:text-navy-800"
        >
          <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          Edit
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {errors.form ? <FormError>{errors.form}</FormError> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Full name"
            name="fullName"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={errors.fullName}
            autoComplete="off"
          />
          <TextField
            label="Username"
            name="username"
            value={employee.username}
            disabled
            readOnly
            hint="Cannot be changed — it is the login name and the key the audit trail resolves through."
          />
        </div>

        <RoleFields value={fields} onChange={setFields} errors={errors} followsRole={false} />

        {claimsMoving ? (
          <p className="rounded-md bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
            Role, rank and department are carried in the account&rsquo;s auth claims. Saving this
            signs {employee.fullName.split(' ')[0]} out immediately, so the new access takes effect
            on their next sign-in rather than whenever their session happens to expire.
          </p>
        ) : null}

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
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The stored values, narrowed to what the controls accept.
 *
 * A record carrying a role the matrix no longer defines — or a rank that was
 * never one of the two — must not crash the dialog. It falls back to something
 * valid, and saving then repairs the record, which is the only way to fix one
 * of these from inside the application.
 */
function initialFields(employee: EditableEmployee): RoleFieldsValue {
  return {
    role: (isInternalRole(employee.role) ? employee.role : 'DOCUMENTATION') as InternalRole,
    rank: (isEmployeeRank(employee.userRole)
      ? employee.userRole
      : 'Staff') as EmployeeRank,
    department: employee.department,
    position: employee.position,
  };
}
