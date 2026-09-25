// Single source for Pro price COPY shown to learners. Copy only: purchase logic, RevenueCat product ids and
// the server-side amounts (novo-subscription PLANS, 9900 / 69900 paise) are untouched — proPricing.test.ts
// fails if this copy ever drifts from them.
export const PRO_MONTHLY_INR = 99;
export const PRO_ANNUAL_INR = 699;

export const PRO_PRICE_SHORT = `₹${PRO_MONTHLY_INR}/month or ₹${PRO_ANNUAL_INR}/year`;
/** Footer line under upgrade buttons. */
export const PRO_PRICE_LINE = `${PRO_PRICE_SHORT} · Cancel anytime`;

/** The annual plan's monthly equivalent — must always be labelled as such, never as the monthly price. */
export const ANNUAL_EQUIVALENT_PER_MONTH_INR = Math.round(PRO_ANNUAL_INR / 12);   // 58
export const ANNUAL_PLAN_SUBLABEL = `per year · about ₹${ANNUAL_EQUIVALENT_PER_MONTH_INR}/month on the annual plan`;

export const ANNUAL_SAVINGS_PCT = Math.round((1 - PRO_ANNUAL_INR / (PRO_MONTHLY_INR * 12)) * 100);   // 41
