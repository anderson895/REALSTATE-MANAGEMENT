'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DOWN_PAYMENT_TIERS,
  FINANCING_OPTIONS,
  Money,
  PAYMENT_TERMS,
  PricingService,
  type DownPaymentTier,
  type FinancingOption,
  type PaymentTerm,
} from '@sfsr/domain';
import { Card, Checkbox, FormError, TextField, cn, fieldClass } from '@sfsr/ui';
import {
  CIVIL_STATUSES,
  ID_TYPES,
  PAYMENT_CHANNELS,
  reservationSchema,
} from '@/lib/schemas/reservation';
import { FileUpload, type UploadedFile } from './file-upload';

/**
 * The eight-step reservation application from RESERVATION.doc.
 *
 * Every peso figure comes from `PricingService` in @sfsr/domain — the same
 * class the Billing Department uses to raise a Statement of Account. Because
 * that package is pure TypeScript, it runs here in the browser, so changing
 * the down-payment tier recomputes instantly with no server round trip and no
 * Firestore read (§3.1).
 */

const pricing = new PricingService();

const STEPS = [
  'Property',
  'Buyer',
  'Payment Terms',
  'Review',
  'Proof of Payment',
  'Documents',
  'Terms',
  'Declaration',
] as const;

interface UnitProps {
  id: string;
  unitNo: string;
  unitType: string;
  tower: string | null;
  floor: number;
  areaSqm: number;
  purchasePriceCentavos: number;
  pricePerSqmCentavos: number;
}

interface ParkingOption {
  id: string;
  label: string;
  parkingType: string;
  purchasePriceCentavos: number;
}

export function ReservationWizard({
  unit,
  project,
  parking,
  buyer,
  reservationFeeCentavos,
}: {
  unit: UnitProps;
  project: { id: string; name: string; location: string };
  parking: readonly ParkingOption[];
  buyer: { fullName: string; dateOfBirth: string; sex: string; email: string; mobile: string };
  reservationFeeCentavos: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Form state ──
  const [withParking, setWithParking] = useState(false);
  const [parkingSlotId, setParkingSlotId] = useState('');

  const [civilStatus, setCivilStatus] = useState<(typeof CIVIL_STATUSES)[number] | ''>('');
  const [nationality, setNationality] = useState('Filipino');
  const [tin, setTin] = useState('');
  const [mobile, setMobile] = useState(buyer.mobile);
  const [houseNo, setHouseNo] = useState('');
  const [street, setStreet] = useState('');
  const [barangay, setBarangay] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [zipCode, setZipCode] = useState('');

  const [downPaymentTier, setDownPaymentTier] = useState<DownPaymentTier>(20);
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>(24);
  const [financingOption, setFinancingOption] = useState<FinancingOption>('Bank Financing');

  const [paymentDate, setPaymentDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [channel, setChannel] = useState<(typeof PAYMENT_CHANNELS)[number]>('Bank Deposit');
  const [receipt, setReceipt] = useState<UploadedFile | null>(null);

  const [idType, setIdType] = useState<(typeof ID_TYPES)[number] | ''>('');
  const [idFile, setIdFile] = useState<UploadedFile | null>(null);

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [declarations, setDeclarations] = useState({
    truthful: false,
    reviewed: false,
    notAutomatic: false,
    verification: false,
    agreed: false,
  });

  // A buyer half-way through a ₱20M application must not lose their work to a
  // stray refresh. Uploaded files are kept too — they already live in
  // Cloudinary, so only the reference needs restoring.
  const storageKey = `sfsr-reservation-${unit.id}`;

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;

    /* eslint-disable react-hooks/set-state-in-effect --
     * Restoring a saved draft is a read FROM an external system on mount,
     * which is precisely what effects exist for — not derived state, which is
     * what this rule guards against. The rule cannot tell the two apart.
     *
     * A lazy useState initializer is not an option: localStorage does not
     * exist during the server render, so the server would emit empty fields
     * and the client pre-filled ones, and React would report a hydration
     * mismatch. It runs once per mount, so there is no cascading render.
     */
    try {
      const d = JSON.parse(saved) as Record<string, unknown>;
      if (typeof d.civilStatus === 'string') setCivilStatus(d.civilStatus as never);
      if (typeof d.nationality === 'string') setNationality(d.nationality);
      if (typeof d.tin === 'string') setTin(d.tin);
      if (typeof d.houseNo === 'string') setHouseNo(d.houseNo);
      if (typeof d.street === 'string') setStreet(d.street);
      if (typeof d.barangay === 'string') setBarangay(d.barangay);
      if (typeof d.city === 'string') setCity(d.city);
      if (typeof d.province === 'string') setProvince(d.province);
      if (typeof d.zipCode === 'string') setZipCode(d.zipCode);
      if (typeof d.downPaymentTier === 'number') setDownPaymentTier(d.downPaymentTier as never);
      if (d.paymentTerm) setPaymentTerm(d.paymentTerm as PaymentTerm);
      if (typeof d.withParking === 'boolean') setWithParking(d.withParking);
      if (typeof d.parkingSlotId === 'string') setParkingSlotId(d.parkingSlotId);
    } catch {
      localStorage.removeItem(storageKey);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        civilStatus, nationality, tin, houseNo, street, barangay, city, province, zipCode,
        downPaymentTier, paymentTerm, withParking, parkingSlotId,
      }),
    );
  }, [
    storageKey, civilStatus, nationality, tin, houseNo, street, barangay, city, province,
    zipCode, downPaymentTier, paymentTerm, withParking, parkingSlotId,
  ]);

  const selectedParking = parking.find((p) => p.id === parkingSlotId) ?? null;

  const summary = useMemo(() => {
    try {
      return pricing.computeSummary({
        unitPrice: Money.fromCentavos(unit.purchasePriceCentavos),
        parkingPrice:
          withParking && selectedParking
            ? Money.fromCentavos(selectedParking.purchasePriceCentavos)
            : undefined,
        downPaymentTier,
        paymentTerm,
        reservationFee: Money.fromCentavos(reservationFeeCentavos),
      });
    } catch {
      return null;
    }
  }, [
    unit.purchasePriceCentavos, withParking, selectedParking, downPaymentTier, paymentTerm,
    reservationFeeCentavos,
  ]);

  function payload() {
    return {
      unitId: unit.id,
      parkingSlotId: withParking ? parkingSlotId : '',
      civilStatus, nationality, tin, mobile,
      houseNo, street, barangay, city, province, zipCode,
      downPaymentTier, paymentTerm, financingOption, salesAgentId: '',
      payment: {
        paymentDate,
        referenceNumber,
        channel,
        amountCentavos: reservationFeeCentavos,
        receipt: receipt ?? undefined,
      },
      governmentId: { idType, file: idFile ?? undefined },
      acceptedTerms,
      declaredTruthful: declarations.truthful,
      declaredReviewed: declarations.reviewed,
      declaredNotAutomatic: declarations.notAutomatic,
      declaredSubjectToVerification: declarations.verification,
      declaredAgreed: declarations.agreed,
    };
  }

  /**
   * Errors that are STILL failing right now.
   *
   * `errors` records what the last Continue reported. Left alone it goes
   * stale: upload a receipt after being told it was missing and the message
   * sits there over the successfully uploaded file, telling the buyer their
   * form is broken when it is not.
   *
   * Rather than clearing errors by hand in twenty change handlers — which is
   * the bug waiting to be reintroduced on field twenty-one — the displayed
   * set is DERIVED. Re-validate on render and keep only the reported errors
   * that still apply. Fixing a field makes its message disappear immediately,
   * and no new message can appear before the buyer presses Continue.
   */
  // Recomputed on every render, deliberately not memoised: the payload closes
  // over ~25 pieces of state, and one zod parse per render costs far less than
  // a dependency list that would silently go stale when a field is added.
  const liveIssuePaths = (() => {
    const parsed = reservationSchema.safeParse(payload());
    if (parsed.success) return new Set<string>();
    return new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'form'));
  })();

  const shownErrors = Object.fromEntries(
    Object.entries(errors).filter(([key]) => liveIssuePaths.has(key)),
  );

  /** Fields each step owns, so a step only blocks on its own problems. */
  const STEP_FIELDS: readonly (readonly string[])[] = [
    ['parkingSlotId'],
    ['civilStatus', 'nationality', 'mobile', 'street', 'barangay', 'city', 'province', 'zipCode'],
    ['downPaymentTier', 'paymentTerm', 'financingOption'],
    [],
    ['payment.paymentDate', 'payment.referenceNumber', 'payment.channel', 'payment.receipt', 'payment.receipt.publicId'],
    ['governmentId.idType', 'governmentId.file', 'governmentId.file.publicId'],
    ['acceptedTerms'],
    [
      'declaredTruthful', 'declaredReviewed', 'declaredNotAutomatic',
      'declaredSubjectToVerification', 'declaredAgreed',
    ],
  ];

  function validateStep(index: number): boolean {
    const parsed = reservationSchema.safeParse(payload());
    if (parsed.success) {
      setErrors({});
      return true;
    }

    const all: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      all[issue.path.join('.') || 'form'] ??= issue.message;
    }

    const owned = STEP_FIELDS[index] ?? [];
    const mine = Object.fromEntries(
      Object.entries(all).filter(([key]) => owned.some((f) => key === f || key.startsWith(`${f}.`))),
    );

    setErrors(mine);
    if (Object.keys(mine).length > 0) {
      setFormError('Please complete the highlighted fields.');
      return false;
    }
    setFormError(null);
    return true;
  }

  function next() {
    setFormError(null);
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    setFormError(null);
    if (!validateStep(STEPS.length - 1)) return;

    const parsed = reservationSchema.safeParse(payload());
    if (!parsed.success) {
      setFormError('Please review every step — some required details are missing.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        reservationNumber?: string;
        error?: string;
      };

      if (!response.ok || !body.ok) {
        setFormError(body.error ?? 'Could not submit your reservation.');
        return;
      }

      localStorage.removeItem(storageKey);
      router.push(`/reserve/${unit.id}/submitted?ref=${body.reservationNumber}`);
    } catch {
      setFormError('Could not submit your reservation. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Stepper current={step} onJump={(i) => i < step && setStep(i)} />

      <Card className="p-6">
        {step === 0 ? (
          <StepPanel title="Step 1 — Property Selection" note="Your selected unit, and an optional parking space.">
            <dl className="mb-6 divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
              <Row label="Developer" value="St. Francis Square Realty Corporation" />
              <Row label="Project" value={project.name} />
              <Row label="Unit number" value={unit.unitNo} />
              {unit.tower ? <Row label="Tower" value={unit.tower} /> : null}
              <Row label="Floor" value={String(unit.floor)} />
              <Row label="Unit type" value={unit.unitType} />
              <Row label="Floor area" value={`${unit.areaSqm} sqm`} />
              <Row
                label="Price per sqm"
                value={Money.fromCentavos(unit.pricePerSqmCentavos).format()}
              />
              <Row
                label="Unit purchase price"
                value={Money.fromCentavos(unit.purchasePriceCentavos).format()}
                strong
              />
            </dl>

            <p className="mb-3 text-sm font-medium">Parking space (optional)</p>
            <div className="space-y-2">
              <Checkbox
                label="No parking"
                checked={!withParking}
                onChange={() => {
                  setWithParking(false);
                  setParkingSlotId('');
                }}
              />
              <Checkbox
                label={`With parking — ${parking.length} available`}
                checked={withParking}
                disabled={parking.length === 0}
                onChange={() => setWithParking(true)}
              />
            </div>

            {withParking ? (
              <div className="mt-4">
                <label htmlFor="parking" className="block text-sm font-medium">
                  Parking space number<span className="ml-0.5 text-rose-500">*</span>
                </label>
                <select
                  id="parking"
                  value={parkingSlotId}
                  onChange={(e) => setParkingSlotId(e.target.value)}
                  className={cn(fieldClass, 'mt-1.5')}
                >
                  <option value="">Select a slot…</option>
                  {parking.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label} — {Money.fromCentavos(slot.purchasePriceCentavos).format()}
                    </option>
                  ))}
                </select>
                {errors.parkingSlotId ? (
                  <p className="mt-1 text-xs text-rose-600">{errors.parkingSlotId}</p>
                ) : null}
              </div>
            ) : null}
          </StepPanel>
        ) : null}

        {step === 1 ? (
          <StepPanel
            title="Step 2 — Buyer Information"
            note="Your name and date of birth are taken from your account and cannot be edited here."
          >
            <dl className="mb-6 divide-y divide-neutral-100 rounded-md bg-neutral-50 text-sm dark:divide-neutral-800 dark:bg-neutral-800/50">
              <Row label="Buyer name" value={buyer.fullName || '—'} />
              <Row label="Date of birth" value={buyer.dateOfBirth || '—'} />
              <Row label="Sex" value={buyer.sex || '—'} />
              <Row label="Email address" value={buyer.email || '—'} />
            </dl>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="civilStatus" className="block text-sm font-medium">
                  Civil status<span className="ml-0.5 text-rose-500">*</span>
                </label>
                <select
                  id="civilStatus"
                  value={civilStatus}
                  onChange={(e) => setCivilStatus(e.target.value as never)}
                  className={cn(fieldClass, 'mt-1.5')}
                >
                  <option value="">Select…</option>
                  {CIVIL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {errors.civilStatus ? (
                  <p className="mt-1 text-xs text-rose-600">{errors.civilStatus}</p>
                ) : null}
              </div>

              <TextField label="Nationality" required value={nationality}
                onChange={(e) => setNationality(e.target.value)} error={errors.nationality} />
              <TextField label="TIN" value={tin} onChange={(e) => setTin(e.target.value)}
                hint="Optional at this stage" error={errors.tin} />
              <TextField label="Mobile number" required value={mobile}
                onChange={(e) => setMobile(e.target.value)} error={errors.mobile} />
            </div>

            <p className="mb-3 mt-6 text-sm font-medium">Current address</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="House / Unit no." value={houseNo}
                onChange={(e) => setHouseNo(e.target.value)} error={errors.houseNo} />
              <TextField label="Street" required value={street}
                onChange={(e) => setStreet(e.target.value)} error={errors.street} />
              <TextField label="Barangay" required value={barangay}
                onChange={(e) => setBarangay(e.target.value)} error={errors.barangay} />
              <TextField label="City / Municipality" required value={city}
                onChange={(e) => setCity(e.target.value)} error={errors.city} />
              <TextField label="Province" required value={province}
                onChange={(e) => setProvince(e.target.value)} error={errors.province} />
              <TextField label="ZIP code" required value={zipCode}
                onChange={(e) => setZipCode(e.target.value)} error={errors.zipCode} />
            </div>
          </StepPanel>
        ) : null}

        {step === 2 ? (
          <StepPanel title="Step 3 — Payment Terms" note="All computations update automatically.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="dp" className="block text-sm font-medium">Down payment</label>
                <select id="dp" value={downPaymentTier}
                  onChange={(e) => setDownPaymentTier(Number(e.target.value) as DownPaymentTier)}
                  className={cn(fieldClass, 'mt-1.5')}>
                  {DOWN_PAYMENT_TIERS.map((t) => <option key={t} value={t}>{t}%</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="term" className="block text-sm font-medium">Payment term</label>
                <select id="term" value={String(paymentTerm)}
                  onChange={(e) => setPaymentTerm(
                    e.target.value === 'Spot Cash' ? 'Spot Cash' : (Number(e.target.value) as PaymentTerm),
                  )}
                  className={cn(fieldClass, 'mt-1.5')}>
                  {PAYMENT_TERMS.map((t) => (
                    <option key={String(t)} value={String(t)}>
                      {t === 'Spot Cash' ? 'Spot Cash' : `${t} months`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="fin" className="block text-sm font-medium">Financing option</label>
                <select id="fin" value={financingOption}
                  onChange={(e) => setFinancingOption(e.target.value as FinancingOption)}
                  className={cn(fieldClass, 'mt-1.5')}>
                  {FINANCING_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            {summary ? <PaymentSummary summary={summary} tier={downPaymentTier} term={paymentTerm} financing={financingOption} /> : null}
          </StepPanel>
        ) : null}

        {step === 3 ? (
          <StepPanel title="Step 4 — Review Reservation Details" note="Please review everything below before continuing.">
            <Section label="Buyer information">
              <Row label="Buyer name" value={buyer.fullName} />
              <Row label="Mobile number" value={mobile} />
              <Row label="Email address" value={buyer.email} />
              <Row label="Civil status" value={civilStatus || '—'} />
              <Row label="Address" value={[houseNo, street, barangay, city, province, zipCode].filter(Boolean).join(', ')} />
            </Section>
            <Section label="Property information">
              <Row label="Project" value={project.name} />
              {unit.tower ? <Row label="Tower" value={unit.tower} /> : null}
              <Row label="Floor" value={String(unit.floor)} />
              <Row label="Unit number" value={unit.unitNo} />
              <Row label="Unit type" value={unit.unitType} />
              <Row label="Floor area" value={`${unit.areaSqm} sqm`} />
              <Row label="Parking space" value={selectedParking ? selectedParking.label : 'None'} />
            </Section>
            {summary ? (
              <Section label="Payment information">
                <Row label="Total purchase price" value={summary.totalPurchasePrice.format()} strong />
                <Row label="Reservation fee" value={summary.reservationFee.format()} />
                <Row label="Down payment" value={summary.downPayment.format()} />
                <Row label="Promotional discount" value={summary.promotionalDiscount.format()} />
                <Row label="Monthly down payment" value={summary.monthlyDownPayment.format()} />
                <Row label="Financing option" value={financingOption} />
                <Row label="Balance on total purchase price" value={summary.balanceOnTotalPurchasePrice.format()} strong />
              </Section>
            ) : null}
          </StepPanel>
        ) : null}

        {step === 4 ? (
          <StepPanel
            title="Step 5 — Upload Proof of Reservation Payment"
            note={`Upload your receipt for the ${Money.fromCentavos(reservationFeeCentavos).format()} reservation fee.`}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Payment date" type="date" required value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)} error={shownErrors['payment.paymentDate']} />
              <TextField label="Reference number" required value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)} error={shownErrors['payment.referenceNumber']} />
              <div>
                <label htmlFor="channel" className="block text-sm font-medium">
                  Payment channel<span className="ml-0.5 text-rose-500">*</span>
                </label>
                <select id="channel" value={channel}
                  onChange={(e) => setChannel(e.target.value as never)}
                  className={cn(fieldClass, 'mt-1.5')}>
                  {PAYMENT_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <TextField label="Amount paid" value={Money.fromCentavos(reservationFeeCentavos).format()}
                readOnly disabled hint="System generated" />
            </div>

            <div className="mt-5">
              <FileUpload kind="reservation-payment" slug="reservation-receipt"
                label="Proof of payment" value={receipt} onChange={setReceipt}
                error={shownErrors['payment.receipt'] ?? shownErrors['payment.receipt.publicId']} />
            </div>

            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              Submitting proof of payment does not by itself confirm payment. All payments remain
              subject to verification by the Billing and Accounting Departments.
            </p>
          </StepPanel>
        ) : null}

        {step === 5 ? (
          <StepPanel
            title="Step 6 — Documentary Requirements"
            note="Upload a valid government-issued ID. Further documents may be requested after submission."
          >
            <div className="mb-5">
              <label htmlFor="idType" className="block text-sm font-medium">
                ID type<span className="ml-0.5 text-rose-500">*</span>
              </label>
              <select id="idType" value={idType} onChange={(e) => setIdType(e.target.value as never)}
                className={cn(fieldClass, 'mt-1.5')}>
                <option value="">Select an ID type…</option>
                {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {shownErrors['governmentId.idType'] ? (
                <p className="mt-1 text-xs text-rose-600">{shownErrors['governmentId.idType']}</p>
              ) : null}
            </div>

            <FileUpload kind="client-document" slug="government-id" label="Government-issued ID"
              value={idFile} onChange={setIdFile}
              error={shownErrors['governmentId.file'] ?? shownErrors['governmentId.file.publicId']} />

            <p className="mt-4 text-xs text-neutral-500">
              Uploaded documents undergo automated validation. Final verification and approval are
              performed by authorised St. Francis Square Realty personnel.
            </p>
          </StepPanel>
        ) : null}

        {step === 6 ? (
          <StepPanel title="Step 7 — Terms and Conditions" note="Please read before proceeding.">
            <ol className="mb-5 max-h-80 space-y-3 overflow-y-auto rounded-md border border-neutral-200 p-4 text-xs leading-relaxed text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
              {TERMS.map((clause, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 font-semibold text-brand-600">{i + 1}.</span>
                  <span>{clause}</span>
                </li>
              ))}
            </ol>
            <Checkbox
              label="I have read, understood, and voluntarily agree to the Reservation Terms and Conditions."
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
            />
            {errors.acceptedTerms ? (
              <p className="mt-1 text-xs text-rose-600">{errors.acceptedTerms}</p>
            ) : null}
          </StepPanel>
        ) : null}

        {step === 7 ? (
          <StepPanel title="Step 8 — Buyer's Declaration" note="All five certifications are required.">
            <div className="space-y-3">
              {(
                [
                  ['truthful', 'I certify that all information provided in this reservation application is true, complete, and correct.'],
                  ['reviewed', 'I have carefully reviewed all information entered in this reservation application.'],
                  ['notAutomatic', 'I understand that submitting this reservation application does not automatically approve my reservation.'],
                  ['verification', 'I understand that my uploaded proof of payment and documentary requirements are subject to verification.'],
                  ['agreed', 'I have read, understood, and voluntarily agree to the Reservation Terms and Conditions.'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="[&_label]:items-start [&_input]:mt-0.5">
                  <Checkbox
                    label={label}
                    checked={declarations[key]}
                    onChange={(e) => setDeclarations((d) => ({ ...d, [key]: e.target.checked }))}
                  />
                </div>
              ))}
            </div>
            {Object.keys(shownErrors).length > 0 ? (
              <p className="mt-3 text-xs text-rose-600">All five declarations must be checked.</p>
            ) : null}
          </StepPanel>
        ) : null}

        {/* Hidden as soon as the highlighted fields are fixed — the banner
            would otherwise outlive the problems it refers to. A submit error
            from the server has no field errors, so it stays until retried. */}
        {formError && (Object.keys(shownErrors).length > 0 || !busy) ? (
          <div className="mt-5">
            <FormError>{formError}</FormError>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(s - 1, 0))}
            disabled={step === 0 || busy}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
          >
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-brand-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Continue
            </button>
          ) : (
            /* Gold, and the only gold on the page. Seven Continues in green
               lead here; making the eighth press look like the seventh before
               it is how a buyer submits a ₱11M application believing they are
               advancing another step. The sub-line states what actually
               happens, because "Submit" alone reads as "approve me". */
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="flex flex-col items-center rounded-md bg-accent-500 px-6 py-2 text-white transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                {busy ? (
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : null}
                {busy ? 'Submitting…' : 'Submit Reservation Application'}
              </span>
              <span className="text-[10px] font-normal text-white/85">
                Submit for verification and review.
              </span>
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ── Presentation helpers ─────────────────────────────────────────────── */

/**
 * Numbered circles joined by a rule, as in the reference design.
 *
 * The connector is what the old row of pills could not express: eight
 * equal-weight chips said "eight things", not "one sequence you are four
 * steps into". The line fills in behind you, so progress is legible at a
 * glance without reading a single label.
 *
 * `overflow-x-auto` rather than wrapping — eight steps do not fit a phone, and
 * a stepper that reflows into two ragged rows loses the sequence it exists to
 * show. Scrolling keeps the line intact.
 */
function Stepper({ current, onJump }: { current: number; onJump: (i: number) => void }) {
  return (
    <ol className="mb-6 flex items-start overflow-x-auto pb-1">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;

        return (
          <li key={label} className="flex min-w-0 flex-1 items-start">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={!done}
              aria-current={active ? 'step' : undefined}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5 px-0.5 sm:w-auto sm:min-w-[4.5rem]"
            >
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  active && 'bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-900/60',
                  done && 'bg-brand-500 text-white',
                  !active &&
                    !done &&
                    'border border-neutral-300 bg-white text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900',
                )}
              >
                {done ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  'text-center text-[10px] leading-tight',
                  active && 'font-semibold text-brand-700 dark:text-brand-300',
                  done && 'text-neutral-600 dark:text-neutral-400',
                  !active && !done && 'text-neutral-400',
                )}
              >
                {label}
              </span>
            </button>

            {i < STEPS.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'mt-4 h-px min-w-3 flex-1',
                  done ? 'bg-brand-500' : 'bg-neutral-200 dark:bg-neutral-700',
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepPanel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">
          {title}
        </h2>
        {note ? <p className="mt-1 text-xs text-neutral-500">{note}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">{label}</p>
      <dl className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">{children}</dl>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={cn('tabular text-right', strong && 'font-semibold')}>{value}</dd>
    </div>
  );
}

function PaymentSummary({
  summary, tier, term, financing,
}: {
  summary: NonNullable<ReturnType<PricingService['computeSummary']>>;
  tier: number; term: PaymentTerm; financing: FinancingOption;
}) {
  return (
    <div className="mt-6 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
      <p className="border-b border-neutral-200 bg-brand-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-brand-700 dark:border-neutral-800 dark:bg-brand-900/40 dark:text-brand-300">
        Payment Summary
      </p>
      <dl className="divide-y divide-neutral-100 px-4 text-sm dark:divide-neutral-800">
        <Row label="Total purchase price" value={summary.totalPurchasePrice.format()} strong />
        <Row label={`Down payment (${tier}%)`} value={summary.downPayment.format()} />
        <Row label="Less: reservation fee" value={`(${summary.reservationFee.format()})`} />
        <Row
          label={`Less: promotional discount${summary.promotionalDiscount.isZero() ? '' : ` — ${summary.discountDescription}`}`}
          value={`(${summary.promotionalDiscount.format()})`}
        />
        <Row label="Net down payment required" value={summary.netDownPaymentRequired.format()} strong />
        <Row
          label={term === 'Spot Cash' ? 'Payable in full' : `Monthly down payment (${term} months)`}
          value={summary.monthlyDownPayment.format()}
        />
        <Row label={`Balance — ${financing}`} value={summary.balanceOnTotalPurchasePrice.format()} strong />
      </dl>
      <p className="border-t border-neutral-200 px-4 py-2.5 text-xs text-neutral-400 dark:border-neutral-800">
        All computations are generated by the system based on the selected payment terms.
      </p>
    </div>
  );
}

/** The eleven clauses from RESERVATION.doc, STEP 7. */
const TERMS = [
  'The reservation application shall be processed only after the reservation fee has been verified by the Billing Department.',
  'Once payment has been verified, the selected unit shall be placed under On Hold status while the reservation is being evaluated.',
  'The Buyer shall submit all required documentary requirements within thirty (30) calendar days from the reservation date.',
  'The reservation fee shall form part of the purchase price and is NON-REFUNDABLE and NON-TRANSFERABLE, except when the reservation is cancelled by St. Francis Square Realty Corporation due to reasons attributable to the company or as otherwise required by applicable law.',
  'Failure to submit the required documents, failure to comply with the approved payment schedule, submission of false or fraudulent information, or voluntary withdrawal of the reservation application may result in cancellation of the reservation in accordance with company policy and applicable laws.',
  'Submission of proof of payment does not automatically constitute payment confirmation. All payments remain subject to verification by the Billing and Accounting Departments.',
  'All uploaded documents shall be processed using OCR technology to assist in document validation. Final approval shall be made by authorized company personnel.',
  'This reservation is personal to the Buyer and may not be assigned or transferred without the prior written consent of St. Francis Square Realty Corporation.',
  'The Developer reserves the right to make reasonable changes to building plans, specifications, finishes, and materials due to engineering requirements, government regulations, or material availability.',
  'The Developer reserves the right to approve, reject, or cancel any reservation application that does not comply with company policies or legal requirements.',
  'Personal information collected through this system shall be processed in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) and shall be used solely for reservation processing, financing, billing, customer support, and other legitimate business purposes.',
];
