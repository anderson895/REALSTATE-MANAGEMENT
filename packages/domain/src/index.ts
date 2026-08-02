/**
 * SFSR-REMS domain layer.
 *
 * Pure TypeScript: entities, value objects, and business rules shared by BOTH
 * applications — the publicly deployed Portal and the locally run Internal
 * Management System.
 *
 * This package is the reason the two apps can never disagree on a peso figure
 * (Development Plan.md §3.1). It has zero runtime dependencies and must never
 * import firebase, cloudinary, next, or react — enforced by the ESLint
 * boundary rule in eslint.config.mjs (§5.5).
 */

export * from './errors';
export * from './value-objects';
export * from './pricing';
export * from './entities';
export * from './events/domain-event';
export * from './repositories';
export * from './services';
export * from './rbac';
export * from './policies';
