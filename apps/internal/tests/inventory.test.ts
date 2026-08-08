import { describe, expect, it } from 'vitest';
import {
  derivePurchasePrice,
  projectSchema,
  suggestUnitPrefix,
  unitSchema,
} from '../lib/inventory';

const project = (over: Record<string, unknown> = {}) => ({
  code: 'MPR006',
  name: 'Meridian Park Residences',
  developer: 'St. Francis Square Realty Corporation',
  location: 'Ortigas Center, Pasig City',
  buildingType: 'Premium High-Rise Condominium',
  floorsRaw: '38 Floors',
  theme: 'Bay-view luxury living',
  unitPrefix: 'MP',
  ...over,
});

const unit = (over: Record<string, unknown> = {}) => ({
  projectId: 'MPR006',
  tower: 'Tower A',
  floor: '12',
  unitNo: 'A-1201',
  unitType: 'Studio',
  areaSqm: '24',
  pricePerSqm: '250000',
  purchasePrice: '6000000',
  ...over,
});

describe('projectSchema', () => {
  it('accepts a complete project', () => {
    expect(projectSchema.safeParse(project()).success).toBe(true);
  });

  it('uppercases the code and the prefix', () => {
    // The document id is the code, and `TLP001` must not become a second
    // project sitting beside `tlp001`.
    const parsed = projectSchema.parse(project({ code: 'mpr006', unitPrefix: 'mp' }));
    expect(parsed.code).toBe('MPR006');
    expect(parsed.unitPrefix).toBe('MP');
  });

  it('holds the code to the shape the seeded five use', () => {
    for (const code of ['MP6', 'MPR0006', 'MPR', '006', 'MPR-006']) {
      expect(projectSchema.safeParse(project({ code })).success).toBe(false);
    }
    // GVR004 and HPR004 share a number in the real data — the digits are not a
    // sequence, so only the shape is checked.
    for (const code of ['TLP001', 'EPR002', 'GVR004', 'HPR004', 'MP006']) {
      expect(projectSchema.safeParse(project({ code })).success).toBe(true);
    }
  });

  it('refuses a unit prefix that is not 1-4 letters', () => {
    for (const unitPrefix of ['MP1', '', 'MPRES', 'M-P']) {
      expect(projectSchema.safeParse(project({ unitPrefix })).success).toBe(false);
    }
  });

  it('keeps the floor count as free text', () => {
    // The workbook holds both "42" and "38 Floors" in one column. Parsing it to
    // a number would silently discard what the sheet says.
    expect(projectSchema.parse(project({ floorsRaw: '38 Floors' })).floorsRaw).toBe('38 Floors');
    expect(projectSchema.parse(project({ floorsRaw: '42' })).floorsRaw).toBe('42');
  });

  it('treats the theme as optional', () => {
    expect(projectSchema.safeParse(project({ theme: '' })).success).toBe(true);
  });
});

describe('unitSchema', () => {
  it('accepts a complete unit', () => {
    expect(unitSchema.safeParse(unit()).success).toBe(true);
  });

  it('parses prices with thousands separators', () => {
    // Anyone pasting from a price list brings the commas with them.
    const parsed = unitSchema.parse(unit({ pricePerSqm: '250,000', purchasePrice: '6,000,000' }));
    expect(parsed.pricePerSqm).toBe(250_000);
    expect(parsed.purchasePrice).toBe(6_000_000);
  });

  it('refuses zero, negative and non-numeric prices', () => {
    for (const purchasePrice of ['0', '-5000', 'free', '']) {
      expect(unitSchema.safeParse(unit({ purchasePrice })).success).toBe(false);
    }
  });

  it('refuses an absurd price rather than quoting it to a buyer', () => {
    // A slipped keyboard should not put a figure into PricingService.
    expect(unitSchema.safeParse(unit({ purchasePrice: '999999999999999' })).success).toBe(false);
  });

  it('refuses a floor outside 1-200 and a non-integer floor', () => {
    for (const floor of ['0', '-3', '500', '2.5']) {
      expect(unitSchema.safeParse(unit({ floor })).success).toBe(false);
    }
    expect(unitSchema.parse(unit({ floor: '12' })).floor).toBe(12);
  });

  it('refuses a floor area of zero or less', () => {
    expect(unitSchema.safeParse(unit({ areaSqm: '0' })).success).toBe(false);
    // Mirrors the entity: "Unit must have a positive floor area."
    expect(unitSchema.safeParse(unit({ areaSqm: '-24' })).success).toBe(false);
  });

  it('refuses a unit type outside the five the domain defines', () => {
    expect(unitSchema.safeParse(unit({ unitType: 'Loft' })).success).toBe(false);
  });

  it('treats the tower as optional — The Legaspi Place has none', () => {
    expect(unitSchema.safeParse(unit({ tower: '' })).success).toBe(true);
  });

  it('has no status field, so a unit cannot be born Sold', () => {
    const parsed = unitSchema.parse(unit());
    expect('status' in parsed).toBe(false);
  });
});

describe('derivePurchasePrice', () => {
  it('reproduces the arithmetic every seeded unit satisfies', () => {
    // 24 sqm at ₱250,000 is ₱6,000,000 — U001 in the fixture.
    expect(derivePurchasePrice('24', '250000')).toBe('6000000');
    expect(derivePurchasePrice('28', '250000')).toBe('7000000');
    expect(derivePurchasePrice('30', '250000')).toBe('7500000');
  });

  it('handles thousands separators the same way the schema does', () => {
    expect(derivePurchasePrice('24', '250,000')).toBe('6000000');
  });

  it('returns empty rather than NaN while the form is half-typed', () => {
    // "NaN" appearing in a price field as somebody types is worse than blank.
    for (const [area, rate] of [
      ['', '250000'],
      ['24', ''],
      ['abc', '250000'],
      ['0', '250000'],
    ]) {
      expect(derivePurchasePrice(area!, rate!)).toBe('');
    }
  });
});

describe('suggestUnitPrefix', () => {
  it('strips the digits off a project code', () => {
    expect(suggestUnitPrefix('MPR006')).toBe('MP');
    expect(suggestUnitPrefix('mpr006')).toBe('MP');
  });

  it('is only a suggestion — the seeded five do not follow one rule', () => {
    // TLP001 has units on `U`, SQR003 has them on `SQ`. The field stays
    // editable precisely because this cannot be right for every project.
    expect(suggestUnitPrefix('TLP001')).toBe('TL');
    expect(suggestUnitPrefix('SQR003')).toBe('SQ');
  });
});
