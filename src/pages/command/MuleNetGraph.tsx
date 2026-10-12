/**
 * DIAMOND-PROTECT :: Command Centre — MuleNet Graph.
 * Interactive transaction-network graph: nodes are accounts, edges are
 * payments, node size is volume, node colour is risk, edge width is amount.
 */

import { Shell } from "@/components/dp/Shell";
import {
  AccountStatusChip,
  BrutButton,
  Chip,
  EmptyBlock,
  ErrorNote,
  KeyValue,
  LoadingBlock,
  Panel,
} from "@/components/dp/ui";
import { api } from "@/convex/_generated/api";
import { durationLabel, formatInr, formatInrShort, timeAgo } from "@/lib/dp";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  ZoomIn,
  ZoomOut,
  Layers,
  ShieldQuestion,
  ShieldCheck,
  Crosshair,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

type GraphNode = {
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
  city?: string;
  flaggedReasons: string[];
};

type GraphEdge = {
  source: string;
  target: string;
  sourceName: string;
  targetName: string;
  amount: number;
  risk: number;
  timestamp: number;
  fraudLabel: boolean;
  suspicious: boolean;
};

const VIEW_W = 1180;
const VIEW_H = 700;

function riskColour(risk: number, status: string, role?: string): string {
  if (status === "BLOCKED") return "#0A0A0A";
  if (status === "CLEARED") return "#10B981";
  if (role === "MULE" || status === "MULE_SUSPECT") return "#EF4444";
  if (role === "SUSPICIOUS" || status === "SUSPICIOUS") return "#F59E0B";
  if (role === "PERIPHERAL") return "#7DD3FC";
  if (risk >= 72) return "#F59E0B";
  if (risk >= 55) return "#FDE047";
  return "#FFFFFF";
}

/**
 * Deterministic layout: every fraud cluster gets its own ring (collectors in
 * the middle, periphery around them) so the money-flow shape is readable, and
 * everything else is laid out on concentric outer rings.
 */
function layout(nodes: GraphNode[]) {
  const positions = new Map<string, { x: number; y: number }>();
  const clusters = new Map<number, GraphNode[]>();
  const loose: GraphNode[] = [];

  for (const node of nodes) {
    if (node.fraudCluster >= 0) {
      const list = clusters.get(node.fraudCluster) ?? [];
      list.push(node);
      clusters.set(node.fraudCluster, list);
    } else {
      loose.push(node);
    }
  }

  const clusterIds = [...clusters.keys()].sort((a, b) => a - b);
  const ringCount = Math.max(1, Math.ceil(Math.sqrt(clusterIds.length)));
  const cellW = VIEW_W / ringCount;
  const cellH = VIEW_H / ringCount;

  clusterIds.forEach((clusterId, index) => {
    const members = clusters.get(clusterId) ?? [];
    const col = index % ringCount;
    const row = Math.floor(index / ringCount);
    const cx = cellW * (col + 0.5);
    const cy = cellH * (row + 0.5);
    const core = members.filter((member) => member.clusterRole !== "PERIPHERAL");
    const periphery = members.filter((member) => member.clusterRole === "PERIPHERAL");
    const innerRadius = clusterIds.length > 12 ? 26 : 34;
    const outerRadius = clusterIds.length > 12 ? 52 : 66;

    core.forEach((member, memberIndex) => {
      const angle = (memberIndex / Math.max(1, core.length)) * Math.PI * 2 - Math.PI / 2;
      positions.set(member.id, {
        x: cx + Math.cos(angle) * innerRadius,
        y: cy + Math.sin(angle) * innerRadius,
      });
    });
    periphery.forEach((member, memberIndex) => {
      const angle =
        (memberIndex / Math.max(1, periphery.length)) * Math.PI * 2 + Math.PI / 8;
      positions.set(member.id, {
        x: cx + Math.cos(angle) * outerRadius,
        y: cy + Math.sin(angle) * outerRadius,
      });
    });
  });

  // Loose accounts on concentric rings around the canvas edge.
  const maxPerRing = 34;
  loose.forEach((node, index) => {
    const ring = Math.floor(index / maxPerRing);
    const slot = index % maxPerRing;
    const radius = 300 + ring * 46;
    const angle = (slot / maxPerRing) * Math.PI * 2 + ring * 0.22;
    positions.set(node.id, {
      x: VIEW_W / 2 + Math.cos(angle) * radius,
      y: VIEW_H / 2 + Math.sin(angle) * radius * 0.62,
    });
  });

  return positions;
}

export default function MuleNetGraph() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setAccountStatus = useMutation(api.commandCentre.setAccountStatus);

  const [cluster, setCluster] = useState<number | "">("");
  const [includeNormal, setIncludeNormal] = useState(false);
  const [minRisk, setMinRisk] = useState(0);
  const [selected, setSelected] = useState<string | null>(searchParams.get("accountId"));
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const graph = useQuery(api.commandCentre.mulenet, {
    community: cluster === "" ? undefined : Number(cluster),
    includeNormal,
    minRisk,
    maxNodes: 420,
  });

  const detail = useQuery(
    api.commandCentre.accountDetail,
    selected ? { accountId: selected } : "skip",
  );

  useEffect(() => {
    const fromUrl = searchParams.get("accountId");
    if (fromUrl) setSelected(fromUrl);
  }, [searchParams]);

  const nodes = useMemo(() => (graph?.nodes ?? []) as unknown as GraphNode[], [graph]);
  const edges = useMemo(() => (graph?.edges ?? []) as unknown as GraphEdge[], [graph]);
  const positions = useMemo(() => layout(nodes), [nodes]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const neighbours = useMemo(() => {
    const focus = hovered ?? selected;
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const edge of edges) {
      if (edge.source === focus) set.add(edge.target);
      if (edge.target === focus) set.add(edge.source);
    }
    return set;
  }, [edges, hovered, selected]);

  const visibleEdges = useMemo(() => {
    const maxAmount = Math.max(...edges.map((edge) => edge.amount), 1);
    return edges
      .filter((edge) => positions.has(edge.source) && positions.has(edge.target))
      .map((edge) => {
        const width = 1 + (edge.amount / maxAmount) * 5;
        return { ...edge, width };
      });
  }, [edges, positions]);

  const applyStatus = async (status: string) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await setAccountStatus({
        accountId: selected,
        status,
        actor: "analyst.mulenet",
      });
      if (response?.ok) {
        setMessage(
          `${nodeById.get(selected)?.name ?? selected} marked ${status.replace(/_/g, " ").toLowerCase()}.`,
        );
      } else {
        setError(response?.error ?? "Could not update the account.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the account.");
    } finally {
      setBusy(false);
    }
  };

  const openAccount = (accountId: string) => {
    setSelected(accountId);
    setMessage(null);
    setError(null);
    const next = new URLSearchParams(searchParams);
    next.set("accountId", accountId);
    setSearchParams(next, { replace: true });
  };

  const detailAccount = detail?.account as unknown as GraphNode | undefined;

  return (
    <Shell
      eyebrow="Command Centre · MuleNet"
      title="MuleNet Graph"
      description="Directed transaction graph built with the same analytics NetworkX would give you: degree, inflow, outflow ratio, unique counterparties, receive-to-forward latency, clustering and mule-collector detection."
      actions={
        <>
          <Chip tone="alert">{graph?.totals?.muleSuspects ?? 0} mule suspects</Chip>
          <Chip tone="dark">{graph?.totals?.blocked ?? 0} blocked</Chip>
        </>
      }
    >
      <div className="space-y-5">
        <Panel title="Graph controls" tone="diamond">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-3">
              <div>
                <p className="dp-label text-[#0A0A0A]/55">Fraud cluster</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCluster("")}
                    className={cn(
                      "brut-flat px-2 py-1 text-[11px] font-bold uppercase",
                      cluster === "" ? "bg-[#0A0A0A] text-[#F4F1EA]" : "bg-white",
                    )}
                  >
                    All clusters
                  </button>
                  {(graph?.communities ?? []).map((entry) => (
                    <button
                      key={entry.community}
                      type="button"
                      onClick={() => setCluster(entry.community)}
                      className={cn(
                        "brut-flat px-2 py-1 text-[11px] font-bold uppercase",
                        cluster === entry.community
                          ? "bg-[#EF4444] text-white"
                          : entry.mules > 0
                            ? "bg-[#FDE047]"
                            : "bg-white",
                      )}
                    >
                      {entry.label}
                      <span className="dp-tabular ml-1 opacity-70">{entry.size}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <label className="block">
                  <span className="dp-label text-[#0A0A0A]/55">
                    Minimum account risk · {minRisk}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={5}
                    value={minRisk}
                    onChange={(event) => setMinRisk(Number(event.target.value))}
                    className="mt-2 w-[200px] accent-[#0A0A0A]"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includeNormal}
                    onChange={(event) => setIncludeNormal(event.target.checked)}
                    className="size-4 accent-[#0A0A0A]"
                  />
                  <span className="dp-label text-[#0A0A0A]/70">
                    include healthy accounts
                  </span>
                </label>
                <div className="flex items-center gap-1.5">
                  <BrutButton size="sm" tone="neutral" onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))}>
                    <ZoomIn className="size-3" />
                  </BrutButton>
                  <BrutButton size="sm" tone="neutral" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}>
                    <ZoomOut className="size-3" />
                  </BrutButton>
                  <BrutButton size="sm" tone="neutral" onClick={() => setZoom(1)}>
                    fit
                  </BrutButton>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:w-[300px]">
              <LegendSwatch colour="#EF4444" label="Mule collector" />
              <LegendSwatch colour="#F59E0B" label="Suspicious" />
              <LegendSwatch colour="#7DD3FC" label="Cluster periphery" />
              <LegendSwatch colour="#FFFFFF" label="Normal account" />
              <LegendSwatch colour="#0A0A0A" label="Blocked account" />
              <LegendSwatch colour="#10B981" label="Cleared account" />
            </div>
          </div>
          <p className="dp-mono mt-3 text-[10px] font-bold uppercase text-[#0A0A0A]/50">
            showing {graph?.totals?.visible ?? 0} of {graph?.totals?.accounts ?? 0} accounts ·{" "}
            {visibleEdges.length} payment edges · node size = volume · edge width = amount
          </p>
        </Panel>

        {graph === undefined ? (
          <LoadingBlock label="Building the transaction network" />
        ) : !graph.ok || nodes.length === 0 ? (
          <EmptyBlock
            title="Graph is empty"
            hint="Regenerate the demo data or relax the filters."
          />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
            <Panel
              title="Transaction network"
              subtitle="Click a node to investigate; hover to isolate its neighbourhood"
              tight
            >
              <div className="dp-grid overflow-hidden bg-[#F4F1EA]">
                <svg
                  viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                  className="h-[600px] w-full"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
                >
                  {visibleEdges.map((edge, index) => {
                    const from = positions.get(edge.source);
                    const to = positions.get(edge.target);
                    if (!from || !to) return null;
                    const dimmed =
                      neighbours !== null &&
                      !(
                        neighbours.has(edge.source) &&
                        neighbours.has(edge.target)
                      );
                    return (
                      <line
                        key={`${edge.source}-${edge.target}-${index}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={edge.suspicious ? "#EF4444" : "#0A0A0A"}
                        strokeWidth={edge.width}
                        strokeOpacity={dimmed ? 0.12 : 0.6}
                        strokeDasharray={edge.suspicious ? undefined : "4 5"}
                      />
                    );
                  })}

                  {nodes.map((node) => {
                    const point = positions.get(node.id);
                    if (!point) return null;
                    const dimmed = neighbours !== null && !neighbours.has(node.id);
                    const radius = Math.max(6, Math.min(26, node.size * 0.72));
                    const isSelected = selected === node.id;
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${point.x} ${point.y})`}
                        opacity={dimmed ? 0.25 : 1}
                        onClick={() => openAccount(node.id)}
                        onMouseEnter={() => setHovered(node.id)}
                        onMouseLeave={() => setHovered(null)}
                        style={{ cursor: "pointer" }}
                      >
                        <circle
                          r={radius}
                          fill={riskColour(node.risk, node.status, node.clusterRole)}
                          stroke="#0A0A0A"
                          strokeWidth={isSelected ? 4 : 2.5}
                        />
                        {(isSelected || hovered === node.id) && (
                          <>
                            <circle
                              r={radius + 7}
                              fill="none"
                              stroke="#0A0A0A"
                              strokeWidth={1.5}
                              strokeDasharray="3 3"
                            />
                            <rect
                              x={-52}
                              y={-radius - 26}
                              width={104}
                              height={18}
                              fill="#FFFFFF"
                              stroke="#0A0A0A"
                              strokeWidth={2}
                            />
                            <text
                              x={0}
                              y={-radius - 13}
                              textAnchor="middle"
                              fontSize={9.5}
                              fontFamily="JetBrains Mono, monospace"
                              fontWeight={700}
                              fill="#0A0A0A"
                            >
                              {node.name.slice(0, 17)}
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </Panel>

            <div className="space-y-4">
              {selected ? (
                <>
                  <Panel
                    title="Account investigation"
                    subtitle={selected}
                    right={
                      <BrutButton size="sm" tone="neutral" onClick={() => setSelected(null)}>
                        <X className="size-3" />
                      </BrutButton>
                    }
                  >
                    {detail === undefined ? (
                      <LoadingBlock label="Loading account" />
                    ) : detailAccount ? (
                      <div className="space-y-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <AccountStatusChip status={detailAccount.status} />
                          <Chip tone="dark">risk {detailAccount.risk}</Chip>
                          {detailAccount.clusterRole &&
                            detailAccount.clusterRole !== "NONE" && (
                              <Chip
                                tone={detailAccount.clusterRole === "MULE" ? "alert" : "info"}
                              >
                                {detailAccount.clusterRole}
                              </Chip>
                            )}
                        </div>
                        <KeyValue label="Name" value={detailAccount.name} />
                        <KeyValue label="UPI ID" value={detailAccount.upiId} mono />
                        <KeyValue
                          label="Type"
                          value={detailAccount.kind === "MERCHANT" ? "Merchant" : "Customer"}
                        />
                        <KeyValue label="City" value={detailAccount.city || "—"} />
                        <KeyValue
                          label="Account age"
                          value={`${detailAccount.accountAgeDays} days`}
                          mono
                        />
                        <KeyValue
                          label="In-degree"
                          value={detailAccount.inDegree}
                          mono
                        />
                        <KeyValue
                          label="Out-degree"
                          value={detailAccount.outDegree}
                          mono
                        />
                        <KeyValue
                          label="Total received"
                          value={formatInr(detailAccount.totalReceived)}
                          mono
                        />
                        <KeyValue
                          label="Total sent"
                          value={formatInr(detailAccount.totalSent)}
                          mono
                        />
                        <KeyValue
                          label="Outflow ratio"
                          value={`${Math.round(detailAccount.outflowRatio * 100)}%`}
                          mono
                        />
                        <KeyValue
                          label="Unique senders"
                          value={detailAccount.uniqueSenders}
                          mono
                        />
                        <KeyValue
                          label="Unique receivers"
                          value={detailAccount.uniqueReceivers}
                          mono
                        />
                        <KeyValue
                          label="Avg receive → send"
                          value={durationLabel(detailAccount.avgReceiveToSendSec)}
                          mono
                        />
                        <KeyValue
                          label="Clustering coefficient"
                          value={detailAccount.clustering}
                          mono
                        />
                        <KeyValue
                          label="Fraud cluster"
                          value={
                            detailAccount.fraudCluster >= 0
                              ? `C${detailAccount.fraudCluster} · ${detailAccount.fraudClusterReach} accounts · ${formatInrShort(detailAccount.fraudClusterValue)}`
                              : "none"
                          }
                          mono
                        />

                        {(detailAccount.flaggedReasons ?? []).length > 0 && (
                          <ul className="mt-2 space-y-1.5">
                            {(detailAccount.flaggedReasons ?? []).map((reason) => (
                              <li
                                key={reason}
                                className="brut-flat bg-[#EF4444] p-2 text-[11px] font-bold leading-4 text-white"
                              >
                                {reason}
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-3 grid gap-1.5">
                          <BrutButton
                            tone="alert"
                            className="w-full"
                            disabled={busy}
                            onClick={() => void applyStatus("BLOCKED")}
                          >
                            <Ban className="size-3.5" /> Block account
                          </BrutButton>
                          <BrutButton
                            tone="sun"
                            className="w-full"
                            disabled={busy}
                            onClick={() => void applyStatus("UNDER_REVIEW")}
                          >
                            <ShieldQuestion className="size-3.5" /> Under review
                          </BrutButton>
                          <BrutButton
                            tone="safe"
                            className="w-full"
                            disabled={busy}
                            onClick={() => void applyStatus("CLEARED")}
                          >
                            <ShieldCheck className="size-3.5" /> Clear account
                          </BrutButton>
                        </div>
                        {message && (
                          <p className="brut-flat mt-2 bg-[#10B981] p-2 text-[11px] font-bold uppercase leading-4">
                            {message}
                          </p>
                        )}
                        {error && <div className="mt-2"><ErrorNote message={error} /></div>}
                      </div>
                    ) : (
                      <EmptyBlock title="Account not found" />
                    )}
                  </Panel>

                  <Panel title="Recent inbound payments" tight>
                    {(detail?.transactions ?? []).length === 0 ? (
                      <div className="p-3">
                        <EmptyBlock title="No inbound payments recorded" />
                      </div>
                    ) : (
                      <ul>
                        {(detail?.transactions ?? []).slice(0, 8).map((txn) => (
                          <li
                            key={txn.txnId}
                            className="flex items-center justify-between gap-2 border-b-2 border-dashed border-[#0A0A0A]/20 p-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold">
                                {txn.userName}
                              </p>
                              <p className="dp-mono text-[10px] text-[#0A0A0A]/55">
                                {txn.txnId} · {timeAgo(txn.timestamp)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className="dp-tabular text-[12px] font-bold">
                                {formatInr(txn.amount)}
                              </span>
                              <Chip tone={txn.diamondTrustScore >= 55 ? "caution" : "alert"}>
                                {txn.diamondTrustScore}
                              </Chip>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                </>
              ) : (
                <Panel title="Account investigation">
                  <EmptyBlock
                    title="Select a node"
                    hint="Click any account in the graph to pull its full MuleNet profile and act on it."
                  />
                </Panel>
              )}

              <Panel title="Top suspicious clusters" tone="alert" tight>
                <div className="max-h-[420px] overflow-y-auto">
                  <ul>
                    {(graph.clusters ?? []).map((entry) => (
                      <li
                        key={entry.clusterId}
                        className={cn(
                          "border-b-2 border-dashed border-[#0A0A0A]/20 p-3",
                          cluster !== "" && `C${cluster}` === entry.clusterId
                            ? "bg-[#FDE047]"
                            : "bg-white",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const numeric = Number(entry.clusterId.replace("C", ""));
                              setCluster(numeric);
                            }}
                            className="brut-flat bg-[#0A0A0A] px-2 py-0.5 text-[11px] font-bold text-[#F4F1EA]"
                          >
                            {entry.clusterId}
                          </button>
                          <div className="flex items-center gap-1.5">
                            <Chip tone="caution">avg risk {entry.avgRisk}</Chip>
                            <Chip tone="alert">{entry.muleAccounts.length} mules</Chip>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3">
                          <KeyValue label="Members" value={entry.memberCount} mono />
                          <KeyValue
                            label="Value"
                            value={formatInrShort(entry.totalValue)}
                            mono
                          />
                        </div>
                        <ul className="mt-1.5 space-y-1">
                          {entry.muleAccounts.map((mule) => (
                            <li key={mule.accountId} className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => openAccount(mule.accountId)}
                                className="truncate text-[11px] font-bold underline decoration-2 underline-offset-2"
                              >
                                {mule.name}
                              </button>
                              <span className="dp-mono text-[10px] font-bold">
                                {mule.accountId} · {mule.risk}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              </Panel>
            </div>
          </div>
        )}

        <Panel title="How MuleNet decides" subtitle="The exact profile the graph layer applies" tone="info">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="dp-label text-[#0A0A0A]/60">Collector profile</p>
              <ul className="mt-2 space-y-1.5 text-[12px] font-medium">
                {[
                  "in-degree ≥ 6 inbound payments",
                  "out-degree ≥ 4 outbound payments",
                  "outflow ratio ≥ 75% of what it received",
                  "average receive → forward latency ≤ 300 seconds",
                  "connected to at least 2 other suspicious accounts",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Crosshair className="mt-0.5 size-3.5 shrink-0" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="dp-label text-[#0A0A0A]/60">Computed per account</p>
              <div className="grid grid-cols-2 gap-x-4">
                {[
                  "in-degree / out-degree",
                  "total received / sent",
                  "outflow ratio",
                  "unique senders / receivers",
                  "receive → forward latency",
                  "clustering coefficient",
                  "community membership",
                  "fraud cluster + reach",
                ].map((line) => (
                  <p key={line} className="flex items-start gap-2 py-0.5 text-[12px] font-medium">
                    <Layers className="mt-0.5 size-3.5 shrink-0" />
                    {line}
                  </p>
                ))}
              </div>
              <p className="mt-3 text-[11px] font-medium leading-5 text-[#0A0A0A]/60">
                Fraud clusters are the connected components of the suspicious subgraph —
                a whole-ledger component would merge every customer into one blob because
                ordinary payments connect almost everybody.
              </p>
            </div>
          </div>
          <p className="dp-mono mt-3 border-t-2 border-dashed border-[#0A0A0A]/25 pt-3 text-[10px] font-bold uppercase text-[#0A0A0A]/50">
            Deterministic replay: regenerating the demo data produces exactly this graph
            again, so a judge can watch the same clusters be rediscovered.
          </p>
        </Panel>
      </div>
    </Shell>
  );
}

function LegendSwatch({ colour, label }: { colour: string; label: string }) {
  return (
    <div className="brut-flat flex items-center gap-2 bg-white px-2 py-1">
      <span
        className="size-3.5 shrink-0 border-2 border-[#0A0A0A]"
        style={{ background: colour }}
      />
      <span className="truncate text-[10px] font-bold uppercase tracking-[0.04em]">
        {label}
      </span>
    </div>
  );
}
