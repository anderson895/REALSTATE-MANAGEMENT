/**
 * Stands in for the `server-only` package under vitest.
 *
 * That package throws the moment it is imported outside a React Server
 * Component, which is exactly what it is for — it turns an accidental client
 * import of server code into a clear build error. A test process is neither a
 * server nor a client component, so it tripped the guard and took down any
 * suite that touched a module importing `@sfsr/infrastructure/server`.
 *
 * Aliased in vitest.config.mts. Deliberately empty: the guard has nothing to
 * do in a test, and stubbing it does not weaken it anywhere it matters.
 */
export {};
