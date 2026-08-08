'use client';

import { useState } from 'react';
import type { InternalRole } from '@sfsr/domain';
import { TextField, fieldClass } from '@sfsr/ui';
import {
  DEFAULT_DEPARTMENTS,
  EMPLOYEE_RANKS,
  ROLE_OPTIONS,
  defaultPositionFor,
  type EmployeeRank,
} from '@/lib/employees';

/**
 * The four controls that add and edit have in common.
 *
 * Shared because they are the same decision in both places, and because the
 * defaulting behaviour between them is fiddly enough that two copies would
 * drift within a week — the add form would keep following the role and the edit
 * form would quietly stop.
 */

export interface RoleFieldsValue {
  readonly role: InternalRole;
  readonly rank: EmployeeRank;
  readonly department: string;
  readonly position: string;
}

/**
 * Role, rank, department and position.
 *
 * ── Why role and rank are two controls and not one ───────────────────────
 *
 * They are two facts. The ROLE decides what the account can reach — it is the
 * key into the RBAC matrix, and `MARKETING` is the whole reason this screen
 * exists. The RANK decides whether the account may approve, through the
 * supervisor flag, and RBAC.xls carries it in a separate column for that reason.
 *
 * A single "Documentation Supervisor" dropdown would have to enumerate twenty
 * combinations and would let the two drift apart the moment somebody adds a
 * rank to the list and forgets a role.
 *
 * ── Why department and position are typed and not derived ────────────────
 *
 * Both are DEFAULTED from the role, so the common case is zero typing. Both
 * stay editable, because the source workbook is inconsistent about them —
 * "Accounting" beside "IT Department", "Legal Officer" beside "Legal Staff" —
 * and a form that refuses the value already in use is a form nobody can file
 * the real org chart into.
 */
export function RoleFields({
  value,
  onChange,
  errors,
  followsRole = true,
}: {
  value: RoleFieldsValue;
  onChange: (value: RoleFieldsValue) => void;
  errors: Record<string, string>;
  /**
   * Should department and position re-derive when the role changes?
   *
   * True when ADDING — the fields start empty and following the role is the
   * whole convenience.
   *
   * False when EDITING, and this matters: both fields already hold a real value
   * somebody chose once. Re-deriving them would silently rewrite "Legal
   * Officer" as "Legal Staff" for an administrator who opened the dialog to fix
   * something else entirely, and the overwrite would be recorded in the audit
   * trail as a deliberate change.
   */
  followsRole?: boolean;
}) {
  /*
   * Defaults follow the role until somebody overrides them.
   *
   * Tracked with a "has this been touched" flag rather than by comparing
   * against the expected default: someone who deliberately types the value the
   * default would have produced has still made a choice, and having their field
   * rewritten by the next dropdown change is worse than a stale default they
   * can see and edit.
   *
   * Starting them touched is how `followsRole={false}` is implemented — an
   * existing value is treated exactly like one a person just typed, because
   * that is what it is.
   */
  const [departmentTouched, setDepartmentTouched] = useState(!followsRole);
  const [positionTouched, setPositionTouched] = useState(!followsRole);

  function setRole(role: InternalRole) {
    onChange({
      ...value,
      role,
      department: departmentTouched ? value.department : DEFAULT_DEPARTMENTS[role],
      position: positionTouched ? value.position : defaultPositionFor(role, value.rank),
    });
  }

  function setRank(rank: EmployeeRank) {
    onChange({
      ...value,
      rank,
      position: positionTouched ? value.position : defaultPositionFor(value.role, rank),
    });
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Role"
          name="role"
          value={value.role}
          onChange={(next) => setRole(next as InternalRole)}
          options={ROLE_OPTIONS}
          error={errors.role}
          hint="Decides which modules the account can reach."
        />
        <Select
          label="Rank"
          name="rank"
          value={value.rank}
          onChange={(next) => setRank(next as EmployeeRank)}
          options={EMPLOYEE_RANKS.map((r) => ({ value: r, label: r }))}
          error={errors.rank}
          hint="A Supervisor is the approver of their department's transactions."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Department"
          name="department"
          required
          value={value.department}
          onChange={(e) => {
            setDepartmentTouched(true);
            onChange({ ...value, department: e.target.value });
          }}
          error={errors.department}
          autoComplete="off"
        />
        <TextField
          label="Position"
          name="position"
          required
          value={value.position}
          onChange={(e) => {
            setPositionTouched(true);
            onChange({ ...value, position: e.target.value });
          }}
          error={errors.position}
          autoComplete="off"
        />
      </div>
    </>
  );
}

/**
 * A labelled `<select>`.
 *
 * `TextField` in @sfsr/ui wraps an `<input>` and cannot render options, and the
 * two controls sit side by side in these forms — so this matches its label,
 * hint and error treatment rather than looking like a different form's control.
 */
export function Select({
  label,
  name,
  value,
  onChange,
  options,
  hint,
  error,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  hint?: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
        <span className="ml-0.5 text-rose-500">*</span>
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${fieldClass} mt-1.5`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
