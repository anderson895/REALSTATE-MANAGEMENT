import { containsFuzzy, normalizeText } from './text-similarity';

/**
 * Keyword signatures for Philippine government IDs.
 *
 * Matching is fuzzy — see `containsFuzzy` — because OCR reliably mangles a
 * character or two in a heading, and a card must not be refused for that.
 */

/** The IDs a buyer may choose. RESERVATION.doc, STEP 7. */
export const ID_TYPES = [
  'Philippine Passport',
  "Driver's License",
  'UMID / SSS',
  'PhilSys National ID',
  'PRC ID',
  'Postal ID',
  'Voter’s ID',
] as const;
export type IdType = (typeof ID_TYPES)[number];

/**
 * IDs that are recognised but NOT accepted for a property reservation.
 *
 * They exist here purely so a refusal can name what was actually uploaded.
 * "This looks like a PhilHealth ID" tells a buyer what to do next; "this is
 * not the ID you selected" leaves them guessing.
 */
export const OTHER_ID_LABELS = [
  'PhilHealth ID',
  'TIN ID',
  'Senior Citizen ID',
  'PWD ID',
  'Barangay ID',
] as const;
export type OtherIdLabel = (typeof OTHER_ID_LABELS)[number];

export type RecognisedId = IdType | OtherIdLabel;

/**
 * Phrases shorter than this are dropped rather than trusted.
 *
 * A short needle passed to `containsFuzzy` matches almost any text of that
 * length. Since ONE primary hit clears the acceptance bar on its own, a single
 * short phrase would be enough to accept the wrong card.
 */
export const MIN_KEYWORD_LENGTH = 6;

/** A score at or above this means "the text really does look like this ID". */
export const ID_ACCEPT_THRESHOLD = 0.5;

interface IdPattern {
  readonly id: RecognisedId;
  /** Strong signals: one of these is close to conclusive. */
  readonly primary: readonly string[];
  /** Weaker supporting signals, worth partial credit. */
  readonly secondary: readonly string[];
}

const ID_PATTERNS: readonly IdPattern[] = [
  {
    id: 'PhilSys National ID',
    primary: [
      'PHILIPPINE IDENTIFICATION CARD',
      'PAMBANSANG PAGKAKAKILANLAN',
      'PHILSYS CARD NUMBER',
      'PHILSYS',
    ],
    // The PhilSys card labels its fields in Filipino, which no other ID does.
    secondary: ['APELYIDO', 'MGA PANGALAN', 'PETSA NG KAPANGANAKAN', 'TIRAHAN', 'KASARIAN'],
  },
  {
    id: 'Philippine Passport',
    primary: [
      'PASAPORTE',
      'DEPARTMENT OF FOREIGN AFFAIRS',
      'PASSPORT NO',
      'KAGAWARAN NG UGNAYANG PANLABAS',
    ],
    secondary: [
      'PLACE OF ISSUE',
      'DATE OF ISSUE',
      'ISSUING AUTHORITY',
      'PLACE OF BIRTH',
      'DATE OF EXPIRY',
    ],
  },
  {
    id: "Driver's License",
    primary: ['DRIVERS LICENSE', 'LAND TRANSPORTATION OFFICE', 'NON PROFESSIONAL'],
    secondary: ['AGENCY CODE', 'RESTRICTIONS', 'CONDITIONS', 'LICENSE NO', 'EYES COLOR'],
  },
  {
    id: 'UMID / SSS',
    primary: [
      'UNIFIED MULTI PURPOSE',
      'SOCIAL SECURITY SYSTEM',
      'GOVERNMENT SERVICE INSURANCE SYSTEM',
    ],
    secondary: ['COMMON REFERENCE NUMBER', 'PAG IBIG', 'CRN NO'],
  },
  {
    id: 'PRC ID',
    primary: ['PROFESSIONAL REGULATION COMMISSION', 'PROFESSIONAL IDENTIFICATION CARD'],
    secondary: ['REGISTRATION NO', 'VALID UNTIL', 'PROFESSION', 'LICENSE NUMBER'],
  },
  {
    id: 'Postal ID',
    primary: ['POSTAL IDENTITY CARD', 'PHILIPPINE POSTAL CORPORATION', 'PHLPOST'],
    secondary: ['POSTAL ID', 'POSTAL REFERENCE NUMBER'],
  },
  {
    id: 'Voter’s ID',
    primary: ['VOTERS IDENTIFICATION CARD', 'COMMISSION ON ELECTIONS', 'COMELEC'],
    secondary: ['PRECINCT NO', 'VOTERS IDENTIFICATION NUMBER', 'CITY MUNICIPALITY'],
  },

  // ── recognised so they can be NAMED when refused, never offered ──────────
  {
    id: 'PhilHealth ID',
    primary: [
      'PHILIPPINE HEALTH INSURANCE CORPORATION',
      'PHILHEALTH',
      'PHILHEALTH IDENTIFICATION NUMBER',
    ],
    secondary: ['MEMBER SINCE', 'PHILHEALTH NO'],
  },
  {
    id: 'TIN ID',
    primary: ['TAXPAYER IDENTIFICATION NUMBER', 'BUREAU OF INTERNAL REVENUE'],
    secondary: ['REVENUE DISTRICT', 'TAXPAYER NAME'],
  },
  {
    id: 'Senior Citizen ID',
    primary: [
      'SENIOR CITIZEN IDENTIFICATION CARD',
      'OFFICE FOR SENIOR CITIZENS AFFAIRS',
      'SENIOR CITIZEN',
    ],
    secondary: ['OSCA ID', 'DATE ISSUED'],
  },
  {
    id: 'PWD ID',
    primary: ['PERSON WITH DISABILITY', 'NATIONAL COUNCIL ON DISABILITY AFFAIRS'],
    secondary: ['TYPE OF DISABILITY', 'PWD ID NO'],
  },
  {
    id: 'Barangay ID',
    primary: ['BARANGAY IDENTIFICATION CARD', 'BARANGAY CLEARANCE', 'OFFICE OF THE BARANGAY'],
    secondary: ['PUNONG BARANGAY', 'BARANGAY CAPTAIN'],
  },
];

/** Generic marks of an identity document, used to answer "is this an ID at all?". */
const ANY_ID_MARKERS: readonly string[] = [
  'REPUBLIC OF THE PHILIPPINES',
  'DATE OF BIRTH',
  'PLACE OF BIRTH',
  'NATIONALITY',
  'SIGNATURE',
  'BLOOD TYPE',
  'EXPIRATION DATE',
  'MIDDLE NAME',
  'GIVEN NAME',
];

export interface IdScore {
  readonly id: RecognisedId;
  readonly score: number;
  readonly matchedKeywords: readonly string[];
}

/**
 * Scores OCR text against every known ID.
 *
 * One primary hit reaches 0.6 — enough to clear `ID_ACCEPT_THRESHOLD` alone,
 * because a phrase like "LAND TRANSPORTATION OFFICE" appears on exactly one
 * card. Secondary hits top up the remaining 0.4; three of them are needed for
 * full credit, since labels like "DATE OF ISSUE" appear on many documents.
 *
 * Sorted best first.
 */
export function scoreIdType(rawText: string): IdScore[] {
  const text = normalizeText(rawText);

  const usable = (phrases: readonly string[]) =>
    phrases.filter((p) => normalizeText(p).length >= MIN_KEYWORD_LENGTH);

  return ID_PATTERNS.map(({ id, primary, secondary }) => {
    const matchedKeywords: string[] = [];

    let primaryHits = 0;
    for (const phrase of usable(primary)) {
      if (containsFuzzy(text, phrase)) {
        primaryHits++;
        matchedKeywords.push(phrase);
      }
    }

    let secondaryHits = 0;
    for (const phrase of usable(secondary)) {
      if (containsFuzzy(text, phrase)) {
        secondaryHits++;
        matchedKeywords.push(phrase);
      }
    }

    const primaryScore = Math.min(1, primaryHits) * 0.6;
    const secondaryScore = Math.min(1, secondaryHits / 3) * 0.4;

    return {
      id,
      score: Number((primaryScore + secondaryScore).toFixed(3)),
      matchedKeywords,
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * How much this text looks like ANY identity document, 0..1.
 *
 * Separate from `scoreIdType` so the two failures can be told apart: a selfie
 * scores near zero here and gets "this does not look like an ID", while a
 * driver's licence uploaded under UMID scores high here and gets the far more
 * useful "this looks like a Driver's License".
 */
export function scoreAnyId(rawText: string): number {
  const text = normalizeText(rawText);
  const hits = ANY_ID_MARKERS.filter((phrase) => containsFuzzy(text, phrase)).length;
  return Number(Math.min(1, hits / 3).toFixed(3));
}
