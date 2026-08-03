import { describe, expect, it } from 'vitest';
import { validateIdUpload } from './validate-id';
import {
  normalizeText,
  similarityRatio,
  bestWindowSimilarity,
  containsFuzzy,
  Verdict,
} from './text-similarity';


/**
 * Realistic OCR output — mangled the way tesseract actually mangles it, with
 * stray characters and dropped letters, so the tests exercise the fuzzy path
 * rather than a clean string match that would pass with `includes`.
 */
const LICENCE = `
REPUBLIC OF THE PHlLIPPINES
DEPARTMENT OF TRANSPORTATION
LAND TRANSPORTATION OFFlCE
NON PROFESSIONAL DRIVERS LICENSE
DELA CRUZ, JUAN SANTOS
DATE OF BIRTH 1990-05-15  BLOOD TYPE O
AGENCY CODE  RESTRICTIONS  2
`;

const UMID = `
REPUBLIC OF THE PHILIPPINES
SOCIAL SECURITY SYSTEM
UNIFIED MULTI PURPOSE ID
COMMON REFERENCE NUMBER 1234-5678901-2
DELA CRUZ, JUAN SANTOS
DATE OF BIRTH 05-15-1990
`;

const PHILHEALTH = `
PHILIPPINE HEALTH INSURANCE CORPORATION
PHILHEALTH IDENTIFICATION NUMBER 12-345678901-2
DELA CRUZ, JUAN SANTOS
MEMBER SINCE 2015
`;

const NOT_AN_ID = `
OFFICIAL RECEIPT
JOLLIBEE FOODS CORPORATION
CHICKENJOY 1PC   150.00
TOTAL 150.00  CASH 200.00
`;

const NAME = 'Juan Dela Cruz';

describe('validateIdUpload — Stage 1b, the wrong ID type', () => {
  it('refuses a driver’s licence uploaded as a UMID, and names what it saw', () => {
    const result = validateIdUpload({
      frontText: LICENCE,
      selectedIdType: 'UMID / SSS',
      registeredName: NAME,
    });

    expect(result.accepted).toBe(false);
    expect(result.idTypeMatch).toBe(false);
    expect(result.detectedId).toBe("Driver's License");
    // Naming the card is the whole point — "wrong ID" alone leaves the buyer
    // guessing which of the two things is wrong.
    expect(result.message).toContain('UMID / SSS');
    expect(result.message).toContain("Driver's License");
  });

  it('refuses a PhilHealth card even though it is never an offered option', () => {
    const result = validateIdUpload({
      frontText: PHILHEALTH,
      selectedIdType: 'UMID / SSS',
      registeredName: NAME,
    });

    expect(result.accepted).toBe(false);
    expect(result.detectedId).toBe('PhilHealth ID');
    expect(result.message).toContain('PhilHealth ID');
  });

  it('accepts the SAME image once the ID type is corrected', () => {
    // The buyer's actual path: refused, told which card it looked like, fixes
    // the dropdown. Nothing about the image changed, so the only thing that
    // may decide this is the selection.
    const refused = validateIdUpload({
      frontText: LICENCE,
      selectedIdType: 'PhilSys National ID',
      registeredName: NAME,
    });
    expect(refused.accepted).toBe(false);

    const corrected = validateIdUpload({
      frontText: LICENCE,
      selectedIdType: "Driver's License",
      registeredName: NAME,
    });
    expect(corrected.accepted).toBe(true);
    expect(corrected.idTypeMatch).toBe(true);
  });

  it('accepts the ID that was actually selected', () => {
    const result = validateIdUpload({
      frontText: UMID,
      selectedIdType: 'UMID / SSS',
      registeredName: NAME,
    });

    expect(result.accepted).toBe(true);
    expect(result.idTypeMatch).toBe(true);
  });
});

describe('validateIdUpload — Stage 1, not an ID at all', () => {
  it('refuses a receipt, and says so differently from a wrong-type refusal', () => {
    const result = validateIdUpload({
      frontText: NOT_AN_ID,
      selectedIdType: 'UMID / SSS',
      registeredName: NAME,
    });

    expect(result.accepted).toBe(false);
    expect(result.looksLikeId).toBe(false);
    expect(result.message).toContain('does not look like a government-issued ID');
  });

  it('treats an unreadable photo as a photo problem, not a wrong document', () => {
    const result = validateIdUpload({
      frontText: '   \n  ',
      selectedIdType: 'UMID / SSS',
      registeredName: NAME,
    });

    expect(result.accepted).toBe(false);
    expect(result.looksLikeId).toBeNull();
    expect(result.message).toContain('could not read any text');
    // Sending someone hunting for a document they are already holding is the
    // failure this guards against.
    expect(result.message).not.toContain('does not look like');
  });
});

describe('validateIdUpload — Stage 2 warns but never blocks', () => {
  it('accepts a correct card whose name does not match, and says a human will check', () => {
    const result = validateIdUpload({
      frontText: UMID,
      selectedIdType: 'UMID / SSS',
      registeredName: 'Maria Clara Santos',
    });

    expect(result.accepted).toBe(true);
    expect(result.verdict).not.toBe(Verdict.MATCH);
    expect(result.message).toContain('staff reviewer');
  });

  it('matches a surname-first name against the registered order', () => {
    const result = validateIdUpload({
      frontText: UMID,
      selectedIdType: 'UMID / SSS',
      registeredName: NAME,
    });

    expect(result.verdict).toBe(Verdict.MATCH);
    expect(result.nameComparison!.similarity).toBeGreaterThanOrEqual(0.85);
  });
});

describe('validateIdUpload — the duplicated side', () => {
  it('flags the same side photographed twice, without blocking', () => {
    const result = validateIdUpload({
      frontText: UMID,
      backText: UMID,
      selectedIdType: 'UMID / SSS',
      registeredName: NAME,
    });

    expect(result.backSideDistinct).toBe(false);
    expect(result.accepted).toBe(true);
    expect(result.message).toContain('same side');
  });

  it('is satisfied by two genuinely different sides', () => {
    const result = validateIdUpload({
      frontText: UMID,
      backText: 'SSS BRANCH QUEZON CITY\nIF FOUND PLEASE RETURN TO THE NEAREST BRANCH\nSIGNATURE OF HOLDER',
      selectedIdType: 'UMID / SSS',
      registeredName: NAME,
    });

    expect(result.backSideDistinct).toBe(true);
  });
});

describe('text similarity', () => {
  it('normalises away accents, case and punctuation', () => {
    expect(normalizeText('Dela Cruz, Juán')).toBe('DELA CRUZ JUAN');
  });

  it('scores surname-first names as the same person', () => {
    // Compared flat these score about 64% — low enough to refuse a valid ID,
    // which is exactly why the comparison is token-aligned.
    expect(similarityRatio('JUAN DELA CRUZ', 'DELA CRUZ JUAN SANTOS')).toBeLessThan(0.7);
    expect(bestWindowSimilarity('Juan Dela Cruz', LICENCE).similarity).toBeGreaterThanOrEqual(0.85);
  });

  it('tolerates the character OCR actually drops', () => {
    // The fixture says "OFFlCE" with a lowercase L — the classic tesseract
    // confusion — and the phrase still has to be found.
    expect(containsFuzzy(normalizeText(LICENCE), 'LAND TRANSPORTATION OFFICE')).toBe(true);
  });

  it('finds a phrase wherever it starts, not only on a stride boundary', () => {
    // Regression: with a window/4 stride this exact string was MISSED at 96%
    // similarity, purely because it begins at index 57 and the windows landed
    // on 54 and 60. A genuine ID lost a 0.6 primary hit to arithmetic.
    const needle = 'LAND TRANSPORTATION OFFICE';
    for (let pad = 0; pad < 12; pad++) {
      const text = normalizeText(`${'X '.repeat(pad)}${needle} NON PROFESSIONAL`);
      expect(containsFuzzy(text, needle), `offset ${pad}`).toBe(true);
    }
  });

  it('still refuses a phrase that is genuinely absent', () => {
    expect(containsFuzzy(normalizeText(UMID), 'LAND TRANSPORTATION OFFICE')).toBe(false);
  });
});
