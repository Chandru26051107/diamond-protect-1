/**
 * DIAMOND-PROTECT :: public API — User Payment Shield + QR Shield.
 *
 * Prototype notice: this module only ever reads and writes SYNTHETIC demo data
 * stored in this prototype's own database. It never contacts UPI, NPCI, a bank,
 * a payment gateway or any real financial system.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { DEFAULT_CONFIG, clamp, type FeatureVector, type RuleConfig } from "./lib/types";
import type { DiamondModel } from "./lib/diamondMl";
import { verifyQrPayload, simulateQrTampering, buildSignedPayload, TAMPER_MODES, type MerchantRecord, type TamperMode } from "./lib/qrShield";
import { scoreTransaction as runScoring } from "./lib/riskEngine";
import { isValidUpiId } from "./lib/rules";
import { nonceFor } from "./lib/generator";
import { canonicalJson, signQrPayload, DEMO_QR_SECRET } from "./lib/crypto";

const TEN_MIN = 600000;
const FIVE_MIN = 300000;

async function loadConfig(ctx: QueryCtx | MutationCtx): Promise<RuleConfig> {
  try {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    if (!row) return DEFAULT_CONFIG;
    return {
      highRiskThreshold: row.highRiskThreshold,
      mlThreshold: row.mlThreshold,
      newBeneficiaryWindowHours: row.newBeneficiaryWindowHours,
      rapidTransactionWindowMin: row.rapidTransactionWindowMin,
      rapidForwardingThreshold: row.rapidForwardingThreshold,
      graphSensitivity: row.graphSensitivity,
      highAmountThreshold: row.highAmountThreshold,
      ruleToggles: (row.ruleToggles as Record<string, boolean>) ?? DEFAULT_CONFIG.ruleToggles,
      qrValidityMinutes: row.qrValidityMinutes,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function loadModel(ctx: QueryCtx | MutationCtx): Promise<DiamondModel | null> {
  try {
    const row = await ctx.db
      .query("modelArtifacts")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    if (!row || !Array.isArray(row.features) || row.features.length === 0) return null;
    return {
      modelType: row.modelType,
      trainedAt: row.trainedAt,
      trainSize: row.trainSize,
      testSize: row.testSize,
      positiveRate: row.positiveRate,
      bias: row.bias,
      features: row.features,
      metrics: row.metrics as DiamondModel["metrics"],
      trainingLog: row.trainingLog,
    };
  } catch {
    return null; // scoring falls back to rules + heuristics, demo keeps running
  }
}

async function loadMetrics(ctx: QueryCtx | MutationCtx) {
  try {
    return await ctx.db
      .query("dashMetrics")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
  } catch {
    return null;
  }
}

async function loadSeedState(ctx: QueryCtx | MutationCtx) {
  try {
    return await ctx.db
      .query("systemMeta")
      .withIndex("by_key", (q) => q.eq("key", "seed"))
      .unique();
  } catch {
    return null;
  }
}

function buildFeatures(partial: Partial<FeatureVector>): FeatureVector {
  return {
    amount: 0,
    hourOfDay: 0,
    beneficiaryAccountAgeDays: 0,
    previousTxnsToBeneficiary: 0,
    isNewBeneficiary: 0,
    deviceChangeFlag: 0,
    locationChangeFlag: 0,
    qrValid: 1,
    qrMerchantMatch: 1,
    senderCountLast10Min: 0,
    outflowRatio5Min: 0,
    previousFraudReports: 0,
    ...partial,
  };
}

/* ------------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------------ */

export const health = query({
  args: {},
  handler: async (ctx) => {
    try {
      const [metrics, seedState, merchantRows, accountRows, qrRows] = await Promise.all([
        loadMetrics(ctx),
        loadSeedState(ctx),
        ctx.db.query("merchants").take(200),
        ctx.db.query("accounts").take(800),
        ctx.db.query("qrCodes").take(400),
      ]);
      const model = metrics?.modelSnapshot as
        | { modelType: string; rocAuc: number; f1: number; trainSize: number }
        | null
        | undefined;
      return {
        ok: true,
        api: "DIAMOND-PROTECT prototype API",
        version: "1.0.0-hackathon",
        seeded: Boolean(metrics),
        isSeeding: Boolean(seedState?.isSeeding),
        seededAt: metrics?.seededAt ?? null,
        seedMessage: seedState?.lastMessage ?? "",
        counts: {
          transactions: metrics?.totalTransactions ?? 0,
          accounts: accountRows.length,
          merchants: merchantRows.length,
          qrCodes: qrRows.length,
          cases: metrics?.activeCases ?? 0,
        },
        fraudRate: metrics?.fraudRate ?? 0,
        model: model
          ? {
              available: true,
              modelType: model.modelType,
              rocAuc: model.rocAuc,
              f1: model.f1,
              trainSize: model.trainSize,
            }
          : { available: false, modelType: "rule-based fallback", rocAuc: 0, f1: 0, trainSize: 0 },
        disclaimer:
          "Hackathon prototype. Synthetic data only. No connection to UPI, NPCI, banks or real financial systems.",
      };
    } catch (error) {
      return {
        ok: false,
        api: "DIAMOND-PROTECT prototype API",
        version: "1.0.0-hackathon",
        seeded: false,
        isSeeding: false,
        seededAt: null,
        seedMessage: "Database not reachable",
        counts: { transactions: 0, accounts: 0, merchants: 0, qrCodes: 0, cases: 0 },
        fraudRate: 0,
        model: { available: false, modelType: "unavailable", rocAuc: 0, f1: 0, trainSize: 0 },
        disclaimer: error instanceof Error ? error.message : "Health check failed.",
      };
    }
  },
});

/** Trimmed transaction row used by the history + investigator tables. */
export type TxnListRow = {
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
  txnType: string;
  qrId: string | null;
  qrStatus: string;
  ruleScore: number;
  mlProbability: number;
  graphScore: number;
  diamondTrustScore: number;
  riskCategory: string;
  decision: string;
  fraudPattern: string;
  isFraudLabel: boolean;
  lossPrevented: number;
  reported: boolean;
  topReason: string;
  reasonCount: number;
};

function toListRow(row: Doc<"transactions">): TxnListRow {
  const reasons = Array.isArray(row.reasons) ? row.reasons : [];
  return {
    txnId: row.txnId,
    userId: row.userId,
    userName: row.userName,
    userUpiId: row.userUpiId,
    beneficiaryId: row.beneficiaryId,
    beneficiaryName: row.beneficiaryName,
    beneficiaryUpiId: row.beneficiaryUpiId,
    amount: row.amount,
    timestamp: row.timestamp,
    deviceId: row.deviceId,
    location: row.location,
    txnType: row.txnType,
    qrId: row.qrId ?? null,
    qrStatus: row.qrStatus,
    ruleScore: row.ruleScore,
    mlProbability: row.mlProbability,
    graphScore: row.graphScore,
    diamondTrustScore: row.diamondTrustScore,
    riskCategory: row.riskCategory,
    decision: row.decision,
    fraudPattern: row.fraudPattern,
    isFraudLabel: row.isFraudLabel,
    lossPrevented: row.lossPrevented,
    reported: row.reported,
    topReason: reasons[0] ?? "",
    reasonCount: reasons.length,
  };
}

export const transactions = query({
  args: {
    limit: v.optional(v.number()),
    riskCategory: v.optional(v.string()),
    decision: v.optional(v.string()),
    qrStatus: v.optional(v.string()),
    pattern: v.optional(v.string()),
    search: v.optional(v.string()),
    minAmount: v.optional(v.number()),
    maxAmount: v.optional(v.number()),
    fraudOnly: v.optional(v.boolean()),
    userId: v.optional(v.string()),
    horizon: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    try {
      const limit = clamp(args.limit ?? 200, 1, 600);
      const rows = await ctx.db
        .query("transactions")
        .withIndex("by_timestamp")
        .order("desc")
        .take(limit);

      const search = (args.search ?? "").trim().toLowerCase();
      const from = args.horizon ? Date.now() - args.horizon : null;

      const filtered = rows
        .filter((row) => (args.riskCategory ? row.riskCategory === args.riskCategory : true))
        .filter((row) => (args.decision ? row.decision === args.decision : true))
        .filter((row) => (args.qrStatus ? row.qrStatus === args.qrStatus : true))
        .filter((row) => (args.pattern ? row.fraudPattern === args.pattern : true))
        .filter((row) => (args.userId ? row.userId === args.userId : true))
        .filter((row) => (args.fraudOnly ? row.isFraudLabel : true))
        .filter((row) =>
          args.minAmount === undefined ? true : row.amount >= args.minAmount,
        )
        .filter((row) =>
          args.maxAmount === undefined ? true : row.amount <= args.maxAmount,
        )
        .filter((row) => (from ? row.timestamp >= from : true))
        .filter((row) => {
          if (!search) return true;
          return (
            row.txnId.toLowerCase().includes(search) ||
            row.beneficiaryName.toLowerCase().includes(search) ||
            row.beneficiaryUpiId.toLowerCase().includes(search) ||
            row.userName.toLowerCase().includes(search) ||
            row.userUpiId.toLowerCase().includes(search) ||
            row.fraudPattern.toLowerCase().includes(search)
          );
        });

      return {
        ok: true,
        scanned: rows.length,
        returned: filtered.length,
        note: `Scanning the ${rows.length} most recent synthetic transactions.`,
        rows: filtered.map((row) => toListRow(row)),
      };
    } catch {
      return { ok: false, scanned: 0, returned: 0, note: "Transaction store unavailable.", rows: [] };
    }
  },
});

export const transaction = query({
  args: { txnId: v.string() },
  handler: async (ctx, args) => {
    try {
      const row = await ctx.db
        .query("transactions")
        .withIndex("by_txnId", (q) => q.eq("txnId", args.txnId))
        .unique();
      if (!row) return { ok: false, row: null, account: null, relatedCase: null, audit: [] };

      const account = await ctx.db
        .query("accounts")
        .withIndex("by_accountId", (q) => q.eq("accountId", row.beneficiaryId))
        .unique();
      const payer = await ctx.db
        .query("accounts")
        .withIndex("by_accountId", (q) => q.eq("accountId", row.userId))
        .unique();
      const relatedCase = await ctx.db
        .query("fraudCases")
        .withIndex("by_txnId", (q) => q.eq("txnId", args.txnId))
        .first();
      const audit = await ctx.db
        .query("auditLogs")
        .withIndex("by_entityId", (q) => q.eq("entityId", args.txnId))
        .take(20);
      const qr = row.qrId
        ? await ctx.db
            .query("qrCodes")
            .withIndex("by_qrId", (q) => q.eq("qrId", row.qrId!))
            .unique()
        : null;

      return { ok: true, row, account, payer, relatedCase, audit, qr };
    } catch {
      return { ok: false, row: null, account: null, relatedCase: null, audit: [] };
    }
  },
});

export const qrCodes = query({
  args: { status: v.optional(v.string()), search: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    try {
      const rows = await ctx.db.query("qrCodes").take(clamp(args.limit ?? 300, 1, 400));
      const search = (args.search ?? "").trim().toLowerCase();
      const filtered = rows
        .filter((row) => (args.status ? row.status === args.status : true))
        .filter((row) =>
          search
            ? row.qrId.toLowerCase().includes(search) ||
              row.merchantName.toLowerCase().includes(search) ||
              row.upiId.toLowerCase().includes(search)
            : true,
        )
        .sort((a, b) => b.createdAt - a.createdAt);
      return { ok: true, rows: filtered, tamperModes: TAMPER_MODES };
    } catch {
      return { ok: false, rows: [], tamperModes: TAMPER_MODES };
    }
  },
});

export const merchants = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    try {
      const rows = await ctx.db.query("merchants").take(200);
      const search = (args.search ?? "").trim().toLowerCase();
      const filtered = rows
        .filter((row) =>
          search
            ? row.merchantName.toLowerCase().includes(search) ||
              row.upiId.toLowerCase().includes(search) ||
              row.merchantId.toLowerCase().includes(search)
            : true,
        )
        .sort((a, b) => b.registeredAt - a.registeredAt);
      return { ok: true, rows: filtered };
    } catch {
      return { ok: false, rows: [] };
    }
  },
});

/** Four reliable, judge-facing demo scenarios derived from the live ledger. */
export const demoScenarios = query({
  args: {},
  handler: async (ctx) => {
    try {
      const recent = await ctx.db
        .query("transactions")
        .withIndex("by_timestamp")
        .order("desc")
        .take(600);

      const safe = recent.find(
        (row) => row.riskCategory === "DIAMOND_SAFE" && row.qrStatus === "VERIFIED",
      );
      const fakeQr = recent.find(
        (row) => row.qrStatus === "FAKE_TAMPERED" && Boolean(row.qrId),
      );
      const mule = recent.find(
        (row) => row.graphScore >= 70 && row.diamondTrustScore < 55,
      );
      const reported = await ctx.db
        .query("fraudCases")
        .withIndex("by_status", (q) => q.eq("status", "NEW"))
        .order("desc")
        .take(30);
      const report = reported.length > 0 ? reported[0] : null;

      return {
        ok: true,
        scenarios: [
          {
            id: "SCENARIO_1_SAFE",
            title: "Scenario 1 · Safe Payment",
            description:
              "Verified merchant, valid signed QR, small amount. All three layers agree the payment is normal.",
            expected: "Diamond Safe — Proceed Safely",
            txnId: safe?.txnId ?? null,
            qrId: safe?.qrId ?? null,
            caseId: null,
            tone: "safe",
          },
          {
            id: "SCENARIO_2_FAKE_QR",
            title: "Scenario 2 · Fake QR Attack",
            description:
              "QR payload no longer matches its HMAC signature, so the merchant name and VPA cannot be trusted.",
            expected: "Diamond Alert — Do Not Pay",
            txnId: fakeQr?.txnId ?? null,
            qrId: fakeQr?.qrId ?? null,
            caseId: null,
            tone: "alert",
          },
          {
            id: "SCENARIO_3_MULE",
            title: "Scenario 3 · Mule Account Payment",
            description:
              "Beneficiary collects from many accounts then forwards most of the money within minutes.",
            expected: "Diamond Alert — Do Not Pay · visible in MuleNet",
            txnId: mule?.txnId ?? null,
            qrId: null,
            caseId: null,
            tone: "alert",
          },
          {
            id: "SCENARIO_4_REPORT",
            title: "Scenario 4 · User Fraud Report",
            description:
              "A user reports a payment; the case lands in the Fraud Case Manager for analyst action and audit.",
            expected: "New case in the queue with a full audit trail",
            txnId: report?.txnId ?? null,
            qrId: null,
            caseId: report?.caseId ?? null,
            tone: "caution",
          },
        ],
      };
    } catch {
      return { ok: false, scenarios: [] };
    }
  },
});

/* ------------------------------------------------------------------------ *
 * Live scoring
 * ------------------------------------------------------------------------ */

export const scoreTransaction = mutation({
  args: {
    payerUpiId: v.string(),
    beneficiaryUpiId: v.string(),
    amount: v.number(),
    deviceId: v.optional(v.string()),
    location: v.optional(v.string()),
    timestamp: v.optional(v.number()),
    txnType: v.optional(v.string()),
    qrId: v.optional(v.string()),
    qrPayload: v.optional(v.string()),
    qrSignature: v.optional(v.string()),
    commit: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      const amount = Number(args.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: "Enter a payment amount greater than ₹0.", result: null };
      }
      if (amount > 5000000) {
        return {
          ok: false,
          error: "Demo limit exceeded: keep the simulated amount under ₹50,00,000.",
          result: null,
        };
      }
      if (!isValidUpiId(args.payerUpiId)) {
        return {
          ok: false,
          error: 'Payer UPI ID looks invalid. Use the format "name@bank" (e.g. aarav.sharma012@diamondbank).',
          result: null,
        };
      }
      if (!isValidUpiId(args.beneficiaryUpiId)) {
        return {
          ok: false,
          error: 'Beneficiary UPI ID looks invalid. Use the format "name@bank".',
          result: null,
        };
      }

      const config = await loadConfig(ctx);
      const model = await loadModel(ctx);
      const timestamp = Number(args.timestamp) || Date.now();
      const payerRow = await ctx.db
        .query("accounts")
        .withIndex("by_upiId", (q) => q.eq("upiId", args.payerUpiId.trim()))
        .unique();
      const payeeRow = await ctx.db
        .query("accounts")
        .withIndex("by_upiId", (q) => q.eq("upiId", args.beneficiaryUpiId.trim()))
        .unique();

      // ---- QR verification (if a QR was scanned) -----------------------
      let qrVerdictInput = null as null | {
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
      let storedQr: { _id: never; payload: string; signature: string; qrId: string } | null = null;
      let qrStatus: "VERIFIED" | "CAUTION" | "FAKE_TAMPERED" | "NOT_USED" = "NOT_USED";

      if (args.qrId || args.qrPayload) {
        const registryRows = await ctx.db.query("merchants").take(200);
        const registry: MerchantRecord[] = registryRows.map((row) => ({
          merchantId: row.merchantId,
          merchantName: row.merchantName,
          upiId: row.upiId,
          status: row.status,
        }));
        if (args.qrId) {
          const stored = await ctx.db
            .query("qrCodes")
            .withIndex("by_qrId", (q) => q.eq("qrId", args.qrId!))
            .unique();
          storedQr = stored
            ? { _id: stored._id as never, payload: stored.payload, signature: stored.signature, qrId: stored.qrId }
            : null;
        }
        const payload = args.qrPayload ?? storedQr?.payload ?? "";
        const signature = args.qrSignature ?? storedQr?.signature ?? "";
        const verdict = verifyQrPayload(payload, signature, registry, timestamp);
        qrStatus = verdict.status;
        qrVerdictInput = {
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
        };
        if (verdict.status === "FAKE_TAMPERED" && storedQr) {
          await ctx.db.patch(storedQr._id, { status: "TAMPERED", isTampered: true });
        }
      }

      // ---- Behavioural features from the synthetic ledger ---------------
      const payerHistory = payerRow
        ? await ctx.db
            .query("transactions")
            .withIndex("by_userId", (q) => q.eq("userId", payerRow.accountId))
            .order("desc")
            .take(80)
        : [];
      const pairCount = payerHistory.filter(
        (row) => row.beneficiaryUpiId === args.beneficiaryUpiId.trim(),
      ).length;
      const deviceKnown = payerHistory.some((row) => row.deviceId === args.deviceId);
      const deviceChangeFlag = payerHistory.length > 0 && !deviceKnown;
      const locationChangeFlag =
        payerHistory.length > 0 &&
        Boolean(args.location) &&
        payerRow !== null &&
        args.location !== (payerRow.city ?? "") &&
        !payerHistory.some((row) => row.location === args.location);
      const payerBurstWindow = payerHistory.filter(
        (row) => timestamp - row.timestamp <= config.rapidTransactionWindowMin * 60000,
      ).length;

      const payeeInbound = payeeRow
        ? await ctx.db
            .query("transactions")
            .withIndex("by_beneficiaryId", (q) => q.eq("beneficiaryId", payeeRow.accountId))
            .order("desc")
            .take(80)
        : [];
      const recentSenders = new Set(
        payeeInbound
          .filter((row) => timestamp - row.timestamp <= TEN_MIN)
          .map((row) => row.userId),
      );
      const forwardedRecently = payeeInbound
        .filter((row) => Math.abs(row.timestamp - timestamp) <= FIVE_MIN)
        .reduce((sum, row) => sum + row.amount, 0);

      const beneficiaryAgeDays = payeeRow
        ? Math.max(
            0,
            Math.round((timestamp - payeeRow.createdAt) / 86400000),
          )
        : 0;
      const isNewBeneficiary = pairCount === 0;
      const addedMsAgo = isNewBeneficiary
        ? payerHistory.length > 0
          ? Math.min(600000, Math.abs(timestamp - payerHistory[0].timestamp))
          : 12000
        : null;

      const graphNode = payeeRow
        ? {
            accountId: payeeRow.accountId,
            inDegree: payeeRow.inDegree,
            outDegree: payeeRow.outDegree,
            totalReceived: payeeRow.totalReceived,
            totalSent: payeeRow.totalSent,
            outflowRatio: payeeRow.outflowRatio,
            uniqueSenders: Math.max(payeeRow.uniqueSenders, recentSenders.size),
            uniqueReceivers: payeeRow.uniqueReceivers,
            avgReceiveToSendSec: payeeRow.avgReceiveToSendSec,
            clustering: payeeRow.clustering,
            clusterRole: (payeeRow.clusterRole ?? "NONE") as
              | "MULE"
              | "SUSPICIOUS"
              | "PERIPHERAL"
              | "NONE",
            community: payeeRow.community,
            communitySize: 1,
            communityMuleCount: payeeRow.communityMuleCount ?? 0,
            fraudCluster: payeeRow.fraudCluster ?? -1,
            fraudClusterSize: payeeRow.fraudClusterSize ?? 0,
            fraudClusterReach: payeeRow.fraudClusterReach ?? 0,
            fraudClusterValue: payeeRow.fraudClusterValue ?? 0,
            fraudClusterMules: payeeRow.fraudClusterMules ?? 0,
            riskScore: payeeRow.riskScore,
            isMuleSuspect: payeeRow.isMuleSuspect,
            status:
              payeeRow.status === "MULE_SUSPECT"
                ? ("MULE_SUSPECT" as const)
                : payeeRow.status === "SUSPICIOUS"
                  ? ("SUSPICIOUS" as const)
                  : ("NORMAL" as const),
            flaggedReasons: payeeRow.flaggedReasons,
          }
        : null;

      const features = buildFeatures({
        amount,
        hourOfDay: new Date(timestamp).getHours(),
        beneficiaryAccountAgeDays: beneficiaryAgeDays,
        previousTxnsToBeneficiary: pairCount,
        isNewBeneficiary: isNewBeneficiary ? 1 : 0,
        deviceChangeFlag: deviceChangeFlag ? 1 : 0,
        locationChangeFlag: locationChangeFlag ? 1 : 0,
        qrValid: !qrVerdictInput || qrVerdictInput.signatureValid ? 1 : 0,
        qrMerchantMatch: !qrVerdictInput || qrVerdictInput.merchantMatch ? 1 : 0,
        senderCountLast10Min: recentSenders.size,
        outflowRatio5Min:
          amount > 0
            ? Math.min(1.5, forwardedRecently / amount || (payeeRow?.outflowRatio ?? 0))
            : 0,
        previousFraudReports: payeeRow
          ? payeeRow.isMuleSuspect
            ? 4
            : payeeRow.riskScore >= 75
              ? 2
              : 0
          : 0,
      });

      const result = runScoring({
        amount,
        timestamp,
        payerName: payerRow?.name ?? args.payerUpiId,
        payerAvgAmount: 2500,
        beneficiaryId: payeeRow?.accountId ?? args.beneficiaryUpiId,
        beneficiaryName: payeeRow?.name ?? args.beneficiaryUpiId,
        beneficiaryUpiId: args.beneficiaryUpiId,
        beneficiaryAddedMsAgo: addedMsAgo,
        beneficiaryAccountAgeDays: beneficiaryAgeDays,
        payerTxnCountWindow: payerBurstWindow + 1,
        deviceId: args.deviceId ?? "DEV-LIVE",
        location: args.location ?? payerRow?.city ?? "Unknown",
        isMerchantPayment: payeeRow?.kind === "MERCHANT" || qrVerdictInput !== null,
        merchantKnown: payeeRow?.kind === "MERCHANT",
        qr: qrVerdictInput,
        graphNode,
        features,
        config,
        model,
      });

      const committed = args.commit !== false;
      let txnId = `LIVE-${nonceFor([args.payerUpiId, args.beneficiaryUpiId, timestamp, amount]).slice(0, 8)}`;

      if (committed) {
        txnId = `TXN-LIVE-${nonceFor([args.payerUpiId, args.beneficiaryUpiId, timestamp, amount]).slice(0, 8).toUpperCase()}`;
        const inserted = await ctx.db.insert("transactions", {
          txnId,
          userId: payerRow?.accountId ?? args.payerUpiId,
          userName: payerRow?.name ?? args.payerUpiId,
          userUpiId: args.payerUpiId,
          beneficiaryId: payeeRow?.accountId ?? args.beneficiaryUpiId,
          beneficiaryName: payeeRow?.name ?? args.beneficiaryUpiId,
          beneficiaryUpiId: args.beneficiaryUpiId,
          amount,
          timestamp,
          deviceId: args.deviceId ?? "DEV-LIVE",
          location: args.location ?? payerRow?.city ?? "Unknown",
          txnType:
            qrVerdictInput !== null
              ? ("P2M_QR" as const)
              : payeeRow?.kind === "MERCHANT"
                ? ("P2M_ONLINE" as const)
                : ("P2P" as const),
          qrId: args.qrId,
          qrStatus,
          ruleScore: result.ruleScore,
          mlProbability: result.mlProbability,
          graphScore: result.graphScore,
          diamondTrustScore: result.diamondTrustScore,
          riskCategory: result.riskCategory,
          decision: result.decision,
          reasons: result.reasons,
          signals: result.signals,
          features,
          recommendedAction: result.recommendedAction,
          explanation: result.explanation,
          fraudPattern: "LIVE_SCORING",
          isFraudLabel: result.diamondTrustScore < 55,
          lossPrevented:
            result.decision === "DO_NOT_PAY" ? Math.round(amount * 0.9) : 0,
          reported: false,
        });
        void inserted;

        const metrics = await loadMetrics(ctx);
        if (metrics) {
          await ctx.db.patch(metrics._id, {
            totalTransactions: metrics.totalTransactions + 1,
            highRiskTransactions:
              metrics.highRiskTransactions + (result.diamondTrustScore < 55 ? 1 : 0),
            blockedTransactions:
              metrics.blockedTransactions + (result.decision === "DO_NOT_PAY" ? 1 : 0),
            fraudLossPrevented:
              metrics.fraudLossPrevented +
              (result.decision === "DO_NOT_PAY" ? Math.round(amount * 0.9) : 0),
          });
        }

        await ctx.db.insert("auditLogs", {
          logId: `LOG-${nonceFor(["score", txnId]).slice(0, 10)}`,
          actor: payerRow?.name ?? args.payerUpiId,
          action: "TRANSACTION_SCORED",
          entityType: "transaction",
          entityId: txnId,
          timestamp,
          details: `Diamond Trust Score ${result.diamondTrustScore} (${result.riskCategory}) — ${result.decision}.`,
        });
      }

      return {
        ok: true,
        error: null,
        txnId,
        committed,
        result: {
          ...result,
          qrStatus,
          beneficiaryName: payeeRow?.name ?? args.beneficiaryUpiId,
          beneficiaryUpiId: args.beneficiaryUpiId,
          payerName: payerRow?.name ?? args.payerUpiId,
          amount,
          timestamp,
          location: args.location ?? "",
          deviceId: args.deviceId ?? "",
          features,
          graphNode,
          modelAvailable: model !== null,
          contribution: result.contribution,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error:
          "Scoring could not complete for this payment. The prototype kept running — try again or reset the demo data.",
        result: null,
        detail: error instanceof Error ? error.message : "unknown error",
      };
    }
  },
});

/* ------------------------------------------------------------------------ *
 * QR Shield
 * ------------------------------------------------------------------------ */

export const generateQr = mutation({
  args: {
    merchantId: v.string(),
    amount: v.optional(v.number()),
    validityMinutes: v.optional(v.number()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const merchant = await ctx.db
        .query("merchants")
        .withIndex("by_merchantId", (q) => q.eq("merchantId", args.merchantId))
        .unique();
      if (!merchant) {
        return { ok: false, error: `Merchant ${args.merchantId} is not registered.`, qr: null };
      }
      const config = await loadConfig(ctx);
      const validityMinutes = clamp(
        Number(args.validityMinutes) || config.qrValidityMinutes,
        1,
        1440,
      );
      const now = Date.now();
      const amount = Number.isFinite(Number(args.amount)) ? Math.max(0, Number(args.amount)) : 0;
      const count = (await ctx.db.query("qrCodes").take(500)).length;
      const qrId = `QR${String(count + 1).padStart(5, "0")}`;
      const payload = {
        merchant_id: merchant.merchantId,
        merchant_name: merchant.merchantName,
        upi_id: merchant.upiId,
        amount,
        created_at: now,
        expires_at: now + validityMinutes * 60000,
        nonce: nonceFor([qrId, now, merchant.merchantId]),
        version: 1,
      };
      const { canonical, signature } = buildSignedPayload(payload);

      await ctx.db.insert("qrCodes", {
        qrId,
        merchantId: merchant.merchantId,
        merchantName: merchant.merchantName,
        upiId: merchant.upiId,
        amount,
        createdAt: now,
        expiresAt: payload.expires_at,
        nonce: payload.nonce,
        version: payload.version,
        signature,
        payload: canonical,
        status: "ACTIVE",
        isTampered: false,
        city: merchant.city,
      });
      await ctx.db.patch(merchant._id, { totalQrCodes: merchant.totalQrCodes + 1 });
      await ctx.db.insert("auditLogs", {
        logId: `LOG-${nonceFor(["qr", qrId]).slice(0, 10)}`,
        actor: args.actor ?? "analyst",
        action: "QR_GENERATED",
        entityType: "qr_code",
        entityId: qrId,
        timestamp: now,
        details: `Signed QR issued for ${merchant.merchantName} (₹${amount}, valid ${validityMinutes} min).`,
      });

      return { ok: true, error: null, qr: { qrId, signature, payload: canonical, ...payload } };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "QR generation failed.",
        qr: null,
      };
    }
  },
});

export const verifyQr = mutation({
  args: {
    qrId: v.optional(v.string()),
    payload: v.optional(v.string()),
    signature: v.optional(v.string()),
    actor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const registryRows = await ctx.db.query("merchants").take(200);
      const registry: MerchantRecord[] = registryRows.map((row) => ({
        merchantId: row.merchantId,
        merchantName: row.merchantName,
        upiId: row.upiId,
        status: row.status,
      }));

      const now = Date.now();
      const qrRow = args.qrId
        ? await ctx.db
            .query("qrCodes")
            .withIndex("by_qrId", (q) => q.eq("qrId", args.qrId!))
            .unique()
        : null;
      const payload = args.payload ?? qrRow?.payload ?? "";
      const signature = args.signature ?? qrRow?.signature ?? "";
      const verdict = verifyQrPayload(payload, signature, registry, now);

      if (qrRow && verdict.status === "FAKE_TAMPERED" && qrRow.status !== "TAMPERED") {
        await ctx.db.patch(qrRow._id, { status: "TAMPERED", isTampered: true });
        await ctx.db.insert("auditLogs", {
          logId: `LOG-${nonceFor(["verify", qrRow.qrId, now]).slice(0, 10)}`,
          actor: args.actor ?? "shield",
          action: "QR_TAMPER_DETECTED",
          entityType: "qr_code",
          entityId: qrRow.qrId,
          timestamp: now,
          details: verdict.reason,
        });
      }

      return { ok: true, verdict, qrId: qrRow?.qrId ?? args.qrId ?? null, checkedAt: now };
    } catch (error) {
      return {
        ok: false,
        verdict: null,
        qrId: args.qrId ?? null,
        checkedAt: Date.now(),
        error: error instanceof Error ? error.message : "QR verification failed.",
      };
    }
  },
});

export const tamperQr = mutation({
  args: { qrId: v.string(), mode: v.optional(v.string()), actor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    try {
      const qrRow = await ctx.db
        .query("qrCodes")
        .withIndex("by_qrId", (q) => q.eq("qrId", args.qrId))
        .unique();
      if (!qrRow) return { ok: false, error: `QR ${args.qrId} not found.`, qr: null };

      const modes: TamperMode[] = ["merchant_name", "amount", "upi_id", "expired", "signature", "missing_field"];
      const mode = (modes as string[]).includes(args.mode ?? "")
        ? (args.mode as TamperMode)
        : "merchant_name";

      const original = JSON.parse(qrRow.payload) as Record<string, unknown>;
      const tampered = simulateQrTampering(
        original as never,
        qrRow.signature,
        mode,
      );
      await ctx.db.patch(qrRow._id, {
        payload: tampered.payload,
        signature: tampered.signature,
        isTampered: true,
        status: "TAMPERED",
        tamperMode: mode,
      });
      await ctx.db.insert("auditLogs", {
        logId: `LOG-${nonceFor(["tamper", args.qrId, Date.now()]).slice(0, 10)}`,
        actor: args.actor ?? "analyst",
        action: "QR_TAMPER_SIMULATED",
        entityType: "qr_code",
        entityId: args.qrId,
        timestamp: Date.now(),
        details: tampered.summary,
      });

      return { ok: true, error: null, qr: { qrId: args.qrId, ...tampered } };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not simulate tampering.",
        qr: null,
      };
    }
  },
});

export const revokeQr = mutation({
  args: { qrId: v.string(), actor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    try {
      const qrRow = await ctx.db
        .query("qrCodes")
        .withIndex("by_qrId", (q) => q.eq("qrId", args.qrId))
        .unique();
      if (!qrRow) return { ok: false, error: `QR ${args.qrId} not found.` };
      await ctx.db.patch(qrRow._id, { status: "REVOKED" });
      await ctx.db.insert("auditLogs", {
        logId: `LOG-${nonceFor(["revoke", args.qrId]).slice(0, 10)}`,
        actor: args.actor ?? "analyst",
        action: "QR_REVOKED",
        entityType: "qr_code",
        entityId: args.qrId,
        timestamp: Date.now(),
        details: `QR ${args.qrId} revoked for ${qrRow.merchantName}.`,
      });
      return { ok: true, error: null };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not revoke QR.",
      };
    }
  },
});

/** Issues a raw signed payload without persisting it (used by the demo tester). */
export const signPayloadPreview = mutation({
  args: { merchantId: v.string(), amount: v.optional(v.number()) },
  handler: async (ctx, args) => {
    try {
      const merchant = await ctx.db
        .query("merchants")
        .withIndex("by_merchantId", (q) => q.eq("merchantId", args.merchantId))
        .unique();
      if (!merchant) return { ok: false, error: "Unknown merchant.", payload: null, signature: null };
      const now = Date.now();
      const payload = {
        merchant_id: merchant.merchantId,
        merchant_name: merchant.merchantName,
        upi_id: merchant.upiId,
        amount: Number(args.amount) || 0,
        created_at: now,
        expires_at: now + 30 * 60000,
        nonce: nonceFor(["preview", merchant.merchantId, now]),
        version: 1,
      };
      const canonical = canonicalJson(payload);
      return {
        ok: true,
        error: null,
        payload: canonical,
        signature: signQrPayload(canonical, DEMO_QR_SECRET),
      };
    } catch {
      return { ok: false, error: "Preview failed.", payload: null, signature: null };
    }
  },
});

/* ------------------------------------------------------------------------ *
 * Fraud reporting
 * ------------------------------------------------------------------------ */

export const reportFraud = mutation({
  args: {
    txnId: v.string(),
    reason: v.string(),
    reportedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const txn = await ctx.db
        .query("transactions")
        .withIndex("by_txnId", (q) => q.eq("txnId", args.txnId))
        .unique();
      if (!txn) {
        return { ok: false, error: `Transaction ${args.txnId} was not found in the ledger.`, caseId: null };
      }
      const existing = await ctx.db
        .query("fraudCases")
        .withIndex("by_txnId", (q) => q.eq("txnId", args.txnId))
        .first();
      if (existing) {
        return {
          ok: true,
          error: null,
          caseId: existing.caseId,
          duplicate: true,
          message: `A case (${existing.caseId}) already exists for this transaction.`,
        };
      }

      const all = await ctx.db.query("fraudCases").take(200);
      const caseId = `CASE-${String(all.length + 1).padStart(4, "0")}`;
      const now = Date.now();
      const reason = (args.reason ?? "").trim() || "User reported this payment as suspicious.";
      const priority =
        txn.diamondTrustScore < 25
          ? ("CRITICAL" as const)
          : txn.diamondTrustScore < 45
            ? ("HIGH" as const)
            : txn.diamondTrustScore < 65
              ? ("MEDIUM" as const)
              : ("LOW" as const);

      await ctx.db.insert("fraudCases", {
        caseId,
        txnId: txn.txnId,
        reportedBy: args.reportedBy?.trim() || txn.userName,
        beneficiaryId: txn.beneficiaryId,
        beneficiaryUpiId: txn.beneficiaryUpiId,
        amount: txn.amount,
        reason,
        status: "NEW",
        priority,
        createdAt: now,
        updatedAt: now,
        analystNotes: "",
        diamondTrustScore: txn.diamondTrustScore,
        timeline: [
          {
            at: now,
            actor: args.reportedBy?.trim() || txn.userName,
            action: "REPORTED",
            note: reason,
          },
        ],
      });

      await ctx.db.patch(txn._id, { reported: true });
      await ctx.db.insert("auditLogs", {
        logId: `LOG-${nonceFor(["report", txn.txnId]).slice(0, 10)}`,
        actor: args.reportedBy?.trim() || txn.userName,
        action: "CASE_CREATED",
        entityType: "fraud_case",
        entityId: caseId,
        timestamp: now,
        details: `Case opened against ${txn.beneficiaryUpiId} for ₹${txn.amount}.`,
      });

      const metrics = await loadMetrics(ctx);
      if (metrics) {
        await ctx.db.patch(metrics._id, { activeCases: metrics.activeCases + 1 });
      }

      return {
        ok: true,
        error: null,
        caseId,
        duplicate: false,
        message: `Case ${caseId} created and routed to the Fraud Case Manager.`,
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? `Could not create the case: ${error.message}`
            : "Could not create the case.",
        caseId: null,
      };
    }
  },
});

/** Small deterministic helper the UI uses to prefill the "Pay" form. */
export const payerSuggestions = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    try {
      const search = (args.search ?? "").trim().toLowerCase();
      const rows = await ctx.db
        .query("accounts")
        .withIndex("by_status", (q) => q.eq("status", "NORMAL"))
        .take(60);
      const merchants = await ctx.db.query("merchants").take(40);
      const candidates = rows
        .filter((row) => row.kind === "USER")
        .filter((row) =>
          search
            ? row.name.toLowerCase().includes(search) || row.upiId.toLowerCase().includes(search)
            : true,
        )
        .slice(0, 12);

      // Each suggestion carries the payer's own behavioural profile — the device
      // and city this account actually pays from plus a beneficiary it has paid
      // before. Without it, a hand-typed payment always trips the device-change
      // and location-anomaly rules and a normal payment looks suspicious.
      const users: {
        accountId: string;
        name: string;
        upiId: string;
        status: string;
        usualDeviceId: string | null;
        usualCity: string | null;
        lastBeneficiaryUpiId: string | null;
      }[] = [];
      for (const row of candidates) {
        const history = await ctx.db
          .query("transactions")
          .withIndex("by_userId", (q) => q.eq("userId", row.accountId))
          .order("desc")
          .take(30);

        const deviceCounts = new Map<string, number>();
        for (const txn of history) {
          const device = String(txn.deviceId ?? "");
          if (device) deviceCounts.set(device, (deviceCounts.get(device) ?? 0) + 1);
        }
        const usualDeviceId =
          [...deviceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const usualCity =
          row.city ?? history.find((txn) => Boolean(txn.location))?.location ?? null;

        // Prefer a beneficiary this account has paid before that is not itself
        // flagged, so a "normal" demo payment stays genuinely normal.
        let lastBeneficiaryUpiId: string | null = null;
        const seenBeneficiaries = new Set<string>();
        for (const txn of history) {
          const upiId = txn.beneficiaryUpiId;
          if (!upiId || upiId === row.upiId || seenBeneficiaries.has(upiId)) continue;
          seenBeneficiaries.add(upiId);
          if (seenBeneficiaries.size > 3) break;
          const payee = await ctx.db
            .query("accounts")
            .withIndex("by_upiId", (q) => q.eq("upiId", upiId))
            .unique();
          if (payee && payee.status === "NORMAL") {
            lastBeneficiaryUpiId = upiId;
            break;
          }
        }

        users.push({
          accountId: row.accountId,
          name: row.name,
          upiId: row.upiId,
          status: row.status,
          usualDeviceId,
          usualCity,
          lastBeneficiaryUpiId,
        });
      }
      const suspicious = (
        await ctx.db
          .query("accounts")
          .withIndex("by_status", (q) => q.eq("status", "MULE_SUSPECT"))
          .take(8)
      ).map((row) => ({ accountId: row.accountId, name: row.name, upiId: row.upiId, status: row.status }));
      const sampleMerchants = merchants
        .slice(0, 10)
        .map((row) => ({ accountId: row.merchantId, name: row.merchantName, upiId: row.upiId, status: row.status }));
      return { ok: true, users, suspicious, merchants: sampleMerchants };
    } catch {
      return { ok: false, users: [], suspicious: [], merchants: [] };
    }
  },
});
