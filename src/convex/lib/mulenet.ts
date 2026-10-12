/**
 * DIAMOND-PROTECT :: Layer 3 — MuleNet graph engine.
 *
 * NetworkX-equivalent analytics implemented in TypeScript so the whole graph
 * layer runs inside the app with zero Python dependencies:
 *   in/out degree, total received/sent, outflow ratio, unique counterparties,
 *   receive→forward latency, clustering coefficient, community membership and
 *   money-mule cluster detection.
 */

import { clamp, formatDuration, type RiskSignal } from "./types";

export type GraphEdgeInput = {
  source: string;
  target: string;
  amount: number;
  timestamp: number;
  fraudLabel?: boolean;
};

export type NodeMetrics = {
  accountId: string;
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
  communitySize: number;
  communityMuleCount: number;
  /** Fraud cluster = connected component of the suspicious subgraph, -1 if none. */
  fraudCluster: number;
  clusterRole: "MULE" | "SUSPICIOUS" | "PERIPHERAL" | "NONE";
  fraudClusterSize: number;
  /** How many accounts the cluster touches (members + their counterparties). */
  fraudClusterReach: number;
  fraudClusterValue: number;
  fraudClusterMules: number;
  riskScore: number;
  isMuleSuspect: boolean;
  status: "NORMAL" | "SUSPICIOUS" | "MULE_SUSPECT";
  flaggedReasons: string[];
};

export type AccountSeed = {
  accountId: string;
  fraudReports: number;
  accountAgeDays: number;
};

const NO_LATENCY = 86400; // "never forwarded" sentinel, in seconds

export function computeGraphMetrics(
  edges: GraphEdgeInput[],
  accountIds: string[],
  seeds: Map<string, AccountSeed>,
  merchantIds: Set<string> = new Set(),
): Map<string, NodeMetrics> {
  const inEdges = new Map<string, GraphEdgeInput[]>();
  const outEdges = new Map<string, GraphEdgeInput[]>();
  const neighbours = new Map<string, Set<string>>();
  const totals = new Map<
    string,
    { received: number; sent: number; senders: Set<string>; receivers: Set<string> }
  >();

  for (const id of accountIds) {
    inEdges.set(id, []);
    outEdges.set(id, []);
    neighbours.set(id, new Set());
    totals.set(id, { received: 0, sent: 0, senders: new Set(), receivers: new Set() });
  }

  for (const edge of edges) {
    if (!totals.has(edge.source) || !totals.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    inEdges.get(edge.target)!.push(edge);
    outEdges.get(edge.source)!.push(edge);
    neighbours.get(edge.source)!.add(edge.target);
    neighbours.get(edge.target)!.add(edge.source);
    const sourceTotals = totals.get(edge.source)!;
    const targetTotals = totals.get(edge.target)!;
    sourceTotals.sent += edge.amount;
    sourceTotals.receivers.add(edge.target);
    targetTotals.received += edge.amount;
    targetTotals.senders.add(edge.source);
  }

  // Community = connected component on the undirected projection.
  const community = new Map<string, number>();
  let communityId = 0;
  for (const id of accountIds) {
    if (community.has(id)) continue;
    const stack = [id];
    community.set(id, communityId);
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const next of neighbours.get(current) ?? []) {
        if (community.has(next)) continue;
        community.set(next, communityId);
        stack.push(next);
      }
    }
    communityId += 1;
  }

  const communitySizes = new Map<number, number>();
  for (const id of accountIds) {
    const c = community.get(id)!;
    communitySizes.set(c, (communitySizes.get(c) ?? 0) + 1);
  }

  const metrics = new Map<string, NodeMetrics>();

  for (const id of accountIds) {
    const incoming = inEdges.get(id) ?? [];
    const outgoing = outEdges.get(id) ?? [];
    const totalsRow = totals.get(id)!;
    const uniqueSenders = totalsRow.senders.size;
    const uniqueReceivers = totalsRow.receivers.size;

    // Average time between receiving money and forwarding it.
    const inTimes = incoming.map((e) => e.timestamp).sort((a, b) => a - b);
    const latencies: number[] = [];
    for (const edge of outgoing) {
      let best: number | null = null;
      for (const t of inTimes) {
        if (t <= edge.timestamp) best = edge.timestamp - t;
        else break;
      }
      if (best !== null) latencies.push(best / 1000);
    }
    const avgReceiveToSendSec =
      latencies.length === 0
        ? NO_LATENCY
        : latencies.reduce((sum, value) => sum + value, 0) / latencies.length;

    const outflowRatio =
      totalsRow.received > 0
        ? Math.min(1.5, totalsRow.sent / totalsRow.received)
        : totalsRow.sent > 0
          ? 1.5
          : 0;

    // Local clustering coefficient on the undirected projection.
    let clustering = 0;
    const nbrs = [...(neighbours.get(id) ?? [])];
    if (nbrs.length >= 2) {
      let links = 0;
      for (let i = 0; i < nbrs.length; i++) {
        for (let j = i + 1; j < nbrs.length; j++) {
          if (neighbours.get(nbrs[i])?.has(nbrs[j])) links += 1;
        }
      }
      clustering = (2 * links) / (nbrs.length * (nbrs.length - 1));
    }

    const seed = seeds.get(id);
    const fraudReports = seed?.fraudReports ?? 0;
    const isMerchant = merchantIds.has(id);

    // Merchant accounts legitimately fan in from hundreds of payers, so their
    // node risk is driven by forwarding behaviour and merchant status only.
    const riskScore = isMerchant
      ? clamp(
          6 +
            Math.min(18, Math.max(0, (outflowRatio - 0.4) * 45)) +
            (avgReceiveToSendSec <= 300 && outgoing.length > 0 ? 12 : 0) +
            Math.min(16, fraudReports * 7),
        )
      : clamp(
          8 +
            Math.min(30, uniqueSenders * 3) +
            Math.min(18, Math.max(0, (outflowRatio - 0.4) * 40)) +
            (avgReceiveToSendSec <= 300 && outgoing.length > 0 ? 14 : 0) +
            Math.min(20, fraudReports * 7) +
            (seed && seed.accountAgeDays < 30 ? 8 : 0),
        );

    metrics.set(id, {
      accountId: id,
      inDegree: incoming.length,
      outDegree: outgoing.length,
      totalReceived: Math.round(totalsRow.received),
      totalSent: Math.round(totalsRow.sent),
      outflowRatio: Math.round(outflowRatio * 1000) / 1000,
      uniqueSenders,
      uniqueReceivers,
      avgReceiveToSendSec: Math.round(avgReceiveToSendSec),
      clustering: Math.round(clustering * 1000) / 1000,
      community: community.get(id)!,
      communitySize: communitySizes.get(community.get(id)!) ?? 1,
      communityMuleCount: 0,
      fraudCluster: -1,
      clusterRole: "NONE",
      fraudClusterSize: 0,
      fraudClusterReach: 0,
      fraudClusterValue: 0,
      fraudClusterMules: 0,
      riskScore: Math.round(riskScore),
      isMuleSuspect: false,
      status: "NORMAL",
      flaggedReasons: [],
    });
  }

  // ---- Money-mule detection (exactly the documented profile) -------------
  const provisional = new Set<string>();
  for (const node of metrics.values()) {
    const seed = seeds.get(node.accountId);
    const fraudReports = seed?.fraudReports ?? 0;
    const profile =
      node.inDegree >= 6 &&
      node.outDegree >= 4 &&
      node.outflowRatio >= 0.75 &&
      node.avgReceiveToSendSec <= 300;
    const boosted = node.riskScore >= 78 && node.inDegree >= 5 && fraudReports >= 2;
    if (profile || boosted) {
      provisional.add(node.accountId);
      node.flaggedReasons.push(
        profile
          ? `Collector profile: ${node.inDegree} inbound / ${node.outDegree} outbound, ${Math.round(
              node.outflowRatio * 100,
            )}% forwarded in ~${node.avgReceiveToSendSec}s.`
          : `High inflow with ${fraudReports} prior fraud reports.`,
      );
    }
  }

  for (const node of metrics.values()) {
    if (!provisional.has(node.accountId)) continue;
    let suspiciousNeighbours = 0;
    for (const nbr of neighbours.get(node.accountId) ?? []) {
      if (provisional.has(nbr)) suspiciousNeighbours += 1;
    }
    if (suspiciousNeighbours >= 2) {
      node.isMuleSuspect = true;
      node.status = "MULE_SUSPECT";
      node.flaggedReasons.push(
        `Linked to ${suspiciousNeighbours} other suspicious accounts in cluster C${node.community}.`,
      );
      node.riskScore = Math.max(node.riskScore, 85);
    } else {
      node.status = "SUSPICIOUS";
      node.riskScore = Math.max(node.riskScore, 68);
    }
  }

  // Community-level mule concentration (used by the graph risk layer).
  const communityMules = new Map<number, number>();
  for (const node of metrics.values()) {
    if (!node.isMuleSuspect) continue;
    communityMules.set(node.community, (communityMules.get(node.community) ?? 0) + 1);
  }
  for (const node of metrics.values()) {
    node.communityMuleCount = communityMules.get(node.community) ?? 0;
  }

  // ---- Fraud clusters ---------------------------------------------------
  // A single connected component over the whole ledger is useless because
  // ordinary payments connect almost everybody. Fraud clusters are therefore
  // the connected components of the *suspicious subgraph* (collectors plus any
  // account already scoring as high risk).
  const suspiciousSet = new Set<string>();
  for (const node of metrics.values()) {
    if (node.isMuleSuspect || node.riskScore >= 65) suspiciousSet.add(node.accountId);
  }

  const clusterOf = new Map<string, number>();
  let clusterId = 0;
  for (const id of suspiciousSet) {
    if (clusterOf.has(id)) continue;
    clusterId += 1;
    clusterOf.set(id, clusterId);
    const stack = [id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const nbr of neighbours.get(current) ?? []) {
        if (!suspiciousSet.has(nbr) || clusterOf.has(nbr)) continue;
        clusterOf.set(nbr, clusterId);
        stack.push(nbr);
      }
    }
  }

  const reach = new Map<number, Set<string>>();
  const clusterMules = new Map<number, number>();
  for (const [id, cluster] of clusterOf) {
    const set = reach.get(cluster) ?? new Set<string>();
    set.add(id);
    for (const nbr of neighbours.get(id) ?? []) set.add(nbr);
    reach.set(cluster, set);
    if (metrics.get(id)?.isMuleSuspect) {
      clusterMules.set(cluster, (clusterMules.get(cluster) ?? 0) + 1);
    }
  }

  const clusterValue = new Map<number, number>();
  for (const edge of edges) {
    const cluster = clusterOf.get(edge.target) ?? clusterOf.get(edge.source);
    if (cluster === undefined) continue;
    clusterValue.set(cluster, (clusterValue.get(cluster) ?? 0) + edge.amount);
  }

  // Accounts one hop away from a cluster are marked PERIPHERAL so the graph
  // view can draw the full money-flow picture around every collector ring.
  const assignedClusters = new Map<number, string[]>();
  for (const [cluster, members] of reach) {
    assignedClusters.set(cluster, [...members]);
  }

  for (const node of metrics.values()) {
    const cluster = clusterOf.get(node.accountId);
    if (cluster !== undefined) {
      node.fraudCluster = cluster;
      node.clusterRole = node.isMuleSuspect ? "MULE" : "SUSPICIOUS";
    } else {
      for (const [candidate, members] of assignedClusters) {
        if (!members.includes(node.accountId)) continue;
        node.fraudCluster = candidate;
        node.clusterRole = "PERIPHERAL";
        break;
      }
    }
    if (node.fraudCluster < 0) continue;
    const clusterIdValue = node.fraudCluster;
    node.fraudClusterSize = [...clusterOf.values()].filter(
      (value) => value === clusterIdValue,
    ).length;
    node.fraudClusterReach = reach.get(clusterIdValue)?.size ?? 1;
    node.fraudClusterMules = clusterMules.get(clusterIdValue) ?? 0;
    node.fraudClusterValue = Math.round(clusterValue.get(clusterIdValue) ?? 0);
  }

  return metrics;
}

export type GraphRiskInput = {
  beneficiaryName: string;
  riskScore: number;
  isMule: boolean;
  uniqueSenders: number;
  uniqueReceivers: number;
  outflowRatio: number;
  avgReceiveToSendSec: number;
  community: number;
  communitySize: number;
  communityMuleCount: number;
  accountAgeDays: number;
  senderWindowMin: number;
  sensitivity: number;
  isMerchant?: boolean;
  clusterId?: number;
  clusterMules?: number;
  clusterReach?: number;
};

export function graphRisk(input: GraphRiskInput): {
  score: number;
  signals: RiskSignal[];
} {
  const signals: RiskSignal[] = [];
  const sensitivity = Number.isFinite(input.sensitivity) ? input.sensitivity : 1;
  const isMerchant = Boolean(input.isMerchant);

  const inflowComponent = isMerchant
    ? Math.min(20, input.uniqueSenders * 0.4)
    : Math.min(100, input.uniqueSenders * 9);
  const outflowComponent = Math.min(100, Math.max(0, input.outflowRatio) * 100);
  const clusterMules = input.clusterMules ?? 0;
  const muleComponent = input.isMule
    ? 100
    : clusterMules > 0
      ? Math.min(75, 30 + clusterMules * 10)
      : 0;

  let score =
    0.4 * clamp(input.riskScore) +
    0.2 * inflowComponent +
    0.15 * outflowComponent +
    0.25 * muleComponent;

  score = clamp(score * sensitivity);
  if (input.isMule) score = Math.max(score, 82);

  if (input.isMule) {
    signals.push({
      ruleId: "G01",
      label: "Money-mule account profile",
      detail: `Beneficiary matches the MuleNet collector profile inside cluster C${
        input.clusterId ?? input.community
      }.`,
      weight: 30,
      layer: "GRAPH",
    });
  }
  if (input.uniqueSenders >= 4 && !isMerchant) {
    signals.push({
      ruleId: "G02",
      label: "Fan-in from many accounts",
      detail: `Beneficiary received funds from ${input.uniqueSenders} accounts within ${
        input.senderWindowMin
      } minutes.`,
      weight: 22,
      layer: "GRAPH",
    });
  }
  if (input.outflowRatio >= 0.6) {
    signals.push({
      ruleId: "G03",
      label: "Rapid forwarding",
      detail: `${Math.round(
        input.outflowRatio * 100,
      )}% of received funds were forwarded${
        input.avgReceiveToSendSec <= 300
          ? ` within an average of ${formatDuration(input.avgReceiveToSendSec * 1000)}`
          : ""
      }.`,
      weight: 20,
      layer: "GRAPH",
    });
  }
  if (clusterMules >= 1 && !input.isMule) {
    signals.push({
      ruleId: "G04",
      label: "Linked to mule cluster",
      detail: `Beneficiary is linked to a fraud cluster of ${input.clusterReach ?? input.communitySize} accounts containing ${clusterMules} suspected mule account(s).`,
      weight: 18,
      layer: "GRAPH",
    });
  }
  if (input.accountAgeDays < 30) {
    signals.push({
      ruleId: "G05",
      label: "Young account in network",
      detail: `Beneficiary account is only ${Math.round(
        input.accountAgeDays,
      )} days old and is already active in this payment network.`,
      weight: 10,
      layer: "GRAPH",
    });
  }

  return { score: Math.round(clamp(score)), signals };
}

export type GraphNodePayload = {
  id: string;
  name: string;
  upiId: string;
  kind: "USER" | "MERCHANT";
  risk: number;
  status: string;
  isMuleSuspect: boolean;
  clusterRole?: string;
  fraudCluster: number;
  fraudClusterSize: number;
  fraudClusterReach: number;
  fraudClusterValue: number;
  fraudClusterMules: number;
  size: number;
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
  accountAgeDays: number;
  flaggedReasons: string[];
};

export type GraphEdgePayload = {
  source: string;
  target: string;
  amount: number;
  risk: number;
  timestamp: number;
  fraudLabel: boolean;
};

export function sizeForVolume(volume: number): number {
  if (!Number.isFinite(volume) || volume <= 0) return 7;
  return Math.round(Math.min(34, 7 + Math.log10(1 + volume) * 4.2));
}

export type SuspiciousCluster = {
  clusterId: string;
  memberCount: number;
  totalValue: number;
  avgRisk: number;
  muleAccounts: { accountId: string; name: string; risk: number }[];
};

export function topSuspiciousClusters(
  nodes: GraphNodePayload[],
  limit = 10,
): SuspiciousCluster[] {
  const byCluster = new Map<number, GraphNodePayload[]>();
  for (const node of nodes) {
    if (typeof node.fraudCluster !== "number" || node.fraudCluster < 0) continue;
    const list = byCluster.get(node.fraudCluster) ?? [];
    list.push(node);
    byCluster.set(node.fraudCluster, list);
  }

  const clusters: SuspiciousCluster[] = [];
  for (const [cluster, members] of byCluster) {
    const mules = members.filter((member) => member.isMuleSuspect);
    const avgRisk =
      members.reduce((sum, member) => sum + member.risk, 0) / (members.length || 1);
    if (mules.length === 0 && avgRisk < 60) continue;
    const head = members[0];

    clusters.push({
      clusterId: `C${cluster}`,
      memberCount: (head.fraudClusterReach || members.length) + members.length,
      totalValue: Math.round(head.fraudClusterValue),
      avgRisk: Math.round(avgRisk),
      muleAccounts: mules
        .sort((a, b) => b.risk - a.risk)
        .slice(0, 4)
        .map((member) => ({
          accountId: member.id,
          name: member.name,
          risk: member.risk,
        })),
    });
  }

  return clusters
    .sort(
      (a, b) =>
        b.muleAccounts.length * 100 +
        b.avgRisk -
        (a.muleAccounts.length * 100 + a.avgRisk),
    )
    .slice(0, limit);
}
