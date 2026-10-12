/**
 * DIAMOND-PROTECT :: frontend presentation helpers.
 */

export type Tone =
  | "safe"
  | "caution"
  | "alert"
  | "info"
  | "diamond"
  | "sun"
  | "neutral"
  | "dark";

export const TONE_BG: Record<Tone, string> = {
  safe: "bg-[#10B981] text-[#0A0A0A]",
  caution: "bg-[#F59E0B] text-[#0A0A0A]",
  alert: "bg-[#EF4444] text-white",
  info: "bg-[#22D3EE] text-[#0A0A0A]",
  diamond: "bg-[#7DD3FC] text-[#0A0A0A]",
  sun: "bg-[#FDE047] text-[#0A0A0A]",
  neutral: "bg-white text-[#0A0A0A]",
  dark: "bg-[#0A0A0A] text-[#F4F1EA]",
};

export const TONE_HEX: Record<Tone, string> = {
  safe: "#10B981",
  caution: "#F59E0B",
  alert: "#EF4444",
  info: "#22D3EE",
  diamond: "#7DD3FC",
  sun: "#FDE047",
  neutral: "#FFFFFF",
  dark: "#0A0A0A",
};

export const CATEGORY_META = {
  DIAMOND_SAFE: {
    label: "Diamond Safe",
    short: "SAFE",
    headline: "Proceed Safely",
    tone: "safe" as Tone,
    blurb: "Every layer agrees this payment matches normal behaviour.",
  },
  DIAMOND_CAUTION: {
    label: "Diamond Caution",
    short: "CAUTION",
    headline: "Verify Before You Pay",
    tone: "caution" as Tone,
    blurb: "Some signals fired. Confirm the payee before releasing funds.",
  },
  DIAMOND_ALERT: {
    label: "Diamond Alert",
    short: "ALERT",
    headline: "Do Not Pay",
    tone: "alert" as Tone,
    blurb: "High-risk pattern detected before the money left the account.",
  },
} as const;

export type CategoryKey = keyof typeof CATEGORY_META;

export function categoryTone(category?: string | null): Tone {
  if (category === "DIAMOND_SAFE") return "safe";
  if (category === "DIAMOND_CAUTION") return "caution";
  if (category === "DIAMOND_ALERT") return "alert";
  return "neutral";
}

export function scoreTone(score: number): Tone {
  if (score >= 80) return "safe";
  if (score >= 55) return "caution";
  return "alert";
}

export function decisionTone(decision?: string | null): Tone {
  switch (decision) {
    case "PROCEED":
      return "safe";
    case "VERIFY_BENEFICIARY":
      return "caution";
    case "EXTRA_AUTH":
      return "sun";
    case "DO_NOT_PAY":
      return "alert";
    default:
      return "neutral";
  }
}

export function decisionLabel(decision?: string | null): string {
  switch (decision) {
    case "PROCEED":
      return "Proceed";
    case "VERIFY_BENEFICIARY":
      return "Verify beneficiary";
    case "EXTRA_AUTH":
      return "Extra authentication";
    case "DO_NOT_PAY":
      return "Do not pay";
    default:
      return "Unknown";
  }
}

export function accountStatusTone(status?: string | null): Tone {
  switch (status) {
    case "NORMAL":
      return "neutral";
    case "SUSPICIOUS":
      return "caution";
    case "MULE_SUSPECT":
      return "alert";
    case "BLOCKED":
      return "dark";
    case "UNDER_REVIEW":
      return "sun";
    case "CLEARED":
      return "safe";
    default:
      return "neutral";
  }
}

export function accountStatusLabel(status?: string | null): string {
  switch (status) {
    case "MULE_SUSPECT":
      return "Mule suspect";
    case "UNDER_REVIEW":
      return "Under review";
    default:
      return (status ?? "UNKNOWN").replace(/_/g, " ").toLowerCase();
  }
}

export function qrStatusTone(status?: string | null): Tone {
  switch (status) {
    case "VERIFIED":
    case "ACTIVE":
      return "safe";
    case "CAUTION":
    case "EXPIRED":
      return "caution";
    case "FAKE_TAMPERED":
    case "TAMPERED":
    case "REVOKED":
      return "alert";
    default:
      return "neutral";
  }
}

export function caseStatusTone(status?: string | null): Tone {
  switch (status) {
    case "NEW":
      return "info";
    case "INVESTIGATING":
      return "sun";
    case "ESCALATED":
      return "alert";
    case "RESOLVED":
      return "safe";
    case "FALSE_POSITIVE":
      return "neutral";
    default:
      return "neutral";
  }
}

export function indianGroup(value: number): string {
  const fixed = Math.abs(Math.round(value)).toString();
  if (fixed.length <= 3) return fixed;
  const last3 = fixed.slice(-3);
  const rest = fixed.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
}

/** ₹1,23,456 */
export function formatInr(value: number | undefined | null): string {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `₹${indianGroup(safe)}`;
}

/** ₹1.2L / ₹3.4Cr — for KPI tiles where space is tight. */
export function formatInrShort(value: number | undefined | null): string {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (Math.abs(safe) >= 10000000) return `₹${(safe / 10000000).toFixed(2)}Cr`;
  if (Math.abs(safe) >= 100000) return `₹${(safe / 100000).toFixed(2)}L`;
  if (Math.abs(safe) >= 1000) return `₹${(safe / 1000).toFixed(1)}K`;
  return `₹${Math.round(safe)}`;
}

export function formatCount(value: number | undefined | null): string {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return indianGroup(safe);
}

export function formatDateTime(ts?: number | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatTime(ts?: number | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function timeAgo(ts?: number | null): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function durationLabel(seconds?: number | null): string {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 90) return `${Math.round(value)}s`;
  if (value < 5400) return `${Math.round(value / 60)} min`;
  if (value < 172800) return `${(value / 3600).toFixed(1)} h`;
  return `${Math.round(value / 86400)} d`;
}

export function initials(name?: string | null): string {
  if (!name) return "DP";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Cities used by the synthetic demo directory. */
export const CITY_OPTIONS = [
  "Mumbai",
  "Delhi",
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "Chennai",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "Lucknow",
  "Surat",
  "Indore",
  "Kochi",
  "Chandigarh",
];

export const CATEGORY_OPTIONS = [
  "Grocery",
  "Restaurant",
  "Fuel",
  "Pharmacy",
  "Electronics",
  "Cafe",
  "Salon",
  "Retail",
  "Transport",
  "Healthcare",
];

export const PATTERN_LABELS: Record<string, string> = {
  NORMAL: "Normal payment",
  LIVE_SCORING: "Live scoring",
  HIGH_VALUE_FRAUD: "High-value fraud",
  NEW_BENEFICIARY_FRAUD: "New-beneficiary fraud",
  RAPID_PAYMENTS: "Rapid payment burst",
  ODD_HOUR_FRAUD: "Odd-hour fraud",
  DEVICE_CHANGE_FRAUD: "Device-change fraud",
  LOCATION_ANOMALY_FRAUD: "Location-anomaly fraud",
  FAKE_QR: "Fake QR sticker",
  TAMPERED_QR: "Tampered QR",
  MERCHANT_IMPERSONATION: "Merchant impersonation",
  MULE_INFLOW: "Mule-account inflow",
  RAPID_FORWARDING: "Rapid forwarding",
};

export function patternLabel(pattern?: string | null): string {
  if (!pattern) return "—";
  return PATTERN_LABELS[pattern] ?? pattern.replace(/_/g, " ").toLowerCase();
}
