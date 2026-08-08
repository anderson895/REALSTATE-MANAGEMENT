# SFSR-REMS

**St. Francis Square Realty — Real Estate Management System.**

A two-application monorepo: a public web portal where buyers browse condominium
units and file reservations, and an internal management system where staff
verify, approve and administer them.

---

## 1. The two applications

| | `@sfsr/portal` | `@sfsr/internal` |
|---|---|---|
| **Audience** | Buyers and guests | Employees |
| **Deployment** | Public internet (Vercel) | Office LAN server, `npm start` |
| **Port (dev)** | 3000 | 3001 |
| **Sign-in** | Username → Firebase Auth | Username → Firebase Auth |
| **Indexed** | Yes | No — `X-Robots-Tag: noindex` |

They are separate Next.js projects with separate deployment targets and **must
not import from one another**; anything genuinely shared lives in `packages/`.
That rule is enforced by ESLint, not by discipline.

---

## 2. Technology summary

### Language and runtime

| Technology | Version | Used for |
|---|---|---|
| **TypeScript** | 6.0 | Every source file. `strict` plus `noUncheckedIndexedAccess`. |
| **Node.js** | ≥ 20.11 | Runtime for both apps and all CLI scripts. |
| **npm workspaces** | npm 11 | Monorepo — 2 apps, 3 shared packages, one lockfile. |

### Framework and UI

| Technology | Version | Used for |
|---|---|---|
| **Next.js** | 16.2 | App Router, React Server Components, Server Actions, `proxy.ts` request gate. |
| **React** | 19.2 | Server Components by default; client islands only where state or the DOM is genuinely needed. |
| **Tailwind CSS** | 4.3 | All styling, via `@tailwindcss/postcss`. No CSS modules, no styled-components. |
| **Radix UI** (`react-dialog`) | 1.1 | The one dialog primitive — focus trapping, scroll locking, focus return. `ConfirmDialog` and `Modal` are built on it. |
| **lucide-react** | 1.x | Icon set across both apps. |
| **Recharts** | 3.x | Dashboard charts in the internal app only. |
| **next-themes** | 0.4 | Light/dark switching on the portal. |
| **sonner** | 2.x | Toasts — **portal only**. The internal app mounts no `<Toaster />` and uses inline messaging instead. |

### Data, auth and services

| Technology | Version | Used for |
|---|---|---|
| **Firebase Authentication** | — | Identity for both buyers and employees. Employees have no real address, so one is synthesised as `{username}@sfsr.internal`. |
| **Cloud Firestore** | — | The database. Every collection is deny-by-default in `firestore.rules`. |
| **firebase-admin** | 14.x | All privileged server-side reads and writes. Bypasses the Security Rules by design. |
| **firebase** (client SDK) | 12.x | Browser-side **only** to sign in and change a password — so a plaintext password never reaches this server. |
| **Cloudinary** | 2.x | File storage. Signed, per-upload tickets; the browser never holds a credential. |
| **Nodemailer** | 9.x | Outbound mail (OTP for password reset) over Gmail SMTP. |
| **Google reCAPTCHA** | v2 checkbox | Buyer registration only — the walk-in counter has none, because an authenticated employee is already a proven human. Bypassable in development via `RECAPTCHA_DISABLED`. |
| **tesseract.js** | 7.x | OCR of an uploaded government ID, running on WASM **in the buyer's browser** — no API key, and the image never leaves the device for it. |

### Validation and testing

| Technology | Version | Used for |
|---|---|---|
| **Zod** | 4.x | Schema validation at every trust boundary — in the browser for ergonomics, again on the server as the actual control. |
| **Vitest** | 4.1 | 23 test files. The domain suite is pure TypeScript: no DOM, no emulator, no network. |
| **ESLint** | 9.x | `eslint-config-next`, plus two custom architectural boundaries (below). |

---

## 3. Architecture

Four layers, **dependencies pointing inward only**:

```
  PRESENTATION   apps/*/app/           React Server + Client Components.
                                       Renders. Decides nothing.
        │
        ▼
  APPLICATION    apps/*/app/**/actions.ts, app/api/
                                       Server Actions and Route Handlers.
                                       Authenticate, check RBAC, map, invoke.
                                       Contains no business rules.
        │
        ▼
  DOMAIN         packages/domain/      Entities, value objects, pricing,
                                       the RBAC matrix. Pure TypeScript.
        ▲
        │ implements
  INFRASTRUCTURE packages/infrastructure/
                                       Firestore repositories, Cloudinary,
                                       mail, sessions, the audit logger.
```

### The packages

| Package | Runtime dependencies | Notes |
|---|---|---|
| `@sfsr/domain` | **zero** | Deliberately. It must run unchanged in a Node script, a server route and a browser bundle, so it may not import `firebase`, `cloudinary`, `next` or `react`. Levenshtein distance is hand-written here rather than pulled in for the same reason. |
| `@sfsr/infrastructure` | firebase, cloudinary, nodemailer | Three entry points: `.` (client-safe), `/server` (carries a `server-only` guard), `/node` (for CLI scripts, no guard). |
| `@sfsr/ui` | radix, lucide, tailwind-merge | Components used by **both** apps. App-specific components stay in their app. |

Two ESLint rules keep this honest, and both fail the build rather than warn:

- `packages/domain/**` may not import infrastructure, Next.js, React or UI.
- `apps/**` may not import from another app.

### Authorisation — three layers

Hiding a link is never counted as a control.

1. **`proxy.ts`** — coarse gate. Rejects anyone without a session cookie.
2. **`requireModule()` / `can()`** — the RBAC matrix, re-checked in every page
   and every Server Action, because an action is a public endpoint whether or
   not a button points at it.
3. **`firestore.rules`** — the only layer the database itself enforces. Deny by
   default; there is no catch-all allow.

The matrix lives in `packages/domain/src/rbac/` so both apps read one copy: ten
internal roles, twenty modules, three client tiers.

### Money

Every amount is an integer count of **centavos**, wrapped in a `Money` value
object. IEEE-754 cannot represent `0.1`, and across a 36-month amortisation that
error compounds until the final balance will not close. Pesos exist only at the
presentation edge.

---

## 4. Getting started

```bash
npm install

# One .env.local at the repo root serves both apps.
cp .env.example .env.local     # then fill it in

npm run dev:portal             # http://localhost:3000
npm run dev:internal           # http://localhost:3001
```

### Everyday commands

| Command | Does |
|---|---|
| `npm run verify` | `typecheck` + `lint` + `test`. Run this before committing. |
| `npm run typecheck` | `tsc --noEmit` across every workspace. |
| `npm run lint` | ESLint, including the architectural boundaries. |
| `npm test` | Vitest, once. `npm run test:watch` to keep it open. |
| `npm run build:portal` / `build:internal` | Production builds. |

### Seeding

The catalogue and the staff roster are imported from the client's workbooks in
`Development_Guide/`.

```bash
npm run seed:extract                                   # .xls → scripts/seed/data/*.json
node --env-file=.env.local --import tsx scripts/seed/load.ts --dry-run
npm run seed:load                                      # writes Firestore + Auth
```

`load.ts` is idempotent — every write is keyed by its source id and merged, so
running it twice produces the same database rather than duplicates. Passwords
from the workbook are used **once**, to create the Auth user, and never stored.

> `seed:extract` requires Windows and the ACE.OLEDB provider; it reads legacy
> `.xls` files. Two roles have no personnel sheet in the workbook at all, so
> Sales and Marketing accounts come from hand-maintained overlay fixtures
> (`employees-sales.json`, `marketing.json`) that the extract never touches.

### Environment

`.env.example` lists every key. The groups are Firebase (client config plus an
admin service account), Cloudinary, Gmail SMTP, and reCAPTCHA. Anything prefixed
`NEXT_PUBLIC_` is exposed to the browser by design; nothing else is.

Both apps read **one** `.env.local` at the repository root. Next reads env files
relative to the app directory, so `load-root-env.mjs` loads it explicitly before
either `next.config.ts` is evaluated.

---

## 5. Deploying

### Portal → Vercel

**Root Directory: `apps/portal`**, with *Include files outside the root
directory* enabled — the app depends on `packages/*`, which live above it.
`.vercelignore` then trims the workbooks and seed fixtures back out of the
upload; they are needed by nobody at build time and cost ~46 MB per deploy.

#### Why `typescript` is declared twice

With that Root Directory, the install resolves against the **portal workspace**,
not the repository root. `typescript` and the `@types/*` packages therefore have
to be listed in `apps/portal/package.json` as well as at the root. Leaving them
at the root alone builds perfectly on a developer machine — npm workspaces hoist
them into the root `node_modules` and a build run from the repo walks up to find
them — and fails on Vercel with:

```
✓ Compiled successfully
  Running TypeScript ...
It looks like you're trying to use TypeScript but do not have the required
package(s) installed.
```

The misleading part is that `@sfsr/domain`, `@sfsr/infrastructure` and
`@sfsr/ui` all resolve fine, because they are ordinary *dependencies* of the
app — so the failure looks unrelated to the monorepo when it is entirely about
it.

Both apps now declare them. **Keep the versions in step with the root**, or npm
installs a second copy of the compiler.

### Internal system → not deployed

It runs on an office LAN server and is never exposed publicly:

```bash
npm run build:internal
npm run start:internal        # binds 0.0.0.0:3001 — reachable across the LAN
```

To run it on one machine and nothing else — a demo, or a laptop that happens to
be on a café network — double-click **`run-internal.bat`**, or:

```bash
npm run start:internal:local  # binds 127.0.0.1:3001 — this machine only
```

The two differ only in the bind address, and that difference is the entire
point: `0.0.0.0` accepts connections from anything that can route to the host,
`127.0.0.1` accepts none. The internal system has no business being reachable
from a network it did not expect, so the launcher deliberately uses the second.

`run-internal.bat` wraps that script with the checks a non-developer would
otherwise hit as a stack trace: Node present, `.env.local` present, dependencies
installed, and a production build available — building one only if
`apps/internal/.next` is missing, or if passed `--rebuild`.

---

## 6. Declared but not yet wired

These appear in a `package.json` and are imported by no source file. Listed so
nobody mistakes them for part of the architecture:

`@google-cloud/vision` · `zustand` · `jspdf` · `jspdf-autotable` ·
`@tanstack/react-table` · `date-fns` · `react-hook-form` ·
`@hookform/resolvers` · `class-variance-authority` · `fastest-levenshtein`

Server-side OCR (`@google-cloud/vision`) is the intended successor to the
in-browser tesseract check and is already listed in both apps'
`serverExternalPackages`; the rest are leftovers from earlier scaffolding.

---

## 7. Where the requirements come from

`Development_Guide/` holds the client's own documents, and the code cites them
by section rather than paraphrasing:

| File | Governs |
|---|---|
| `Development Plan.md` | The architecture. Referenced throughout as §-numbers. |
| `RBAC.xls` | Roles, modules, permissions, and the personnel roster. |
| `RESERVATION.doc` | The nine-step reservation flow, pricing and credential policy. |
| `INTERNAL.xls` | The internal screens, per department. |
| `DATABASE PROJECT.xls` | Projects, units and parking inventory. |
| `note.txt` | Later client corrections. Where it contradicts a workbook, it wins — each case is argued in a comment at the code it changes. |
