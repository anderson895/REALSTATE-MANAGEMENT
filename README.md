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

`load.ts` is idempotent in the sense that matters for a *fresh* database — every
write is keyed by its source id and merged, so running it twice creates no
duplicates. Passwords from the workbook are used **once**, to create the Auth
user, and never stored.

> **A full `seed:load` is not safe once the system has been used.** `units.json`
> carries each unit's workbook `status`, and the loader writes it back with
> `currentReservation: null` — so a unit sold or held since the last seed goes
> back to Available, its link to the reservation holding it is cleared, and that
> reservation survives as an orphan pointing at a unit that no longer points
> back. Use `--projects-only` for content changes:

```bash
node --env-file=.env.local --import tsx scripts/seed/load.ts --projects-only
```

That writes the five project documents and touches no unit, reservation or
account.

### Where a project's content comes from

Two sources, merged at load time:

| Source | Carries | Maintained |
|---|---|---|
| `projects.json` | code, floors, building type, developer | **Generated** by `seed:extract` from `DATABASE PROJECT.xls` |
| `projects-content.json` | description, amenities, location highlights, unit-type copy | **By hand**, from the client's description/amenities `.doc` |

The generated row is merged **last**, so the overlay can only add fields — it
cannot restate a floor count. That is load-bearing: the `.doc` and the workbook
disagree about The Legaspi Place (35 floors versus 42, and a differently spelled
Legaspi/Legazpi Village), and the workbook wins by decision. Resolve it with the
client rather than by editing one file to match the other.

Amenity posters live in `CONDOMINIUM PROJECTS/new/` and are uploaded by
`upload-media.ts`. The project page renders the structured amenity list *and*
the poster: the poster's labels are baked into the pixels, so on a phone it is
decoration and the list is the content.

### Changing pictures without a developer

`upload-media.ts` reads files off a developer's disk, so a project added from
the Unit Inventory screen had no way to ever get a picture. **Marketing** can
now replace them in place, from `/inventory` → *Pictures*:

| Slot | Cloudinary path |
|---|---|
| Project render | `sfsr/projects/{id}/hero` |
| Amenities sheet | `sfsr/projects/{id}/amenities` |
| Floor plan, per unit type | `sfsr/projects/{id}/floorplans/{type}` |
| Photo of one unit | `sfsr/projects/{id}/units/{unitId}` |

The paths are **the same ones `upload-media.ts` writes**, so a picture changed
in the browser and one loaded from disk are the same asset rather than two —
without that, the next seed run would silently undo Marketing's edit. It also
means uploading REPLACES: the old picture is gone, which is why the change is
written to the audit trail.

A unit photo is distinct from a floor plan. The plan is per unit *type*, shared
by every Studio in a project; the photo is that specific room. Most units will
never have one — these are pre-selling towers — so the Portal renders it only
when it exists rather than showing an empty frame on every unit.

A picture can also be **removed**, which destroys the CDN copy as well as
clearing the field — these are public assets, so a picture cleared only from
Firestore is still one anybody holding the link can open.

> Marketing alone can do this, by client instruction, enforced by
> `canManageMedia` in the domain rather than by the matrix. Sales and Account
> Receivables hold `UNIT_INVENTORY` read-only and reach the same screen; the
> buttons are not drawn for them and the upload route refuses them.

### Taking something back off the market

`create` without a way back produced the mess the withheld `delete` was meant
to prevent: a project typed by mistake goes straight to the public Portal —
there is no draft state and no filter on empty projects — and removing it took
a developer with a Firestore console.

Marketing can now remove **a project that holds nothing** and **a unit that is
Available and has never been reserved**. Both conditions are re-counted inside
the action rather than read off the screen, because a button drawn a minute ago
must not delete a unit a buyer reserved since.

| Refused when | Why |
|---|---|
| Project has units, parking or reservations | Those records name it and would be left pointing at nothing |
| Unit is On Hold or Sold | A unit off the market stays on the record — that is what those statuses are for |
| Unit has any reservation, even cancelled | The reservation survives and still names the unit |

> This is deliberately **not** a `delete` grant on `UNIT_INVENTORY`. That
> permission is module-wide and would also authorise deleting a unit outright —
> the thing the matrix comment forbids in as many words. `canRemoveInventory`
> is a capability instead, exactly as wide as the need, and both deletions are
> written to the audit trail with the name and price copied in, because
> afterwards there is no document left to read them from.

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

### Opening it as an application

The people who use this are documentation clerks, billing staff and cashiers,
not developers. The split below is deliberate: **setting a machine up is a
technical job done once; using it is a double-click.** Staff are never asked to
open a terminal, and when something breaks they are told to call someone rather
than to fix it.

#### Setting up a new machine — once, by whoever administers it

1. Install **Node.js 22** from [nodejs.org](https://nodejs.org).
2. Copy the project folder onto the machine. Anywhere is fine — no path is
   hard-coded, and nothing needs editing afterwards.
3. Put a filled-in **`.env.local`** in the project root. It is not distributed
   with the project, and it is what decides which machines may run the system.
4. Double-click **`create-internal-shortcut.bat`**.

That last step writes the same shortcut to three places — the Desktop, the
Start menu, and the project folder — so it can be found however the person
looks for it. To keep it on the taskbar, open Start, type `SFSR`, right-click
the result and choose *Pin to taskbar*; Windows removed the API that would let
a script do that, so it is the one manual step.

The **first** launch then installs dependencies and builds, which takes a few
minutes. That path is deliberately *not* silent — it hands over to
`run-internal.bat` in a visible window, because a hidden process doing minutes
of work is indistinguishable from one that has failed.

#### Everyday use — by staff

Double-click **SFSR Internal System**. `internal-app.ps1` runs hidden and:

1. starts the local server on `127.0.0.1:3101`, with no console window,
2. waits until it answers,
3. opens it in a chromeless window — no address bar, no tabs,
4. and stops the server again when that window is closed.

If the server was already running — from a terminal, or `run-internal.bat` —
the launcher attaches to it and leaves it running afterwards, because it
belongs to something else.

**3101, not 3001, and the difference is load-bearing.** The launcher decides
"is the server up?" by asking the port, so pointing it at 3001 means it
attaches to whatever is there — including a `next dev` server. That is not
hypothetical: it happened. The window opened against a development build, React
never hydrated, and every control on the login page was dead, down to the *Show
Password* checkbox. Nothing reported an error, because from the launcher's side
the server had answered. On its own port it cannot mistake one for the other,
and a developer can run both at once.

Every failure message is written twice: what happened, in plain words, and then
the technical detail under a *For your IT administrator* heading. A message
that only says "contact IT" wastes the trip; one that only says "`.env.local`
is missing" wastes the reader.

#### Changing the logo

Replace `apps/internal/public/logo.png`, then:

```bat
powershell -ExecutionPolicy Bypass -File scripts\make-app-icon.ps1
create-internal-shortcut.bat
```

The first regenerates both icons from that one file; the second refreshes the
shortcuts. **Two icons are needed because they are read from different places:**
the shortcut carries `sfsr-internal.ico`, while the taskbar icon of the open
window comes from the site's favicon, `apps/internal/app/icon.png`. Generating
both from one source is what stops the launcher and the application from
showing different marks.

> **The shortcut is convenience, not access control.** It opens a URL, and the
> same URL typed into a browser on that machine reaches the same page. What
> restricts access is the employee login and the RBAC matrix behind it. The
> reason nobody *else* can reach it is the bind address — `127.0.0.1`, not
> `0.0.0.0` — and that is decided by `start:app`, not by any of these files.

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
