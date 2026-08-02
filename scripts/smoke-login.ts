/**
 * End-to-end login smoke test against the running Internal app.
 *
 *   node --env-file=.env.local --import tsx scripts/smoke-login.ts
 *
 * Signs in as real seeded employees through the Firebase REST API, exchanges
 * the token for a session cookie, and fetches the dashboard — proving the
 * whole chain works and that the sidebar really is driven by the RBAC matrix
 * rather than hand-maintained per role.
 *
 * Requires: npm run start:internal (port 3001).
 */

const BASE = 'http://localhost:3001';
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;

interface Expectation {
  readonly username: string;
  readonly password: string;
  readonly employeeId: string;
  readonly role: string;
  readonly mustSee: readonly string[];
  readonly mustNotSee: readonly string[];
}

const CASES: readonly Expectation[] = [
  {
    username: 'bmendoza',
    password: 'Docs@123',
    employeeId: 'EMP012',
    role: 'DOCUMENTATION',
    mustSee: ['Documentary Requirements', 'OCR Validation', 'Client Profiles'],
    mustNotSee: ['Statements of Account', 'Unit Inventory', 'Users & Roles'],
  },
  {
    username: 'clim',
    password: 'Cash@123',
    employeeId: 'EMP008',
    role: 'CASH_CLERK',
    mustSee: ['Payment Records', 'Official Receipts'],
    mustNotSee: ['OCR Validation', 'Client Profiles', 'Users & Roles'],
  },
  {
    username: 'admin',
    password: 'Admin@123',
    employeeId: 'EMP001',
    role: 'IT_ADMINISTRATOR',
    mustSee: ['Users & Roles', 'Audit Trail', 'Unit Inventory', 'Statements of Account'],
    mustNotSee: [],
  },
];

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (ok) passed++;
  else failed++;
}

async function signIn(username: string, password: string): Promise<string | null> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${username}@sfsr.internal`,
        password,
        returnSecureToken: true,
      }),
    },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { idToken?: string };
  return body.idToken ?? null;
}

async function run(expect: Expectation): Promise<void> {
  console.log(`\n── ${expect.username} (${expect.employeeId}, ${expect.role}) ──`);

  const idToken = await signIn(expect.username, expect.password);
  check('firebase sign-in', idToken !== null);
  if (!idToken) return;

  const sessionResponse = await fetch(`${BASE}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const sessionBody = (await sessionResponse.json()) as { role?: string; employeeId?: string };
  check('session issued', sessionResponse.ok);
  check('resolved role', sessionBody.role === expect.role, `${sessionBody.role}`);

  const setCookie = sessionResponse.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  check('httpOnly cookie', /httponly/i.test(setCookie));

  const page = await fetch(`${BASE}/`, { headers: { cookie } });
  // React escapes text nodes, so "Users & Roles" ships as "Users &amp; Roles"
  // and also appears &-escaped inside the RSC payload. Normalise before
  // matching, or a correct sidebar reads as a missing item.
  const html = (await page.text()).replace(/&amp;/g, '&').replace(/\\u0026/g, '&');
  check('dashboard renders', page.status === 200);

  for (const item of expect.mustSee) {
    check(`sidebar SHOWS "${item}"`, html.includes(item));
  }
  for (const item of expect.mustNotSee) {
    check(`sidebar HIDES "${item}"`, !html.includes(item));
  }
}

async function main(): Promise<void> {
  console.log('Internal app login smoke test');

  for (const expect of CASES) {
    await run(expect);
  }

  console.log('\n── Rejection: a bad password must fail ──');
  check('wrong password rejected', (await signIn('admin', 'wrong-password')) === null);

  console.log('\n─────────────────────────────────────────');
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main().catch((e: unknown) => {
  console.error('ERROR:', (e as Error).message);
  process.exit(1);
});
