import {
  ID_ACCEPT_THRESHOLD,
  scoreAnyId,
  scoreIdType,
  type IdScore,
  type IdType,
  type RecognisedId,
} from './id-patterns';
import { bestWindowSimilarity, Verdict, type ComparisonResult } from './text-similarity';

/**
 * Staged validation of an uploaded government ID.
 *
 *   Stage 1  — is this an identity document at all?        BLOCKS
 *   Stage 1b — is it the ID the buyer SELECTED?            BLOCKS
 *   Stage 2  — does the name on it match the account?      WARNS
 *
 * Stages 1 and 1b block because they are questions about the FILE, and the
 * buyer can fix a wrong file in seconds. Stage 2 does not, because it is a
 * question about a NAME, and OCR misreads names constantly — "Ma. Cristina"
 * comes back as "Ma Crlstina" often enough that blocking on it would turn away
 * buyers holding perfectly good documents. A name mismatch is surfaced and
 * left for staff, which is what the Terms already promise: "Final approval
 * shall be made by authorized company personnel."
 *
 * Pure: takes TEXT, returns a verdict. It knows nothing about tesseract,
 * Google Vision, or where the file is stored, which is what makes it testable
 * and lets the OCR engine be swapped without touching any of this.
 */

/** Below this, the text is too sparse to conclude anything. */
const MIN_USABLE_TEXT_LENGTH = 24;

export interface IdValidationInput {
  /** OCR text from the front of the card. */
  readonly frontText: string;
  /** OCR text from the back, when it was read. */
  readonly backText?: string;
  /** What the buyer chose in the form. */
  readonly selectedIdType: IdType;
  /** The name on the account, for Stage 2. */
  readonly registeredName: string;
}

export interface IdValidationResult {
  /** True only when nothing blocking was found. */
  readonly accepted: boolean;
  /** What to tell the buyer. Always set. */
  readonly message: string;
  /** Stage 1: is it an ID at all? `null` when there was too little text. */
  readonly looksLikeId: boolean | null;
  /** Stage 1b: is it the SELECTED ID? `null` when Stage 1 already failed. */
  readonly idTypeMatch: boolean | null;
  /** Best guess at what was actually uploaded, for the refusal message. */
  readonly detectedId: RecognisedId | null;
  readonly scores: readonly IdScore[];
  /** Stage 2. `null` when not reached. */
  readonly nameComparison: ComparisonResult | null;
  /**
   * False when both images read as the same side.
   *
   * `null` when the back was not supplied or could not be read. Reported
   * rather than blocking: a duplicated side is a paperwork problem for staff
   * to bounce back, not evidence of a wrong document.
   */
  readonly backSideDistinct: boolean | null;
  /** The overall grade, driven by Stage 2 once the blocking stages pass. */
  readonly verdict: Verdict;
}

/**
 * Do the two sides read as different documents?
 *
 * Photographing the front twice is the common mistake and otherwise passes in
 * SILENCE: the front is a valid ID, so every other check succeeds and nobody
 * notices the back was never supplied.
 */
function checkBackDistinct(frontText: string, backText: string | undefined): boolean | null {
  if (!backText || backText.trim().length < MIN_USABLE_TEXT_LENGTH) return null;
  // Deliberately loose. Both sides of one card share a lot of text — the
  // holder's name, the agency — so only a near-identical read is suspicious.
  return bestWindowSimilarity(frontText, backText).similarity < 0.9;
}

export function validateIdUpload({
  frontText,
  backText,
  selectedIdType,
  registeredName,
}: IdValidationInput): IdValidationResult {
  const scores = scoreIdType(frontText);
  const best = scores[0] ?? null;
  const backSideDistinct = checkBackDistinct(frontText, backText);

  const base = {
    scores,
    backSideDistinct,
    detectedId: best && best.score >= ID_ACCEPT_THRESHOLD ? best.id : null,
  };

  // ── Too little text to judge ──────────────────────────────────────────
  //
  // Not a refusal. A dark or blurred photo is the buyer's most likely
  // problem, and calling that "the wrong ID" sends them hunting for a
  // document they are already holding.
  if (frontText.trim().length < MIN_USABLE_TEXT_LENGTH) {
    return {
      ...base,
      accepted: false,
      looksLikeId: null,
      idTypeMatch: null,
      nameComparison: null,
      verdict: Verdict.REVIEW,
      message:
        'We could not read any text from this image. Retake the photo in good light, ' +
        'with the whole card flat in frame and in focus.',
    };
  }

  // ── Stage 1: is it an ID at all? ──────────────────────────────────────
  const looksLikeId = scoreAnyId(frontText) >= 0.34 || (best?.score ?? 0) >= ID_ACCEPT_THRESHOLD;

  if (!looksLikeId) {
    return {
      ...base,
      accepted: false,
      looksLikeId: false,
      idTypeMatch: null,
      nameComparison: null,
      verdict: Verdict.MISMATCH,
      message:
        'This does not look like a government-issued ID. Upload a photo of the card itself, ' +
        'not a screenshot, selfie or receipt.',
    };
  }

  // ── Stage 1b: is it the ID that was SELECTED? ─────────────────────────
  //
  // Only refuse when another card is confidently recognised. A blurry UMID
  // that scores badly is a photo problem; a crisp driver's licence uploaded
  // under UMID is a real mistake, and only that second case is worth
  // stopping — with the actual card named, so the fix is obvious.
  const selectedScore = scores.find((s) => s.id === selectedIdType)?.score ?? 0;

  if (
    selectedScore < ID_ACCEPT_THRESHOLD &&
    best &&
    best.id !== selectedIdType &&
    best.score >= ID_ACCEPT_THRESHOLD
  ) {
    return {
      ...base,
      accepted: false,
      looksLikeId: true,
      idTypeMatch: false,
      nameComparison: null,
      verdict: Verdict.MISMATCH,
      message:
        `You selected ${selectedIdType}, but this looks like a ${best.id}. ` +
        'Choose the matching ID type, or upload your ' +
        `${selectedIdType} instead.`,
    };
  }

  // ── Stage 2: does the name match? (warns, never blocks) ───────────────
  const combined = backText ? `${frontText}\n${backText}` : frontText;
  const nameComparison = bestWindowSimilarity(registeredName, combined);

  const passed = {
    ...base,
    accepted: true,
    looksLikeId: true,
    idTypeMatch: true,
    nameComparison,
  } as const;

  if (backSideDistinct === false) {
    return {
      ...passed,
      verdict: Verdict.REVIEW,
      message:
        'Both images look like the same side of your ID. Upload the front and the back as ' +
        'separate photos — you can continue, but staff will ask for the missing side.',
    };
  }

  if (nameComparison.verdict === Verdict.MATCH) {
    return {
      ...passed,
      verdict: Verdict.MATCH,
      message: `Looks good — a ${selectedIdType} in the name on your account.`,
    };
  }

  return {
    ...passed,
    verdict: nameComparison.verdict,
    message:
      `We could not clearly match the name on this ${selectedIdType} to your account name ` +
      `(${registeredName}). You can continue — a staff reviewer will check it.`,
  };
}
