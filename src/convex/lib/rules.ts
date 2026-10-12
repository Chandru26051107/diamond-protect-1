/**
 * DIAMOND-PROTECT :: Layer 1 — deterministic rule engine (RuleRisk 0..100).
 *
 * Rules are the fast, explainable layer that runs on every payment. Each rule
 * produces a human-readable reason so the user-facing shield can answer
 * "why did we flag this?" without any model archaeology.
 */

import {
  DEFAULT_RULES,
  RULE_CATALOGUE,
  RULE_IDS,
  clamp,
  formatDuration,
  formatInr,
  type RuleConfig,
  type RiskSignal,
} from "./types";

export type QrVerdictInput = {
  used: boolean;
  signatureValid: boolean;
  merchantMatch: boolean;
  expired: boolean;
  revoked: boolean;
  unknownMerchant: boolean;
  status: "VERIFIED" | "CAUTION" | "FAKE_TAMPERED";
  reason: string;
  merchantName: string | null;
  registeredMerchantName: string | null;
};

export type RuleInput = {
  amount: number;
  timestamp: number;
  userAvgAmount: number;
  beneficiaryAddedMsAgo: number | null;
  beneficiaryAgeDays: number;
  previousTxnsToBeneficiary: number;
  isNewBeneficiary: boolean;
  deviceChangeFlag: boolean;
  locationChangeFlag: boolean;
  payerTxnCountWindow: number;
  outflowRatio5Min: number;
  previousFraudReports: number;
  beneficiaryIsMule: boolean;
  qr: QrVerdictInput | null;
  isMerchantPayment: boolean;
  merchantKnown: boolean;
  config: RuleConfig;
};

const WEIGHTS: Record<string, number> = Object.fromEntries(
  RULE_CATALOGUE.map((rule) => [rule.id, rule.weight]),
);

type RuleDefinition = {
  id: string;
  layer?: "RULE" | "QR";
  apply: (input: RuleInput) => string | null;
};

const RULES: RuleDefinition[] = [
  {
    id: RULE_IDS.HIGH_AMOUNT,
    apply: (input) =>
      input.amount >= input.config.highAmountThreshold
        ? `Payment of ${formatInr(input.amount)} is above the high-value threshold (${formatInr(
            input.config.highAmountThreshold,
          )}).`
        : null,
  },
  {
    id: RULE_IDS.AMOUNT_ANOMALY,
    apply: (input) => {
      const baseline = Math.max(input.userAvgAmount, 250);
      if (input.amount < baseline * 5) return null;
      const multiple = input.amount / baseline;
      return `Amount is ${multiple.toFixed(1)}x higher than this account's normal payment pattern (${formatInr(
        baseline,
      )}).`;
    },
  },
  {
    id: RULE_IDS.NEW_BENEFICIARY,
    apply: (input) => {
      const windowMs = input.config.newBeneficiaryWindowHours * 3600 * 1000;
      if (!input.isNewBeneficiary) return null;
      if (input.beneficiaryAddedMsAgo === null) {
        return `Beneficiary has never received a payment from this account before.`;
      }
      if (input.beneficiaryAddedMsAgo > windowMs) return null;
      return `Beneficiary was added ${formatDuration(
        input.beneficiaryAddedMsAgo,
      )} before this payment.`;
    },
  },
  {
    id: RULE_IDS.NEW_ACCOUNT,
    apply: (input) =>
      input.beneficiaryAgeDays < 30
        ? `Beneficiary account is only ${Math.max(
            0,
            Math.round(input.beneficiaryAgeDays),
          )} day(s) old.`
        : null,
  },
  {
    id: RULE_IDS.ODD_HOUR,
    apply: (input) => {
      const hour = new Date(input.timestamp).getUTCHours();
      const ist = (hour + 5) % 24; // demo data uses IST-style hours
      return ist >= 0 && ist < 5
        ? `Payment initiated at ${String(ist).padStart(2, "0")}:00, inside the 00:00–05:00 odd-hour window.`
        : null;
    },
  },
  {
    id: RULE_IDS.DEVICE_CHANGE,
    apply: (input) =>
      input.deviceChangeFlag
        ? "Payment originated from a device this account has not used before."
        : null,
  },
  {
    id: RULE_IDS.LOCATION_ANOMALY,
    apply: (input) =>
      input.locationChangeFlag
        ? "Payment location does not match the account's usual city."
        : null,
  },
  {
    id: RULE_IDS.QR_INVALID,
    layer: "QR",
    apply: (input) =>
      input.qr && input.qr.used && !input.qr.signatureValid
        ? "QR signature verification failed. Possible tampering or fake QR."
        : null,
  },
  {
    id: RULE_IDS.QR_MERCHANT_MISMATCH,
    layer: "QR",
    apply: (input) =>
      input.qr && input.qr.used && !input.qr.merchantMatch
        ? `QR merchant name "${
            input.qr.merchantName ?? "unknown"
          }" does not match the registered merchant "${
            input.qr.registeredMerchantName ?? "unregistered"
          }".`
        : null,
  },
  {
    id: RULE_IDS.QR_EXPIRED,
    layer: "QR",
    apply: (input) =>
      input.qr && input.qr.used && input.qr.expired
        ? "Scanned QR has expired and should not be reused."
        : null,
  },
  {
    id: RULE_IDS.QR_REVOKED,
    layer: "QR",
    apply: (input) =>
      input.qr && input.qr.used && input.qr.revoked
        ? "QR was revoked by the merchant registry before this payment."
        : null,
  },
  {
    id: RULE_IDS.RAPID_TXNS,
    apply: (input) => {
      if (input.payerTxnCountWindow < 4) return null;
      return `${input.payerTxnCountWindow} payments were attempted from this account inside ${input.config.rapidTransactionWindowMin} minutes.`;
    },
  },
  {
    id: RULE_IDS.RAPID_FORWARDING,
    apply: (input) => {
      if (input.outflowRatio5Min < input.config.rapidForwardingThreshold)
        return null;
      return `${Math.round(
        input.outflowRatio5Min * 100,
      )}% of received funds were forwarded within 5 minutes.`;
    },
  },
  {
    id: RULE_IDS.MULE_NETWORK,
    apply: (input) => {
      if (input.beneficiaryIsMule) {
        return "Beneficiary matches the MuleNet money-mule behaviour profile.";
      }
      if (input.previousFraudReports >= 3) {
        return `Beneficiary has ${input.previousFraudReports} prior fraud reports on this prototype ledger.`;
      }
      return null;
    },
  },
  {
    id: RULE_IDS.UNKNOWN_MERCHANT,
    apply: (input) =>
      input.isMerchantPayment && !input.merchantKnown
        ? "Payee merchant is not present in the DIAMOND-PROTECT merchant registry."
        : null,
  },
];

function ruleName(id: string): string {
  return RULE_CATALOGUE.find((rule) => rule.id === id)?.name ?? id;
}

/** Runs every enabled rule and returns the aggregated rule risk 0..100. */
export function runRuleEngine(input: RuleInput): {
  ruleScore: number;
  signals: RiskSignal[];
} {
  const toggles = { ...DEFAULT_RULES, ...(input.config.ruleToggles ?? {}) };
  const signals: RiskSignal[] = [];
  let total = 0;

  for (const rule of RULES) {
    if (toggles[rule.id] === false) continue;
    let detail: string | null = null;
    try {
      detail = rule.apply(input);
    } catch {
      detail = null; // a broken rule must never break the payment flow
    }
    if (!detail) continue;
    const weight = WEIGHTS[rule.id] ?? 10;
    total += weight;
    signals.push({
      ruleId: rule.id,
      label: ruleName(rule.id),
      detail,
      weight,
      layer: rule.layer ?? "RULE",
    });
  }

  return { ruleScore: clamp(total), signals };
}

export function isValidUpiId(value: string): boolean {
  if (typeof value !== "string") return false;
  return /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/.test(value.trim());
}
