/**
 * DIAMOND-PROTECT :: shared contracts
 *
 * The same feature contract is used by the synthetic data generator, the
 * in-app model trainer, the live scoring path and the explanation renderer.
 * Keeping it in one module is what makes the prototype explainable end to end.
 *
 * Prototype notice: every value handled here is SYNTHETIC demo data. Nothing in
 * this project talks to UPI, NPCI, a bank or any real financial system.
 */

export type FeatureKey =
  | "amount"
  | "hourOfDay"
  | "beneficiaryAccountAgeDays"
  | "previousTxnsToBeneficiary"
  | "isNewBeneficiary"
  | "deviceChangeFlag"
  | "locationChangeFlag"
  | "qrValid"
  | "qrMerchantMatch"
  | "senderCountLast10Min"
  | "outflowRatio5Min"
  | "previousFraudReports";

export type FeatureVector = Record<FeatureKey, number>;

export const FEATURES: { key: FeatureKey; label: string; unit?: string }[] = [
  { key: "amount", label: "Transaction amount", unit: "INR" },
  { key: "hourOfDay", label: "Hour of day", unit: "h" },
  {
    key: "beneficiaryAccountAgeDays",
    label: "Beneficiary account age",
    unit: "days",
  },
  {
    key: "previousTxnsToBeneficiary",
    label: "Previous payments to beneficiary",
  },
  { key: "isNewBeneficiary", label: "First-time beneficiary" },
  { key: "deviceChangeFlag", label: "New / changed device" },
  { key: "locationChangeFlag", label: "Unusual location" },
  { key: "qrValid", label: "QR signature valid" },
  { key: "qrMerchantMatch", label: "QR merchant match" },
  { key: "senderCountLast10Min", label: "Senders in last 10 min" },
  { key: "outflowRatio5Min", label: "5-min outflow ratio" },
  { key: "previousFraudReports", label: "Prior fraud reports" },
];

export const FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  FEATURES.map((feature) => [feature.key, feature.label]),
);

export type Layer = "RULE" | "ML" | "GRAPH" | "QR";

export type RiskSignal = {
  ruleId: string;
  label: string;
  detail: string;
  weight: number;
  layer: Layer;
};

export type RuleConfig = {
  highRiskThreshold: number;
  mlThreshold: number;
  newBeneficiaryWindowHours: number;
  rapidTransactionWindowMin: number;
  rapidForwardingThreshold: number;
  graphSensitivity: number;
  highAmountThreshold: number;
  ruleToggles: Record<string, boolean>;
  qrValidityMinutes: number;
};

export const RULE_IDS = {
  HIGH_AMOUNT: "R01",
  AMOUNT_ANOMALY: "R02",
  NEW_BENEFICIARY: "R03",
  NEW_ACCOUNT: "R04",
  ODD_HOUR: "R05",
  DEVICE_CHANGE: "R06",
  LOCATION_ANOMALY: "R07",
  QR_INVALID: "R08",
  QR_MERCHANT_MISMATCH: "R09",
  QR_EXPIRED: "R10",
  QR_REVOKED: "R11",
  RAPID_TXNS: "R12",
  RAPID_FORWARDING: "R13",
  MULE_NETWORK: "R14",
  UNKNOWN_MERCHANT: "R15",
} as const;

export const RULE_CATALOGUE: {
  id: string;
  name: string;
  weight: number;
  description: string;
  enabledByDefault: boolean;
}[] = [
  {
    id: RULE_IDS.HIGH_AMOUNT,
    name: "High-value payment",
    weight: 12,
    description: "Amount crosses the configured high-value threshold.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.AMOUNT_ANOMALY,
    name: "Amount anomaly vs history",
    weight: 16,
    description: "Amount is many times larger than the payer's normal spend.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.NEW_BENEFICIARY,
    name: "New beneficiary",
    weight: 18,
    description: "Beneficiary was added inside the new-beneficiary window.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.NEW_ACCOUNT,
    name: "Fresh beneficiary account",
    weight: 14,
    description: "Beneficiary account is itself very new.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.ODD_HOUR,
    name: "Odd-hour transaction",
    weight: 10,
    description: "Payment initiated between 00:00 and 05:00.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.DEVICE_CHANGE,
    name: "Device change",
    weight: 12,
    description: "Payment came from a device not seen before.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.LOCATION_ANOMALY,
    name: "Location anomaly",
    weight: 14,
    description: "Payment location differs from the payer's usual city.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.QR_INVALID,
    name: "QR signature invalid",
    weight: 30,
    description: "HMAC signature of the scanned QR payload does not verify.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.QR_MERCHANT_MISMATCH,
    name: "QR merchant mismatch",
    weight: 25,
    description: "Merchant details in the QR do not match the registry.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.QR_EXPIRED,
    name: "Expired QR",
    weight: 12,
    description: "QR is past its expiry timestamp.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.QR_REVOKED,
    name: "Revoked QR",
    weight: 22,
    description: "QR was revoked by the registry before this payment.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.RAPID_TXNS,
    name: "Rapid payment burst",
    weight: 16,
    description: "Several payments from the same account in a short window.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.RAPID_FORWARDING,
    name: "Rapid forwarding",
    weight: 18,
    description: "Beneficiary forwards most of the received money immediately.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.MULE_NETWORK,
    name: "Mule network linkage",
    weight: 22,
    description: "Beneficiary is linked to known mule-network behaviour.",
    enabledByDefault: true,
  },
  {
    id: RULE_IDS.UNKNOWN_MERCHANT,
    name: "Unregistered merchant",
    weight: 10,
    description: "Payee merchant is not present in the QR registry.",
    enabledByDefault: true,
  },
];

export const DEFAULT_RULES: Record<string, boolean> = Object.fromEntries(
  RULE_CATALOGUE.map((rule) => [rule.id, rule.enabledByDefault]),
);

export const DEFAULT_CONFIG: RuleConfig = {
  highRiskThreshold: 55,
  mlThreshold: 0.6,
  newBeneficiaryWindowHours: 24,
  rapidTransactionWindowMin: 10,
  rapidForwardingThreshold: 0.75,
  graphSensitivity: 1,
  highAmountThreshold: 25000,
  ruleToggles: DEFAULT_RULES,
  qrValidityMinutes: 30,
};

export const CATEGORY_META = {
  DIAMOND_SAFE: {
    label: "Diamond Safe",
    headline: "Proceed Safely",
    action: "Proceed safely — nothing unusual detected.",
    tone: "safe",
  },
  DIAMOND_CAUTION: {
    label: "Diamond Caution",
    headline: "Verify Before You Pay",
    action: "Verify the beneficiary before releasing funds.",
    tone: "caution",
  },
  DIAMOND_ALERT: {
    label: "Diamond Alert",
    headline: "Do Not Pay",
    action: "Do not pay. Verify the merchant through an official channel.",
    tone: "alert",
  },
} as const;

export type RiskCategory = keyof typeof CATEGORY_META;

export function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function categoryFromScore(score: number): RiskCategory {
  if (score >= 80) return "DIAMOND_SAFE";
  if (score >= 55) return "DIAMOND_CAUTION";
  return "DIAMOND_ALERT";
}

export function decisionFromScore(score: number, threshold: number) {
  if (score < threshold) return "DO_NOT_PAY" as const;
  if (score >= 80) return "PROCEED" as const;
  if (score >= 65) return "VERIFY_BENEFICIARY" as const;
  return "EXTRA_AUTH" as const;
}

export function decisionLabel(decision: string): string {
  switch (decision) {
    case "PROCEED":
      return "Proceed";
    case "VERIFY_BENEFICIARY":
      return "Verify Beneficiary";
    case "EXTRA_AUTH":
      return "Add Extra Authentication";
    case "DO_NOT_PAY":
      return "Do Not Pay";
    default:
      return decision;
  }
}

/** Locale-independent INR formatting (Indian digit grouping: 1,23,456.78). */
export function formatInr(amount: number): string {
  const safe = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100;
  const negative = safe < 0;
  const [whole, fraction] = Math.abs(safe).toFixed(2).split(".");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest
    ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`
    : last3;
  const decimals = fraction === "00" ? "" : `.${fraction}`;
  return `${negative ? "-" : ""}₹${grouped}${decimals}`;
}

/** "42 seconds" / "8 minutes" / "3 hours" — plain English duration. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}
