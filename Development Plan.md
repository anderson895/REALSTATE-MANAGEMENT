# Development Plan
## St. Francis Square Realty — Real Estate Management System (SFSR-REMS)

**Document version:** 1.0
**Date:** 2026-08-02
**Status:** Approved for Sprint 0
**Prepared from:** `instruction.txt`, `RESERVATION.doc`, `RBAC.xls`, `SALES STAFF DATABASE.xls`, `DATABASE PROJECT.xls`, `CONDOMINIUM PROJECTS/`, `.env`

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Software Development Principles](#3-software-development-principles)
4. [Software Development Life Cycle](#4-software-development-life-cycle)
5. [System Architecture](#5-system-architecture)
6. [Data Model & Migration](#6-data-model--migration)
7. [Role-Based Access Control Matrix](#7-role-based-access-control-matrix)
8. [Reservation Module](#8-reservation-module)
9. [Document Validation Pipeline](#9-document-validation-pipeline)
10. [Sprint Breakdown](#10-sprint-breakdown)
11. [Testing Strategy](#11-testing-strategy)
12. [Risks & Open Items](#12-risks--open-items)

---

## 1. Project Overview

### 1.1 System Identity

| Field | Value |
|---|---|
| System name | St. Francis Square Realty Real Estate Management System |
| Acronym | SFSR-REMS |
| Developer / Owner | St. Francis Square Realty Corporation |
| Platform | Web-based only |
| Firebase project | `sfsr-rems` |
| Context | Capstone / thesis defense build |

### 1.2 The Two Platforms

SFSR-REMS is delivered as **two separate applications with different network exposure**, sharing a single centralized database so that inventory and reservation state stay synchronized in real time. Full topology in §5.7.

**A. Web-Based Real Estate Portal** *(external — buyers)* — **deployed publicly**
Public browsing of condominium projects, online reservation, document and payment upload, and transaction monitoring. Hosted on Vercel, reachable from anywhere.

**B. Internal Management System** *(internal — 25 employees across 8 departments)* — **runs locally**
Payment verification, document validation, approval workflows, billing, statements of account, loan monitoring, reporting, and audit. Runs on **one office PC acting as a LAN server**; staff reach it over the office network. It is never published to the internet.

They are separate builds and separate deployments, but they are **not** independent codebases: both consume the shared `@sfsr/domain` package, so the pricing engine and the reservation rules are literally the same code in both (§3.1, §5.1). The database is the integration point — there is no API between them.

> The requirement that these stay in lockstep is explicit in `RESERVATION.doc`:
> *"Once a reservation application is submitted, the selected condominium unit is automatically tagged as 'On Hold' to prevent multiple reservations for the same unit… across both the Web-Based Real Estate Portal and the Internal Management System."*

### 1.3 Inventory Under Management

| Project | Code | Location | Floors | Units | Parking | Towers |
|---|---|---|---|---|---|---|
| The Legaspi Place | `TLP001` | Legazpi Village, Makati City | 42 | 30 | 15 | — |
| Emerald Park Residences | `EPR002` | ASEANA, Parañaque City | 35 | 30 | 30 | — |
| Skyline Quarter Residences | `SQR003` | Ortigas Center, Pasig City | 40 | 30 | 20 | A, B |
| Grand Verdant Residences | `GVR004` | Bonifacio Global City, Taguig | 45 | 30 | 30 | A |
| Harbor Point Residences | `HPR004` ⚠ | Roxas Boulevard, Pasay City | 38 | 30 | 30 | A |
| **Total** | | | | **150** | **125** | |

Unit types: Studio · One Bedroom · Two Bedroom · Three Bedroom · Penthouse
Parking types: Regular · Premium (⚠ `Tandem` appears in the reservation form but in no inventory row)

### 1.4 Scope

**In scope**

- Client registration, username-based login, three-tier client accounts
- Public project and unit browsing with floor plans
- Sample computation and tripping (site viewing) requests
- The full 9-step online reservation workflow with automatic pricing
- Document upload with Document Type Validation, OCR, and Levenshtein Distance verification
- Payment verification, official receipt issuance, and supervisor approval chains
- Unit inventory lifecycle (Available → On Hold → Sold → Available on cancellation)
- Statement of Account generation, amortization schedules, payment history
- Loan monitoring (Bank Financing / Pag-IBIG Fund / Cash)
- Role dashboards, reports, analytics, announcements, notifications
- Immutable audit trail

**Out of scope**

- Native mobile applications (`instruction.txt`: *"Web based only"*)
- Live payment gateway integration — buyers upload **proof** of payment; verification is manual by design
- Property management after turnover (association dues, maintenance)
- Accounting system integration beyond in-app financial reports

---

## 2. Technology Stack

### 2.1 Core (mandated by `instruction.txt`)

| Layer | Choice | Notes |
|---|---|---|
Versions below are the ones actually installed and verified in Sprint 0, not the ones originally assumed.

| Layer | Choice | Installed | Notes |
|---|---|---|---|
| Framework | **Next.js** (App Router) | `16.2.12` | Server Components + Route Handlers let RBAC run on the server, not the browser |
| UI library | **React** | `19.2.8` | |
| Language | **TypeScript** (`strict`) | `6.0.3` | Plus `noUncheckedIndexedAccess` and `noImplicitOverride` — see §3.9 |
| Styling | **Tailwind CSS** | `4.3.3` | CSS-first config; no `tailwind.config.js` |
| Components | **shadcn/ui** | — | Copy-in components — no runtime dependency, fully themeable |
| Monorepo | **npm workspaces** | npm `11.4.2` | Built in; no Turborepo needed at this scale |

> **Next.js 16 changed a file convention this plan depends on.** `middleware.ts` is
> deprecated; the replacement is **`proxy.ts`**. Verified against the installed
> package, which emits: *"The `middleware` file convention is deprecated. Please
> use `proxy` instead."* All references below use `proxy.ts`.

### 2.2 Recommended Libraries

`instruction.txt` invites additions: *"and other libraries kung recommended mo."* Each is justified against a specific requirement in this system.

| Package | Why this system needs it |
|---|---|
| `zod` | One schema definition validates the reservation form in the browser **and** re-validates it on the server. Prevents drift between the two. |
| `react-hook-form` + `@hookform/resolvers` | The reservation wizard has 8 steps and ~40 fields. Uncontrolled inputs keep re-renders cheap. |
| `zustand` + `persist` | Wizard drafts survive a page refresh — a buyer half-way through a ₱20M reservation must not lose their work. |
| `@tanstack/react-table` | Internal verification queues need sorting, filtering, and pagination over reservations and payments. |
| `recharts` | Dashboard requirement for the Account Receivables role (sales, collections, delinquency charts). |
| `date-fns` | The 30-day document deadline and 24-hour deficiency window need reliable date arithmetic. |
| `firebase` | Client SDK — auth session, real-time unit availability. |
| `firebase-admin` | Server SDK — privileged writes, custom claims, seeding. Never shipped to the browser. |
| `@google-cloud/vision` | OCR engine for documentary requirements (see §9). |
| `fastest-levenshtein` | The Levenshtein Distance algorithm is an explicit requirement in `RBAC.xls` and `RESERVATION.doc`. |
| `cloudinary` | Server SDK for **signed** uploads and authenticated delivery URLs. |
| `jspdf` + `jspdf-autotable` | Statement of Account and reservation summary must be printable. `RBAC.xls` grants "view & print" to several roles. |
| `sonner` | Toast notifications for verification outcomes. |
| `lucide-react` | shadcn/ui default icon set. |
| `next-themes` | Light/dark mode. |
| `vitest` + `@testing-library/react` | Unit tests, principally for the pricing engine. |
| `@firebase/rules-unit-testing` | Security Rules must be tested, not assumed. |
| `playwright` | End-to-end coverage of the reservation happy path. |

### 2.3 Cloud Services

| Service | Role |
|---|---|
| **Firebase Authentication** | Identity for both clients and employees |
| **Cloud Firestore** | Centralized database, real-time synchronization |
| **Cloudinary** | All file storage — project media *and* documents (see §2.4) |
| **Google Cloud Vision API** | OCR text extraction, same Google project as Firebase |
| **Vercel** | Hosting for the **Portal only**. The Internal system runs on an office LAN server and is never deployed there (§5.7). |

### 2.4 Media & Document Storage Policy

Cloudinary handles **all** file storage. Because the current `.env` uses an **unsigned** upload preset, the following controls are mandatory before any government ID is accepted:

| Asset class | Delivery type | Access |
|---|---|---|
| Project renders, floor plans | `type: 'upload'` | Public CDN — these are marketing assets |
| Government IDs, proof of payment, contracts, SOA | `type: 'authenticated'` | Time-limited signed URLs only |

**Upload path:** browser → `POST /app/api/upload/route.ts` → server generates a Cloudinary signature using `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` → browser uploads with that signature.

> **Why this matters.** An unsigned preset means anyone who reads the cloud name `riayd2nv` out of the JavaScript bundle can upload arbitrary files to the account, and any stored asset is retrievable by URL alone. Storing scans of government IDs that way is not defensible under the Data Privacy Act of 2012 (RA 10173), which `RESERVATION.doc` commits the company to in three separate clauses. Signed uploads plus authenticated delivery close both holes while keeping Cloudinary as the single provider.

The two secret variables are **server-only** and must never carry the `NEXT_PUBLIC_` prefix.

---

## 3. Software Development Principles

`instruction.txt` asks to *"Apply Software Development Principles (choose best for this project)."* The following are selected because each resolves a specific risk in **this** system — a financial workflow where a single unit must never be sold twice and a peso figure must never differ between two screens.

### 3.1 Single Source of Truth

All monetary computation lives in **one** place: `lib/domain/pricing/`. The portal wizard, the internal verification screen, the Statement of Account, and the PDF export all call the same `PricingService`.

*Risk addressed:* a discount displayed to the buyer that disagrees with what Billing computes is a contractual dispute, not a bug.

### 3.2 Single Responsibility & Separation of Concerns

Four layers, with dependencies pointing **inward** toward the domain (see §5.5):

```
app/                  → presentation — routing, layouts, React components
lib/actions/, app/api → application — orchestration, auth checks, DTO mapping
lib/domain/           → domain — entities, value objects, business rules
lib/infrastructure/   → data infrastructure — Firestore, Cloudinary, Vision adapters
```

No component calls Firestore directly. A component renders; a service decides; a repository persists.

*Risk addressed:* business rules scattered across JSX cannot be unit-tested, and the approval workflow is the part most likely to be challenged during defense.

### 3.3 Defense in Depth

Authorization is enforced at **three independent layers**:

1. `proxy.ts` — request gate (the Internal app requires an employee claim)
2. Route Handler / Server Action — verifies the caller's role before mutating
3. Firestore Security Rules — final backstop, enforced by the database itself

A fourth layer applies to the Internal system specifically: it is not published
to the internet at all (§5.7). Network isolation is a control, but it is the
outermost one — the three above still apply in full.

Hiding a button in the UI is cosmetic and is never counted as a control.

### 3.4 Least Privilege & Fail-Safe Defaults

Firestore rules deny by default. Each of the ten internal roles receives only the grants transcribed from the `USER ROLE ACCESS` sheet — nothing inferred, nothing convenient. A Legal Counsel who is granted *"View Client profile"* gets read on `clients` and nothing else.

### 3.5 Integer Money

Every amount is stored as an **integer number of centavos**. `₱39,900,000.00` is persisted as `3990000000`.

*Risk addressed:* IEEE-754 floats cannot represent `0.1` exactly. In a 36-month amortization schedule the rounding error compounds, and the final balance will not close to zero. Formatting to pesos happens only at the presentation edge.

### 3.6 Immutable Audit Trail

`auditLogs` is append-only. The Security Rules define `create` and grant no `update` or `delete` to any role, including the IT Administrator.

*Risk addressed:* `RBAC.xls` assigns "audit trail monitoring" to IT and "audit trail reports" to Account Receivables. An audit log an administrator can edit provides no assurance.

### 3.7 DRY

Shared `zod` schemas and domain types live in `packages/domain` and are imported by both applications. A change to the reservation shape propagates to the portal form, the internal review screen, and the API contract in one edit — and cannot be applied to one app and forgotten in the other.

### 3.8 KISS & YAGNI

This is a capstone delivered on a fixed defense date. No microservices, no custom design system beyond shadcn/ui, no GraphQL layer, no premature caching tier. Complexity is spent where the requirements demand it — the pricing engine, the approval state machine, and the OCR pipeline.

### 3.9 Object-Oriented Design

**OOP is applied to the domain and data infrastructure layers. The presentation layer stays functional.**

This split is deliberate, and it is worth being able to defend it. Modern React and Next.js are function-oriented by design — hooks, Server Components, and function components. Class components have been legacy React since 2019. Writing `class ReservationWizard extends React.Component` to satisfy an OOP checkbox would fight the framework and signal an outdated grasp of the stack.

The business logic is a different matter. A reservation that must never skip from *Pending* to *Sold*, money that must never lose a centavo, and six document types that share one validation skeleton are textbook objects. That is where OOP earns its place.

#### The four pillars, mapped to this system

| Pillar | Where it appears | What it prevents |
|---|---|---|
| **Encapsulation** | `Money` hides its centavo integer; `Reservation` owns its status field and exposes only legal transitions | External code cannot corrupt an amount or force an illegal status |
| **Abstraction** | `IUnitRepository`, `IReservationRepository`, `IDocumentStorage` — interfaces declared by the domain | Domain logic never knows Firestore or Cloudinary exists |
| **Inheritance** | `FirestoreRepository<T>` base class; `DocumentValidator` base class | CRUD and validation skeletons written once, not six times |
| **Polymorphism** | `DiscountStrategy` subclasses; `DocumentValidator` subclasses | Callers select behaviour by data, with no `switch` chains to maintain |

#### Pillar 1 — Encapsulation: the `Money` value object

```typescript
// lib/domain/value-objects/money.ts
export class Money {
  private constructor(private readonly centavos: number) {
    if (!Number.isInteger(centavos)) throw new DomainError('Money must be whole centavos');
    if (centavos < 0) throw new DomainError('Money cannot be negative');
  }

  static fromPesos(pesos: number): Money  { return new Money(Math.round(pesos * 100)); }
  static fromCentavos(c: number): Money   { return new Money(c); }
  static zero(): Money                    { return new Money(0); }

  add(other: Money): Money        { return new Money(this.centavos + other.centavos); }
  subtract(other: Money): Money   { return new Money(this.centavos - other.centavos); }
  percentage(rate: number): Money { return new Money(Math.round(this.centavos * rate / 100)); }

  /** Splits into n instalments that sum back to exactly this amount. */
  divideIntoInstalments(n: number): Money[] {
    const base = Math.floor(this.centavos / n);
    const remainder = this.centavos - base * n;
    return Array.from({ length: n }, (_, i) =>
      new Money(base + (i < remainder ? 1 : 0)));
  }

  toCentavos(): number { return this.centavos; }
  format(): string {
    return `₱${(this.centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
  }
}
```

The constructor is `private`, so a `Money` can only be created through a validating factory. There is no setter, so it is immutable — `add` returns a new instance. `divideIntoInstalments` distributes the leftover centavos across the first few months, which is what makes a 36-month schedule sum back to the net down payment exactly. This directly implements §3.5.

#### Pillar 2 — Abstraction: the repository port

The domain layer *declares* what it needs; it never imports Firebase.

```typescript
// lib/domain/repositories/unit.repository.ts   ← domain layer, zero infrastructure imports
export interface IUnitRepository {
  findById(id: UnitId): Promise<Unit | null>;
  findAvailableByProject(projectId: ProjectId): Promise<Unit[]>;
  /** Atomically moves Available → On Hold. Throws UnitNotAvailableError if taken. */
  holdForReservation(id: UnitId, reservationId: ReservationNumber): Promise<void>;
}
```

#### Pillar 3 — Inheritance: the Firestore base repository

```typescript
// lib/infrastructure/firestore/base.repository.ts
export abstract class FirestoreRepository<T extends Entity> {
  protected constructor(
    protected readonly db: Firestore,
    protected readonly collectionName: string,
    protected readonly mapper: EntityMapper<T>,
  ) {}

  async findById(id: string): Promise<T | null> {
    const snap = await this.db.collection(this.collectionName).doc(id).get();
    return snap.exists ? this.mapper.toDomain(snap.id, snap.data()!) : null;
  }

  async save(entity: T): Promise<void> {
    await this.db.collection(this.collectionName)
      .doc(entity.id).set(this.mapper.toPersistence(entity));
  }

  protected abstract collectionPath(): string;
}

// lib/infrastructure/firestore/unit.repository.ts
export class FirestoreUnitRepository
  extends FirestoreRepository<Unit>
  implements IUnitRepository {

  async holdForReservation(id: UnitId, reservationId: ReservationNumber): Promise<void> {
    await this.db.runTransaction(async (tx) => {
      const ref  = this.db.collection('units').doc(id.value);
      const snap = await tx.get(ref);
      const unit = this.mapper.toDomain(snap.id, snap.data()!);
      unit.hold(reservationId);                    // ← entity enforces the rule
      tx.update(ref, this.mapper.toPersistence(unit));
    });
  }
}
```

`findById` and `save` are written once and inherited by all fifteen repositories.

#### Pillar 4 — Polymorphism: discount strategies

This is the pattern that fits the requirements most naturally. The discount rule in `RESERVATION.doc` changes its *base* between tiers — 20% applies to the down payment, 30–50% apply to the total purchase price (§8.3). A `switch` statement would hide that; separate strategy classes make it explicit.

```typescript
// lib/domain/pricing/discount-strategy.ts
export abstract class DiscountStrategy {
  abstract calculate(totalPurchasePrice: Money, downPayment: Money): Money;
}

class NoDiscount extends DiscountStrategy {                    // 10% DP
  calculate(): Money { return Money.zero(); }
}

class DownPaymentBasedDiscount extends DiscountStrategy {      // 20% DP → 10% OF THE DOWN PAYMENT
  constructor(private readonly rate: number) { super(); }
  calculate(_tpp: Money, downPayment: Money): Money { return downPayment.percentage(this.rate); }
}

class PurchasePriceBasedDiscount extends DiscountStrategy {    // 30/40/50% DP → OF THE TOTAL PRICE
  constructor(private readonly rate: number) { super(); }
  calculate(tpp: Money): Money { return tpp.percentage(this.rate); }
}

export class DiscountStrategyFactory {
  private static readonly byTier = new Map<number, DiscountStrategy>([
    [10, new NoDiscount()],
    [20, new DownPaymentBasedDiscount(10)],
    [30, new PurchasePriceBasedDiscount(5)],
    [40, new PurchasePriceBasedDiscount(10)],
    [50, new PurchasePriceBasedDiscount(10)],
  ]);

  static forTier(percent: number): DiscountStrategy {
    const s = DiscountStrategyFactory.byTier.get(percent);
    if (!s) throw new DomainError(`Unsupported down payment tier: ${percent}%`);
    return s;
  }
}
```

`PricingService` calls `strategy.calculate(tpp, dp)` without knowing which tier it received. If St. Francis later introduces a 60% tier, that is one new map entry and zero edits to existing code — the Open/Closed Principle, demonstrable in a single diff.

#### Encapsulating the status machine

The `Reservation` entity owns its own lifecycle. The transition table from §8.4 lives inside the class, so no service, route handler, or component can move a reservation illegally.

```typescript
// lib/domain/entities/reservation.ts
export class Reservation {
  private constructor(
    public  readonly id: ReservationNumber,
    private _status: ReservationStatus,
    private readonly _events: DomainEvent[] = [],
  ) {}

  private static readonly ALLOWED: Record<ReservationStatus, ReservationStatus[]> = {
    PendingPaymentVerification: ['PaymentVerified', 'DeficiencyNoted'],
    PaymentVerified:            ['DocumentsVerified', 'DeficiencyNoted'],
    DocumentsVerified:          ['Approved', 'DeficiencyNoted'],
    Approved:                   ['ContractSigned'],
    ContractSigned:             ['Completed'],
    DeficiencyNoted:            ['PaymentVerified', 'DocumentsVerified', 'Expired'],
    Expired:                    ['Cancelled'],          // manual review only
    Cancelled:                  [],                     // terminal
    Completed:                  [],                     // terminal
  };

  get status(): ReservationStatus { return this._status; }   // read-only to the outside

  verifyPayment(by: EmployeeId): void {
    this.transitionTo('PaymentVerified');
    this._events.push(new PaymentVerifiedEvent(this.id, by));
  }

  /** Expiry never cancels — §8.4. Cancellation is a separate, privileged action. */
  markExpired(): void { this.transitionTo('Expired'); }

  cancel(by: EmployeeId, approvedBy: EmployeeId, reason: string): void {
    if (this._status !== 'Expired') throw new DomainError('Only expired reservations may be cancelled');
    this.transitionTo('Cancelled');
    this._events.push(new ReservationCancelledEvent(this.id, by, approvedBy, reason));
  }

  private transitionTo(next: ReservationStatus): void {
    if (!Reservation.ALLOWED[this._status].includes(next)) {
      throw new IllegalStateTransitionError(this._status, next);
    }
    this._status = next;
  }
}
```

*Risk addressed:* the most damaging bug this system could ship is a unit marked **Sold** without verified payment. With `_status` private and every path funnelled through `transitionTo`, that bug becomes unrepresentable rather than merely unlikely.

#### Where OOP is deliberately not used

| Area | Style | Reason |
|---|---|---|
| React components | Function components + hooks | Class components are legacy React; Server Components cannot be classes |
| Route Handlers / Server Actions | Exported async functions | Required by the Next.js App Router contract |
| Zod schemas | Declarative composition | Zod's own API is combinator-based |
| Tailwind styling | Utility classes | No styling abstraction layer needed |

Stating this boundary is part of the design, not a gap in it.

### 3.10 SOLID

| Letter | Principle | Applied here |
|---|---|---|
| **S** | Single Responsibility | `PricingService` computes; `ReservationWorkflowService` transitions; `FirestoreReservationRepository` persists. Three reasons to change, three classes. |
| **O** | Open / Closed | A new down-payment tier or document type is a **new subclass**, never an edit to a working `switch`. |
| **L** | Liskov Substitution | Any `DiscountStrategy` is safely usable wherever the base type is expected — all return `Money`, none throw on valid input. `InMemoryUnitRepository` substitutes for `FirestoreUnitRepository` in tests. |
| **I** | Interface Segregation | Repository ports are narrow. The Legal Counsel screen depends on `IClientReadRepository` (read-only), not on a fat interface that also exposes `delete`. |
| **D** | Dependency Inversion | Services depend on the `I*Repository` **interfaces declared in the domain**, and the Firestore classes implement them. High-level policy does not depend on the database. |

Dependency Inversion is the one with the largest practical payoff: because `ReservationWorkflowService` accepts `IUnitRepository` rather than a Firestore handle, its tests run against an in-memory fake in milliseconds with no emulator (§11).

---

## 4. Software Development Life Cycle

`instruction.txt` asks to *"Implement SDLC (choose best for this project)."*

### 4.1 Selected Model: Agile Scrum (Iterative & Incremental)

**Eight sprints of two weeks each — 16 weeks total.**

### 4.2 Justification

The requirements for SFSR-REMS are unusually complete for a project of this size. `RESERVATION.doc` specifies field-by-field forms, `RBAC.xls` fixes the permission matrix, and `DATABASE PROJECT.xls` supplies the full inventory. That degree of up-front definition would ordinarily favour a plan-driven, Waterfall-style approach.

Two factors override it:

1. **The interface is deliberately undefined.** `RESERVATION.doc` states plainly: *"Note: See Picture as reference for details and how reservation process.. You may design your own interface."* Design that is discovered rather than specified requires iteration and feedback.

2. **Panel review is a feedback loop.** Capstone panels evaluate working increments and request changes. A model that cannot absorb mid-build change would put the defense date at risk.

Agile Scrum keeps the documented requirements as a stable Product Backlog while allowing the UI and workflow details to converge over successive Sprint Reviews. Each sprint ends in a demonstrable increment — which is also the artifact a panel wants to see.

### 4.3 Mapping to Classical SDLC Phases

Academic evaluation typically expects the seven classical phases. They are not discarded; they recur inside every sprint.

| Classical Phase | Where it happens in Scrum | Artifact produced |
|---|---|---|
| Planning | Sprint Planning (start of each sprint) | Sprint Backlog, Sprint Goal |
| Requirements Analysis | Backlog Refinement (mid-sprint) | User stories with acceptance criteria |
| System Design | Design spike within the sprint | ERD, DFD, wireframes, API contract |
| Implementation | Daily development | Working code in `main` |
| Testing | Continuous + sprint-end regression | Vitest, rules tests, Playwright specs |
| Deployment | End of each sprint | Vercel preview; production at Sprint 7 |
| Maintenance | Sprint Retrospective + defect backlog | Retrospective notes, bug tickets |

### 4.4 Scrum Ceremonies

| Ceremony | Cadence | Duration | Purpose |
|---|---|---|---|
| Sprint Planning | Start of sprint | 2 h | Commit to a Sprint Goal |
| Daily Standup | Daily | 15 min | Surface blockers early |
| Backlog Refinement | Mid-sprint | 1 h | Prepare the next sprint's stories |
| Sprint Review | End of sprint | 1 h | Demonstrate the increment to the adviser |
| Sprint Retrospective | End of sprint | 45 min | Improve the process |

### 4.5 Definition of Done

A story is Done only when **all** hold:

- [ ] Acceptance criteria met
- [ ] TypeScript compiles with zero errors under `strict`
- [ ] Unit tests written and passing for any business logic introduced
- [ ] Firestore Security Rules updated and tested for any new collection or field
- [ ] Audit log entry emitted for any state-changing operation
- [ ] Responsive at 360 px, 768 px, and 1440 px
- [ ] Deployed to the Vercel preview environment
- [ ] Reviewed and merged to `main`

---

## 5. System Architecture

### 5.1 Repository Structure

**Two separate applications in one npm-workspaces monorepo.**

The two apps have different audiences, different deployment targets, and different network exposure (§5.7). They build, run, and ship independently — `apps/internal` never appears in the Portal's bundle, and vice versa. The ESLint config forbids either app from importing the other.

What they *do* share is `packages/domain`. That is deliberate and non-negotiable: the pricing engine must be byte-identical in both. If the Portal quoted a buyer ₱2,450,000 and Billing computed ₱2,449,999 because one copy was patched and the other was not, the result is a contractual dispute (§3.1). One package, two consumers, no drift.

```
RealestateManagement/
├── package.json                     ← workspace root
├── tsconfig.base.json               ← shared compiler options
├── eslint.config.mjs                ← incl. the architectural boundary rule
├── vitest.config.mts
│
├── packages/
│   ├── domain/                      ← DOMAIN LAYER — @sfsr/domain
│   │   └── src/                       Pure TypeScript. ZERO runtime deps.
│   │       ├── entities/       Reservation · Unit · Client · Payment · Document
│   │       ├── value-objects/  Money · ReservationNumber · UnitId · ProjectId
│   │       ├── pricing/        PricingService · DiscountStrategy hierarchy
│   │       ├── validation/     DocumentValidator hierarchy
│   │       ├── services/       ReservationWorkflowService · SoaService
│   │       ├── repositories/   I*Repository interfaces (ports only)
│   │       ├── events/         DomainEvent types
│   │       └── errors/         DomainError · IllegalStateTransitionError
│   │
│   ├── infrastructure/              ← DATA INFRA LAYER — @sfsr/infrastructure
│   │   └── src/
│   │       ├── firestore/      BaseRepository<T> + concrete repositories
│   │       ├── mappers/        Firestore document ↔ domain entity
│   │       ├── cloudinary/     CloudinaryStorageAdapter (signed uploads)
│   │       ├── vision/         CloudVisionOcrAdapter
│   │       ├── unit-of-work/   FirestoreUnitOfWork (transaction boundary)
│   │       ├── firebase/       client.ts · admin.ts
│   │       └── testing/        in-memory fakes for the domain test suite
│   │
│   └── ui/                          ← SHARED UI — @sfsr/ui
│       └── src/                       shadcn/ui primitives, cross-app components
│
├── apps/
│   ├── portal/                      ← @sfsr/portal — DEPLOYED PUBLICLY, port 3000
│   │   ├── app/
│   │   │   ├── layout.tsx           ← SIDEBAR navigation (explicit client request)
│   │   │   ├── page.tsx             ← landing
│   │   │   ├── projects/[projectId]/units/
│   │   │   ├── units/[unitId]/
│   │   │   ├── compute/             ← sample computation
│   │   │   ├── tripping/            ← site viewing request
│   │   │   ├── reserve/[unitId]/    ← 8-step wizard
│   │   │   ├── dashboard/           ← reservations · documents · soa · payments
│   │   │   ├── (auth)/              ← login · register · reset-password
│   │   │   └── api/
│   │   │       ├── auth/resolve-username/
│   │   │       ├── upload/          ← Cloudinary signature
│   │   │       └── ocr/             ← Cloud Vision
│   │   ├── lib/container.ts         ← composition root
│   │   ├── proxy.ts                 ← client-tier gate
│   │   └── next.config.ts
│   │
│   └── internal/                    ← @sfsr/internal — LOCAL LAN ONLY, port 3001
│       ├── app/
│       │   ├── layout.tsx           ← sidebar, role-filtered menu
│       │   ├── dashboard/           ← role-specific KPIs
│       │   ├── inventory/           ← Unit Inventory module
│       │   ├── reservations/        ← queue · detail · approval
│       │   ├── verification/        ← payments (AR) · documents (Documentation)
│       │   ├── billing/  cash/  loans/  accounting/
│       │   ├── clients/  scheduling/  announcements/
│       │   ├── reports/             ← incl. Expired Reservation Report
│       │   ├── audit/               ← audit trail viewer
│       │   └── admin/               ← IT: users, roles, settings
│       ├── lib/container.ts
│       ├── proxy.ts                 ← employee-claim gate
│       └── next.config.ts
│
├── scripts/seed/                    ← .xls → JSON fixtures → Firestore
├── firestore.rules
└── .env.local
```

**Commands**

| Task | Command |
|---|---|
| Portal, development | `npm run dev:portal` → `localhost:3000` |
| Internal, development | `npm run dev:internal` → `localhost:3001` |
| Portal, production build | `npm run build:portal` |
| Internal, run on the office server | `npm run build:internal && npm run start:internal` |
| Full verification | `npm run verify` (typecheck → lint → test) |

> **Client portal navigation is a sidebar.** This is an explicit instruction from `RESERVATION.doc`:
> *"Gusto ko din sana ang menu(option) pag sa portal na ni buyer is nasa gilid. Mas neat kasi tignan. Para nasa isang side lang. gaya sa picture."*

### 5.2 Authentication Flow

Both the Registration and Login pages in `RESERVATION.doc` specify a **username**, not an email address. Firebase Authentication requires an email. The bridge:

```
Login form (username, password)
   ↓
POST /api/auth/resolve-username        ← server-only, Admin SDK
   ↓
usernames/{username} → { email, uid }  ← private collection, no client read
   ↓
signInWithEmailAndPassword(email, password)
   ↓
Custom claims { role, department, accountType } → proxy.ts + Firestore Rules
```

The `usernames` collection is unreadable by clients, so the index cannot be enumerated to harvest registered accounts.

Per `RESERVATION.doc`, the username is **permanent and cannot be changed** — *"For record integrity and audit purposes, the assigned username remains permanent."* Employees and newly activated Permanent Clients carry `mustChangePassword: true` until their first password reset.

### 5.3 Reservation Submission Path

```
Portal wizard (client)
   ↓  zod validation
Server Action / Route Handler
   ↓  re-validate with the same zod schema
   ↓  verify caller owns this draft
Firestore transaction (atomic):
   ├─ read unit; abort if status ≠ Available
   ├─ increment counters/reservations → RES-YYYY-NNNNNN
   ├─ create reservations/{id}, status = Pending Payment Verification
   └─ write auditLogs entry
   ↓
Notification → client portal + internal AR queue
```

The transaction is what prevents two buyers reserving the same unit in the same second.

### 5.4 Firestore Collections

| Collection | Contents |
|---|---|
| `projects` | The 5 condominium projects |
| `units` | 150 units, incl. lifecycle status |
| `parkingSlots` | 125 parking slots |
| `clients` | Buyer accounts (Guest → Initial → Permanent) |
| `employees` | The 25 internal staff |
| `salesOrg` | Group Heads, Brokers, Agents |
| `reservations` | Reservation applications and workflow state |
| `payments` | Proof of payment, verification, official receipts |
| `documents` | Uploads with OCR results and validation scores |
| `trippings` | Site viewing requests |
| `soa` | Statements of Account, amortization schedules |
| `announcements` | Marketing content |
| `notifications` | Per-user notification feed |
| `auditLogs` | Append-only audit trail |
| `usernames` | Private username → email index |
| `counters` | Sequence generator for reservation numbers |
| `settings` | Configurable values (reservation fee, SLA windows) |

### 5.5 Layered Architecture

SFSR-REMS follows a four-layer **Clean Architecture / Ports-and-Adapters** structure. The rule that makes it work: **dependencies point inward only.** The domain layer imports nothing from the outer layers.

```
╔══════════════════════════════════════════════════════════════════════╗
║  PRESENTATION LAYER                                    (functional)  ║
║  app/(portal)/ · app/(internal)/ · components/                       ║
║  React Server + Client Components. Renders. Decides nothing.         ║
╚═══════════════════════════════╤══════════════════════════════════════╝
                                │ calls
╔═══════════════════════════════▼══════════════════════════════════════╗
║  APPLICATION LAYER                                     (functional)  ║
║  lib/actions/ · app/api/                                             ║
║  Server Actions and Route Handlers. Thin: authenticate the caller,   ║
║  check RBAC, map DTO → domain, invoke a service, map back.           ║
║  Contains no business rules.                                         ║
╚═══════════════════════════════╤══════════════════════════════════════╝
                                │ calls
╔═══════════════════════════════▼══════════════════════════════════════╗
║  DOMAIN LAYER                                                (OOP)   ║
║  lib/domain/                                                         ║
║  Entities · Value Objects · Domain Services · Strategies             ║
║  DECLARES the repository interfaces (ports) it needs.                ║
║  Zero imports from firebase, cloudinary, next, or react.             ║
║  Pure TypeScript — unit-testable with no emulator, no network.       ║
╚═══════════════════════════════▲══════════════════════════════════════╝
                                │ implements (dependency INVERTED)
╔═══════════════════════════════╧══════════════════════════════════════╗
║  DATA INFRASTRUCTURE LAYER                                   (OOP)   ║
║  lib/infrastructure/                                                 ║
║  Firestore repositories · Mappers · Unit of Work                     ║
║  Cloudinary adapter · Cloud Vision adapter                           ║
║  The only layer that knows a database or a vendor SDK exists.        ║
╚══════════════════════════════════════════════════════════════════════╝
```

Note the direction of the bottom arrow. Infrastructure depends on the domain, not the other way round — that is Dependency Inversion (§3.10 D), and it is what makes the domain testable in isolation.

**Enforcement.** An ESLint `no-restricted-imports` rule fails the build if anything under `lib/domain/` imports `firebase`, `firebase-admin`, `cloudinary`, `@google-cloud/vision`, `next`, or `react`. The boundary is checked by CI, not by discipline.

**Practical payoff for this project:** if Firestore ever proves unsuitable — a real possibility given the reporting and aggregation the Accounting and Account Receivables roles need — the replacement is a new set of classes under `lib/infrastructure/`. The domain, the pricing rules, and the approval workflow are untouched.

### 5.6 Data Infrastructure Layer

#### 5.6.1 Responsibilities

| Concern | Component |
|---|---|
| Persistence | `FirestoreRepository<T>` + 15 concrete subclasses |
| Translation | `EntityMapper<T>` — Firestore document ↔ domain entity |
| Transactions | `FirestoreUnitOfWork` — one atomic boundary per use case |
| File storage | `CloudinaryStorageAdapter` implements `IDocumentStorage` |
| OCR | `CloudVisionOcrAdapter` implements `IOcrEngine` |
| Sequences | `FirestoreCounterRepository` — gap-free `RES-YYYY-NNNNNN` |

#### 5.6.2 Mappers

Firestore documents and domain entities are **not** the same shape, and conflating them is how a `Money` object degrades back into a raw float somewhere in the codebase.

```typescript
// lib/infrastructure/mappers/unit.mapper.ts
export class UnitMapper implements EntityMapper<Unit> {
  toDomain(id: string, raw: DocumentData): Unit {
    return Unit.reconstitute({
      id:            new UnitId(id),
      projectId:     new ProjectId(raw.projectId),
      tower:         raw.tower ?? null,              // null for Legaspi & Emerald — §12.5
      purchasePrice: Money.fromCentavos(raw.purchasePriceCentavos),
      status:        raw.status as UnitStatus,
    });
  }

  toPersistence(unit: Unit): DocumentData {
    return {
      projectId:             unit.projectId.value,
      tower:                 unit.tower,
      purchasePriceCentavos: unit.purchasePrice.toCentavos(),   // integer, always
      status:                unit.status,
      updatedAt:             FieldValue.serverTimestamp(),
    };
  }
}
```

`reconstitute` is a separate factory from `create`: rebuilding a stored entity must not re-run creation-time invariants that were already satisfied when it was first saved.

#### 5.6.3 Unit of Work

The reservation submit in §5.3 touches three collections and must be all-or-nothing. Rather than scatter `runTransaction` calls, one object owns the boundary:

```typescript
// lib/infrastructure/unit-of-work/firestore.uow.ts
export class FirestoreUnitOfWork implements IUnitOfWork {
  constructor(private readonly db: Firestore) {}

  async execute<T>(work: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async (tx) => work(new FirestoreTransactionContext(tx)));
  }
}
```

Used by the workflow service, which itself stays free of Firestore imports:

```typescript
// lib/domain/services/reservation-workflow.service.ts
export class ReservationWorkflowService {
  constructor(
    private readonly units:        IUnitRepository,
    private readonly reservations: IReservationRepository,
    private readonly audit:        IAuditLogger,
    private readonly uow:          IUnitOfWork,
  ) {}

  async submit(draft: ReservationDraft, client: ClientId): Promise<ReservationNumber> {
    return this.uow.execute(async (ctx) => {
      const unit = await this.units.findById(draft.unitId);
      if (!unit) throw new DomainError('Unit not found');

      const number      = await this.reservations.nextNumber(ctx);
      const reservation = Reservation.create(number, draft, client);

      unit.hold(number);                     // entity rejects if not Available

      await this.units.save(unit, ctx);
      await this.reservations.save(reservation, ctx);
      await this.audit.record(new ReservationSubmittedEvent(number, client), ctx);

      return number;
    });
  }
}
```

Every dependency is an **interface**. In tests this service runs against in-memory fakes; in production the composition root injects the Firestore implementations.

#### 5.6.4 Composition Root

One file wires ports to adapters. It is the only place in the codebase where a concrete infrastructure class is named.

```typescript
// lib/container.ts
const db = getFirestore(adminApp);

export const container = {
  units:        new FirestoreUnitRepository(db, 'units', new UnitMapper()),
  reservations: new FirestoreReservationRepository(db, 'reservations', new ReservationMapper()),
  storage:      new CloudinaryStorageAdapter(cloudinaryConfig),
  ocr:          new CloudVisionOcrAdapter(visionClient),
  uow:          new FirestoreUnitOfWork(db),
} as const;

export const reservationWorkflow = new ReservationWorkflowService(
  container.units, container.reservations, container.audit, container.uow,
);
```

No DI framework — a plain object is sufficient at this scale and keeps §3.8 (KISS) honest.

### 5.7 Deployment Topology

The two applications have **different network exposure**. This is a client requirement, not an implementation detail.

```
        INTERNET                          ST. FRANCIS SQUARE OFFICE (LAN)
   ┌──────────────────┐                  ┌──────────────────────────────────┐
   │                  │                  │                                  │
   │   Buyers /       │                  │   Staff workstations (25)        │
   │   Prospective    │                  │   browser only — no app, no keys │
   │   Clients        │                  │             │                    │
   │        │         │                  │             ▼                    │
   │        ▼         │                  │   ┌──────────────────────┐       │
   │  ┌────────────┐  │                  │   │  Office LAN server   │       │
   │  │  @sfsr/    │  │                  │   │  @sfsr/internal      │       │
   │  │  portal    │  │                  │   │  npm start :3001     │       │
   │  │  (Vercel)  │  │                  │   │  http://<office-ip>  │       │
   │  └─────┬──────┘  │                  │   └──────────┬───────────┘       │
   └────────┼─────────┘                  └──────────────┼───────────────────┘
            │                                           │
            │        ┌───────────────────────┐          │
            └───────►│   Cloud Firestore     │◄─────────┘
                     │   project: sfsr-rems  │
                     │                       │
                     │   THE CONNECTION      │
                     └───────────────────────┘
                                │
                     ┌──────────┴───────────┐
                     │  Cloudinary  ·  Cloud Vision
                     └──────────────────────┘
```

| | Portal | Internal |
|---|---|---|
| Package | `@sfsr/portal` | `@sfsr/internal` |
| Audience | Buyers, prospective clients | 25 employees, 8 departments |
| Hosting | **Vercel — public internet** | **One office PC on the LAN** |
| Port | 3000 | 3001 (`--hostname 0.0.0.0`) |
| Reachable from | Anywhere | Office network only |
| Firebase Admin key | Vercel env vars | The LAN server only — **not** on workstations |
| Public DNS | Yes | No |

**How they stay in sync.** Both apps read and write the same Cloud Firestore project. When a buyer submits a reservation on the Portal, the submit transaction (§5.3) flips the unit to `On Hold`; a Firestore listener in the Internal app reflects that immediately in the Unit Inventory and the Account Receivables queue. No API between the two apps, no polling, no sync job — the database *is* the integration point. This is exactly what `RESERVATION.doc` requires:

> *"…the selected condominium unit is automatically tagged as 'On Hold' … across both the Web-Based Real Estate Portal and the Internal Management System."*

**Why the Internal app is not deployed.** Keeping it off the public internet removes the entire class of attacks that begin with an attacker reaching the admin login page. It is the outermost of four controls, not a replacement for the other three (§3.3) — Firestore Security Rules still enforce every role boundary, because a compromised workstation is inside the LAN.

**Why one LAN server rather than 25 local installs.** The Firebase Admin service account can mint tokens for any user and bypasses Security Rules entirely. On 25 workstations that is 25 copies of a key that grants total database access, on machines nobody audits. On one server it is one copy, in one place, with one set of backups. Staff reach it over HTTP like any intranet site.

**Consequences to plan for:**

| Consequence | Handling |
|---|---|
| The office server is a single point of failure | Internal work stops if it is down; the Portal keeps accepting reservations, and the queue drains when it returns |
| No HTTPS on a bare LAN deployment | Firebase Auth tokens would travel in the clear. Sprint 7: self-signed certificate or a reverse proxy |
| Staff cannot work off-site | Accepted for the capstone; a VPN is the production answer |
| Two builds to keep in step | `npm run verify` at the workspace root typechecks, lints, and tests both apps plus the shared packages |

---

## 6. Data Model & Migration

### 6.1 Core Entity Shapes

The shapes below are the **persistence** representation — what a Firestore document holds. The corresponding domain classes (§3.9, §5.6) wrap these in behaviour: `purchasePriceCentavos: number` becomes a `Money`, `status: string` becomes a field private to the `Unit` entity. Translation between the two is the mapper's job (§5.6.2).

```typescript
type UnitStatus = 'Available' | 'On Hold' | 'Sold' | 'Cancelled';

interface Project {
  id: string;              // 'TLP001'
  name: string;            // 'The Legaspi Place'
  developer: string;       // 'St. Francis Square Realty Corporation'
  location: string;
  buildingType: string;
  floors: number;
  theme: string;
  towers: string[];        // ['Tower A','Tower B'] — empty for TLP001, EPR002
  heroImageUrl: string | null;
  floorPlans: Record<string, string>;   // unitType → Cloudinary URL
}

interface Unit {
  id: string;              // 'U001' | 'EU001' | 'SQ001' | 'GV001' | 'HP001'
  projectId: string;
  tower: string | null;    // null for Legaspi and Emerald
  floor: number;
  unitNo: string;          // 'A-101'
  unitType: 'Studio' | 'One Bedroom' | 'Two Bedroom' | 'Three Bedroom' | 'Penthouse';
  areaSqm: number;
  pricePerSqmCentavos: number;
  purchasePriceCentavos: number;
  status: UnitStatus;
  currentReservationId: string | null;
}

interface ParkingSlot {
  id: string;              // 'PK001' | 'EPK001' | 'SP001' | 'GVP001' | 'HPP001'
  projectId: string;
  tower: string | null;
  level: string;           // 'Basement 1'
  parkingNo: string;
  parkingType: 'Regular' | 'Premium' | 'Tandem';
  areaSqm: number;
  purchasePriceCentavos: number;
  status: UnitStatus;
}
```

`tower` is nullable because two of the five source sheets have no Tower column (see §12, finding 5).

### 6.2 Status Legend

Transcribed from `DATABASE PROJECT.xls`:

| Status | Meaning |
|---|---|
| **Available** | Unit can be reserved |
| **On Hold** | Reservation application submitted; payment and documents under verification |
| **Sold** | Reservation approved |
| **Cancelled** | No payment, no submitted document, did not qualify |

### 6.3 Migration Approach

A one-time seed script per source file, run through the Firebase Admin SDK.

| Script | Source | Writes |
|---|---|---|
| `seed-projects.ts` | `DATABASE PROJECT.xls` header blocks | `projects` |
| `seed-inventory.ts` | 5 project sheets | `units` (150), `parkingSlots` (125) |
| `seed-employees.ts` | `RBAC.xls`, 8 department sheets | `employees` (25) + Firebase Auth users |
| `seed-sales-org.ts` | `SALES STAFF DATABASE.xls` | `salesOrg` (3 + 6 + 12) |
| `upload-media.ts` | `CONDOMINIUM PROJECTS/` | Cloudinary → URLs onto `projects` |

**Normalization rules applied during import:**

1. Currency strings → integer centavos. `"₱15,000,000"` and `"15,000,000.00"` both → `1500000000`.
2. Header aliases unified: `Price/sqm` ≡ `Price per sqm`; `Unit Price` ≡ `Unit Purchase Price`.
3. Missing `Tower` column → `tower: null`.
4. Employee passwords from `RBAC.xls` are used **only** to create the Auth user, then discarded. Every seeded account carries `mustChangePassword: true`.

---

## 7. Role-Based Access Control Matrix

Transcribed from `RBAC.xls › USER ROLE ACCESS`.

### 7.1 Internal Roles

| # | Role | Department | Modules | Rights |
|---|---|---|---|---|
| 1 | **IT Administrator** | IT | All modules | Create, modify, delete, view |
| 2 | **Sales Agent / Broker / Group Head** | Sales | Unit Inventory, Scheduling | View, print |
| 3 | **Documentation Staff / Supervisor** | Loans Management | Documentary Requirements, OCR Validation, Reservation Verification, Client Profile | Create, modify, delete, view |
| 4 | **Loan Officer / Supervisor** | Loans Management | Client Profile, Payment Monitoring | View, print reports |
| 5 | **Billing Staff / Supervisor** | Loans Management | SOA Generation, Payment Term Monitoring | Create, modify, delete, view, send |
| 6 | **Account Receivables Officer / Supervisor** | Loans Management | Dashboard, Reports, Analytics, Approval Monitoring | Create, modify, delete, view |
| 7 | **Accounting Staff** | Accounting | Payment, Official Receipt, Financial Reports | View, manage, print |
| 8 | **Cash Clerk** | Cash | Payment Records | Record, monitor |
| 9 | **Marketing Staff** | Marketing | Advertisement | Upload announcements, project details |
| 10 | **Legal Counsel** | Legal | Client Profile | View |

**Supervisor rule** — from the sheet's own note:
> *"All Supervisor per personnel is the approver of the transaction, they are the final stage of the transaction."*

Implemented as a `isSupervisor` boolean on the employee record. Approval actions check `role` **and** `isSupervisor` together.

### 7.2 Client Access Tiers

| Tier | Capabilities |
|---|---|
| **Guest User** | View all project details; create an account |
| **Initial Account** (Prospective Buyer) | Request tripping, request sample computation, reserve a unit, upload proof of payment and ID |
| **Permanent Client** | Everything above, plus: reserve again, upload documents, view profile, documents, balances, SOA, payment history, announcements, notifications |

The Permanent Client Account is created and activated by **Documentation Staff** after the Contract to Sell is signed.

### 7.3 Sales Organization Hierarchy

```
Group Head (3)  →  Broker (6, PRC-licensed)  →  Agent (12)
```

Each reservation records the assigned Sales Agent, from which the broker and group head are derived for commission reporting.

### 7.4 Employee Distribution

| Department | Sheet | Count | IDs |
|---|---|---|---|
| IT | `IT` | 4 | EMP001–EMP004 |
| User Receivables | `RECEIVABLES` | 3 | EMP005–EMP007 |
| Cash | `CASH` | 3 | EMP008–EMP010 |
| Loans Mgmt — Documentation | `DOCUMENTATION` | 3 | EMP011–EMP013 |
| Loans Mgmt — Billing | `BILLING` | 3 | EMP014–EMP016 |
| Loans Mgmt — Loans | `LOANS` | 3 | EMP017–EMP019 |
| Accounting | `ACCOUNTING` | 3 | EMP020–EMP022 |
| Legal | `LEGAL` | 3 | EMP023–EMP025 |
| Marketing | *(none)* | **0** ⚠ | — |
| **Total** | | **25** | |

---

## 8. Reservation Module

The core of the system. All content in this section is transcribed from `RESERVATION.doc`.

### 8.1 Business Workflow (verbatim)

> Login → Browse Available Units → Select Unit → Complete Reservation → Upload Payment & ID → System verify upload document if correct → Submit reservation → Unit becomes On Hold → Payment Verification & Documentation Verification by St Francis Employee → Sales Approval → Unit becomes Sold → Contract Signing → Permanent Client Account Issued.

### 8.2 The Nine Steps

| Step | Content |
|---|---|
| **1 — Property Selection** | Project, unit, unit type, floor area, floor, price/sqm, unit price — all auto-filled from the database. Optional parking (No Parking / With Parking → slot no., type, area, price). |
| **2 — Buyer Information** | Auto-filled from the Initial Account. Buyer completes civil status, nationality, TIN, contact, and current address. Purchase Price table renders. |
| **3 — Payment Terms** | Reservation fee (₱50,000), down payment %, promotional discount, installment term, financing option. Payment Summary renders. |
| **4 — Review Reservation Details** | Full summary of buyer, property, and payment information. `[REVIEW DETAILS]` / `[EDIT INFORMATION]`. |
| **5 — Upload Proof of Payment** | PDF/JPG/JPEG/PNG, max 10 MB. Plus payment date, reference number, channel, amount paid. |
| **6 — Documentary Requirements** | Government-issued ID with ID type selection. Post-submission: BIR Form 1904/TIN, Proof of Billing, COE / Proof of Income, Marriage Certificate, SPA, Other Supporting Documents. |
| **7 — Terms and Conditions** | 11 clauses, all must be accepted. |
| **8 — Buyer's Declaration** | 5 certification checkboxes. |
| **9 — Submit** | Generates `RES-YYYY-NNNNNN`, sets status to Pending Payment Verification. |

### 8.3 Pricing Engine Specification

Implemented in `lib/domain/pricing/` as `PricingService` over `Money` value objects (§3.9). Deterministic and side-effect-free: no I/O, no clock, no randomness — so every rule below is directly unit-testable. Discount tiers are `DiscountStrategy` subclasses rather than a `switch`, because the rule's *base* changes between tiers.

```
Total Purchase Price = Unit Purchase Price + Parking Purchase Price
Down Payment         = Total Purchase Price × Down Payment %
Reservation Fee      = ₱50,000.00                    (from settings, not hardcoded)
Promotional Discount = per the table below
Net Down Payment     = Down Payment − Reservation Fee − Promotional Discount
Monthly Down Payment = Net Down Payment ÷ term months
Balance on TPP       = Total Purchase Price − Down Payment
```

**Inputs**

| Field | Allowed values |
|---|---|
| Down Payment % | 10% · 20% · 30% · 40% · 50% |
| Installment term | Spot Cash · 6 · 12 · 18 · 24 · 30 · 36 months |
| Financing option | Bank Financing · PAG-IBIG Fund · Cash Payment |
| Payment channel | Bank Deposit · Online Banking · GCash · Maya · Check · Cash |

**Promotional Discount rules** — transcribed exactly. Note the base changes between the 20% and 30% tiers:

| Down Payment % | Discount rate | Applied to |
|---|---|---|
| 10% | none | — |
| 20% | 10% | the **Down Payment** |
| 30% | 5% | the **Total Purchase Price** |
| 40% – 50% | 10% | the **Total Purchase Price** |

**Worked example** — ₱10,000,000 total purchase price, 24-month term:

| DP % | Down Payment | Discount | Net DP Required | Monthly DP | Balance on TPP |
|---|---|---|---|---|---|
| 10% | ₱1,000,000 | ₱0 | ₱950,000 | ₱39,583.33 | ₱9,000,000 |
| 20% | ₱2,000,000 | ₱200,000 | ₱1,750,000 | ₱72,916.67 | ₱8,000,000 |
| 30% | ₱3,000,000 | ₱500,000 | ₱2,450,000 | ₱102,083.33 | ₱7,000,000 |
| 40% | ₱4,000,000 | ₱1,000,000 | ₱2,950,000 | ₱122,916.67 | ₱6,000,000 |
| 50% | ₱5,000,000 | ₱1,000,000 | ₱3,950,000 | ₱164,583.33 | ₱5,000,000 |

Discount rises monotonically across tiers — the change of base does not create a discontinuity where a buyer would be penalised for paying more.

### 8.4 Reservation Status Machine

```
                    ┌─────────────────────────────────┐
                    │ Pending Payment Verification    │  ← on submit
                    └────────────┬────────────────────┘
                                 │  Account Receivables verifies the reservation fee
                                 │  (coordinates with Cash Clerk if bank-credited)
                                 ▼
                    ┌─────────────────────────────────┐
                    │ Payment Verified  →  unit ON HOLD│
                    └────────────┬────────────────────┘
                                 │  Documentation Dept: type validation, OCR, Levenshtein
                    ┌────────────┴────────────┐
                    ▼                         ▼
        ┌───────────────────┐    ┌──────────────────────────┐
        │ Documents Verified │    │ Deficiency Noted         │
        └─────────┬─────────┘    │ buyer has 24 hours       │
                  │              └────────────┬─────────────┘
                  │  Supervisor approval      │  no response
                  ▼                           ▼
        ┌───────────────────┐    ┌──────────────────────────┐
        │ APPROVED          │    │ Expired Reservation Report│
        │ unit → SOLD       │    │ (report only — no auto    │
        └─────────┬─────────┘    │  cancellation)            │
                  │              └────────────┬─────────────┘
                  │  OR issued by Cash Clerk, │  manual review +
                  │  uploaded by Billing      │  management approval
                  ▼                           ▼
        ┌───────────────────┐    ┌──────────────────────────┐
        │ Contract to Sell  │    │ CANCELLED                │
        │ signed            │    │ record retained (audit)   │
        └─────────┬─────────┘    │ unit → AVAILABLE          │
                  │              └──────────────────────────┘
                  ▼
        ┌───────────────────────────────┐
        │ Permanent Client Account       │
        │ created + activated by         │
        │ Documentation Staff            │
        └───────────────────────────────┘
```

**Critical rule.** The system must **never** cancel automatically:

> *"The system does not automatically cancel expired reservations. Instead, authorized St. Francis Square Realty Corporation personnel review the expired reservations and, upon management approval, manually process the cancellation through the Internal Management System."*

Cancelled records are retained and tagged for audit; the unit returns to Available.

**Implementation.** This transition table lives inside the `Reservation` entity as a private static map, and `_status` is a private field (§3.9). Every status change goes through `transitionTo()`, which throws `IllegalStateTransitionError` on an illegal move. No service, route handler, or component can bypass it — the diagram above is enforced by the type system and the class, not by convention.

### 8.5 Service Level Agreements

Two distinct timers, both required:

| Timer | Duration | Trigger | On expiry |
|---|---|---|---|
| Documentary submission | **30 calendar days** from reservation date | Reservation submitted | Flagged for review |
| Deficiency cure | **24 hours** from notice | Deficiency found in payment or documents | Listed in Expired Reservation Report |

### 8.6 Reservation Number Format

`RES-YYYY-NNNNNN` — e.g. `RES-2026-000001`. Generated inside the Firestore transaction via the `counters` collection so numbers are gap-free and unique under concurrency.

---

## 9. Document Validation Pipeline

Three techniques are named explicitly in both `RBAC.xls` and `RESERVATION.doc` and must all be present.

### 9.1 Pipeline

```
Upload (PDF / JPG / JPEG / PNG, ≤ 10 MB)
   ↓
[1] DOCUMENT TYPE VALIDATION
    Does the file match the document type the buyer selected?
    Keyword and layout heuristics per type.
    ✗ → reject immediately, ask for the correct document
   ↓
[2] OCR — Google Cloud Vision API
    Extract full text and structured fields
   ↓
[3] LEVENSHTEIN DISTANCE
    Compare extracted text against the stored client record
    (name, date of birth, address, TIN)
    → normalized similarity score per field
   ↓
[4] CONFIDENCE SCORE → verification queue
   ↓
[5] HUMAN VERIFICATION — Documentation Staff
    Final approval always by authorized personnel
```

### 9.2 Validator Hierarchy

Step [1] and step [3] differ per document type, but the *sequence* never does. That is the Template Method pattern: the base class fixes the skeleton, subclasses fill in the parts that vary.

```typescript
// lib/domain/validation/document-validator.ts
export abstract class DocumentValidator {
  abstract readonly documentType: DocumentType;
  protected abstract readonly typeKeywords: string[];
  protected abstract extractFields(text: string): ExtractedFields;

  /** Template method — the skeleton is fixed; subclasses supply the steps. */
  validate(ocrText: string, expected: ClientRecord): ValidationResult {
    if (!this.matchesType(ocrText)) {
      return ValidationResult.wrongType(this.documentType);   // reject before OCR scoring
    }
    const extracted = this.extractFields(ocrText);
    return this.score(extracted, expected);
  }

  protected matchesType(text: string): boolean {
    const haystack = text.toLowerCase();
    return this.typeKeywords.some((k) => haystack.includes(k));
  }

  /** Shared Levenshtein scoring — written once for all document types. */
  protected score(extracted: ExtractedFields, expected: ClientRecord): ValidationResult {
    const scores = Object.entries(extracted).map(([field, value]) => ({
      field,
      similarity: normalizedSimilarity(value, expected[field]),   // fastest-levenshtein
    }));
    return ValidationResult.from(scores);
  }
}

class GovernmentIdValidator   extends DocumentValidator { /* name, DOB, address */ }
class ProofOfBillingValidator extends DocumentValidator { /* name, address       */ }
class IncomeDocumentValidator extends DocumentValidator { /* name, employer      */ }
class BirForm1904Validator    extends DocumentValidator { /* name, TIN           */ }
class MarriageCertValidator   extends DocumentValidator { /* spouse names        */ }

export class DocumentValidatorRegistry {
  private readonly validators = new Map<DocumentType, DocumentValidator>();
  register(v: DocumentValidator): void { this.validators.set(v.documentType, v); }
  for(type: DocumentType): DocumentValidator {
    const v = this.validators.get(type);
    if (!v) throw new DomainError(`No validator registered for ${type}`);
    return v;
  }
}
```

`RESERVATION.doc` lists at least six document types and anticipates *"Other Supporting Documents."* Each new type is one subclass plus one `register()` call — no edits to the pipeline (Open/Closed, §3.10).

The OCR engine itself sits behind the `IOcrEngine` port, so `CloudVisionOcrAdapter` can be swapped for a stub in tests without a network call or API quota.

### 9.3 Requirement Basis

> *"The system performs Document Type Validation to verify whether the uploaded file matches the selected document type. If an incorrect document is detected, the system immediately notifies the buyer and requests the correct document before submission. Once the correct document type is confirmed, Optical Character Recognition (OCR) extracts the document information, while the Levenshtein Distance Algorithm compares the extracted text with the expected information stored in the database to assist authorized personnel during document validation."*

Note the wording: the algorithms **assist** personnel. The system scores and ranks; it never auto-approves. `RESERVATION.doc` reinforces this: *"Final approval shall be made by authorized company personnel."*

### 9.4 Confidence Bands

| Similarity | Queue treatment |
|---|---|
| ≥ 0.90 | High confidence — surfaced first, one-click verify |
| 0.70 – 0.89 | Medium — field-level diff shown to the reviewer |
| < 0.70 | Low — flagged, mismatched fields highlighted |

### 9.5 Accepted Documents

**At reservation:** Government-issued ID (type selected by the buyer)

**After submission, or on request by the Sales Department:**
BIR Form No. 1904 / TIN · Proof of Billing · Certificate of Employment / Proof of Income · Marriage Certificate (if applicable) · Special Power of Attorney (if applicable) · Other Supporting Documents

---

## 10. Sprint Breakdown

**16 weeks · 8 sprints × 2 weeks**

### Sprint 0 — Foundation & Data Migration *(Weeks 1–2)*

Status legend: ✅ done · ◻ outstanding

**Workspace foundation**
- ✅ npm-workspaces monorepo: `packages/domain`, `packages/infrastructure`, `packages/ui`, `apps/portal`, `apps/internal` (§5.1)
- ✅ Next.js 16.2 · React 19.2 · TypeScript 6.0 (`strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`) · Tailwind 4.3
- ✅ ESLint flat config with the **architectural boundary rule** — verified by probe: a `firebase/firestore` import inside `packages/domain` fails the lint (§5.5)
- ✅ Second boundary rule: the two apps cannot import from each other (§5.7)
- ✅ `.gitignore` rewritten — `.env` was **not** ignored despite claiming to be (§12.17)
- ✅ `.env.local` migrated `VITE_*` → `NEXT_PUBLIC_*`, server-only secrets separated below a divider; `.env.example` committed
- ◻ shadcn/ui initialised into `packages/ui`

**Domain layer** (`@sfsr/domain`, zero runtime dependencies)
- ✅ `Money` value object — private constructor, immutable, `divideIntoInstalments` proven to close exactly across all 30 tier × term combinations
- ✅ `DomainError` hierarchy — `InvalidValueError`, `IllegalStateTransitionError`, `UnitNotAvailableError`
- ✅ Identifier value objects — `ProjectId`, `UnitId`, `ParkingSlotId`, `ClientId`, `EmployeeId`, `SalesStaffId`, `ReservationNumber`
- ✅ `DiscountStrategy` hierarchy + `DiscountStrategyFactory` (§3.9)
- ✅ `PricingService` — matches the published §8.3 table exactly; **33 tests passing**
- ◻ `Reservation` and `Unit` entities with the §8.4 transition table

**Data infrastructure layer** (`@sfsr/infrastructure`)
- ◻ Firebase client and Admin SDK initialisation
- ◻ `FirestoreRepository<T>` base class, `EntityMapper<T>` contract, `FirestoreUnitOfWork`
- ◻ In-memory fake repositories for the domain test suite
- ◻ `lib/container.ts` composition root in each app

**Application**
- ◻ Firestore Security Rules skeleton — deny by default
- ◻ Username-based authentication (`/api/auth/resolve-username`), registration, password reset
- ◻ RBAC: custom claims, `proxy.ts` in each app, `lib/rbac/`
- ◻ Audit log service
- ◻ Cloudinary signed-upload route
- ◻ Seed pipeline: `.xls` → JSON fixtures → Firestore (5 projects, 150 units, 125 parking slots, 25 employees, 21 sales staff)
- ◻ Base layouts: portal sidebar, internal sidebar with role-filtered menu

**Increment:** an employee and a buyer can each log in and land on an empty, correctly-gated dashboard.

### Sprint 1 — Inventory & Public Browsing *(Weeks 3–4)*

- `projects`, `units`, `parkingSlots` models and repositories
- Guest browsing: project list, project detail (hero render, floors, theme, amenities)
- Unit inventory with filters — project, tower, floor, type, price range, status
- Unit detail page with floor plan
- Internal **Unit Inventory** module (view and manage status)
- Upload the 19 project images to Cloudinary; wire URLs to `projects`

**Increment:** a guest can browse all 5 projects and 150 units with real data and images.

### Sprint 2 — Pre-Reservation Services *(Weeks 5–6)*

- **Sample computation** — pricing engine v1, exercised publicly without commitment
- **Tripping request** — buyer submits, selects preferred date and unit
- Sales **Scheduling** module — agents view and manage tripping requests
- Notification scaffolding

**Increment:** an Initial Account can request a computation and book a site viewing; a Sales Agent sees it.

### Sprint 3 — Reservation Wizard *(Weeks 7–8)*

- 8-step wizard, `react-hook-form` + `zod`, `zustand` draft persistence
- **Pricing engine complete and unit-tested** — discount table, amortization, summary
- Terms and Conditions (11 clauses) and Buyer's Declaration (5 checkboxes)
- `RES-YYYY-NNNNNN` generator via `counters`
- Atomic submit transaction: unit → On Hold, reservation created, audit written
- Reservation summary PDF

**Increment:** end-to-end reservation submission with correct money and a guaranteed-unique reference number.

### Sprint 4 — Documents, OCR & Levenshtein *(Weeks 9–10)*

- Signed Cloudinary uploads with `type: 'authenticated'` delivery
- Proof of payment upload — date, reference number, channel, amount
- Document Type Validation
- Google Cloud Vision OCR integration
- Levenshtein Distance matching and confidence scoring
- Documentation Dept verification queue with field-level diff view

**Increment:** an uploaded ID is type-checked, OCR'd, scored against the client record, and queued for review.

### Sprint 5 — Verification & Approval Workflow *(Weeks 11–12)*

- Account Receivables payment verification queue
- Cash Clerk: official receipt issuance, daily collections
- Billing: uploads the OR against the reservation
- Documentation: document approval, **Permanent Client Account activation**
- Supervisor approval gates across all departments
- Deficiency notice with 24-hour SLA timer
- 30-day documentary submission timer
- **Expired Reservation Report**
- Manual cancellation with management approval → unit returns to Available
- Approval → unit becomes Sold
- Notifications to the client portal

**Increment:** the complete approval chain from submission to Permanent Client Account.

### Sprint 6 — Billing, SOA, Dashboards & Reports *(Weeks 13–14)*

- Statement of Account generation + PDF export
- Amortization schedule, monthly billing, penalties, discounts
- Payment history and balance monitoring
- Delinquent account tracking
- Loan monitoring — Bank Financing and Pag-IBIG Fund
- Accounting: financial reports, billing reconciliation
- Role-specific dashboards with charts
- Audit trail viewer
- Marketing: announcements and project detail publishing
- Legal: client profile read-only view

**Increment:** every module in the RBAC matrix is reachable and functional.

### Sprint 7 — Hardening, Testing & Defense Preparation *(Weeks 15–16)*

- Firestore Security Rules test suite covering all 10 roles + 3 client tiers
- Playwright E2E: register → browse → reserve → upload → verify → approve
- Demo reset script for repeatable defense runs
- Documentation: ERD, DFD, use case diagrams, user manual
- Accessibility and responsive pass
- Production deployment to Vercel
- Defense dry-run

**Increment:** a deployed, tested, documented system ready for panel review.

---

## 11. Testing Strategy

### 11.1 Coverage by Layer

| Layer | Tool | Priority | Rationale |
|---|---|---|---|
| Domain — pricing, `Money` | Vitest | **Highest** | Deterministic and money-critical. Every discount tier × every term length is a test case. No mocks needed. |
| Domain — `Reservation` entity | Vitest | **Highest** | Asserts every illegal status transition throws. This is the correctness core of the system. |
| Domain — validators, Levenshtein | Vitest | High | Pure and fixture-driven. |
| Domain — workflow services | Vitest + **in-memory fakes** | High | Runs in milliseconds with no emulator (see below). |
| Infrastructure — repositories | Vitest + Firestore emulator | Medium | Only mappers and transactions need a real emulator. |
| Security Rules | `@firebase/rules-unit-testing` | **Highest** | The final authorization backstop. Untested rules are unverified claims. |
| Components | Testing Library | Medium | Wizard step navigation and validation display. |
| End-to-end | Playwright | High | The reservation happy path is the demo path. |

**Why the layering pays off here.** Because `ReservationWorkflowService` depends on `IUnitRepository` rather than a Firestore handle (§3.10 D), its tests inject a fake:

```typescript
class InMemoryUnitRepository implements IUnitRepository {
  private readonly units = new Map<string, Unit>();
  async findById(id: UnitId) { return this.units.get(id.value) ?? null; }
  async holdForReservation(id: UnitId, res: ReservationNumber) {
    this.units.get(id.value)!.hold(res);       // real entity, real invariants
  }
}
```

The entity being exercised is the production one, so the business rules under test are real — only the storage is swapped. The whole domain suite runs without Java, without the emulator, and without network access, which matters when the panel asks to see the tests run live.

### 11.2 Priority Test Cases

**Pricing** — all 5 down-payment tiers × all 7 terms = 35 combinations; parking included and excluded; centavo rounding closes to zero across a 36-month schedule.

**Concurrency** — two simultaneous reservations for the same unit: exactly one succeeds, the other is rejected and the unit is On Hold once.

**Authorization** — for each of the 10 roles, assert every module it must **not** reach is denied at the rules layer, not merely hidden in the UI.

**Workflow** — expired reservations are never auto-cancelled; cancellation requires an explicit privileged action and returns the unit to Available while retaining the record.

**Audit** — no role, including IT Administrator, can update or delete an `auditLogs` document.

---

## 12. Risks & Open Items

Findings from analysis of the source artifacts. Each must be resolved by its target sprint.

### Configuration

| # | Finding | Resolution | Owner | Sprint |
|---|---|---|---|---|
| 1 | `.env` uses `VITE_*` prefixes; its comment reads *"Both apps read this single file via Vite's `envDir` setting"* — a leftover from a Vite plan. `instruction.txt` specifies Next.js. | Rename all to `NEXT_PUBLIC_*`. | Dev | 0 |
| 2 | Cloudinary preset `sfsr_uploads` is **unsigned** — anyone with cloud name `riayd2nv` can upload, and assets are URL-reachable. | Add signed-upload route + `type: 'authenticated'` delivery for sensitive documents. Add `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` as server-only vars. | Dev | 0 |
| 3 | `RBAC.xls` contains **25 plaintext passwords** (`Admin@123`, `Cash@123`, `Loan@123`, …). | Seed via Admin SDK, then discard. Every account carries `mustChangePassword: true`. Never store the plaintext. | Dev | 0 |
| 17 | ⚠ **`.gitignore` did not ignore `.env`.** It contained one line, `instruction.txt`, while `.env` — holding the live Firebase and Cloudinary credentials — carried a header claiming *"This file is gitignored — do not commit it."* Nothing leaked because the folder was never a git repository. | ✅ **Fixed in Sprint 0.** `.gitignore` rewritten to cover `.env`, `.env.*`, service-account JSON, build output. Verify before the first `git init`. | Dev | 0 |
| 18 | `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are still blank in `.env.local`. | Blocks signed uploads (§2.4), so no government ID can be accepted. Obtain from Cloudinary Console → Settings → API Keys. | **Client** | 0 |
| 19 | `FIREBASE_ADMIN_CLIENT_EMAIL` and `FIREBASE_ADMIN_PRIVATE_KEY` are still blank. | Blocks the seed pipeline and username resolution. Firebase Console → Project Settings → Service accounts. | **Client** | 0 |

| 25 | ⚠ **The Firebase project `sfsr-rems` was not empty.** A read-only survey found **12 Auth users** (created 28 Jul 2026, several signed in 30 Jul) and a `/documents` collection with **6 records** carrying `ocr`, `backOcr`, `validation`, `reviewedBy`, `reviewNote` and `payment` fields — a prior working implementation of §9, almost certainly the Vite app the original `.env` header referred to. None of the 12 users carry custom claims, so its auth model differs from §5.2. | ✅ **Resolved.** New project `sfsr-rems-next` created; the original is left untouched. Nothing was overwritten. | Dev | 0 |
| 26 | The Firebase service account key downloads as `<project>-firebase-adminsdk-<hash>.json`, matching **none** of the `.gitignore` credential patterns. One such key was found sitting unignored in the repo root. | ✅ **Fixed.** Added `*firebase-adminsdk*.json`, `*.credentials.json`, `secrets/`. Second credential-exposure gap found in this repo — audit `.gitignore` before the first `git init`. | Dev | 0 |
| 27 | **One service account serves both apps, and it bypasses every Firestore Security Rule.** A Firebase service account is scoped to the *project*, not to an app, so the same full-admin credential is deployed to Vercel (public internet) and to the office LAN server. The Portal's copy is the more exposed of the two and needs far less power — it only resolves usernames, signs Cloudinary uploads, and runs the reservation transaction. | Split into two service accounts with distinct IAM roles: a narrow one for the Portal, a broad one for the Internal system. Contradicts §3.4 (Least Privilege) until done. Acceptable for the defense build; required before real office use. | Dev | 7 |

| 28 | **The `Department` column cannot drive permissions.** Nine employees (`EMP011`–`EMP019`) all record "Loans Management Department", but `USER ROLE ACCESS` splits them across **three roles with materially different rights** — Documentation (full CRUD on the client masterfile), Billing (SOA generation and sending), Loan Officer (view and print only). The only field that separates them is which sheet of `RBAC.xls` a person appears on. | ✅ **Resolved.** `resolveRoleFromSheet()` maps sheet → role; the seed writes the resolved role into the Firebase custom claim, not the department. Verified: 9 employees → 3 roles, 3 each. | Dev | 0 |
| 29 | **`USER ROLE ACCESS` has one IT row, but the IT sheet has three seniority levels** — System Administrator (`EMP001`), IT Supervisor (`EMP002`), IT Staff (`EMP003`, `EMP004`). The matrix grants "Full Access to All Modules" to "IT Administrator" without distinguishing, so all four currently receive all 20 modules including delete. | Confirm whether IT Staff should hold full delete across every module. Least Privilege (§3.4) suggests a narrower `IT_STAFF` role with view + support access. Currently follows the source document literally. | **Client** | 1 |

**Framework versions**

| # | Finding | Resolution | Owner | Sprint |
|---|---|---|---|---|
| 20 | Installed versions are newer than this plan originally assumed: **Next.js 16.2.12** (not 15), **TypeScript 6.0.3**, **Zod 4.4.3**, **Tailwind 4.3.3**. | ✅ §2.1 updated to the verified versions. Zod 4 changed several validator APIs — use `z.email()`, not `z.string().email()`. | Dev | 0 |
| 21 | **Next.js 16 deprecated the `middleware.ts` convention** in favour of `proxy.ts`. Confirmed against the installed package's own build warning. | ✅ All references updated. Each app gets its own `proxy.ts`. | Dev | 0 |
| 22 | `eslint-config-next` v16 ships **native flat config**; the `FlatCompat` shim documented for v15 throws `TypeError: Converting circular structure to JSON`. | ✅ Config imports `eslint-config-next/core-web-vitals` and `/typescript` directly. | Dev | 0 |

### Authentication

| # | Finding | Resolution | Owner | Sprint |
|---|---|---|---|---|
| 4 | Registration and Login both specify **username**, but Firebase Auth requires an email. | Private `usernames/{username}` index resolved server-side by `/api/auth/resolve-username`, then `signInWithEmailAndPassword`. Username is permanent per the requirements. | Dev | 0 |

### Data Schema Drift

| # | Finding | Resolution | Owner | Sprint |
|---|---|---|---|---|
| 5 | `legaspi place` and `Emerald` sheets have **no `Tower` column**; `skyline`, `grandverdant`, and `harbor point` do. | Model `tower` as nullable; hide the field in the UI when null. | Dev | 0 |
| 6 | Price columns mix formats — `₱15,000,000` in three sheets, plain `15,000,000.00` in `harbor point`. | Normalize to integer centavos at import. | Dev | 0 |
| 7 | Header drift: `Price/sqm` vs `Price per sqm`; `Unit Price` vs `Unit Purchase Price`. | Alias map in the seed script. | Dev | 0 |
| 8 | **Project code collision** — Grand Verdant is `GVR004` and Harbor Point is `HPR004`; both use sequence `004`. | Confirm with the client whether Harbor Point should be `HPR005`. | **Client** | 0 |
| 9 | Parking type **`Tandem`** appears in the reservation form dropdown but in **no inventory row** — all 125 slots are Regular or Premium. | Confirm whether Tandem is planned inventory. Keep in the enum, hide until stock exists. | **Client** | 1 |

### Content Gaps

| # | Finding | Resolution | Owner | Sprint |
|---|---|---|---|---|
| 10 | **The Legaspi Place has zero images.** The other four projects have a hero render plus floor plans. | Request assets, or use a placeholder for the defense build. | **Client** | 1 |
| 11 | **Harbor Point has no Three Bedroom floor plan**, yet its inventory contains Three Bedroom units. No project has a **Penthouse** floor plan, yet Legaspi, Emerald, and Skyline all sell Penthouses. | Request the missing plans, or fall back to the unit-type description. | **Client** | 1 |
| 12 | **Marketing Staff** appears in `USER ROLE ACCESS` but has **no employee sheet** — zero seedable accounts for a role that owns the Advertisement module. | Request the Marketing personnel list, or create one demo account. | **Client** | 0 |
| 13 | Six names appear in **both** `RBAC.xls` and `SALES STAFF DATABASE.xls`: Christine Lim (Cash Supervisor `EMP008` / Group Head `GH003`), Michael Tan (`EMP007` / Broker `BR003`), Anthony Dela Cruz (`EMP023` / Broker `BR001`), Joanna Flores (`EMP011` / Broker `BR006`), Michelle Aquino (`EMP015` / Agent `AG002`), Vincent Perez (`EMP009` / Agent `AG009`). | Confirm whether these are the same people holding two roles or coincidental sample data. Affects identity modeling and conflict-of-interest rules in the approval chain. | **Client** | 0 |

### Business Rules

| # | Finding | Resolution | Owner | Sprint |
|---|---|---|---|---|
| 14 | Two SLAs coexist — **30 calendar days** to submit documentary requirements, **24 hours** to cure a deficiency. | Implement both timers independently; surface both in the client portal. | Dev | 5 |
| 23 | The Internal system runs on a bare LAN server with **no HTTPS**, so Firebase Auth tokens would cross the office network in the clear (§5.7). | Self-signed certificate or a reverse proxy on the office server. Acceptable for the defense demo; required before real office use. | Dev | 7 |
| 24 | The office LAN server is a **single point of failure** for all internal work. | Accepted. The Portal keeps accepting reservations while it is down and the queues drain on restart. Document the restart procedure in the user manual. | Dev | 7 |
| 15 | The ₱50,000 reservation fee is stated as a fixed value in the requirements. | Store in `settings` so it can be changed without a redeploy. | Dev | 3 |
| 16 | The promotional discount base changes between tiers — 20% applies to the *down payment*, 30–50% apply to the *total purchase price*. | Implemented as transcribed. Verified monotonic (§8.3). Confirm the intent with the client before Sprint 3. | **Client** | 3 |

---

## Appendix A — Explicit Client Requirements

Requirements stated directly by the client that must not be lost in design iteration.

| Requirement | Source |
|---|---|
| **The buyer portal navigation must be a sidebar.** *"Gusto ko din sana ang menu(option) pag sa portal na ni buyer is nasa gilid. Mas neat kasi tignan. Para nasa isang side lang. gaya sa picture."* | `RESERVATION.doc` |
| **Interface design is free-form.** *"See Picture as reference for details and how reservation process.. You may design your own interface."* The 24 embedded images are reference, not specification. | `RESERVATION.doc` |
| Reservation fee is **non-refundable and non-transferable**, except where cancellation is attributable to the company or required by law. | `RESERVATION.doc` T&C |
| Submission of proof of payment **does not** constitute payment confirmation. | `RESERVATION.doc` T&C |
| Personal information is processed under the **Data Privacy Act of 2012 (RA 10173)**. | `RESERVATION.doc`, three clauses |
| The assigned username is **permanent and cannot be changed**, for record integrity and audit purposes. | `RESERVATION.doc` |

---

## Appendix B — Source Artifact Inventory

| File | Size | Contents |
|---|---|---|
| `instruction.txt` | 404 B | Stack, cloud providers, SD principles + SDLC directive, platform scope |
| `.env` | 729 B | Firebase config (`sfsr-rems`), Cloudinary (`riayd2nv` / `sfsr_uploads`) |
| `RESERVATION.doc` | 1.7 MB | 15 pages, 527 paragraphs, 2 tables, 24 images — registration, login, reservation flow, pricing rules, T&C, status lifecycle |
| `RBAC.xls` | 43 KB | 9 sheets — 8 department rosters (25 employees) + `USER ROLE ACCESS` matrix |
| `SALES STAFF DATABASE.xls` | 32 KB | 3 sheets — 3 Group Heads, 6 Brokers, 12 Agents |
| `DATABASE PROJECT.xls` | 86 KB | 5 sheets — 5 projects, 150 units, 125 parking slots, status legend |
| `CONDOMINIUM PROJECTS/` | ~33 MB | 19 PNGs — 4 hero renders, 15 floor plans |

---

*End of document.*
