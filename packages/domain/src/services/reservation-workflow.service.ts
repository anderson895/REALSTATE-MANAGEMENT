import { BusinessRuleViolationError } from '../errors';
import { Reservation, type ReservationTerms } from '../entities/reservation';
import type {
  IAuditLogger,
  IReservationRepository,
  IUnitOfWork,
  IUnitRepository,
} from '../repositories/ports';
import type {
  ClientId,
  EmployeeId,
  ParkingSlotId,
  ReservationNumber,
  UnitId,
} from '../value-objects/identifiers';

export interface SubmitReservationInput {
  readonly clientId: ClientId;
  readonly unitId: UnitId;
  readonly parkingSlotId: ParkingSlotId | null;
  readonly salesAgentId: string | null;
  readonly terms: ReservationTerms;
  readonly at: Date;
}

/**
 * Orchestrates the reservation lifecycle across the Reservation and Unit
 * entities, keeping the two in step inside one transaction.
 *
 * Every dependency is an interface. In production the composition root injects
 * Firestore implementations; in tests, in-memory fakes. The entities exercised
 * are the real ones either way, so the rules under test are the shipped rules
 * (Development Plan.md §5.6.3, §11.1).
 */
export class ReservationWorkflowService {
  constructor(
    private readonly units: IUnitRepository,
    private readonly reservations: IReservationRepository,
    private readonly audit: IAuditLogger,
    private readonly uow: IUnitOfWork,
  ) {}

  /**
   * Submits a reservation.
   *
   * The unit is NOT held here. RESERVATION.doc puts the hold after Account
   * Receivables verifies the fee: "Once the payment has been verified and
   * approved, the selected unit is automatically tagged as On Hold."
   * Submitting only records intent.
   */
  async submit(input: SubmitReservationInput): Promise<ReservationNumber> {
    return this.uow.execute(async (ctx) => {
      const unit = await this.units.findById(input.unitId, ctx);
      if (!unit) {
        throw new BusinessRuleViolationError(`Unit ${input.unitId.value} does not exist.`);
      }
      if (!unit.isAvailable()) {
        throw new BusinessRuleViolationError(
          `Unit ${input.unitId.value} is ${unit.status} and cannot be reserved.`,
        );
      }

      const number = await this.reservations.nextNumber(input.at.getFullYear(), ctx);
      const reservation = Reservation.create({
        number,
        clientId: input.clientId,
        unitId: input.unitId,
        parkingSlotId: input.parkingSlotId,
        salesAgentId: input.salesAgentId,
        terms: input.terms,
        reservedAt: input.at,
      });

      await this.reservations.save(reservation, ctx);
      await this.audit.record(reservation.pullEvents(), input.clientId.value, ctx);

      return number;
    });
  }

  /**
   * Account Receivables verifies the reservation fee.
   * This is the step that takes the unit off the market.
   */
  async verifyPayment(number: ReservationNumber, by: EmployeeId, at: Date): Promise<void> {
    return this.uow.execute(async (ctx) => {
      const reservation = await this.mustFind(number, ctx);
      const unit = await this.units.findById(reservation.unitId, ctx);
      if (!unit) {
        throw new BusinessRuleViolationError(`Unit ${reservation.unitId.value} does not exist.`);
      }

      reservation.verifyPayment(by, at);
      unit.hold(number, at); // throws UnitNotAvailableError if taken meanwhile

      await this.reservations.save(reservation, ctx);
      await this.units.save(unit, ctx);
      await this.audit.record(
        [...reservation.pullEvents(), ...unit.pullEvents()],
        by.value,
        ctx,
      );
    });
  }

  async verifyDocuments(number: ReservationNumber, by: EmployeeId, at: Date): Promise<void> {
    return this.uow.execute(async (ctx) => {
      const reservation = await this.mustFind(number, ctx);
      reservation.verifyDocuments(by, at);
      await this.reservations.save(reservation, ctx);
      await this.audit.record(reservation.pullEvents(), by.value, ctx);
    });
  }

  /** Supervisor approval. Flips the unit to Sold in the same transaction. */
  async approve(
    number: ReservationNumber,
    by: EmployeeId,
    isSupervisor: boolean,
    at: Date,
  ): Promise<void> {
    return this.uow.execute(async (ctx) => {
      const reservation = await this.mustFind(number, ctx);
      const unit = await this.units.findById(reservation.unitId, ctx);
      if (!unit) {
        throw new BusinessRuleViolationError(`Unit ${reservation.unitId.value} does not exist.`);
      }

      reservation.approve(by, isSupervisor, at);
      unit.markSold(at);

      await this.reservations.save(reservation, ctx);
      await this.units.save(unit, ctx);
      await this.audit.record(
        [...reservation.pullEvents(), ...unit.pullEvents()],
        by.value,
        ctx,
      );
    });
  }

  async noteDeficiency(
    number: ReservationNumber,
    reason: string,
    by: EmployeeId,
    at: Date,
  ): Promise<void> {
    return this.uow.execute(async (ctx) => {
      const reservation = await this.mustFind(number, ctx);
      reservation.noteDeficiency(reason, by, at);
      await this.reservations.save(reservation, ctx);
      await this.audit.record(reservation.pullEvents(), by.value, ctx);
    });
  }

  /**
   * Moves a lapsed reservation into the Expired Reservation Report.
   * Does NOT cancel and does NOT release the unit — that needs a human
   * decision with management approval (§8.4).
   */
  async markExpired(number: ReservationNumber, at: Date): Promise<void> {
    return this.uow.execute(async (ctx) => {
      const reservation = await this.mustFind(number, ctx);
      if (!reservation.isDeficiencyOverdue(at)) {
        throw new BusinessRuleViolationError(
          `Reservation ${number.value} is not past its deficiency deadline.`,
        );
      }
      reservation.markExpired(at);
      await this.reservations.save(reservation, ctx);
      await this.audit.record(reservation.pullEvents(), 'system', ctx);
    });
  }

  /**
   * Manual cancellation. Requires two distinct employees, and only from
   * Expired. Returns the unit to Available.
   */
  async cancel(
    number: ReservationNumber,
    by: EmployeeId,
    approvedBy: EmployeeId,
    reason: string,
    at: Date,
  ): Promise<void> {
    return this.uow.execute(async (ctx) => {
      const reservation = await this.mustFind(number, ctx);
      const unit = await this.units.findById(reservation.unitId, ctx);
      if (!unit) {
        throw new BusinessRuleViolationError(`Unit ${reservation.unitId.value} does not exist.`);
      }

      reservation.cancel(by, approvedBy, reason, at);
      unit.release(reason, at);

      await this.reservations.save(reservation, ctx);
      await this.units.save(unit, ctx);
      await this.audit.record(
        [...reservation.pullEvents(), ...unit.pullEvents()],
        by.value,
        ctx,
      );
    });
  }

  private async mustFind(
    number: ReservationNumber,
    ctx: Parameters<Parameters<IUnitOfWork['execute']>[0]>[0],
  ): Promise<Reservation> {
    const reservation = await this.reservations.findByNumber(number, ctx);
    if (!reservation) {
      throw new BusinessRuleViolationError(`Reservation ${number.value} does not exist.`);
    }
    return reservation;
  }
}
