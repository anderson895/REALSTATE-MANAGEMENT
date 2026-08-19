import { IllegalStateTransitionError, InvalidValueError, UnitNotAvailableError } from '../errors';
import { Money } from '../value-objects/money';
import { ProjectId, ReservationNumber, UnitId } from '../value-objects/identifiers';
import { unitHeld, unitReleased, unitSold, type DomainEvent } from '../events/domain-event';

export const UNIT_TYPES = [
  'Studio',
  'One Bedroom',
  'Two Bedroom',
  'Three Bedroom',
  'Penthouse',
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/**
 * The lifecycle a unit can occupy.
 *
 * `DATABASE PROJECT.xls` also lists "Cancelled" in its status legend, but that
 * describes the *reservation* outcome. RESERVATION.doc is explicit that the
 * unit itself goes back on the market: "the condominium unit is automatically
 * returned to Available status and becomes open for reservation again."
 * A unit therefore never rests in Cancelled.
 */
export const UNIT_STATUSES = ['Available', 'On Hold', 'Sold'] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

/**
 * What a buyer — or a stranger — is allowed to see in the catalogue.
 *
 * comments.doc: "need lang maview ang available units. No need na po makita ng
 * prospect buyer/buyer ang on hold at sold. Meron lang access ng status ng unit
 * ay ang authorized employee which is Billing, documentation, marketing and
 * sales." And separately: "Wala na po munang penthouse."
 *
 * ── Why one predicate and not a filter on each page ──────────────────────
 *
 * Four buyer-facing surfaces reach units — the project page, the cross-project
 * search, a unit's own page, and the reservation wizard — and "hide it" has to
 * hold on all four or it holds on none. `status !== 'Available'` written four
 * times is three chances to forget, and the one that gets forgotten is the
 * direct link, which is exactly the one an outsider would use.
 *
 * Same shape as `isVisibleToSales` on the reservation, and for the same reason:
 * a visibility rule the client stated is business policy, so it belongs with
 * the business rules rather than in a component.
 *
 * ── Why Penthouse is a list and not a deletion ───────────────────────────
 *
 * "Wala na po muna" is *for now*. The units exist, they are priced, and Emerald
 * Park's sixth floor is five of them — withdrawing a type from sale is not the
 * same as pretending the building is shorter. Internal keeps seeing all of
 * them, so Marketing can still manage the stock and Billing can still service a
 * Penthouse already sold. Putting them back on sale means emptying this array,
 * and nothing else.
 */
export const BUYER_VISIBLE_STATUSES: readonly UnitStatus[] = ['Available'];

/** Types withdrawn from public sale. Emptying this list puts them back. */
export const WITHHELD_UNIT_TYPES: readonly string[] = ['Penthouse'];

/**
 * Whether this unit may appear in the public catalogue at all.
 *
 * Deliberately takes the loose shape rather than a `Unit`: the Portal renders
 * plain rows read straight out of Firestore and never builds the entity, so a
 * predicate demanding one would be bypassed by every caller that matters.
 */
export function isListedToBuyers(unit: {
  readonly status: string;
  readonly unitType: string;
}): boolean {
  return (
    BUYER_VISIBLE_STATUSES.includes(unit.status as UnitStatus) &&
    !WITHHELD_UNIT_TYPES.includes(unit.unitType)
  );
}

/** The unit types a buyer may still browse, in the order given. */
export function listedUnitTypes(types: readonly string[]): string[] {
  return types.filter((type) => !WITHHELD_UNIT_TYPES.includes(type));
}

export interface UnitProps {
  readonly id: UnitId;
  readonly projectId: ProjectId;
  readonly tower: string | null;
  readonly floor: number;
  readonly unitNo: string;
  readonly unitType: UnitType;
  readonly areaSqm: number;
  readonly pricePerSqm: Money;
  readonly purchasePrice: Money;
  readonly status: UnitStatus;
  readonly currentReservation: ReservationNumber | null;
}

/**
 * A condominium unit.
 *
 * `_status` is private and every change funnels through `transitionTo`. This
 * is what makes "unit marked Sold without a verified reservation" not merely
 * unlikely but unrepresentable — there is no setter to misuse.
 *
 * See Development Plan.md §3.9 and §8.4.
 */
export class Unit {
  private static readonly ALLOWED: Record<UnitStatus, readonly UnitStatus[]> = {
    Available: ['On Hold'],
    'On Hold': ['Sold', 'Available'], // Available = reservation cancelled
    Sold: ['Available'], // only via an approved cancellation
  };

  private _status: UnitStatus;
  private _currentReservation: ReservationNumber | null;
  private readonly _events: DomainEvent[] = [];

  private constructor(
    readonly id: UnitId,
    readonly projectId: ProjectId,
    readonly tower: string | null,
    readonly floor: number,
    readonly unitNo: string,
    readonly unitType: UnitType,
    readonly areaSqm: number,
    readonly pricePerSqm: Money,
    readonly purchasePrice: Money,
    status: UnitStatus,
    currentReservation: ReservationNumber | null,
  ) {
    if (areaSqm <= 0) {
      throw new InvalidValueError(`Unit ${id.value} must have a positive floor area.`);
    }
    this._status = status;
    this._currentReservation = currentReservation;
  }

  /** Builds a brand-new unit. Always starts Available. */
  static create(props: Omit<UnitProps, 'status' | 'currentReservation'>): Unit {
    return new Unit(
      props.id,
      props.projectId,
      props.tower,
      props.floor,
      props.unitNo,
      props.unitType,
      props.areaSqm,
      props.pricePerSqm,
      props.purchasePrice,
      'Available',
      null,
    );
  }

  /**
   * Rebuilds a unit from storage.
   *
   * Deliberately separate from `create`: a stored unit already satisfied the
   * creation-time rules when it was first written, and re-running them would
   * reject rows that are legitimately mid-lifecycle.
   */
  static reconstitute(props: UnitProps): Unit {
    return new Unit(
      props.id,
      props.projectId,
      props.tower,
      props.floor,
      props.unitNo,
      props.unitType,
      props.areaSqm,
      props.pricePerSqm,
      props.purchasePrice,
      props.status,
      props.currentReservation,
    );
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  get status(): UnitStatus {
    return this._status;
  }

  get currentReservation(): ReservationNumber | null {
    return this._currentReservation;
  }

  isAvailable(): boolean {
    return this._status === 'Available';
  }

  /** Unit + parking is computed by PricingService; this is the unit alone. */
  get price(): Money {
    return this.purchasePrice;
  }

  // ── Transitions ──────────────────────────────────────────────────────────

  /**
   * Available → On Hold, when a reservation passes payment verification.
   *
   * Throws `UnitNotAvailableError` rather than the generic transition error:
   * the caller is a reservation flow that needs to tell the buyer their unit
   * was taken, which is a different message from an internal bug.
   */
  hold(reservation: ReservationNumber, at: Date): void {
    if (this._status !== 'Available') {
      throw new UnitNotAvailableError(this.id.value, this._status);
    }
    this._status = 'On Hold';
    this._currentReservation = reservation;
    this._events.push(unitHeld(this.id, reservation, at));
  }

  /** On Hold → Sold, on reservation approval. */
  markSold(at: Date): void {
    this.transitionTo('Sold');
    const reservation = this._currentReservation;
    if (!reservation) {
      throw new IllegalStateTransitionError(
        this._status,
        'Sold',
        `Unit ${this.id.value} (no reservation attached)`,
      );
    }
    this._events.push(unitSold(this.id, reservation, at));
  }

  /**
   * Back to Available, after an approved cancellation.
   *
   * Never automatic. RESERVATION.doc: "The system does not automatically
   * cancel expired reservations." A human decides; this only records it.
   */
  release(reason: string, at: Date): void {
    this.transitionTo('Available');
    this._currentReservation = null;
    this._events.push(unitReleased(this.id, reason, at));
  }

  private transitionTo(next: UnitStatus): void {
    if (!Unit.ALLOWED[this._status].includes(next)) {
      throw new IllegalStateTransitionError(this._status, next, `Unit ${this.id.value}`);
    }
    this._status = next;
  }

  // ── Events ───────────────────────────────────────────────────────────────

  /** Drains recorded events. The caller persists them in the same transaction. */
  pullEvents(): DomainEvent[] {
    return this._events.splice(0, this._events.length);
  }
}
