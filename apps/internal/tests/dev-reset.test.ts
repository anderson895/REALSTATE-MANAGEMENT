import { describe, expect, it } from 'vitest';
import { devToolsEnabled, resetReservationData } from '../lib/dev-reset';

/**
 * The guard on the most destructive thing this application can do.
 *
 * `resetReservationData` deletes every reservation, payment, document and
 * audit entry, and releases every hold. It exists so that clearing test data
 * does not leave the orphans that deleting one collection by hand does — but
 * the same call in production would be an outage.
 *
 * Vitest runs with NODE_ENV set to "test", which is not "development", so
 * these assertions exercise the exact branch a production build takes. That is
 * the point: the guard is a string comparison, and a test that had to fake
 * `development` would be testing the wrong side of it.
 */
describe('development-only reset', () => {
  it('is disabled anywhere that is not `next dev`', () => {
    expect(process.env.NODE_ENV).not.toBe('development');
    expect(devToolsEnabled()).toBe(false);
  });

  it('refuses to run, rather than quietly doing nothing', async () => {
    // Throwing beats returning zero counts: a reset that silently no-ops in
    // the wrong environment reads as "there was nothing to clear", and the
    // next thing someone does is go and delete it by hand instead.
    await expect(resetReservationData()).rejects.toThrow(/development only/i);
  });

  it('does not reach Firestore before refusing', async () => {
    // No credentials are configured in the test environment. If the guard ran
    // after the first query this would fail with a Firebase error instead of
    // the refusal above — which is how a guard placed one line too low gets
    // missed.
    await expect(resetReservationData()).rejects.toThrow(
      'Reservation reset is available in development only.',
    );
  });
});
