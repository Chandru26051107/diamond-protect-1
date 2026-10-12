/**
 * DIAMOND-PROTECT :: pre-aggregated Command Centre KPIs + MuleNet node records.
 */

import type { MerchantSeed, UserSeed } from "./generator";
import { DAY } from "./generator";
import type { NodeMetrics } from "./mulenet";
import type { CaseDoc, TxnDoc } from "./ledger";
import type { DiamondModel } from "./diamondMl";
import { round2 } from "./types";

export type AccountDoc = {
  accountId: string;
  name: string;
  upiId: string;
  kind: "USER" | "MERCHANT";
  createdAt: number;
  accountAgeDays: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  isMuleSuspect: boolean;
  status:
    | "NORMAL"
    | "SUSPICIOUS"
    | "MULE_SUSPECT"
    | "BLOCKED"
    | "UNDER_REVIEW"
    | "CLEARED";
  category?: string;
  city?: string;
  isVerified?: boolean;
  inDegree: number;
  outDegree: number;
  totalReceived: number;
  totalSent: number;
  outflowRatio: number;
  uniqueSenders: number;
  uniqueReceivers: number;
  avgReceiveToSendSec: number;
  clustering: number;
  community: number;
  communityMuleCount: number;
  fraudCluster: number;
  clusterRole: string;
  fraudClusterSize: number;
  fraudClusterReach: number;
  fraudClusterValue: number;
  fraudClusterMules: number;
  riskScore: number;
  flaggedReasons: string[];
};

export type MetricsDoc = {
  key: string;
  totalTransactions: number;
  highRiskTransactions: number;
  blockedTransactions: number;
  fraudLossPrevented: number;
  avgTrustScore: number;
  activeCases: number;
  verifiedMerchants: number;
  suspectedMuleAccounts: number;
  flaggedQrCodes: number;
  fraudRate: number;
  trustedRate: number;
  trend: {
    day: string;
    total: number;
    fraud: number;
    blocked: number;
    avgScore: number;
    lossPrevented: number;
  }[];
  scoreDistribution: { bucket: string; count: number }[];
  patternBreakdown: { pattern: string; count: number }[];
  topSuspicious: {
    accountId: string;
    name: string;
    upiId: string;
    riskScore: number;
    status: string;
    totalReceived: number;
    flags: number;
  }[];
  modelSnapshot: unknown;
  seededAt: number;
};

const EMPTY_METRICS: NodeMetrics = {
  accountId: "",
  inDegree: 0,
  outDegree: 0,
  totalReceived: 0,
  totalSent: 0,
  outflowRatio: 0,
  uniqueSenders: 0,
  uniqueReceivers: 0,
  avgReceiveToSendSec: 86400,
  clustering: 0,
  community: 0,
  communitySize: 1,
  communityMuleCount: 0,
  fraudCluster: -1,
  clusterRole: "NONE",
  fraudClusterSize: 0,
  fraudClusterReach: 0,
  fraudClusterValue: 0,
  fraudClusterMules: 0,
  riskScore: 5,
  isMuleSuspect: false,
  status: "NORMAL",
  flaggedReasons: [],
};

function statusFor(metrics: NodeMetrics, index: number): AccountDoc["status"] {
  if (metrics.isMuleSuspect) {
    return index % 3 === 0 ? "BLOCKED" : "MULE_SUSPECT";
  }
  if (metrics.riskScore >= 60) {
    return index % 5 === 0 ? "UNDER_REVIEW" : "SUSPICIOUS";
  }
  if (index % 37 === 0) return "CLEARED";
  return "NORMAL";
}

export function buildAccountDocs(
  users: UserSeed[],
  merchants: MerchantSeed[],
  metrics: Map<string, NodeMetrics>,
): AccountDoc[] {
  const accounts: AccountDoc[] = [];

  users.forEach((user, index) => {
    const node = metrics.get(user.userId) ?? EMPTY_METRICS;
    accounts.push({
      accountId: user.userId,
      name: user.name,
      upiId: user.upiId,
      kind: "USER",
      createdAt: user.createdAt,
      accountAgeDays: user.accountAgeDays,
      riskLevel: node.riskScore >= 75 ? "HIGH" : node.riskScore >= 50 ? "MEDIUM" : "LOW",
      isMuleSuspect: node.isMuleSuspect,
      status: statusFor(node, index),
      city: user.city,
      inDegree: node.inDegree,
      outDegree: node.outDegree,
      totalReceived: node.totalReceived,
      totalSent: node.totalSent,
      outflowRatio: node.outflowRatio,
      uniqueSenders: node.uniqueSenders,
      uniqueReceivers: node.uniqueReceivers,
      avgReceiveToSendSec: node.avgReceiveToSendSec,
      clustering: node.clustering,
      community: node.community,
      communityMuleCount: node.communityMuleCount,
      fraudCluster: node.fraudCluster,
      clusterRole: node.clusterRole,
      fraudClusterSize: node.fraudClusterSize,
      fraudClusterReach: node.fraudClusterReach,
      fraudClusterValue: node.fraudClusterValue,
      fraudClusterMules: node.fraudClusterMules,
      riskScore: node.riskScore,
      flaggedReasons: node.flaggedReasons,
    });
  });

  merchants.forEach((merchant, index) => {
    const node = metrics.get(merchant.merchantId) ?? EMPTY_METRICS;
    accounts.push({
      accountId: merchant.merchantId,
      name: merchant.merchantName,
      upiId: merchant.upiId,
      kind: "MERCHANT",
      createdAt: merchant.registeredAt,
      accountAgeDays: Math.round((Date.now() - merchant.registeredAt) / DAY),
      riskLevel: node.riskScore >= 75 ? "HIGH" : node.riskScore >= 50 ? "MEDIUM" : "LOW",
      isMuleSuspect: false,
      status:
        merchant.status === "REVOKED"
          ? "BLOCKED"
          : merchant.status === "SUSPENDED"
            ? "UNDER_REVIEW"
            : index % 41 === 7
              ? "SUSPICIOUS"
              : "NORMAL",
      category: merchant.category,
      city: merchant.city,
      isVerified: merchant.isVerified,
      inDegree: node.inDegree,
      outDegree: node.outDegree,
      totalReceived: node.totalReceived,
      totalSent: node.totalSent,
      outflowRatio: node.outflowRatio,
      uniqueSenders: node.uniqueSenders,
      uniqueReceivers: node.uniqueReceivers,
      avgReceiveToSendSec: node.avgReceiveToSendSec,
      clustering: node.clustering,
      community: node.community,
      communityMuleCount: node.communityMuleCount,
      fraudCluster: node.fraudCluster,
      clusterRole: node.clusterRole,
      fraudClusterSize: node.fraudClusterSize,
      fraudClusterReach: node.fraudClusterReach,
      fraudClusterValue: node.fraudClusterValue,
      fraudClusterMules: node.fraudClusterMules,
      riskScore: node.riskScore,
      flaggedReasons: node.flaggedReasons,
    });
  });

  return accounts;
}

function dayKey(timestamp: number): string {
  const shifted = new Date(timestamp + 19_800_000); // IST-style buckets
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${month}-${day}`;
}

export function buildDashboardMetrics(input: {
  transactions: TxnDoc[];
  cases: CaseDoc[];
  merchants: MerchantSeed[];
  accounts: AccountDoc[];
  flaggedQrCodes: number;
  model: DiamondModel | null;
  now: number;
}): MetricsDoc {
  const { transactions, cases, merchants, accounts, model, now } = input;
  const total = transactions.length || 1;

  let highRisk = 0;
  let blocked = 0;
  let fraudCount = 0;
  let scoreSum = 0;
  let lossPrevented = 0;

  const buckets = new Map<string, number>();
  for (let i = 0; i < 10; i++) {
    buckets.set(`${i * 10}-${i * 10 + 9}`, 0);
  }
  buckets.set("100", 0);

  const patternCounts = new Map<string, number>();
  const trend = new Map<
    string,
    { day: string; total: number; fraud: number; blocked: number; scoreSum: number; lossPrevented: number }
  >();

  const cutoff = now - 14 * DAY;
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(now - i * DAY);
    trend.set(key, { day: key, total: 0, fraud: 0, blocked: 0, scoreSum: 0, lossPrevented: 0 });
  }

  for (const txn of transactions) {
    scoreSum += txn.diamondTrustScore;
    if (txn.isFraudLabel) fraudCount += 1;
    if (txn.diamondTrustScore < 55) highRisk += 1;
    if (txn.decision === "DO_NOT_PAY") blocked += 1;
    lossPrevented += txn.lossPrevented;

    const bucket = txn.diamondTrustScore >= 100 ? "100" : `${Math.floor(txn.diamondTrustScore / 10) * 10}-${Math.floor(txn.diamondTrustScore / 10) * 10 + 9}`;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);

    patternCounts.set(txn.fraudPattern, (patternCounts.get(txn.fraudPattern) ?? 0) + 1);

    if (txn.timestamp >= cutoff) {
      const key = dayKey(txn.timestamp);
      const row = trend.get(key);
      if (row) {
        row.total += 1;
        row.scoreSum += txn.diamondTrustScore;
        if (txn.isFraudLabel) row.fraud += 1;
        if (txn.decision === "DO_NOT_PAY") row.blocked += 1;
        row.lossPrevented += txn.lossPrevented;
      }
    }
  }

  const activeCases = cases.filter(
    (entry) => entry.status === "NEW" || entry.status === "INVESTIGATING" || entry.status === "ESCALATED",
  ).length;

  const topSuspicious = [...accounts]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10)
    .map((account) => ({
      accountId: account.accountId,
      name: account.name,
      upiId: account.upiId,
      riskScore: account.riskScore,
      status: account.status,
      totalReceived: account.totalReceived,
      flags: account.flaggedReasons.length,
    }));

  const trustedCount = transactions.filter((txn) => txn.riskCategory === "DIAMOND_SAFE").length;

  return {
    key: "global",
    totalTransactions: transactions.length,
    highRiskTransactions: highRisk,
    blockedTransactions: blocked,
    fraudLossPrevented: Math.round(lossPrevented),
    avgTrustScore: Math.round(scoreSum / total),
    activeCases,
    verifiedMerchants: merchants.filter((merchant) => merchant.isVerified).length,
    suspectedMuleAccounts: accounts.filter((account) => account.isMuleSuspect).length,
    flaggedQrCodes: input.flaggedQrCodes,
    fraudRate: round2((fraudCount / total) * 100),
    trustedRate: round2((trustedCount / total) * 100),
    trend: [...trend.values()].map((row) => ({
      day: row.day,
      total: row.total,
      fraud: row.fraud,
      blocked: row.blocked,
      avgScore: row.total > 0 ? Math.round(row.scoreSum / row.total) : 0,
      lossPrevented: Math.round(row.lossPrevented),
    })),
    scoreDistribution: [...buckets.entries()].map(([bucket, count]) => ({ bucket, count })),
    patternBreakdown: [...patternCounts.entries()]
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    topSuspicious,
    modelSnapshot: model
      ? {
          modelType: model.modelType,
          rocAuc: model.metrics.rocAuc,
          f1: model.metrics.f1,
          precision: model.metrics.precision,
          recall: model.metrics.recall,
          accuracy: model.metrics.accuracy,
          trainedAt: model.trainedAt,
          trainSize: model.trainSize,
          testSize: model.testSize,
          positives: model.metrics.positives,
          negatives: model.metrics.negatives,
          notes: model.metrics.notes,
          topFeatures: [...model.features]
            .sort((a, b) => b.importance - a.importance)
            .slice(0, 6)
            .map((feature) => ({
              label: feature.label,
              importance: feature.importance,
              coef: feature.coef,
            })),
        }
      : null,
    seededAt: now,
  };
}

export function metricsHealth(metrics: MetricsDoc | null) {
  return {
    seeded: metrics !== null,
    seededAt: metrics?.seededAt ?? null,
    modelAvailable: Boolean(metrics?.modelSnapshot),
    sampleCount: metrics?.totalTransactions ?? 0,
    fraudRate: metrics?.fraudRate ?? 0,
  };
}
