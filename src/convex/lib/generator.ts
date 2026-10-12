/**
 * DIAMOND-PROTECT :: synthetic data generator (part 1 — directory).
 *
 * Produces a realistic-looking UPI directory for the demo: 500 customers,
 * 60 merchants and 300 HMAC-signed QR codes, with mule-cluster membership
 * baked in so the MuleNet graph has something real to find.
 *
 * 100% synthetic. No real UPI, NPCI, bank or customer data is used anywhere.
 */

import { mulberry32, sha256Hex } from "./crypto";
import { buildSignedPayload, simulateQrTampering, type QrPayload, type TamperMode } from "./qrShield";
import type { RuleConfig } from "./types";

export const SEED = 20260214;
export const USER_COUNT = 500;
export const MERCHANT_COUNT = 60;
export const QR_COUNT = 300;
export const TXN_COUNT = 8000;
export const CASE_COUNT = 120;
export const MULE_CLUSTERS = 20;
export const DAY = 86400000;

export type Rng = () => number;

export function makeRandom(seed: number): Rng {
  return mulberry32(seed);
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function randFloat(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

export function nonceFor(parts: (string | number)[]): string {
  return sha256Hex(parts.join("|")).slice(0, 16);
}

const FIRST_NAMES = [
  "Aarav", "Vivaan", "Aditya", "Arjun", "Kabir", "Ishaan", "Rahul", "Rohit",
  "Amit", "Suresh", "Deepak", "Manish", "Naveen", "Kiran", "Sanjay", "Vikram",
  "Ananya", "Diya", "Aadhya", "Saanvi", "Kiara", "Myra", "Anika", "Riya",
  "Neha", "Priya", "Pooja", "Sneha", "Meera", "Kavya", "Ritu", "Anita",
  "Sunita", "Farhan", "Imran", "Zoya", "Ayesha", "Rohan", "Siddharth", "Nikhil",
  "Harsh", "Yash", "Tanvi", "Ishita", "Nisha", "Divya", "Rehan", "Aryan",
];

const LAST_NAMES = [
  "Sharma", "Verma", "Gupta", "Patel", "Reddy", "Nair", "Iyer", "Singh",
  "Kumar", "Das", "Bose", "Mehta", "Shah", "Rao", "Joshi", "Mishra",
  "Chauhan", "Kapoor", "Malhotra", "Bhatt", "Pillai", "Menon", "Chopra",
  "Saxena", "Yadav", "Kulkarni", "Desai", "Jain", "Agarwal", "Banerjee",
];

export const CITIES = [
  "Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Pune", "Chennai", "Kolkata",
  "Ahmedabad", "Jaipur", "Lucknow", "Surat", "Indore", "Kochi", "Chandigarh",
];

const UPI_HANDLES = ["diamondbank", "upidemo", "paydemo"];

export type UserSeed = {
  userId: string;
  name: string;
  upiId: string;
  city: string;
  createdAt: number;
  accountAgeDays: number;
  avgAmount: number;
  fraudReports: number;
  deviceId: string;
  role: "NORMAL" | "HUB" | "SENDER" | "RECEIVER";
  cluster: number;
};

export type MerchantSeed = {
  merchantId: string;
  merchantName: string;
  upiId: string;
  category: string;
  city: string;
  isVerified: boolean;
  status: "ACTIVE" | "REVOKED" | "SUSPENDED";
  qrSecretVersion: number;
  registeredAt: number;
};

export type QrDoc = {
  qrId: string;
  merchantId: string;
  merchantName: string;
  upiId: string;
  amount: number;
  createdAt: number;
  expiresAt: number;
  nonce: string;
  version: number;
  signature: string;
  payload: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "TAMPERED";
  isTampered: boolean;
  tamperMode?: string;
  city: string;
};

const CATEGORIES: { name: string; nouns: string[] }[] = [
  { name: "Grocery", nouns: ["Grocery Mart", "Kirana Store", "Fresh Basket"] },
  { name: "Restaurant", nouns: ["Kitchen", "Dhaba", "Family Restaurant"] },
  { name: "Fuel", nouns: ["Fuel Station", "Petro Point", "Energy Pump"] },
  { name: "Pharmacy", nouns: ["Pharmacy", "Medical Store", "Chemist"] },
  { name: "Electronics", nouns: ["Electronics", "Mobile World", "Digital Hub"] },
  { name: "Cafe", nouns: ["Cafe", "Coffee House", "Tea Point"] },
  { name: "Salon", nouns: ["Salon", "Beauty Studio", "Grooming Lounge"] },
  { name: "Retail", nouns: ["Fashion Store", "Bazaar", "Collection"] },
  { name: "Transport", nouns: ["Cabs", "Travels", "Logistics"] },
  { name: "Healthcare", nouns: ["Clinic", "Diagnostics", "Care Centre"] },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
}

export function generateUsers(now: number): UserSeed[] {
  const rng = makeRandom(SEED + 11);
  const users: UserSeed[] = [];

  for (let index = 0; index < USER_COUNT; index++) {
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    const name = `${first} ${last}`;
    const isNewAccount = rng() < 0.28;
    const accountAgeDays = isNewAccount ? randInt(rng, 2, 45) : randInt(rng, 90, 1600);
    users.push({
      userId: `USR${pad(index + 1, 4)}`,
      name,
      upiId: `${slugify(name)}${pad(index + 1, 3)}@${pick(rng, UPI_HANDLES)}`,
      city: pick(rng, CITIES),
      createdAt: now - accountAgeDays * DAY,
      accountAgeDays,
      avgAmount: randInt(rng, 300, 4200),
      fraudReports: rng() < 0.045 ? randInt(rng, 1, 6) : 0,
      deviceId: `DEV-${nonceFor(["device", index]).slice(0, 6).toUpperCase()}`,
      role: "NORMAL",
      cluster: -1,
    });
  }

  // ---- Money-mule clusters --------------------------------------------
  // 20 clusters, each with a RING OF 3 COLLECTORS so the documented MuleNet
  // profile is genuinely satisfied: every collector has >= 6 inbound and
  // >= 4 outbound edges, forwards ~86% of what it receives within minutes,
  // and is connected to at least 2 other suspicious accounts.
  for (let cluster = 0; cluster < MULE_CLUSTERS; cluster++) {
    const hubIndex = 8 + cluster * 24;
    for (let offset = 0; offset <= 2; offset++) {
      const idx = hubIndex + offset;
      if (idx >= USER_COUNT) break;
      users[idx].role = "HUB";
      users[idx].cluster = cluster;
      users[idx].accountAgeDays = randInt(rng, 20, 380);
      users[idx].fraudReports = randInt(rng, 2, 6);
    }
    for (let offset = 3; offset <= 12; offset++) {
      const idx = hubIndex + offset;
      if (idx >= USER_COUNT) break;
      users[idx].role = "SENDER";
      users[idx].cluster = cluster;
    }
    for (let offset = 13; offset <= 15; offset++) {
      const idx = hubIndex + offset;
      if (idx >= USER_COUNT) break;
      users[idx].role = "RECEIVER";
      users[idx].cluster = cluster;
      users[idx].accountAgeDays = randInt(rng, 15, 600);
      users[idx].fraudReports = randInt(rng, 0, 3);
    }
  }

  return users;
}

export function generateMerchants(now: number): MerchantSeed[] {
  const rng = makeRandom(SEED + 22);
  const merchants: MerchantSeed[] = [];

  for (let index = 0; index < MERCHANT_COUNT; index++) {
    const category = CATEGORIES[index % CATEGORIES.length];
    const owner = pick(rng, LAST_NAMES);
    const merchantName = `${owner} ${pick(rng, category.nouns)}`;
    const status: MerchantSeed["status"] =
      index % 29 === 7 ? "REVOKED" : index % 31 === 5 ? "SUSPENDED" : "ACTIVE";
    merchants.push({
      merchantId: `MER${pad(index + 1, 4)}`,
      merchantName,
      upiId: `${slugify(merchantName)}${pad(index + 1, 3)}@merchant`,
      category: category.name,
      city: pick(rng, CITIES),
      isVerified: index % 23 !== 3,
      status,
      qrSecretVersion: 1 + (index % 3),
      registeredAt: now - randInt(rng, 120, 1800) * DAY,
    });
  }

  return merchants;
}

export function generateQrCodes(
  merchants: MerchantSeed[],
  now: number,
  config: RuleConfig,
): QrDoc[] {
  const rng = makeRandom(SEED + 33);
  // Seeded QR codes have to stay demo-usable for a whole hackathon day, so they
  // are minted with a long validity window regardless of the 30-minute rule
  // config value, which keeps governing QRs minted live from the QR registry.
  const validityMs = Math.max(24 * 60, config.qrValidityMinutes) * 60000;
  const MAX_ACTIVE_AGE_MS = 90 * 60000;
  const codes: QrDoc[] = [];

  for (let index = 0; index < QR_COUNT; index++) {
    const merchant = merchants[index % merchants.length];
    const roll = rng();
    let status: QrDoc["status"] = "ACTIVE";
    if (roll < 0.22) status = "TAMPERED";
    else if (roll < 0.37) status = "EXPIRED";
    else if (roll < 0.45) status = "REVOKED";

    const createdAt =
      status === "EXPIRED" || status === "REVOKED"
        ? now - randInt(rng, 2, 20) * DAY
        : now - randInt(rng, 60000, MAX_ACTIVE_AGE_MS);

    const amount = rng() < 0.6 ? 0 : randInt(rng, 40, 6000);
    const payload: QrPayload = {
      merchant_id: merchant.merchantId,
      merchant_name: merchant.merchantName,
      upi_id: merchant.upiId,
      amount,
      created_at: createdAt,
      expires_at: createdAt + validityMs,
      nonce: nonceFor(["qr", index, merchant.merchantId, createdAt]),
      version: 1,
    };
    const { canonical, signature } = buildSignedPayload(payload);

    let storedPayload = canonical;
    let storedSignature = signature;
    let isTampered = false;
    let tamperMode: string | undefined;

    if (status === "TAMPERED") {
      const modes: TamperMode[] = ["merchant_name", "amount", "upi_id", "signature", "missing_field"];
      const mode = modes[index % modes.length];
      const tampered = simulateQrTampering(payload, signature, mode);
      storedPayload = tampered.payload;
      storedSignature = tampered.signature;
      isTampered = true;
      tamperMode = mode;
    }

    codes.push({
      qrId: `QR${pad(index + 1, 5)}`,
      merchantId: merchant.merchantId,
      merchantName: merchant.merchantName,
      upiId: merchant.upiId,
      amount,
      createdAt,
      expiresAt: payload.expires_at,
      nonce: payload.nonce,
      version: payload.version,
      signature: storedSignature,
      payload: storedPayload,
      status,
      isTampered,
      tamperMode,
      city: merchant.city,
    });
  }

  return codes;
}
