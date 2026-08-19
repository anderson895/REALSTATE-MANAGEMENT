import { describe, expect, it } from 'vitest';
import {
  Unit,
  UNIT_STATUSES,
  UNIT_TYPES,
  WITHHELD_UNIT_TYPES,
  isListedToBuyers,
  listedUnitTypes,
  type UnitStatus,
} from './unit';
import { Money } from '../value-objects/money';
import { ProjectId, ReservationNumber, UnitId } from '../value-objects/identifiers';
import { IllegalStateTransitionError, UnitNotAvailableError } from '../errors';

const AT = new Date('2026-08-02T10:00:00Z');
const RES = ReservationNumber.create(2026, 1);
const OTHER_RES = ReservationNumber.create(2026, 2);

function makeUnit(status: UnitStatus = 'Available', withReservation = false): Unit {
  return Unit.reconstitute({
    id: new UnitId('U001'),
    projectId: new ProjectId('TLP001'),
    tower: null,
    floor: 1,
    unitNo: 'A-101',
    unitType: 'Studio',
    areaSqm: 24,
    pricePerSqm: Money.fromPesos(250_000),
    purchasePrice: Money.fromPesos(6_000_000),
    status,
    currentReservation: withReservation ? RES : null,
  });
}

describe('Unit — creation', () => {
  it('starts Available with no reservation attached', () => {
    const unit = Unit.create({
      id: new UnitId('U001'),
      projectId: new ProjectId('TLP001'),
      tower: null,
      floor: 1,
      unitNo: 'A-101',
      unitType: 'Studio',
      areaSqm: 24,
      pricePerSqm: Money.fromPesos(250_000),
      purchasePrice: Money.fromPesos(6_000_000),
    });
    expect(unit.status).toBe('Available');
    expect(unit.isAvailable()).toBe(true);
    expect(unit.currentReservation).toBeNull();
  });

  it('rejects a non-positive floor area', () => {
    expect(() =>
      Unit.create({
        id: new UnitId('U001'),
        projectId: new ProjectId('TLP001'),
        tower: null,
        floor: 1,
        unitNo: 'A-101',
        unitType: 'Studio',
        areaSqm: 0,
        pricePerSqm: Money.fromPesos(250_000),
        purchasePrice: Money.fromPesos(6_000_000),
      }),
    ).toThrow();
  });
});

describe('Unit — holding', () => {
  it('moves Available to On Hold and records the reservation', () => {
    const unit = makeUnit('Available');
    unit.hold(RES, AT);
    expect(unit.status).toBe('On Hold');
    expect(unit.currentReservation?.value).toBe('RES-2026-000001');
    expect(unit.pullEvents().map((e) => e.type)).toEqual(['unit.held']);
  });

  it('refuses a second reservation on a held unit', () => {
    const unit = makeUnit('On Hold', true);
    expect(() => unit.hold(OTHER_RES, AT)).toThrow(UnitNotAvailableError);
  });

  it('refuses to hold a sold unit', () => {
    const unit = makeUnit('Sold', true);
    expect(() => unit.hold(OTHER_RES, AT)).toThrow(UnitNotAvailableError);
  });

  it('names the current status in the error so the buyer can be told why', () => {
    const unit = makeUnit('Sold', true);
    expect(() => unit.hold(OTHER_RES, AT)).toThrow(/Sold/);
  });
});

describe('Unit — selling and releasing', () => {
  it('moves On Hold to Sold', () => {
    const unit = makeUnit('On Hold', true);
    unit.markSold(AT);
    expect(unit.status).toBe('Sold');
    expect(unit.pullEvents().map((e) => e.type)).toEqual(['unit.sold']);
  });

  it('cannot sell straight from Available — the core safety property', () => {
    const unit = makeUnit('Available');
    expect(() => unit.markSold(AT)).toThrow(IllegalStateTransitionError);
    expect(unit.status).toBe('Available');
  });

  it('returns a held unit to Available on cancellation and clears the reservation', () => {
    const unit = makeUnit('On Hold', true);
    unit.release('reservation cancelled', AT);
    expect(unit.status).toBe('Available');
    expect(unit.currentReservation).toBeNull();
  });

  it('returns a sold unit to Available on an approved cancellation', () => {
    const unit = makeUnit('Sold', true);
    unit.release('approved cancellation', AT);
    expect(unit.status).toBe('Available');
  });
});

describe('Unit — exhaustive transition matrix', () => {
  // Transcribed independently from Development Plan.md §8.4 rather than read
  // from the entity, so this asserts the specification, not the implementation.
  const SPEC: Record<UnitStatus, readonly UnitStatus[]> = {
    Available: ['On Hold'],
    'On Hold': ['Sold', 'Available'],
    Sold: ['Available'],
  };

  const attempt: Record<UnitStatus, (u: Unit) => void> = {
    'On Hold': (u) => u.hold(RES, AT),
    Sold: (u) => u.markSold(AT),
    Available: (u) => u.release('test', AT),
  };

  for (const from of UNIT_STATUSES) {
    for (const to of UNIT_STATUSES) {
      const legal = SPEC[from].includes(to);

      it(`${from} -> ${to} ${legal ? 'is allowed' : 'THROWS'}`, () => {
        const unit = makeUnit(from, from !== 'Available');
        const run = () => attempt[to](unit);

        if (legal) {
          run();
          expect(unit.status).toBe(to);
        } else {
          expect(run).toThrow();
          expect(unit.status, 'status must be unchanged after a rejected move').toBe(from);
        }
      });
    }
  }
});

describe('isListedToBuyers', () => {
  const unit = (over: { status?: string; unitType?: string } = {}) => ({
    status: 'Available',
    unitType: 'Studio',
    ...over,
  });

  it('lists an Available unit of a type still on sale', () => {
    expect(isListedToBuyers(unit())).toBe(true);
  });

  it('hides every status except Available', () => {
    // comments.doc: "No need na po makita ng prospect buyer/buyer ang on hold
    // at sold." Written as a loop over UNIT_STATUSES so a status added later
    // has to be classified deliberately rather than defaulting to visible.
    for (const status of UNIT_STATUSES) {
      expect(isListedToBuyers(unit({ status })), status).toBe(status === 'Available');
    }
  });

  it('hides a withheld type even when it is Available', () => {
    // The trap this exists for: a Penthouse IS Available. Anything checking
    // `status === 'Available'` lets it straight through, which is how it would
    // have stayed reservable by direct link after being taken off the listings.
    expect(isListedToBuyers(unit({ unitType: 'Penthouse' }))).toBe(false);
  });

  it('withholds Penthouse and nothing else', () => {
    for (const unitType of UNIT_TYPES) {
      expect(isListedToBuyers(unit({ unitType })), unitType).toBe(unitType !== 'Penthouse');
    }
  });

  it('names only real unit types as withheld', () => {
    // A typo here would silently withhold nothing at all.
    for (const withheld of WITHHELD_UNIT_TYPES) {
      expect(UNIT_TYPES, withheld).toContain(withheld);
    }
  });
});

describe('listedUnitTypes', () => {
  it('drops the withheld types and keeps the order', () => {
    expect(listedUnitTypes(['Studio', 'Penthouse', 'Two Bedroom'])).toEqual([
      'Studio',
      'Two Bedroom',
    ]);
  });

  it('leaves a list with nothing withheld alone', () => {
    expect(listedUnitTypes(['Studio', 'One Bedroom'])).toEqual(['Studio', 'One Bedroom']);
  });

  it('agrees with isListedToBuyers about every type', () => {
    // Two functions, one rule. They are applied in different places — the
    // filter chips and the rows — and a screen offering a filter that matches
    // no row is how a disagreement between them would surface.
    const listed = listedUnitTypes([...UNIT_TYPES]);
    for (const unitType of UNIT_TYPES) {
      expect(listed.includes(unitType), unitType).toBe(
        isListedToBuyers({ status: 'Available', unitType }),
      );
    }
  });
});
