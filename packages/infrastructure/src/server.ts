import 'server-only';

/**
 * SFSR-REMS infrastructure — SERVER-ONLY entry point for Next.js app code.
 *
 * Adapters implementing the ports declared in @sfsr/domain: Firestore
 * repositories, the audit logger, the unit of work, and session handling
 * (Development Plan.md §5.5, §5.6).
 *
 * The `server-only` import above turns an accidental client import into a
 * build error naming this file, rather than a confusing module-not-found deep
 * inside grpc.
 *
 * CLI scripts must import `@sfsr/infrastructure/node` instead — the guard
 * throws outside a React Server Component context, which is correct for the
 * apps and wrong for a plain `node` script.
 */

export * from './node';
