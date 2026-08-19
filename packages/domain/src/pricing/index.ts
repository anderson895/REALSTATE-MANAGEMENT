export {
  DiscountStrategy,
  DiscountStrategyFactory,
  DEFAULT_DISCOUNT_SCHEDULE,
  DISCOUNT_BASES,
  DOWN_PAYMENT_TIERS,
  isDownPaymentTier,
  validateDiscountSchedule,
  type DiscountBase,
  type DiscountRule,
  type DiscountSchedule,
  type DownPaymentTier,
} from './discount-strategy';

export {
  PricingService,
  pricingService,
  PAYMENT_TERMS,
  FINANCING_OPTIONS,
  type PaymentTerm,
  type FinancingOption,
  type PricingInput,
  type PaymentSummary,
} from './pricing.service';
