/**
 * Document validation.
 *
 * Pure logic: it takes OCR TEXT and returns a verdict, so the recognition
 * engine (tesseract in the browser today, Google Vision later) can change
 * without touching any of it — and so all of it is testable without an image.
 */

export {
  normalizeText,
  levenshteinDistance,
  similarityRatio,
  compareText,
  tokenAlignedComparison,
  bestWindowSimilarity,
  containsFuzzy,
  Verdict,
  SIMILARITY_MATCH,
  SIMILARITY_REVIEW,
  type ComparisonResult,
} from './text-similarity';

export {
  ID_TYPES,
  OTHER_ID_LABELS,
  MIN_KEYWORD_LENGTH,
  ID_ACCEPT_THRESHOLD,
  scoreIdType,
  scoreAnyId,
  type IdType,
  type OtherIdLabel,
  type RecognisedId,
  type IdScore,
} from './id-patterns';

export {
  validateIdUpload,
  type IdValidationInput,
  type IdValidationResult,
} from './validate-id';
