const prisma = require("../utils/prisma");

const SUPPORTED_CURRENCIES = ["ETB", "USD", "EUR"];

const DEFAULT_UNIT_PRICE_BY_CURRENCY = {
  ETB: 5,
  USD: 0.99,
  EUR: 0.99,
};

function roundMoney(value) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue)) return 0;
  return Number(numberValue.toFixed(2));
}

function toDecimalMoneyString(value) {
  return roundMoney(value).toFixed(2);
}

function normalizeCurrency(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "ETB" || raw === "BR" || raw === "BIRR") return "ETB";
  if (raw === "$" || raw === "USD") return "USD";
  if (raw === "€" || raw === "EUR") return "EUR";
  if (SUPPORTED_CURRENCIES.includes(raw)) return raw;
  return "USD";
}

function resolveEventCurrency(event) {
  const designCurrency = String(event?.designJson?.currency || "").trim();
  return normalizeCurrency(designCurrency);
}

async function resolveConfiguredUnitPrice(currency) {
  const normalized = normalizeCurrency(currency);
  const row = await prisma.adminCurrencyPaymentInstruction.findUnique({
    where: { currency: normalized },
    select: { unitPrice: true },
  });
  if (!row || row.unitPrice == null) return null;
  const parsed = Number(row.unitPrice);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return roundMoney(parsed);
}

async function resolveUnitPriceForCurrency(currency) {
  const normalized = normalizeCurrency(currency);
  const configured = await resolveConfiguredUnitPrice(normalized);
  if (configured != null) return configured;
  return roundMoney(DEFAULT_UNIT_PRICE_BY_CURRENCY[normalized] ?? DEFAULT_UNIT_PRICE_BY_CURRENCY.USD);
}

function readLockedEventUnitPrice(event) {
  if (!event) return null;
  if (event.billingUnitPriceSnapshot == null) return null;
  const parsed = Number(event.billingUnitPriceSnapshot);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return roundMoney(parsed);
}

async function lockEventUnitPriceIfMissing(eventId, currency) {
  const normalizedCurrency = normalizeCurrency(currency);
  const unitPrice = await resolveUnitPriceForCurrency(normalizedCurrency);
  const result = await prisma.userEvent.updateMany({
    where: { id: eventId, billingUnitPriceSnapshot: null },
    data: { billingUnitPriceSnapshot: toDecimalMoneyString(unitPrice) },
  });
  return { locked: result.count === 1, unitPrice };
}

module.exports = {
  SUPPORTED_CURRENCIES,
  DEFAULT_UNIT_PRICE_BY_CURRENCY,
  normalizeCurrency,
  resolveEventCurrency,
  resolveUnitPriceForCurrency,
  readLockedEventUnitPrice,
  lockEventUnitPriceIfMissing,
  toDecimalMoneyString,
};
