/**
 * DIAMOND-PROTECT :: dataset orchestrator.
 *
 *   directory -> QR codes -> transaction plans -> MuleNet metrics ->
 *   train ML model -> score ledger -> accounts -> fraud cases -> KPIs
 *
 * Everything is deterministic: the same fixed seed always regenerates the same
 * demo story, so a judge who clicks "Reset demo data" sees the identical
 * numbers they were shown a minute earlier.
 */

import {
  buildAccountDocs,
  buildDashboardMetrics,
  type AccountDoc,
  type MetricsDoc,
} from "./aggregate";
import {
  generateMerchants,
  generateQrCodes,
  generateUsers,
  MULE_CLUSTERS,
  type MerchantSeed,
  type QrDoc,
  type UserSeed,
} from "./generator";
import { buildFraudCases, buildLedger, planTransactions, type AuditDoc, type CaseDoc, type TxnDoc } from "./ledger";
import { computeGraphMetrics, topSuspiciousClusters, type GraphEdgeInput, type NodeMetrics } from "./mulenet";
import type { DiamondModel } from "./diamondMl";
import { DEFAULT_CONFIG, type RuleConfig } from "./types";

export type GraphEdgeDoc = {
  edgeId: string;
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  amount: number;
  risk: number;
  timestamp: number;
  fraudLabel: boolean;
  suspicious: boolean;
  community: number;
};

export type SeedDataset = {
  accounts: AccountDoc[];
  merchants: MerchantSeed[];
  users: UserSeed[];
  qrCodes: QrDoc[];
  transactions: TxnDoc[];
  cases: CaseDoc[];
  auditLogs: AuditDoc[];
  graphEdges: GraphEdgeDoc[];
  metrics: MetricsDoc;
  model: DiamondModel;
  stats: {
    users: number;
    merchants: number;
    qrCodes: number;
    transactions: number;
    cases: number;
    muleClusters: number;
    muleAccounts: number;
    fraudCount: number;
    fraudRate: number;
  };
};

export function generateDataset(
  configInput: RuleConfig = DEFAULT_CONFIG,
  now = Date.now(),
): SeedDataset {
  const config: RuleConfig = { ...DEFAULT_CONFIG, ...(configInput ?? {}) };

  const users = generateUsers(now);
  const merchants = generateMerchants(now);
  const qrCodes = generateQrCodes(merchants, now, config);
  const plans = planTransactions(users, merchants, qrCodes, now);

  // ---- MuleNet pass 1: structural metrics from the planned graph --------
  const accountIds = [
    ...users.map((user) => user.userId),
    ...merchants.map((merchant) => merchant.merchantId),
  ];
  const nameById = new Map<string, string>();
  const seeds = new Map<string, { accountId: string; fraudReports: number; accountAgeDays: number }>();
  users.forEach((user) => {
    nameById.set(user.userId, user.name);
    seeds.set(user.userId, {
      accountId: user.userId,
      fraudReports: user.fraudReports,
      accountAgeDays: user.accountAgeDays,
    });
  });
  merchants.forEach((merchant) => {
    nameById.set(merchant.merchantId, merchant.merchantName);
    seeds.set(merchant.merchantId, {
      accountId: merchant.merchantId,
      fraudReports: 0,
      accountAgeDays: Math.round((now - merchant.registeredAt) / 86400000),
    });
  });

  const plannedEdges: GraphEdgeInput[] = [];
  for (const plan of plans) {
    const source = users[plan.payerIdx]?.userId;
    const target = plan.unregistered
      ? plan.unregistered.id
      : plan.payeeMerchantIdx !== null
        ? merchants[plan.payeeMerchantIdx]?.merchantId
        : plan.payeeUserIdx !== null
          ? users[plan.payeeUserIdx]?.userId
          : undefined;
    if (!source || !target) continue;
    plannedEdges.push({
      source,
      target,
      amount: plan.amount,
      timestamp: plan.ts,
    });
  }

  const merchantIds = new Set(merchants.map((merchant) => merchant.merchantId));
  const graphMetrics = computeGraphMetrics(plannedEdges, accountIds, seeds, merchantIds);

  // ---- Train the ML layer, then score the whole ledger ------------------
  const ledger = buildLedger(plans, users, merchants, qrCodes, graphMetrics, config);

  const accounts = buildAccountDocs(users, merchants, graphMetrics);

  // ---- Sampled graph edge list for the interactive MuleNet view ---------
  const graphEdges: GraphEdgeDoc[] = [];
  let normalKept = 0;
  for (const [index, edge] of ledger.edges.entries()) {
    const sourceNode = graphMetrics.get(edge.source);
    const targetNode = graphMetrics.get(edge.target);
    const suspicious =
      Boolean(sourceNode?.isMuleSuspect) ||
      Boolean(targetNode?.isMuleSuspect) ||
      (sourceNode?.riskScore ?? 0) >= 72 ||
      (targetNode?.riskScore ?? 0) >= 72;
    if (!suspicious) {
      // Keep only a light sample of healthy edges so the canvas stays readable.
      if (normalKept >= 420 || index % 9 !== 0) continue;
      normalKept += 1;
    }
    graphEdges.push({
      edgeId: `EDGE-${index}`,
      source: edge.source,
      target: edge.target,
      sourceName: nameById.get(edge.source) ?? edge.source,
      targetName: nameById.get(edge.target) ?? edge.target,
      amount: edge.amount,
      risk: Math.max(
        graphMetrics.get(edge.source)?.riskScore ?? 10,
        graphMetrics.get(edge.target)?.riskScore ?? 10,
      ),
      timestamp: edge.timestamp,
      fraudLabel: Boolean(edge.fraudLabel),
      suspicious,
      community: graphMetrics.get(edge.target)?.community ?? 0,
    });
  }

  // ---- Fraud cases + audit trail ---------------------------------------
  const { cases, auditLogs } = buildFraudCases(ledger.transactions, now);

  const flaggedQrCodes = qrCodes.filter((qr) => qr.status !== "ACTIVE").length;
  const metrics = buildDashboardMetrics({
    transactions: ledger.transactions,
    cases,
    merchants,
    accounts,
    flaggedQrCodes,
    model: ledger.model,
    now,
  });

  const muleAccounts = accounts.filter((account) => account.isMuleSuspect).length;
  const fraudCount = ledger.transactions.filter((txn) => txn.isFraudLabel).length;

  const clusters = topSuspiciousClusters(
    accounts.map((account) => ({
      id: account.accountId,
      name: account.name,
      upiId: account.upiId,
      kind: account.kind,
      risk: account.riskScore,
      status: account.status,
      isMuleSuspect: account.isMuleSuspect,
      clusterRole: account.clusterRole,
      fraudCluster: account.fraudCluster,
      fraudClusterSize: account.fraudClusterSize,
      fraudClusterReach: account.fraudClusterReach,
      fraudClusterValue: account.fraudClusterValue,
      fraudClusterMules: account.fraudClusterMules,
      size: 10,
      inDegree: account.inDegree,
      outDegree: account.outDegree,
      totalReceived: account.totalReceived,
      totalSent: account.totalSent,
      outflowRatio: account.outflowRatio,
      uniqueSenders: account.uniqueSenders,
      uniqueReceivers: account.uniqueReceivers,
      avgReceiveToSendSec: account.avgReceiveToSendSec,
      clustering: account.clustering,
      community: account.community,
      accountAgeDays: account.accountAgeDays,
      flaggedReasons: account.flaggedReasons,
    })),
    Math.max(10, MULE_CLUSTERS),
  );

  auditLogs.push({
    logId: `LOG-SEED-${now}`,
    actor: "system",
    action: "DEMO_DATA_GENERATED",
    entityType: "system",
    entityId: "global",
    timestamp: now,
    details: `Synthetic ledger generated: ${ledger.transactions.length} transactions, ${accounts.length} accounts, ${qrCodes.length} QR codes, ${cases.length} fraud cases, ${clusters.length} clusters analysed.`,
  });

  return {
    accounts,
    merchants,
    users,
    qrCodes,
    transactions: ledger.transactions,
    cases,
    auditLogs,
    graphEdges,
    metrics,
    model: ledger.model,
    stats: {
      users: users.length,
      merchants: merchants.length,
      qrCodes: qrCodes.length,
      transactions: ledger.transactions.length,
      cases: cases.length,
      muleClusters: clusters.length,
      muleAccounts,
      fraudCount,
      fraudRate: Math.round((fraudCount / Math.max(1, ledger.transactions.length)) * 1000) / 10,
    },
  };
}

export function accountIndex(accounts: AccountDoc[]): Map<string, AccountDoc> {
  return new Map(accounts.map((account) => [account.accountId, account]));
}

export type { NodeMetrics, AccountDoc, MetricsDoc };
