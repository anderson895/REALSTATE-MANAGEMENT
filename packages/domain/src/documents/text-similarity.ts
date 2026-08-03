/**
 * Levenshtein distance — the tolerance that makes OCR validation usable.
 *
 * The distance between two strings is the minimum number of single-character
 * insertions, deletions or substitutions needed to turn one into the other.
 * Every check in this folder is fuzzy for the same reason: OCR routinely turns
 * "OFFICIAL" into "OFFlCIAL", and a document must not be refused over one
 * mangled character.
 */

/** A name this close to the registered one is accepted outright. */
export const SIMILARITY_MATCH = 0.85;
/** Below MATCH but at or above this, a human decides. */
export const SIMILARITY_REVIEW = 0.7;

export const Verdict = {
  MATCH: 'match',
  REVIEW: 'review',
  MISMATCH: 'mismatch',
} as const;
export type Verdict = (typeof Verdict)[keyof typeof Verdict];

/**
 * Strips formatting noise before comparison.
 *
 * Without it, "Dela Cruz, Juan" and "JUAN DELA CRUZ" score as wildly different
 * despite naming the same person.
 *
 * - Unicode NFD + diacritic stripping, so "PEÑA" and "PENA" agree
 * - uppercase, so case never counts as an edit
 * - punctuation to spaces, then whitespace collapsed
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Two-row rolling variant.
 *
 * The classic algorithm fills an (m+1)×(n+1) matrix, but each row only ever
 * reads the one above it, so we keep two. That is O(n) memory instead of
 * O(m·n) — worth doing because OCR of a full card runs to thousands of
 * characters.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Index the shorter string along the row to keep the arrays small.
  if (a.length > b.length) [a, b] = [b, a];

  let previous = new Array<number>(a.length + 1);
  let current = new Array<number>(a.length + 1);

  for (let i = 0; i <= a.length; i++) previous[i] = i;

  for (let j = 1; j <= b.length; j++) {
    current[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      // Every index here is provably in bounds: both rows are allocated at
      // a.length + 1, and `i` runs 1..a.length. The assertions are for
      // `noUncheckedIndexedAccess`, which cannot see that.
      current[i] = Math.min(
        current[i - 1]! + 1, // insertion
        previous[i]! + 1, // deletion
        previous[i - 1]! + substitutionCost, // substitution
      );
    }
    [previous, current] = [current, previous];
  }

  return previous[a.length]!;
}

/**
 * Raw distance as a 0..1 ratio.
 *
 * Dividing by the longer length keeps scores comparable across sizes: one edit
 * in a 4-character string matters far more than one in a 40-character string.
 */
export function similarityRatio(a: string, b: string): number {
  if (!a && !b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshteinDistance(a, b) / longest;
}

function gradeOf(similarity: number): Verdict {
  if (similarity >= SIMILARITY_MATCH) return Verdict.MATCH;
  if (similarity >= SIMILARITY_REVIEW) return Verdict.REVIEW;
  return Verdict.MISMATCH;
}

export interface ComparisonResult {
  /** Both sides after normalisation, so a reviewer can see what was compared. */
  readonly normalizedA: string;
  readonly normalizedB: string;
  readonly distance: number;
  /** 0..1, where 1 is exact. */
  readonly similarity: number;
  readonly verdict: Verdict;
}

/**
 * Normalises both inputs, compares, grades.
 *
 * A MATCH is a RECOMMENDATION. Final acceptance always rests with authorised
 * personnel — this is decision support, not an auto-approver, and the Terms
 * the buyer accepts say exactly that.
 */
export function compareText(a: string, b: string): ComparisonResult {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);
  const distance = levenshteinDistance(normalizedA, normalizedB);
  const similarity = similarityRatio(normalizedA, normalizedB);

  return { normalizedA, normalizedB, distance, similarity, verdict: gradeOf(similarity) };
}

/**
 * Compares two names token by token, ignoring word order.
 *
 * Philippine IDs print names surname-first — "DELA CRUZ, JUAN SANTOS" — while
 * the buyer registers as "Juan Dela Cruz". Compared flat those score about
 * 64%, which would refuse a perfectly valid ID. Matching each registered part
 * against its best counterpart makes the comparison order-independent, and
 * tolerates the middle name that IDs carry but registration forms often omit.
 *
 * Parts are weighted by length, so a mangled "CRUZ" costs more than a mangled
 * middle initial.
 */
export function tokenAlignedComparison(needle: string, candidate: string): ComparisonResult {
  const normalizedA = normalizeText(needle);
  const normalizedB = normalizeText(candidate);

  const needleTokens = normalizedA.split(' ').filter(Boolean);
  const candidateTokens = normalizedB.split(' ').filter(Boolean);

  if (needleTokens.length === 0 || candidateTokens.length === 0) {
    return compareText(needle, candidate);
  }

  const used = new Set<number>();
  const aligned: string[] = [];
  let weightedScore = 0;
  let totalWeight = 0;

  for (const token of needleTokens) {
    let bestIndex = -1;
    let bestScore = 0;

    candidateTokens.forEach((candidateToken, index) => {
      if (used.has(index)) return;
      const score = similarityRatio(token, candidateToken);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0) {
      used.add(bestIndex);
      aligned.push(candidateTokens[bestIndex]!);
    }

    weightedScore += bestScore * token.length;
    totalWeight += token.length;
  }

  const similarity = totalWeight > 0 ? weightedScore / totalWeight : 0;
  // Distance is reported against the candidate RE-ORDERED to match, so the
  // character count a reviewer sees lines up with the percentage beside it.
  const reordered = aligned.join(' ');

  return {
    normalizedA,
    normalizedB: reordered,
    distance: levenshteinDistance(normalizedA, reordered),
    similarity,
    verdict: gradeOf(similarity),
  };
}

/**
 * Finds the buyer's name inside a full page of OCR text.
 *
 * OCR returns the whole card, not an isolated field, so comparing a
 * 14-character name against 2,000 characters would always score near zero.
 * Instead a window roughly the name's word count slides across the page and
 * the best hit wins.
 *
 * Windows stay CONTIGUOUS rather than matching tokens anywhere on the page: a
 * document that merely happens to contain "JUAN" and "CRUZ" in unrelated
 * corners should not pass. The name has to actually appear together.
 */
export function bestWindowSimilarity(needle: string, haystack: string): ComparisonResult {
  const normalizedNeedle = normalizeText(needle);
  const normalizedHaystack = normalizeText(haystack);

  if (!normalizedNeedle || !normalizedHaystack) {
    return compareText(needle, haystack);
  }

  const words = normalizedHaystack.split(' ').filter(Boolean);
  const needleWordCount = normalizedNeedle.split(' ').filter(Boolean).length;

  let best: ComparisonResult | null = null;

  // One word short (missing middle name) to two long (extra middle name, or a
  // suffix such as JR).
  const minSpan = Math.max(1, needleWordCount - 1);
  const maxSpan = needleWordCount + 2;

  for (let span = minSpan; span <= maxSpan; span++) {
    for (let start = 0; start + span <= words.length; start++) {
      const candidate = words.slice(start, start + span).join(' ');
      const result = tokenAlignedComparison(normalizedNeedle, candidate);
      if (!best || result.similarity > best.similarity) best = result;
    }
  }

  return best ?? compareText(needle, haystack);
}

/**
 * Fuzzy keyword search: does `phrase` appear anywhere in `text`?
 *
 * A plain `includes` fails the moment OCR turns "OFFICIAL RECEIPT" into
 * "OFFlCIAL RECEIPT", so a same-length window slides across the text and the
 * phrase is accepted when any window is at least 85% similar.
 *
 * `text` must already be normalised.
 */
export function containsFuzzy(text: string, phrase: string): boolean {
  const needle = normalizeText(phrase);
  if (!needle) return false;
  if (text.includes(needle)) return true;

  const window = needle.length;
  if (text.length < window) return false;

  /*
   * Stride of window/8, not window/4.
   *
   * A coarser stride silently MISSES phrases that are plainly there. Sliding
   * by a quarter of a 26-character needle steps 0, 6, 12 … 54, 60 — so a
   * phrase starting at index 57 is never tested, even at 96% similarity. That
   * is not a near miss: it costs the card a 0.6 primary hit and can refuse a
   * genuine ID.
   *
   * Eight is the number because misalignment is what decides this. Comparing
   * against a window offset by `d` characters costs roughly `2d/window` in
   * similarity. A stride of window/8 leaves a worst-case offset of window/16,
   * so the worst-case loss is 1/8 — landing at 0.875, still clear of the 0.85
   * threshold. A stride of window/4 allows an offset of window/8 and a loss of
   * 1/4, which falls straight through it.
   */
  const stride = Math.max(1, Math.floor(window / 8));
  for (let i = 0; i + window <= text.length; i += stride) {
    if (similarityRatio(needle, text.slice(i, i + window)) >= 0.85) return true;
  }
  return false;
}
