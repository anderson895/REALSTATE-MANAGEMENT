'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Search, TriangleAlert, UserPlus } from 'lucide-react';
import {
  CIVIL_STATUSES,
  DOWN_PAYMENT_TIERS,
  FINANCING_OPTIONS,
  ID_TYPES,
  PAYMENT_CHANNELS,
  PAYMENT_TERMS,
} from '@sfsr/domain';
import { FileUpload, type UploadedFile } from './file-upload';
import {
  createBuyer,
  searchBuyers,
  submitWalkIn,
  suggestUsernameFor,
  type BuyerHit,
  type CreatedBuyer,
} from './actions';

export interface UnitOption {
  readonly id: string;
  readonly label: string;
  readonly priceCentavos: number;
}
export interface ProjectOption {
  readonly id: string;
  readonly name: string;
  readonly units: readonly UnitOption[];
}

/**
 * The walk-in counter, as one page.
 *
 * ── Why not the Portal's eight-step wizard ────────────────────────────────
 *
 * note.txt asks for the "same process", and the DATA collected here is the
 * same. The pacing is not, because the situation is not: a wizard exists to
 * stop a buyer alone at home being overwhelmed by one long form. At the counter
 * the operator is a trained employee who does this repeatedly, with the buyer
 * waiting. Hiding six sections behind Next buttons makes that slower and makes
 * it impossible to check the whole form before filing it.
 *
 * So: one page, sections in the wizard's order, and the buyer resolved first
 * because nothing else can be uploaded until there is a folder to upload into.
 */
export function WalkInForm({ projects }: { projects: readonly ProjectOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ── The buyer ──
  const [buyer, setBuyer] = useState<BuyerHit | null>(null);
  const [credentials, setCredentials] = useState<CreatedBuyer | null>(null);
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<BuyerHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [newBuyer, setNewBuyer] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    dateOfBirth: '',
    sex: '',
    mobile: '',
    email: '',
    username: '',
  });

  // ── The reservation ──
  const [projectId, setProjectId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [form, setForm] = useState({
    civilStatus: 'Single',
    nationality: 'Filipino',
    tin: '',
    mobile: '',
    houseNo: '',
    street: '',
    barangay: '',
    city: '',
    province: '',
    zipCode: '',
    downPaymentTier: '20',
    paymentTerm: '12',
    financingOption: 'Bank Financing',
    salesAgentId: '',
    paymentDate: '',
    referenceNumber: '',
    channel: 'Bank Deposit',
    amount: '',
    idType: ID_TYPES[0] as string,
  });
  const [receipt, setReceipt] = useState<UploadedFile | null>(null);
  const [idFront, setIdFront] = useState<UploadedFile | null>(null);
  const [idBack, setIdBack] = useState<UploadedFile | null>(null);
  const [signed, setSigned] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const units = projects.find((p) => p.id === projectId)?.units ?? [];

  async function runSearch() {
    setSearching(true);
    setBanner(null);
    try {
      setHits(await searchBuyers(term));
    } catch {
      setBanner('Could not search. Please try again.');
    } finally {
      setSearching(false);
    }
  }

  // NOT named `useBuyer` — a function starting with "use" is read as a hook by
  // the rules-of-hooks lint, and calling it from a callback then looks illegal.
  function selectBuyer(hit: BuyerHit) {
    setBuyer(hit);
    // Prefill what the client record already knows, so the operator is not
    // retyping a mobile number that is on file.
    setForm((prev) => ({ ...prev, mobile: prev.mobile || hit.mobile }));
  }

  function submitNewBuyer() {
    setErrors({});
    startTransition(async () => {
      const result = await createBuyer(newBuyer);
      if (!result.ok) {
        setErrors(result.fieldErrors);
        return;
      }
      setCredentials(result.buyer);
      selectBuyer({
        uid: result.buyer.uid,
        name: result.buyer.name,
        username: result.buyer.username,
        email: result.buyer.email,
        mobile: newBuyer.mobile,
        tier: 'INITIAL',
      });
    });
  }

  function submit() {
    setErrors({});
    setBanner(null);

    const pesos = Number(form.amount);
    const payload = {
      buyerUid: buyer?.uid ?? '',
      unitId,
      parkingSlotId: '',
      civilStatus: form.civilStatus,
      nationality: form.nationality,
      tin: form.tin,
      mobile: form.mobile,
      houseNo: form.houseNo,
      street: form.street,
      barangay: form.barangay,
      city: form.city,
      province: form.province,
      zipCode: form.zipCode,
      downPaymentTier: Number(form.downPaymentTier),
      paymentTerm: form.paymentTerm === 'Spot Cash' ? 'Spot Cash' : Number(form.paymentTerm),
      financingOption: form.financingOption,
      salesAgentId: form.salesAgentId,
      payment: {
        paymentDate: form.paymentDate,
        referenceNumber: form.referenceNumber,
        channel: form.channel,
        // Typed in pesos because that is what the receipt says; stored in
        // centavos because money is never a float.
        amountCentavos: Number.isFinite(pesos) ? Math.round(pesos * 100) : 0,
        receipt,
      },
      governmentId: { idType: form.idType, frontFile: idFront, backFile: idBack },
      buyerSignedForm: signed,
    };

    startTransition(async () => {
      const result = await submitWalkIn(payload);
      if (result.ok) {
        router.push(`/reservations/${result.reservationNumber}?done=walkIn`);
        return;
      }
      setErrors(result.fieldErrors ?? {});
      setBanner(result.error);
    });
  }

  return (
    <div className="space-y-6">
      {banner ? (
        <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          {banner}
        </p>
      ) : null}

      {/* ── 1. The buyer ──────────────────────────────────────────────── */}
      <Section step={1} title="Buyer">
        {buyer ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                  <Check className="h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden="true" />
                  {buyer.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-emerald-800/80">
                  {buyer.username} · {buyer.email} · {buyer.tier}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBuyer(null);
                  setCredentials(null);
                }}
                className="shrink-0 text-xs font-medium text-emerald-900 hover:underline"
              >
                Change
              </button>
            </div>

            {credentials ? (
              /*
               * Shown once and never again — Firebase Auth stores a hash, so
               * this cannot be recovered. Said plainly here rather than
               * discovered later by a buyer who cannot sign in.
               */
              <div className="rounded-md border border-gold-300 bg-gold-50 px-3.5 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-900">
                  Temporary password — write this down now
                </p>
                <p className="mt-1.5 font-mono text-lg font-bold tracking-wider text-navy-900">
                  {credentials.temporaryPassword}
                </p>
                <p className="mt-1 text-xs text-gold-900/80">
                  It is not stored and cannot be shown again. The buyer signs in at the Portal
                  with <span className="font-semibold">{credentials.username}</span> and changes
                  it.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Tab active={mode === 'search'} onClick={() => setMode('search')}>
                <Search className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                Find existing
              </Tab>
              <Tab active={mode === 'new'} onClick={() => setMode('new')}>
                <UserPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                New buyer
              </Tab>
            </div>

            {mode === 'search' ? (
              <div>
                <div className="flex gap-2">
                  <input
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void runSearch();
                      }
                    }}
                    placeholder="Surname, username or email"
                    className={INPUT}
                  />
                  <button
                    type="button"
                    onClick={() => void runSearch()}
                    disabled={searching || term.trim().length < 2}
                    className="shrink-0 rounded-md bg-navy-800 px-4 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
                  >
                    {searching ? 'Searching…' : 'Search'}
                  </button>
                </div>
                {/* Said out loud because a search that quietly fails to find
                    someone is exactly how a duplicate account gets created. */}
                <p className="mt-1.5 text-xs text-neutral-400">
                  Matches the START of a surname, username or email — &ldquo;pad&rdquo; finds
                  Padilla, &ldquo;adilla&rdquo; finds nobody.
                </p>

                {hits !== null ? (
                  hits.length === 0 ? (
                    <p className="mt-3 rounded-md bg-neutral-50 px-3.5 py-3 text-sm text-neutral-500">
                      No account found. Check the spelling, or create a new buyer.
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-neutral-100 overflow-hidden rounded-md border border-neutral-200">
                      {hits.map((hit) => (
                        <li key={hit.uid}>
                          <button
                            type="button"
                            onClick={() => selectBuyer(hit)}
                            className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-navy-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-neutral-800">
                                {hit.name}
                              </span>
                              <span className="block truncate text-xs text-neutral-500">
                                {hit.username} · {hit.email}
                              </span>
                            </span>
                            <span className="shrink-0 rounded-full bg-navy-50 px-2 py-0.5 text-[10px] font-semibold text-navy-700">
                              {hit.tier}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="First name" error={errors.firstName}>
                    <input
                      value={newBuyer.firstName}
                      onChange={(e) =>
                        setNewBuyer((p) => ({ ...p, firstName: e.target.value }))
                      }
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Last name" error={errors.lastName}>
                    <input
                      value={newBuyer.lastName}
                      onChange={(e) => setNewBuyer((p) => ({ ...p, lastName: e.target.value }))}
                      onBlur={() => {
                        if (newBuyer.username || !newBuyer.firstName || !newBuyer.lastName) return;
                        void suggestUsernameFor(newBuyer.firstName, newBuyer.lastName).then(
                          (suggested) =>
                            suggested && setNewBuyer((p) => ({ ...p, username: suggested })),
                        );
                      }}
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Middle name" optional>
                    <input
                      value={newBuyer.middleName}
                      onChange={(e) =>
                        setNewBuyer((p) => ({ ...p, middleName: e.target.value }))
                      }
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Suffix" optional>
                    <input
                      value={newBuyer.suffix}
                      onChange={(e) => setNewBuyer((p) => ({ ...p, suffix: e.target.value }))}
                      placeholder="Jr., III"
                      className={INPUT}
                    />
                  </Field>
                  <Field
                    label="Date of birth"
                    error={errors.dateOfBirth}
                    hint="Must be at least 21 — the same floor the Portal holds a buyer to."
                  >
                    <input
                      type="date"
                      value={newBuyer.dateOfBirth}
                      onChange={(e) =>
                        setNewBuyer((p) => ({ ...p, dateOfBirth: e.target.value }))
                      }
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Sex" error={errors.sex}>
                    <select
                      value={newBuyer.sex}
                      onChange={(e) => setNewBuyer((p) => ({ ...p, sex: e.target.value }))}
                      className={INPUT}
                    >
                      <option value="">Select…</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </Field>
                  <Field label="Mobile" error={errors.mobile}>
                    <input
                      value={newBuyer.mobile}
                      onChange={(e) => setNewBuyer((p) => ({ ...p, mobile: e.target.value }))}
                      placeholder="09XX XXX XXXX"
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Email" error={errors.email}>
                    <input
                      type="email"
                      value={newBuyer.email}
                      onChange={(e) => setNewBuyer((p) => ({ ...p, email: e.target.value }))}
                      className={INPUT}
                    />
                  </Field>
                  <Field label="Username" error={errors.username}>
                    <input
                      value={newBuyer.username}
                      onChange={(e) => setNewBuyer((p) => ({ ...p, username: e.target.value }))}
                      className={INPUT}
                    />
                  </Field>
                </div>
                {errors.form ? <p className="text-xs text-rose-600">{errors.form}</p> : null}
                <button
                  type="button"
                  onClick={submitNewBuyer}
                  disabled={pending}
                  className="rounded-md bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
                >
                  {pending ? 'Creating…' : 'Create account'}
                </button>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Everything below needs a buyer: the uploads have to land in their
          folder, and the reservation hangs off their id. */}
      {buyer ? (
        <>
          <Section step={2} title="Unit">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Project">
                <select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setUnitId('');
                  }}
                  className={INPUT}
                >
                  <option value="">Select a project…</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.units.length} available)
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unit" error={errors.unitId}>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  disabled={!projectId}
                  className={INPUT}
                >
                  <option value="">
                    {projectId ? 'Select a unit…' : 'Choose a project first'}
                  </option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label} — ₱{(unit.priceCentavos / 100).toLocaleString('en-PH')}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {projectId && units.length === 0 ? (
              <p className="mt-2 text-xs text-amber-700">
                No available units in this project.
              </p>
            ) : null}
          </Section>

          <Section step={3} title="Buyer information">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Civil status">
                <select
                  value={form.civilStatus}
                  onChange={(e) => set('civilStatus')(e.target.value)}
                  className={INPUT}
                >
                  {CIVIL_STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </Field>
              <Field label="Nationality" error={errors.nationality}>
                <input
                  value={form.nationality}
                  onChange={(e) => set('nationality')(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="Mobile" error={errors.mobile}>
                <input
                  value={form.mobile}
                  onChange={(e) => set('mobile')(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="TIN" optional>
                <input
                  value={form.tin}
                  onChange={(e) => set('tin')(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="House / unit no." optional>
                <input
                  value={form.houseNo}
                  onChange={(e) => set('houseNo')(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="Street" error={errors.street}>
                <input
                  value={form.street}
                  onChange={(e) => set('street')(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="Barangay" error={errors.barangay}>
                <input
                  value={form.barangay}
                  onChange={(e) => set('barangay')(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="City / municipality" error={errors.city}>
                <input
                  value={form.city}
                  onChange={(e) => set('city')(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="Province" error={errors.province}>
                <input
                  value={form.province}
                  onChange={(e) => set('province')(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="ZIP code" error={errors.zipCode}>
                <input
                  value={form.zipCode}
                  onChange={(e) => set('zipCode')(e.target.value)}
                  className={INPUT}
                />
              </Field>
            </div>
          </Section>

          <Section step={4} title="Payment terms">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Down payment">
                <select
                  value={form.downPaymentTier}
                  onChange={(e) => set('downPaymentTier')(e.target.value)}
                  className={INPUT}
                >
                  {DOWN_PAYMENT_TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}%
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Payment term">
                <select
                  value={form.paymentTerm}
                  onChange={(e) => set('paymentTerm')(e.target.value)}
                  className={INPUT}
                >
                  {PAYMENT_TERMS.map((term) => (
                    <option key={String(term)} value={String(term)}>
                      {term === 'Spot Cash' ? 'Spot Cash' : `${term} months`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Financing">
                <select
                  value={form.financingOption}
                  onChange={(e) => set('financingOption')(e.target.value)}
                  className={INPUT}
                >
                  {FINANCING_OPTIONS.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </Field>
              <Field label="Sales agent ID" optional hint="Employee ID, if an agent assisted.">
                <input
                  value={form.salesAgentId}
                  onChange={(e) => set('salesAgentId')(e.target.value)}
                  className={INPUT}
                />
              </Field>
            </div>
          </Section>

          <Section step={5} title="Proof of reservation payment">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Payment date" error={errors['payment.paymentDate']}>
                <input
                  type="date"
                  value={form.paymentDate}
                  onChange={(e) => set('paymentDate')(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field
                label="Channel"
                hint="Cash and check are not offered — Billing verifies against a bank record."
              >
                <select
                  value={form.channel}
                  onChange={(e) => set('channel')(e.target.value)}
                  className={INPUT}
                >
                  {PAYMENT_CHANNELS.map((channel) => (
                    <option key={channel}>{channel}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reference number" error={errors['payment.referenceNumber']}>
                <input
                  value={form.referenceNumber}
                  onChange={(e) => set('referenceNumber')(e.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="Amount (₱)" error={errors['payment.amountCentavos']}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => set('amount')(e.target.value)}
                  className={INPUT}
                />
              </Field>
            </div>
            <div className="mt-3">
              <FileUpload
                kind="reservation-payment"
                slug="receipt"
                buyerUid={buyer.uid}
                label="Receipt or deposit slip"
                value={receipt}
                onChange={setReceipt}
                error={errors['payment.receipt'] ?? errors['payment.receipt.publicId']}
              />
            </div>
          </Section>

          <Section step={6} title="Government ID">
            <Field label="ID type">
              <select
                value={form.idType}
                onChange={(e) => set('idType')(e.target.value)}
                className={INPUT}
              >
                {ID_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </Field>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <FileUpload
                kind="client-document"
                slug="id-front"
                buyerUid={buyer.uid}
                label="Front"
                value={idFront}
                onChange={setIdFront}
                error={errors['governmentId.frontFile'] ?? errors['governmentId.frontFile.publicId']}
              />
              <FileUpload
                kind="client-document"
                slug="id-back"
                buyerUid={buyer.uid}
                label="Back"
                hint="The restrictions on a licence, the address on a PhilSys card."
                value={idBack}
                onChange={setIdBack}
                error={errors['governmentId.backFile'] ?? errors['governmentId.backFile.publicId']}
              />
            </div>
            {/*
             * The name check that runs on the Portal does not run here — it is
             * OCR in the buyer's own browser as they upload. Said plainly, so
             * the operator knows the comparison is theirs to make.
             */}
            <p className="mt-3 rounded-md bg-navy-50 px-3.5 py-2.5 text-xs text-navy-800">
              Check the name on the card against{' '}
              <span className="font-semibold">{buyer.name}</span> yourself. The automated name
              check only runs on Portal uploads, so this reservation will show none.
            </p>
          </Section>

          <Section step={7} title="Declaration">
            <label className="flex items-start gap-2.5 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={signed}
                onChange={(e) => setSigned(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300"
              />
              <span>
                The buyer has read and{' '}
                <span className="font-semibold">signed the printed reservation form</span>,
                including the five declarations, and it is on file.
              </span>
            </label>
            {errors.buyerSignedForm ? (
              <p className="mt-1.5 text-xs text-rose-600">{errors.buyerSignedForm}</p>
            ) : null}
            <p className="mt-2 text-xs text-neutral-500">
              Recorded against your employee ID. The buyer&rsquo;s own signature is the paper —
              this system does not tick their boxes for them.
            </p>
          </Section>

          <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-5">
            <p className="mr-auto text-xs text-neutral-500">
              Filing this does not verify it. Billing still checks the payment and Documentation
              the ID.
            </p>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-md bg-gold-400 px-5 py-2.5 text-sm font-bold text-navy-900 shadow-sm transition-colors hover:bg-gold-300 disabled:opacity-50"
            >
              {pending ? 'Filing…' : 'File reservation'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

const INPUT =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-800 outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20 disabled:bg-neutral-50 disabled:text-neutral-400';

function Section({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm">
      <h2 className="flex items-center gap-2.5 border-b border-neutral-200/80 px-5 py-3.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-800 text-[11px] font-bold text-white">
          {step}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy-800">
          {title}
        </span>
      </h2>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">
        {label}
        {optional ? <span className="ml-1 text-neutral-400">(optional)</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-neutral-400">{hint}</span>
      ) : null}
    </label>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'flex items-center gap-1.5 rounded-md bg-navy-800 px-3.5 py-2 text-xs font-semibold text-white'
          : 'flex items-center gap-1.5 rounded-md border border-neutral-300 px-3.5 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-50'
      }
    >
      {children}
    </button>
  );
}
