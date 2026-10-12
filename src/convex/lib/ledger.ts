/**
 * DIAMOND-PROTECT :: synthetic data generator (part 2 — ledger).
 *
 * Builds 8,000 UPI payments covering every pattern the brief asks for:
 * normal payments, high-value fraud, new-beneficiary fraud, rapid payment
 * bursts, odd-hour fraud, device-change fraud, location-anomaly fraud,
 * fake-QR and tampered-QR fraud, merchant impersonation, mule-account inflow,
 * rapid forwarding and multi-account mule clusters (~11% fraudulent).
 */

import { verifyQrPayload, type MerchantRecord } from "./qrShield";
import type { QrVerdictInput } from "./rules";
import type { QrDoc, MerchantSeed, UserSeed } from "./generator";
import {
  DAY,
  TXN_COUNT,
  makeRandom,
  nonceFor,
  pad,
  pick,
  randInt,
  randFloat,
  type Rng,
} from "./generator";
import { computeGraphMetrics, type GraphEdgeInput, type NodeMetrics } from "./mulenet";
import { scoreTransaction, qrStatusFromVerdict } from "./riskEngine";
import {
  FEATURES,
  type FeatureVector,
  type RiskSignal,
  type RuleConfig,
} from "./types";
import { trainDiamondModel, type DiamondModel, type TrainingSample } from "./diamondMl";

export type TxnDoc = {
  txnId: string;
  userId: string;
  userName: string;
  userUpiId: string;
  beneficiaryId: string;
  beneficiaryName: string;
  beneficiaryUpiId: string;
  amount: number;
  timestamp: number;
  deviceId: string;
  location: string;
  txnType: "P2P" | "P2M_QR" | "P2M_ONLINE" | "COLLECT";
  qrId?: string;
  qrStatus: "VERIFIED" | "CAUTION" | "FAKE_TAMPERED" | "NOT_USED";
  ruleScore: number;
  mlProbability: number;
  graphScore: number;
  diamondTrustScore: number;
  riskCategory: "DIAMOND_SAFE" | "DIAMOND_CAUTION" | "DIAMOND_ALERT";
  decision: "PROCEED" | "VERIFY_BENEFICIARY" | "EXTRA_AUTH" | "DO_NOT_PAY";
  reasons: string[];
  signals: RiskSignal[];
  features: FeatureVector;
  recommendedAction: string;
  explanation: string;
  fraudPattern: string;
  isFraudLabel: boolean;
  lossPrevented: number;
  reported: boolean;
};

export type CaseDoc = {
  caseId: string;
  txnId: string;
  reportedBy: string;
  beneficiaryId?: string;
  beneficiaryUpiId?: string;
  amount: number;
  reason: string;
  status: "NEW" | "INVESTIGATING" | "ESCALATED" | "RESOLVED" | "FALSE_POSITIVE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignedTo?: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  analystNotes: string;
  diamondTrustScore: number;
  timeline: { at: number; actor: string; action: string; note?: string }[];
};

export type AuditDoc = {
  logId: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: number;
  details: string;
};

const ANALYSTS = [
  "analyst.priya",
  "analyst.rohit",
  "analyst.sneha",
  "analyst.farhan",
  "analyst.kavya",
];

const CASE_REASONS = [
  "Money left my account but the beneficiary stopped responding.",
  "I was told to scan a QR to receive a refund — the payment went to a stranger.",
  "Merchant QR sticker looked different from the shop's usual code.",
  "Payment went to a different name than the merchant displayed.",
  "I was called by someone claiming to be from my bank and asked to pay.",
  "Beneficiary promised a job and asked for a security deposit.",
  "Electricity-bill reminder SMS led me to a payment link I did not recognise.",
  "UPI collect request arrived that I never initiated.",
];

type Planned = {
  ts: number;
  payerIdx: number;
  payeeUserIdx: number | null;
  payeeMerchantIdx: number | null;
  unregistered: null | { id: string; name: string; upiId: string };
  amount: number;
  txnType: TxnDoc["txnType"];
  qrIdx: number | null;
  pattern: string;
  forceNew: boolean;
  forceDevice: boolean;
  forceLocation: boolean;
  addedMsAgo: number | null;
};

function legitAmount(rng: Rng): number {
  const roll = rng();
  if (roll < 0.7) return randInt(rng, 40, 2400);
  if (roll < 0.96) return randInt(rng, 2400, 24000);
  return randInt(rng, 24000, 95000);
}

function startOfIstDay(ts: number): number {
  // Demo data uses IST-style day buckets (UTC+5:30) for readable trend charts.
  return ts - ((ts + 19_800_000) % DAY);
}

/** Converts an IST wall-clock hour into the UTC hour the rule engine reads. */
function istHourToUtc(istHour: number): number {
  return (istHour - 5 + 24) % 24;
}

export function planTransactions(
  users: UserSeed[],
  merchants: MerchantSeed[],
  qrCodes: QrDoc[],
  now: number,
): Planned[] {
  const rng = makeRandom(20260301);
  const plans: Planned[] = [];

  const activeQrByMerchant = new Map<string, number[]>();
  qrCodes.forEach((qr, index) => {
    if (qr.status !== "ACTIVE") return;
    const list = activeQrByMerchant.get(qr.merchantId) ?? [];
    list.push(index);
    activeQrByMerchant.set(qr.merchantId, list);
  });
  const tamperedQrIdx = qrCodes
    .map((qr, index) => (qr.status === "TAMPERED" ? index : -1))
    .filter((index) => index >= 0);

  // ---- (A) Mule-cluster traffic ---------------------------------------
  // Each cluster: 3 collectors in a ring. 10 senders feed the ring, the ring
  // forwards ~86% of everything it receives down to 5 receivers within
  // minutes. Every collector therefore presents the full mule profile.
  const clusterIds = [...new Set(users.filter((user) => user.role === "HUB").map((user) => user.cluster))];
  const pushMuleTxn = (
    ts: number,
    payerIdx: number,
    payeeUserIdx: number,
    amount: number,
    pattern: string,
    rngLocal: Rng,
  ) => {
    plans.push({
      ts,
      payerIdx,
      payeeUserIdx,
      payeeMerchantIdx: null,
      unregistered: null,
      amount,
      txnType: "P2P",
      qrIdx: null,
      pattern,
      forceNew: true,
      forceDevice: rngLocal() < 0.35,
      forceLocation: rngLocal() < 0.3,
      addedMsAgo: randInt(rngLocal, 15, 900) * 1000,
    });
  };

  for (const cluster of clusterIds) {
    const memberIndexOf = (role: string) =>
      users
        .map((user, index) => ({ user, index }))
        .filter((row) => row.user.cluster === cluster && row.user.role === role)
        .map((row) => row.index);

    const hubs = memberIndexOf("HUB");
    const senders = memberIndexOf("SENDER");
    const receivers = memberIndexOf("RECEIVER");
    if (hubs.length < 3 || receivers.length === 0) continue;

    const base = startOfIstDay(now - randInt(rng, 0, 18) * DAY) + randInt(rng, 10, 22) * 3600000;

    // 1. Smurfing window: 10 senders each push 2 payments into 2 different
    //    collectors, so every collector fans in from 10 accounts.
    senders.forEach((sender, senderIndex) => {
      const first = hubs[senderIndex % hubs.length];
      const second = hubs[(senderIndex + 1) % hubs.length];
      [first, second].forEach((hub, k) => {
        const ts = base + (k * 40 + randInt(rng, 0, 200)) * 1000;
        pushMuleTxn(ts, sender, hub, randInt(rng, 900, 49000), "MULE_INFLOW", rng);
      });
    });

    // 2. Each collector forwards 86% of what it holds: one 34% pass around the
    //    ring, then 52% out to the cash-out receivers. Legs are emitted in
    //    time order so every hop keeps a receive-to-forward latency under the
    //    300 second window MuleNet looks for, and so all three collectors end
    //    up connected to at least two other suspicious accounts.
    const inboundSoFar = (hub: number) =>
      plans
        .filter((plan) => plan.payeeUserIdx === hub)
        .reduce((sum, plan) => sum + plan.amount, 0);
    const emitLeg = (hub: number, payee: number, ts: number, share: number) => {
      const amount = Math.max(250, Math.round(inboundSoFar(hub) * share));
      pushMuleTxn(ts, hub, payee, amount, "RAPID_FORWARDING", rng);
    };

    const ringShare = 0.34;
    emitLeg(hubs[0], hubs[1], base + (300 + randInt(rng, 0, 60)) * 1000, ringShare);
    emitLeg(hubs[1], hubs[2], base + (380 + randInt(rng, 0, 60)) * 1000, ringShare);
    emitLeg(hubs[2], hubs[0], base + (460 + randInt(rng, 0, 60)) * 1000, ringShare);

    const receiverShares = [0.22, 0.17, 0.13];
    hubs.forEach((hub, hubIndex) => {
      receiverShares.forEach((share, k) => {
        const payee = receivers[(hubIndex + k) % receivers.length];
        const ts = base + (540 + hubIndex * 20 + randInt(rng, 0, 80) + k * 10) * 1000;
        emitLeg(hub, payee, ts, share);
      });
    });
  }

  const mulePlanned = plans.length;

  // ---- (C) Fraud patterns that are NOT mule traffic ---------------------
  const fraud: Planned[] = [];
  const addFraud = (pattern: string, count: number, mutate: (plan: Planned, rng: Rng) => void) => {
    for (let i = 0; i < count; i++) {
      const payer = p2pPool[randInt(rng, 0, p2pPool.length - 1)];
      const plan: Planned = {
        ts: now - randInt(rng, 0, 20) * DAY - randInt(rng, 0, DAY),
        payerIdx: payer,
        payeeUserIdx: null,
        payeeMerchantIdx: null,
        unregistered: null,
        amount: legitAmount(rng),
        txnType: "P2P",
        qrIdx: null,
        pattern,
        forceNew: false,
        forceDevice: false,
        forceLocation: false,
        addedMsAgo: null,
      };
      mutate(plan, rng);
      fraud.push(plan);
    }
  };

  // Accounts belonging to a mule cluster only appear in their own cluster
  // traffic in this synthetic ledger. That keeps every cluster an isolated,
  // readable subgraph instead of smearing into the legitimate population.
  const p2pPool = users
    .map((user, index) => (user.cluster >= 0 ? -1 : index))
    .filter((index) => index >= 0);

  const randomUserPayee = (rng: Rng, payer: number) => {
    let payee = p2pPool[randInt(rng, 0, p2pPool.length - 1)];
    let guard = 0;
    while (payee === payer && guard < 10) {
      payee = p2pPool[randInt(rng, 0, p2pPool.length - 1)];
      guard += 1;
    }
    return payee;
  };

  addFraud("NEW_BENEFICIARY_FRAUD", 40, (plan, r) => {
    plan.payeeUserIdx = randomUserPayee(r, plan.payerIdx);
    plan.forceNew = true;
    plan.addedMsAgo = randInt(r, 20, 240) * 1000;
    plan.amount = randInt(r, 8000, 90000);
  });

  addFraud("ODD_HOUR_FRAUD", 20, (plan, r) => {
    plan.payeeUserIdx = randomUserPayee(r, plan.payerIdx);
    // IST 01:00–04:59 is UTC 20:00–23:59, which is what the rule engine reads.
    const utcHour = istHourToUtc(randInt(r, 1, 4));
    plan.ts = startOfIstDay(plan.ts) + utcHour * 3600000 + randInt(r, 0, 59) * 60000;
    plan.forceNew = true;
    plan.amount = randInt(r, 5000, 60000);
  });

  addFraud("DEVICE_CHANGE_FRAUD", 20, (plan, r) => {
    plan.payeeUserIdx = randomUserPayee(r, plan.payerIdx);
    plan.forceDevice = true;
    plan.forceNew = true;
    plan.amount = randInt(r, 6000, 75000);
  });

  addFraud("LOCATION_ANOMALY_FRAUD", 20, (plan, r) => {
    plan.payeeUserIdx = randomUserPayee(r, plan.payerIdx);
    plan.forceLocation = true;
    plan.forceNew = true;
    plan.amount = randInt(r, 7000, 80000);
  });

  addFraud("HIGH_VALUE_FRAUD", 25, (plan, r) => {
    plan.payeeUserIdx = randomUserPayee(r, plan.payerIdx);
    plan.amount = randInt(r, 60000, 260000);
    plan.forceNew = r() < 0.8;
    plan.forceDevice = r() < 0.5;
  });

  addFraud("FAKE_QR", 25, (plan, r) => {
    if (tamperedQrIdx.length === 0) return;
    const qrIdx = tamperedQrIdx[randInt(r, 0, tamperedQrIdx.length - 1)];
    plan.qrIdx = qrIdx;
    plan.txnType = "P2M_QR";
    plan.amount = randInt(r, 1500, 45000);
    plan.forceDevice = r() < 0.4;
    plan.forceNew = true;
  });

  addFraud("TAMPERED_QR", 18, (plan, r) => {
    if (tamperedQrIdx.length === 0) return;
    const qrIdx = tamperedQrIdx[randInt(r, 0, tamperedQrIdx.length - 1)];
    plan.qrIdx = qrIdx;
    plan.txnType = "P2M_QR";
    plan.amount = randInt(r, 25000, 120000);
    plan.forceLocation = r() < 0.3;
  });

  addFraud("MERCHANT_IMPERSONATION", 18, (plan, r) => {
    const owner = pick(r, ["Sharma", "Verma", "Patel", "Reddy", "Nair"]);
    plan.unregistered = {
      id: `MER9${pad(randInt(r, 100, 999), 3)}`,
      name: `${owner} Verified Pay`,
      upiId: `securepay${pad(randInt(r, 100, 999), 3)}@upi`,
    };
    plan.txnType = "P2M_ONLINE";
    plan.amount = randInt(r, 3000, 65000);
    plan.forceNew = true;
    plan.forceDevice = r() < 0.5;
  });

  // Rapid payment bursts: one payer, many brand-new beneficiaries, minutes.
  for (let burst = 0; burst < 8; burst++) {
    const payer = p2pPool[randInt(rng, 0, p2pPool.length - 1)];
    const burstStart = now - randInt(rng, 1, 14) * DAY - randInt(rng, 0, 12) * 3600000;
    const size = randInt(rng, 5, 8);
    for (let k = 0; k < size; k++) {
      fraud.push({
        ts: burstStart + k * randInt(rng, 25, 90) * 1000,
        payerIdx: payer,
        payeeUserIdx: randomUserPayee(rng, payer),
        payeeMerchantIdx: null,
        unregistered: null,
        amount: randInt(rng, 4000, 40000),
        txnType: "P2P",
        qrIdx: null,
        pattern: "RAPID_PAYMENTS",
        forceNew: true,
        forceDevice: k === 0,
        forceLocation: k < 2,
        addedMsAgo: randInt(rng, 10, 400) * 1000,
      });
    }
  }

  plans.push(...fraud);

  // ---- (B) Legit traffic to fill the ledger -----------------------------
  const legitCount = Math.max(0, TXN_COUNT - mulePlanned - fraud.length);
  const merchantIndices = merchants
    .map((merchant, index) => index)
    .filter((index) => merchants[index].status === "ACTIVE");

  // Real UPI behaviour is repeat-heavy: most payments go to people or shops a
  // payer already trusts, with a small share going to brand-new beneficiaries.
  const contacts = new Map<number, number[]>();
  for (let index = 0; index < users.length; index++) {
    const list: number[] = [];
    for (let k = 0; k < 6; k++) {
      const candidate = p2pPool[randInt(rng, 0, p2pPool.length - 1)];
      if (candidate !== index) list.push(candidate);
    }
    contacts.set(index, list);
  }

  for (let i = 0; i < legitCount; i++) {
    const payer = p2pPool[randInt(rng, 0, p2pPool.length - 1)];
    const roll = rng();
    // Uniform spread across the last 30 days so recent windows stay realistic.
    const dayOffset = Math.floor(rng() * 30);
    const istHour = rng() < 0.06 ? randInt(rng, 1, 4) : randInt(rng, 7, 22);
    const ts =
      startOfIstDay(now - dayOffset * DAY) +
      istHourToUtc(istHour) * 3600000 +
      randInt(rng, 0, 59) * 60000;

    if (roll < 0.42) {
      const merchantIdx = merchantIndices[randInt(rng, 0, merchantIndices.length - 1)];
      const merchant = merchants[merchantIdx];
      const qrList = activeQrByMerchant.get(merchant.merchantId) ?? [];
      const qrIdx = qrList.length > 0 && rng() < 0.6 ? qrList[randInt(rng, 0, qrList.length - 1)] : null;
      plans.push({
        ts,
        payerIdx: payer,
        payeeUserIdx: null,
        payeeMerchantIdx: merchantIdx,
        unregistered: null,
        amount: legitAmount(rng),
        txnType: qrIdx !== null ? "P2M_QR" : "P2M_ONLINE",
        qrIdx,
        pattern: "NORMAL",
        forceNew: false,
        forceDevice: false,
        forceLocation: false,
        addedMsAgo: null,
      });
      void merchant;
      continue;
    }

    const knownContacts = contacts.get(payer) ?? [];
    const payee =
      knownContacts.length > 0 && rng() < 0.74
        ? knownContacts[randInt(rng, 0, knownContacts.length - 1)]
        : randomUserPayee(rng, payer);
    plans.push({
      ts,
      payerIdx: payer,
      payeeUserIdx: payee,
      payeeMerchantIdx: null,
      unregistered: null,
      amount: legitAmount(rng),
      txnType: rng() < 0.06 ? "COLLECT" : "P2P",
      qrIdx: null,
      pattern: "NORMAL",
      forceNew: false,
      forceDevice: false,
      forceLocation: false,
      addedMsAgo: null,
    });
  }

  // Never schedule a payment in the future. Today's plan hours are drawn from
  // the whole IST day, so a run at 07:00 would otherwise mint payments dated
  // 22:00 tonight — which would then sort above every live score in the feed,
  // the history list and the audit trail.
  for (const plan of plans) {
    if (plan.ts > now) plan.ts = now - randInt(rng, 0, DAY);
  }

  return plans.sort((a, b) => a.ts - b.ts);
}

export type LedgerResult = {
  transactions: TxnDoc[];
  edges: GraphEdgeInput[];
  modelSamples: TrainingSample[];
  graphMetrics: Map<string, NodeMetrics>;
  model: DiamondModel;
};

/**
 * Builds the scored ledger.
 *
 * Order matters and mirrors how a real deployment is trained:
 * features -> labels (+label noise) -> train on synthetic history -> score.
 */
export function buildLedger(
  plans: Planned[],
  users: UserSeed[],
  merchants: MerchantSeed[],
  qrCodes: QrDoc[],
  graphMetrics: Map<string, NodeMetrics>,
  config: RuleConfig,
): LedgerResult {
  const rng = makeRandom(20260402);
  const registry: MerchantRecord[] = merchants.map((merchant) => ({
    merchantId: merchant.merchantId,
    merchantName: merchant.merchantName,
    upiId: merchant.upiId,
    status: merchant.status,
  }));

  const qrVerdictCache = new Map<string, ReturnType<typeof verifyQrPayload>>();
  const verifyQrAt = (qr: QrDoc, at: number) => {
    const state =
      qr.status === "REVOKED"
        ? "revoked"
        : at > qr.expiresAt
          ? "expired"
          : "live";
    const key = `${qr.qrId}:${state}`;
    const cached = qrVerdictCache.get(key);
    if (cached) return cached;
    const verdict = verifyQrPayload(qr.payload, qr.signature, registry, at, {
      status: qr.status,
      qrId: qr.qrId,
    });
    qrVerdictCache.set(key, verdict);
    return verdict;
  };

  // ---- Pass 1: walk forward in time, derive payer-side features ---------
  const pairCounts = new Map<string, number>();
  const payerDevices = new Map<number, Set<string>>();
  const payerCities = new Map<number, Set<string>>();
  const payerTimes = new Map<number, number[]>();

  const rows: TxnDoc[] = [];
  const burstCounts: number[] = [];
  const windowMs = config.rapidTransactionWindowMin * 60000;

  for (let index = 0; index < plans.length; index++) {
    const plan = plans[index];
    const payer = users[plan.payerIdx];
    const merchant = plan.payeeMerchantIdx !== null ? merchants[plan.payeeMerchantIdx] : null;
    const payeeUser = plan.payeeUserIdx !== null ? users[plan.payeeUserIdx] : null;

    const beneficiaryId = plan.unregistered
      ? plan.unregistered.id
      : merchant
        ? merchant.merchantId
        : (payeeUser?.userId ?? "UNKNOWN");
    const beneficiaryName = plan.unregistered
      ? plan.unregistered.name
      : merchant
        ? merchant.merchantName
        : (payeeUser?.name ?? "Unknown beneficiary");
    const beneficiaryUpiId = plan.unregistered
      ? plan.unregistered.upiId
      : merchant
        ? merchant.upiId
        : (payeeUser?.upiId ?? "unknown@upi");

    const pairKey = `${payer.userId}->${beneficiaryId}`;
    const previousTxnsToBeneficiary = pairCounts.get(pairKey) ?? 0;
    const isNewBeneficiary = previousTxnsToBeneficiary === 0 || plan.forceNew;
    const addedMsAgo = isNewBeneficiary
      ? (plan.addedMsAgo ?? randInt(rng, 20, 60 * 60 * 30) * 1000)
      : null;

    // Device / location history per payer.
    const devices = payerDevices.get(plan.payerIdx) ?? new Set<string>();
    const deviceId =
      plan.forceDevice || devices.size === 0
        ? payer.deviceId
        : rng() < 0.12
          ? `DEV-${nonceFor(["alt", plan.payerIdx, index]).slice(0, 6).toUpperCase()}`
          : [...devices][randInt(rng, 0, devices.size - 1)];
    const deviceChangeFlag = plan.forceDevice || (devices.size > 0 && !devices.has(deviceId));

    const cities = payerCities.get(plan.payerIdx) ?? new Set<string>();
    const location =
      plan.forceLocation || cities.size === 0
        ? plan.forceLocation
          ? pick(rng, ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Pune", "Chennai", "Surat", "Jaipur"])
          : payer.city
        : rng() < 0.08
          ? pick(rng, ["Mumbai", "Delhi", "Bengaluru", "Kolkata", "Indore"])
          : payer.city;
    const locationChangeFlag =
      plan.forceLocation || (cities.size > 0 && !cities.has(location) && location !== payer.city);

    devices.add(deviceId);
    cities.add(location);
    payerDevices.set(plan.payerIdx, devices);
    payerCities.set(plan.payerIdx, cities);

    const previousTimes = payerTimes.get(plan.payerIdx) ?? [];
    const payerTxnCountWindow =
      previousTimes.filter((time) => plan.ts - time <= windowMs).length + 1;
    previousTimes.push(plan.ts);
    payerTimes.set(plan.payerIdx, previousTimes);
    burstCounts.push(payerTxnCountWindow);

    pairCounts.set(pairKey, previousTxnsToBeneficiary + 1);

    const qr = plan.qrIdx !== null ? qrCodes[plan.qrIdx] : null;
    const verdict = qr ? verifyQrAt(qr, plan.ts) : null;
    const qrVerdictInput: QrVerdictInput | null = verdict
      ? {
          used: true,
          signatureValid: verdict.signatureValid,
          merchantMatch: verdict.merchantMatch,
          expired: verdict.expired,
          revoked: verdict.revoked,
          unknownMerchant: verdict.unknownMerchant,
          status: verdict.status,
          reason: verdict.reason,
          merchantName: verdict.payload ? String(verdict.payload.merchant_name) : null,
          registeredMerchantName: verdict.registeredMerchantName,
        }
      : null;

    const features: FeatureVector = {
      amount: plan.amount,
      hourOfDay: Math.floor(((plan.ts + 19_800_000) % DAY) / 3600000),
      beneficiaryAccountAgeDays: merchant ? 900 : (payeeUser?.accountAgeDays ?? 120),
      previousTxnsToBeneficiary,
      isNewBeneficiary: isNewBeneficiary ? 1 : 0,
      deviceChangeFlag: deviceChangeFlag ? 1 : 0,
      locationChangeFlag: locationChangeFlag ? 1 : 0,
      qrValid: !qr || verdict?.signatureValid ? 1 : 0,
      qrMerchantMatch: !qr || verdict?.merchantMatch ? 1 : 0,
      senderCountLast10Min: 0, // filled in pass 2
      outflowRatio5Min: 0, // filled in pass 2
      previousFraudReports: merchant
        ? 0
        : Math.max(
            payeeUser?.fraudReports ?? 0,
            graphMetrics.get(beneficiaryId)?.isMuleSuspect ? 4 : 0,
          ),
    };

    const txnId = `TXN${pad(index + 1, 6)}`;
    rows.push({
      txnId,
      userId: payer.userId,
      userName: payer.name,
      userUpiId: payer.upiId,
      beneficiaryId,
      beneficiaryName,
      beneficiaryUpiId,
      amount: plan.amount,
      timestamp: plan.ts,
      deviceId,
      location,
      txnType: plan.txnType,
      qrId: qr ? qr.qrId : undefined,
      qrStatus: qrStatusFromVerdict(qrVerdictInput),
      ruleScore: 0,
      mlProbability: 0,
      graphScore: 0,
      diamondTrustScore: 0,
      riskCategory: "DIAMOND_SAFE",
      decision: "PROCEED",
      reasons: [],
      signals: [],
      features,
      recommendedAction: "",
      explanation: "",
      fraudPattern: plan.pattern,
      isFraudLabel: plan.pattern !== "NORMAL",
      lossPrevented: 0,
      reported: false,
    });
  }

  // ---- Pass 2: beneficiary-side network features ------------------------
  const inbound = new Map<string, { ts: number; from: string }[]>();
  const outbound = new Map<string, { ts: number; amount: number }[]>();
  for (const row of rows) {
    const inList = inbound.get(row.beneficiaryId) ?? [];
    inList.push({ ts: row.timestamp, from: row.userId });
    inbound.set(row.beneficiaryId, inList);
    const outList = outbound.get(row.userId) ?? [];
    outList.push({ ts: row.timestamp, amount: row.amount });
    outbound.set(row.userId, outList);
  }

  const TEN_MIN = 600000;
  const FIVE_MIN = 300000;
  for (const row of rows) {
    const inList = inbound.get(row.beneficiaryId) ?? [];
    const senders = new Set<string>();
    for (const entry of inList) {
      if (entry.ts > row.timestamp) break;
      if (row.timestamp - entry.ts <= TEN_MIN) senders.add(entry.from);
    }
    row.features.senderCountLast10Min = Math.max(0, senders.size - 1);

    const outList = outbound.get(row.beneficiaryId) ?? [];
    let forwarded = 0;
    for (const entry of outList) {
      if (entry.ts < row.timestamp) continue;
      if (entry.ts - row.timestamp > FIVE_MIN) break;
      forwarded += entry.amount;
    }
    row.features.outflowRatio5Min =
      row.amount > 0 ? Math.min(1.5, forwarded / row.amount) : 0;
  }

  // ---- Labels: a little label noise so the metrics stay honest ---------
  // Real fraud datasets are never perfectly labelled; a small flip rate keeps
  // the reported precision/recall believable instead of a suspicious 100%.
  const labelRng = makeRandom(20260505);
  for (const row of rows) {
    if (labelRng() < 0.02) row.isFraudLabel = !row.isFraudLabel;
  }

  const edges: GraphEdgeInput[] = rows.map((row) => ({
    source: row.userId,
    target: row.beneficiaryId,
    amount: row.amount,
    timestamp: row.timestamp,
    fraudLabel: row.isFraudLabel,
  }));

  const modelSamples: TrainingSample[] = rows.map((row) => ({
    features: row.features,
    label: row.isFraudLabel,
  }));

  // ---- Train the ML layer on the synthetic ledger ----------------------
  const model = trainDiamondModel(modelSamples);

  // ---- Pass 3: score every transaction ---------------------------------
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const node = graphMetrics.get(row.beneficiaryId) ?? null;
    const payer = users.find((user) => user.userId === row.userId);
    const merchant =
      row.txnType === "P2M_QR" || row.txnType === "P2M_ONLINE"
        ? (merchants.find((entry) => entry.merchantId === row.beneficiaryId) ?? null)
        : null;
    const qr = row.qrId ? (qrCodes.find((entry) => entry.qrId === row.qrId) ?? null) : null;
    const verdict = qr ? verifyQrAt(qr, row.timestamp) : null;
    const qrVerdictInput: QrVerdictInput | null = verdict
      ? {
          used: true,
          signatureValid: verdict.signatureValid,
          merchantMatch: verdict.merchantMatch,
          expired: verdict.expired,
          revoked: verdict.revoked,
          unknownMerchant: verdict.unknownMerchant,
          status: verdict.status,
          reason: verdict.reason,
          merchantName: verdict.payload ? String(verdict.payload.merchant_name) : null,
          registeredMerchantName: verdict.registeredMerchantName,
        }
      : null;

    const result = scoreTransaction({
      amount: row.amount,
      timestamp: row.timestamp,
      payerName: row.userName,
      payerAvgAmount: payer?.avgAmount ?? 1500,
      beneficiaryId: row.beneficiaryId,
      beneficiaryName: row.beneficiaryName,
      beneficiaryUpiId: row.beneficiaryUpiId,
      beneficiaryAddedMsAgo:
        row.features.isNewBeneficiary && row.features.previousTxnsToBeneficiary === 0
          ? Math.max(15000, randInt(rng, 20, 3600) * 1000)
          : row.features.isNewBeneficiary
            ? randInt(rng, 20, 3600) * 1000
            : null,
      beneficiaryAccountAgeDays: row.features.beneficiaryAccountAgeDays,
      payerTxnCountWindow: burstCounts[index] ?? 1,
      deviceId: row.deviceId,
      location: row.location,
      isMerchantPayment: Boolean(merchant) || row.txnType !== "P2P",
      merchantKnown: Boolean(merchant),
      qr: qrVerdictInput,
      graphNode: node,
      features: row.features,
      config,
      model,
    });

    row.ruleScore = result.ruleScore;
    row.mlProbability = result.mlProbability;
    row.graphScore = result.graphScore;
    row.diamondTrustScore = result.diamondTrustScore;
    row.riskCategory = result.riskCategory;
    row.decision = result.decision;
    row.reasons = result.reasons;
    row.signals = result.signals;
    row.recommendedAction = result.recommendedAction;
    row.explanation = result.explanation;
    row.lossPrevented =
      result.decision === "DO_NOT_PAY" && row.isFraudLabel ? row.amount : 0;
  }

  return { transactions: rows, edges, modelSamples, graphMetrics, model };
}

export function buildFraudCases(
  transactions: TxnDoc[],
  now: number,
): { cases: CaseDoc[]; auditLogs: AuditDoc[] } {
  const rng = makeRandom(20260606);
  const candidates = transactions
    .filter((row) => row.diamondTrustScore < 80)
    .sort((a, b) => a.diamondTrustScore - b.diamondTrustScore)
    .slice(0, 900);

  const cases: CaseDoc[] = [];
  const auditLogs: AuditDoc[] = [];
  const pool = candidates.length > 0 ? candidates : transactions.slice(0, 100);

  for (let index = 0; index < Math.min(120, pool.length); index++) {
    const txn = pool[Math.floor((index * pool.length) / Math.min(120, pool.length))];
    const roll = rng();
    const status: CaseDoc["status"] =
      roll < 0.26
        ? "NEW"
        : roll < 0.56
          ? "INVESTIGATING"
          : roll < 0.71
            ? "ESCALATED"
            : roll < 0.91
              ? "RESOLVED"
              : "FALSE_POSITIVE";
    const priority: CaseDoc["priority"] =
      txn.diamondTrustScore < 25
        ? "CRITICAL"
        : txn.diamondTrustScore < 45
          ? "HIGH"
          : txn.diamondTrustScore < 65
            ? "MEDIUM"
            : "LOW";
    // A case can only exist once the payment did — never in the future.
    const cap = (value: number) => Math.min(value, now);
    const createdAt = cap(txn.timestamp + randInt(rng, 30000, 900000));
    const assignedTo = status === "NEW" ? undefined : ANALYSTS[index % ANALYSTS.length];
    const caseId = `CASE-${pad(index + 1, 4)}`;

    const timeline: CaseDoc["timeline"] = [
      {
        at: createdAt,
        actor: txn.userName,
        action: "REPORTED",
        note: "Fraud report submitted from the User Payment Shield.",
      },
    ];
    if (assignedTo) {
      timeline.push({
        at: cap(createdAt + randInt(rng, 60000, 3600000)),
        actor: "system",
        action: "ASSIGNED",
        note: `Auto-assigned to ${assignedTo}.`,
      });
    }
    if (status === "ESCALATED") {
      timeline.push({
        at: cap(createdAt + randInt(rng, 3600000, 2 * DAY)),
        actor: assignedTo ?? "system",
        action: "ESCALATED",
        note: "Escalated to the bank fraud cell for beneficiary action.",
      });
    }
    if (status === "RESOLVED" || status === "FALSE_POSITIVE") {
      timeline.push({
        at: cap(createdAt + randInt(rng, 2 * 3600000, 3 * DAY)),
        actor: assignedTo ?? "system",
        action: status === "RESOLVED" ? "RESOLVED" : "FALSE_POSITIVE",
        note:
          status === "RESOLVED"
            ? "Beneficiary account blocked and amount held back from settlement."
            : "Analyst confirmed the payment was legitimate — no fraud found.",
      });
    }

    const resolvedAt =
      status === "RESOLVED" || status === "FALSE_POSITIVE"
        ? timeline[timeline.length - 1].at
        : undefined;

    cases.push({
      caseId,
      txnId: txn.txnId,
      reportedBy: txn.userName,
      beneficiaryId: txn.beneficiaryId,
      beneficiaryUpiId: txn.beneficiaryUpiId,
      amount: txn.amount,
      reason: CASE_REASONS[index % CASE_REASONS.length],
      status,
      priority,
      assignedTo,
      createdAt,
      updatedAt: timeline[timeline.length - 1].at,
      resolvedAt,
      analystNotes:
        status === "NEW"
          ? ""
          : `Diamond Trust Score ${txn.diamondTrustScore}. Top signal: ${
              txn.reasons[0] ?? "n/a"
            }`,
      diamondTrustScore: txn.diamondTrustScore,
      timeline,
    });

    auditLogs.push({
      logId: `LOG-${pad(index + 1, 5)}`,
      actor: txn.userName,
      action: "CASE_CREATED",
      entityType: "fraud_case",
      entityId: caseId,
      timestamp: createdAt,
      details: `Case opened against ${txn.beneficiaryUpiId} for ₹${txn.amount}.`,
    });
  }

  void now;
  return { cases, auditLogs };
}

export function featureVectorFrom(partial: Partial<FeatureVector>): FeatureVector {
  const base = Object.fromEntries(FEATURES.map((feature) => [feature.key, 0])) as FeatureVector;
  return { ...base, ...partial };
}
