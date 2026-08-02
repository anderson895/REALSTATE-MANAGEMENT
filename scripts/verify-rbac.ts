/**
 * Confirms the seeded custom claims resolve to the right RBAC role, and that
 * the resulting permissions match USER ROLE ACCESS.
 *
 *   node --env-file=.env.local --import tsx scripts/verify-rbac.ts
 *
 * Read-only.
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { canAccessModule, isInternalRole, modulesFor, type InternalRole } from '@sfsr/domain';

async function main(): Promise<void> {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
  }

  const { users } = await getAuth().listUsers(100);
  const rows = users
    .map((u) => ({
      username: (u.email ?? '').split('@')[0] ?? '',
      claims: u.customClaims ?? {},
    }))
    .sort((a, b) => String(a.claims.employeeId).localeCompare(String(b.claims.employeeId)));

  console.log('── Seeded claims -> resolved role ───────────────\n');
  console.log('  EMP     username     department                      role                  sup');
  console.log('  ' + '-'.repeat(88));

  let bad = 0;
  for (const { username, claims } of rows) {
    const role = claims.role;
    const ok = isInternalRole(role);
    if (!ok) bad++;
    console.log(
      `  ${String(claims.employeeId).padEnd(8)}${username.padEnd(13)}` +
        `${String(claims.department).slice(0, 30).padEnd(32)}` +
        `${String(role).padEnd(22)}${claims.isSupervisor ? 'Y' : '-'}${ok ? '' : '   <-- UNRESOLVED'}`,
    );
  }

  console.log('\n── The Loans Management split ───────────────────');
  const loans = rows.filter((r) => r.claims.department === 'Loans Management Department');
  const distinct = new Set(loans.map((r) => String(r.claims.role)));
  console.log(`  ${loans.length} employees share one department, resolved to ${distinct.size} roles:`);
  for (const role of [...distinct].sort()) {
    const n = loans.filter((r) => r.claims.role === role).length;
    console.log(`    ${role.padEnd(22)} ${n}`);
  }

  console.log('\n── Module reach per role ────────────────────────');
  for (const role of [...new Set(rows.map((r) => String(r.claims.role)))].sort()) {
    if (!isInternalRole(role)) continue;
    const mods = modulesFor(role as InternalRole);
    console.log(`  ${role.padEnd(22)} ${mods.length} module(s)`);
  }

  console.log('\n── Spot check: Billing must not reach Unit Inventory ──');
  const billing = { role: 'BILLING' as InternalRole, isSupervisor: false };
  console.log(`  BILLING -> UNIT_INVENTORY : ${canAccessModule(billing, 'UNIT_INVENTORY')}`);
  console.log(`  BILLING -> SOA_GENERATION : ${canAccessModule(billing, 'SOA_GENERATION')}`);

  console.log('\n─────────────────────────────────────────────────');
  console.log(bad === 0 ? 'All claims resolve to a valid role.' : `${bad} unresolved claim(s)`);
  process.exit(bad === 0 ? 0 : 1);
}

void main().catch((e: unknown) => {
  console.error('FAILED:', (e as Error).message);
  process.exit(1);
});
