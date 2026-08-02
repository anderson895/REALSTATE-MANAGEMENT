import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads the workspace-root .env.local into process.env.
 *
 * Next.js reads .env files relative to the app directory, so `apps/portal` and
 * `apps/internal` would each need their own copy — two files holding the same
 * Firebase credentials, guaranteed to drift.
 *
 * Vite solved this with `envDir`, which is what the original .env header
 * referred to. Next has no equivalent, so both next.config.ts files call this
 * at startup instead. One file, two apps, no duplication (§3.7 DRY).
 *
 * Values already present in the environment win, so a real deployment
 * (Vercel env vars, systemd) is never overridden by a local file.
 */
export function loadRootEnv() {
  const here = dirname(fileURLToPath(import.meta.url));

  for (const name of ['.env.local', '.env']) {
    const path = resolve(join(here, name));
    if (!existsSync(path)) continue;

    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;

      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();

      // Strip surrounding quotes; the Firebase private key is a quoted
      // single-line value containing escaped newlines.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}
