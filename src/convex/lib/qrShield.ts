/**
 * DIAMOND-PROTECT :: QR Shield — HMAC-SHA256 signed merchant QR codes.
 *
 * Static UPI QR codes are trivially copyable, so a fraudster can print a
 * look-alike sticker, swap the payee VPA and keep the merchant's branding.
 * DIAMOND-PROTECT signs the whole merchant payload instead of trusting what is
 * printed on the sticker, then verifies merchant identity, expiry and payload
 * integrity before a single rupee moves.
 */

import { canonicalJson, safeEqual, signQrPayload, DEMO_QR_SECRET } from "./crypto";

export const QR_VERSION_SUPPORTED = 1;

export type QrPayload = {
  merchant_id: string;
  merchant_name: string;
  upi_id: string;
  amount: number;
  created_at: number;
  expires_at: number;
  nonce: string;
  version: number;
};

export type QrCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type QrVerificationResult = {
  valid: boolean;
  status: "VERIFIED" | "CAUTION" | "FAKE_TAMPERED";
  riskLevel: "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK";
  reason: string;
  merchantMatch: boolean;
  signatureValid: boolean;
  expired: boolean;
  revoked: boolean;
  unknownMerchant: boolean;
  checks: QrCheck[];
  payload: QrPayload | null;
  registeredMerchantName: string | null;
  recommendedAction: string;
};

export type MerchantRecord = {
  merchantId: string;
  merchantName: string;
  upiId: string;
  status: "ACTIVE" | "REVOKED" | "SUSPENDED";
};

const REQUIRED_FIELDS: (keyof QrPayload)[] = [
  "merchant_id",
  "merchant_name",
  "upi_id",
  "amount",
  "created_at",
  "expires_at",
  "nonce",
  "version",
];

export function buildSignedPayload(payload: QrPayload): {
  canonical: string;
  signature: string;
} {
  const canonical = canonicalJson(payload);
  return { canonical, signature: signQrPayload(canonical, DEMO_QR_SECRET) };
}

function fail(
  reason: string,
  checks: QrCheck[],
  partial: Partial<QrVerificationResult> = {},
): QrVerificationResult {
  return {
    valid: false,
    status: "FAKE_TAMPERED",
    riskLevel: "HIGH_RISK",
    reason,
    merchantMatch: false,
    signatureValid: false,
    expired: false,
    revoked: false,
    unknownMerchant: false,
    checks,
    payload: null,
    registeredMerchantName: null,
    recommendedAction:
      "Do not pay. Scan the original merchant QR or verify with the merchant.",
    ...partial,
  };
}

/**
 * Registry state of the exact QR code being scanned (as opposed to the
 * merchant credential). A code can be revoked on its own, e.g. when a merchant
 * reports a stolen sticker batch.
 */
export type QrRegistryState = {
  status?: string | null;
  qrId?: string | null;
};

/**
 * Verifies a scanned QR payload against the merchant registry.
 * Never throws: malformed input always comes back as a FAKE_TAMPERED verdict.
 */
export function verifyQrPayload(
  rawPayload: unknown,
  signature: string | null | undefined,
  merchants: MerchantRecord[],
  now: number,
  qrState?: QrRegistryState | null,
): QrVerificationResult {
  const checks: QrCheck[] = [];

  // 1. Parse --------------------------------------------------------------
  let payload: Record<string, unknown> | null = null;
  if (typeof rawPayload === "string") {
    const text = rawPayload.trim();
    if (text.length === 0) {
      return fail("QR payload is empty. This QR cannot be trusted.", [
        { name: "Payload readable", passed: false, detail: "No payload data received." },
      ]);
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      payload = null;
    }
    if (!payload) {
      return fail(
        "QR payload is not valid JSON. Possible tampering or fake QR.",
        [
          {
            name: "Payload readable",
            passed: false,
            detail: "Payload could not be decoded as JSON.",
          },
        ],
      );
    }
  } else if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    payload = rawPayload as Record<string, unknown>;
  } else {
    return fail("QR payload is missing. This QR cannot be trusted.", [
      { name: "Payload readable", passed: false, detail: "No payload received." },
    ]);
  }

  checks.push({
    name: "Payload readable",
    passed: true,
    detail: "QR payload decoded successfully.",
  });

  // 2. Required fields ---------------------------------------------------
  const missing = REQUIRED_FIELDS.filter(
    (field) => payload![field] === undefined || payload![field] === null || payload![field] === "",
  );
  if (missing.length > 0) {
    checks.push({
      name: "Required fields present",
      passed: false,
      detail: `Missing field(s): ${missing.join(", ")}.`,
    });
    return fail(
      `QR is missing required field(s): ${missing.join(", ")}. Possible tampering or fake QR.`,
      checks,
    );
  }
  checks.push({
    name: "Required fields present",
    passed: true,
    detail: "All 8 signed fields are present.",
  });

  const typed = payload as unknown as QrPayload;
  const merchantId = String(typed.merchant_id);
  const merchantName = String(typed.merchant_name);
  const upiId = String(typed.upi_id);
  const amount = Number(typed.amount);
  const expiresAt = Number(typed.expires_at);
  const version = Number(typed.version);

  // 3. Amount sanity ------------------------------------------------------
  checks.push({
    name: "Amount valid",
    passed: Number.isFinite(amount) && amount >= 0,
    detail:
      Number.isFinite(amount) && amount >= 0
        ? amount === 0
          ? "Open-amount QR (customer enters the amount)."
          : `Amount encoded as ₹${amount}.`
        : "Amount is not a valid non-negative number.",
  });
  if (!Number.isFinite(amount) || amount < 0) {
    return fail("QR amount is malformed. Possible tampering or fake QR.", checks);
  }

  // 4. Version ------------------------------------------------------------
  const versionOk = version === QR_VERSION_SUPPORTED;
  checks.push({
    name: "QR version supported",
    passed: versionOk,
    detail: versionOk
      ? `Payload version v${version}.`
      : `Unsupported payload version v${version}. Expected v${QR_VERSION_SUPPORTED}.`,
  });

  // 5. Registry lookup ----------------------------------------------------
  const merchant = merchants.find((entry) => entry.merchantId === merchantId) ?? null;
  const unknownMerchant = merchant === null;
  checks.push({
    name: "Merchant registered",
    passed: !unknownMerchant,
    detail: unknownMerchant
      ? `Merchant ID ${merchantId} is not present in the registry.`
      : `Merchant ${merchant!.merchantName} found in registry.`,
  });

  const merchantRevoked = merchant ? merchant.status === "REVOKED" : false;
  const qrRevoked = qrState?.status === "REVOKED";
  const revoked = merchantRevoked || qrRevoked;
  checks.push({
    name: "QR not revoked",
    passed: !revoked,
    detail: revoked
      ? qrRevoked
        ? `QR ${qrState?.qrId ?? "code"} was revoked by the merchant registry. Do not pay.`
        : "QR / merchant credential was revoked by the registry."
      : "Merchant credential is active.",
  });

  const nameMatch = merchant ? merchant.merchantName === merchantName : false;
  const upiMatch = merchant ? merchant.upiId === upiId : false;
  const merchantMatch = nameMatch && upiMatch;
  checks.push({
    name: "Merchant identity match",
    passed: merchantMatch,
    detail: merchant
      ? merchantMatch
        ? `Name and VPA match the registered merchant (${merchant.merchantName}).`
        : `QR says "${merchantName}" / ${upiId} but registry has "${merchant.merchantName}" / ${merchant.upiId}.`
      : "Cannot match identity for an unregistered merchant.",
  });

  // 6. Signature ----------------------------------------------------------
  const expectedSignature = signQrPayload(canonicalJson(typed), DEMO_QR_SECRET);
  const signatureValid =
    typeof signature === "string" &&
    signature.length > 0 &&
    safeEqual(signature, expectedSignature);
  checks.push({
    name: "HMAC-SHA256 signature",
    passed: signatureValid,
    detail: signatureValid
      ? "Signature matches the canonical payload (integrity intact)."
      : "Signature verification failed — payload was modified or was never signed by this registry.",
  });

  // 7. Expiry -------------------------------------------------------------
  const expired = Number.isFinite(expiresAt) && now > expiresAt;
  checks.push({
    name: "QR not expired",
    passed: !expired,
    detail: expired
      ? `QR expired ${Math.max(1, Math.round((now - expiresAt) / 60000))} minute(s) ago.`
      : "QR is inside its validity window.",
  });

  const allCriticalPass =
    signatureValid &&
    merchantMatch &&
    !unknownMerchant &&
    !revoked &&
    version === QR_VERSION_SUPPORTED;

  if (!allCriticalPass) {
    let reason: string;
    if (!signatureValid && merchantMatch) {
      reason = "QR signature verification failed. Possible tampering or fake QR.";
    } else if (unknownMerchant) {
      reason = "QR merchant is not registered. Possible fake QR sticker.";
    } else if (revoked) {
      reason = "QR was revoked by the merchant registry. Do not pay.";
    } else if (!merchantMatch) {
      reason =
        "QR merchant details do not match the registered merchant. Possible payment redirection.";
    } else {
      reason = "Unsupported QR version. This QR cannot be trusted.";
    }
    return fail(reason, checks, {
      merchantMatch,
      signatureValid,
      expired,
      revoked,
      unknownMerchant,
      payload: typed,
      registeredMerchantName: merchant ? merchant.merchantName : null,
    });
  }

  if (expired) {
    return {
      valid: false,
      status: "CAUTION",
      riskLevel: "MEDIUM_RISK",
      reason: "QR has expired. Ask the merchant to display a fresh signed QR.",
      merchantMatch: true,
      signatureValid: true,
      expired: true,
      revoked: false,
      unknownMerchant: false,
      checks,
      payload: typed,
      registeredMerchantName: merchant ? merchant.merchantName : null,
      recommendedAction:
        "Reject this QR and ask the merchant to generate a new one before paying.",
    };
  }

  return {
    valid: true,
    status: "VERIFIED",
    riskLevel: "LOW_RISK",
    reason: "QR is authentic, unexpired and matches the registered merchant.",
    merchantMatch: true,
    signatureValid: true,
    expired: false,
    revoked: false,
    unknownMerchant: false,
    checks,
    payload: typed,
    registeredMerchantName: merchant ? merchant.merchantName : null,
    recommendedAction: "QR verified. You can safely continue to risk scoring.",
  };
}

export type TamperMode =
  | "merchant_name"
  | "amount"
  | "upi_id"
  | "expired"
  | "signature"
  | "missing_field";

export const TAMPER_MODES: { mode: TamperMode; label: string; description: string }[] = [
  {
    mode: "merchant_name",
    label: "Impersonate merchant name",
    description: "Swaps the printed merchant name for a look-alike brand.",
  },
  {
    mode: "amount",
    label: "Inflate amount",
    description: "Rewrites the amount to a much larger value.",
  },
  {
    mode: "upi_id",
    label: "Redirect payee VPA",
    description: "Points the payment at a mule-controlled VPA.",
  },
  {
    mode: "expired",
    label: "Backdate expiry",
    description: "Pushes the expiry timestamp into the past.",
  },
  {
    mode: "signature",
    label: "Forge signature",
    description: "Keeps the payload but corrupts the HMAC signature.",
  },
  {
    mode: "missing_field",
    label: "Strip a signed field",
    description: "Removes a mandatory field from the payload.",
  },
];

const LOOKALIKE = ["Sharma", "Gupta", "Paytm", "Verified", "Official", "Express"];

/**
 * Simulates a real-world QR attack so judges can watch detection happen live.
 * Returns the tampered payload + the (deliberately wrong) signature.
 */
export function simulateQrTampering(
  payload: QrPayload,
  signature: string,
  mode: TamperMode,
): { payload: string; signature: string; mode: TamperMode; summary: string } {
  const clone: Record<string, unknown> = { ...payload };
  let summary = "";

  switch (mode) {
    case "merchant_name": {
      const original = String(clone.merchant_name ?? "Merchant");
      const impostor = `${original} ${
        LOOKALIKE[Math.floor(Math.abs(original.length) % LOOKALIKE.length)]
      }`;
      clone.merchant_name = impostor;
      summary = `Merchant name rewritten from "${original}" to "${impostor}".`;
      break;
    }
    case "amount": {
      const original = Number(clone.amount ?? 0);
      const inflated = original > 0 ? Math.round(original * 12) : 49999;
      clone.amount = inflated;
      summary = `Amount rewritten from ₹${original} to ₹${inflated}.`;
      break;
    }
    case "upi_id": {
      const original = String(clone.upi_id ?? "");
      const parts = original.split("@");
      const impostor = `mule${Math.abs(original.length * 37) % 900 + 100}@${
        parts[1] ?? "diamondbank"
      }`;
      clone.upi_id = impostor;
      summary = `Payee VPA rewritten from ${original} to ${impostor}.`;
      break;
    }
    case "expired": {
      clone.expires_at = Date.now() - 1000 * 60 * 45;
      summary = "Expiry timestamp pushed 45 minutes into the past.";
      break;
    }
    case "signature": {
      summary = "Payload left untouched but the HMAC signature was forged.";
      return {
        payload: canonicalJson(clone),
        signature: `dps1_${"x".repeat(22)}`,
        mode,
        summary,
      };
    }
    case "missing_field":
    default: {
      delete clone.merchant_id;
      summary = "Signed field merchant_id stripped from the payload.";
      break;
    }
  }

  // Re-signing with the demo secret would look "valid", so the tampered QR
  // keeps the ORIGINAL signature — exactly what happens with a reprinted
  // sticker whose payload was edited after signing.
  return { payload: canonicalJson(clone), signature, mode, summary };
}
