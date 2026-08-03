import { Money } from '@sfsr/domain';

/**
 * "₱6.29M" — for headline figures and price ranges.
 *
 * Two decimal places of centavos are noise on a card that exists to say
 * "roughly this much"; the exact peso figure belongs on the unit page, where
 * the buyer is deciding rather than comparing.
 */
export function formatShort(centavos: number): string {
  const pesos = centavos / 100;
  if (pesos >= 1_000_000) return `₱${(pesos / 1_000_000).toFixed(2)}M`;
  if (pesos >= 1_000) return `₱${Math.round(pesos / 1_000)}K`;
  return Money.fromCentavos(centavos).format();
}

/** "₱6.00M – ₱7.68M", collapsing to one figure when the ends agree. */
export function formatRange(minCentavos: number, maxCentavos: number): string {
  const low = formatShort(minCentavos);
  const high = formatShort(maxCentavos);
  return low === high ? low : `${low} – ${high}`;
}
