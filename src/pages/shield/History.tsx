/**
 * DIAMOND-PROTECT :: Transaction History (payment shield view).
 */

import { Shell } from "@/components/dp/Shell";
import { TrustResult, type TrustView } from "@/components/dp/TrustResult";
import {
  BrutButton,
  CategoryChip,
  Chip,
  DecisionChip,
  EmptyBlock,
  ErrorNote,
  FilterPills,
  LoadingBlock,
  Panel,
  QrStatusChip,
} from "@/components/dp/ui";
import { api } from "@/convex/_generated/api";
import { formatDateTime, formatInr, patternLabel, scoreTone } from "@/lib/dp";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { Eye, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

export default function History() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [decision, setDecision] = useState("");
  const [qrStatus, setQrStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(150);

  const result = useQuery(api.diamond.transactions, {
    limit,
    search: search.trim() || undefined,
    riskCategory: category || undefined,
    decision: decision || undefined,
    qrStatus: qrStatus || undefined,
  });

  const detail = useQuery(
    api.diamond.transaction,
    selected ? { txnId: selected } : "skip",
  );

  const rows = result?.rows ?? [];

  const view: TrustView | null = useMemo(() => {
    const row = detail?.row;
    if (!row) return null;
    return {
      txnId: row.txnId,
      amount: row.amount,
      timestamp: row.timestamp,
      payerName: row.userName,
      payerUpiId: row.userUpiId,
      beneficiaryName: row.beneficiaryName,
      beneficiaryUpiId: row.beneficiaryUpiId,
      deviceId: row.deviceId,
      location: row.location,
      txnType: row.txnType,
      diamondTrustScore: row.diamondTrustScore,
      riskCategory: row.riskCategory,
      decision: row.decision,
      ruleScore: row.ruleScore,
      mlRisk: Math.round(row.mlProbability * 100),
      mlProbability: row.mlProbability,
      graphScore: row.graphScore,
      reasons: row.reasons ?? [],
      signals: (row.signals ?? []) as TrustView["signals"],
      recommendedAction: row.recommendedAction,
      explanation: row.explanation,
      qrStatus: row.qrStatus,
      fraudPattern: row.fraudPattern,
      isFraudLabel: row.isFraudLabel,
      features: row.features as Record<string, number>,
      graphNode: detail?.account
        ? {
            inDegree: detail.account.inDegree,
            outDegree: detail.account.outDegree,
            uniqueSenders: detail.account.uniqueSenders,
            uniqueReceivers: detail.account.uniqueReceivers,
            outflowRatio: detail.account.outflowRatio,
            avgReceiveToSendSec: detail.account.avgReceiveToSendSec,
            riskScore: detail.account.riskScore,
            isMuleSuspect: detail.account.isMuleSuspect,
            fraudCluster: detail.account.fraudCluster ?? -1,
            fraudClusterReach: detail.account.fraudClusterReach ?? 0,
            flaggedReasons: detail.account.flaggedReasons,
          }
        : null,
      modelAvailable: true,
    };
  }, [detail]);

  return (
    <Shell
      eyebrow="Payment Shield"
      title="Transaction History"
      description="Every scored payment from the synthetic demo ledger, with its Diamond Trust Score, decision and QR verdict."
      actions={
        <Chip tone="info">
          {result?.returned ?? 0} of {result?.scanned ?? 0} scanned
        </Chip>
      }
    >
      <div className="space-y-5">
        <Panel title="Search & filters" tone="diamond">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block">
              <span className="dp-label text-[#0A0A0A]/55">Search</span>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="brut-flat flex flex-1 items-center gap-2 bg-white px-2.5 py-2">
                  <Search className="size-3.5 shrink-0" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Transaction ID, beneficiary, UPI ID, payer or pattern"
                    className="w-full bg-transparent text-sm font-semibold focus:outline-none"
                  />
                </div>
                {search && (
                  <BrutButton size="sm" tone="neutral" onClick={() => setSearch("")}>
                    <X className="size-3" />
                  </BrutButton>
                )}
              </div>
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px]">
              <label className="block">
                <span className="dp-label text-[#0A0A0A]/55">Horizon</span>
                <select
                  value={String(limit)}
                  onChange={(event) => setLimit(Number(event.target.value))}
                  className="brut-flat mt-1.5 w-full bg-white p-2 text-sm font-semibold focus:outline-none"
                >
                  <option value="60">Latest 60</option>
                  <option value="150">Latest 150</option>
                  <option value="300">Latest 300</option>
                  <option value="600">Latest 600</option>
                </select>
              </label>
              <label className="block">
                <span className="dp-label text-[#0A0A0A]/55">QR status</span>
                <select
                  value={qrStatus}
                  onChange={(event) => setQrStatus(event.target.value)}
                  className="brut-flat mt-1.5 w-full bg-white p-2 text-sm font-semibold focus:outline-none"
                >
                  <option value="">Any QR status</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="CAUTION">Caution</option>
                  <option value="FAKE_TAMPERED">Fake / tampered</option>
                  <option value="NOT_USED">No QR</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            <div>
              <p className="dp-label text-[#0A0A0A]/55">Risk category</p>
              <div className="mt-1.5">
                <FilterPills
                  value={category}
                  onChange={setCategory}
                  allLabel="All scores"
                  options={[
                    { value: "DIAMOND_SAFE", label: "Safe" },
                    { value: "DIAMOND_CAUTION", label: "Caution" },
                    { value: "DIAMOND_ALERT", label: "Alert" },
                  ]}
                />
              </div>
            </div>
            <div>
              <p className="dp-label text-[#0A0A0A]/55">Decision</p>
              <div className="mt-1.5">
                <FilterPills
                  value={decision}
                  onChange={setDecision}
                  allLabel="Any decision"
                  options={[
                    { value: "PROCEED", label: "Proceed" },
                    { value: "VERIFY_BENEFICIARY", label: "Verify" },
                    { value: "EXTRA_AUTH", label: "Extra auth" },
                    { value: "DO_NOT_PAY", label: "Do not pay" },
                  ]}
                />
              </div>
            </div>
          </div>
          <p className="dp-mono mt-3 text-[10px] font-bold uppercase text-[#0A0A0A]/50">
            {result?.note ?? "Reading ledger…"}
          </p>
        </Panel>

        <Panel
          title="Transactions"
          subtitle={`${rows.length} row${rows.length === 1 ? "" : "s"} in view`}
          tight
        >
          {result === undefined ? (
            <div className="p-4">
              <LoadingBlock label="Reading synthetic ledger" />
            </div>
          ) : !result.ok ? (
            <div className="p-4">
              <ErrorNote message="The transaction store could not be read." />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyBlock
                title="No transactions match these filters"
                hint="Try widening the horizon or clearing the filters."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#0A0A0A] text-[#F4F1EA]">
                    {[
                      "Transaction ID",
                      "Beneficiary",
                      "Amount",
                      "When",
                      "Score",
                      "Category",
                      "Decision",
                      "QR",
                      "",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="dp-label whitespace-nowrap px-3 py-2 text-[10px]"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const score = Number(row.diamondTrustScore ?? 0);
                    return (
                      <tr
                        key={row.txnId}
                        className={cn(
                          "border-b-2 border-dashed border-[#0A0A0A]/20",
                          selected === row.txnId ? "bg-[#FDE047]" : "bg-white hover:bg-[#F4F1EA]",
                        )}
                      >
                        <td className="dp-mono whitespace-nowrap px-3 py-2 text-[11px] font-bold">
                          {row.txnId}
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-[12px] font-bold">{row.beneficiaryName}</p>
                          <p className="dp-mono text-[10px] text-[#0A0A0A]/55">
                            {row.beneficiaryUpiId}
                          </p>
                        </td>
                        <td className="dp-tabular whitespace-nowrap px-3 py-2 text-[12px] font-bold">
                          {formatInr(Number(row.amount ?? 0))}
                        </td>
                        <td className="dp-mono whitespace-nowrap px-3 py-2 text-[11px] font-semibold">
                          {formatDateTime(Number(row.timestamp ?? 0))}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "dp-tabular inline-block border-2 border-[#0A0A0A] px-2 py-0.5 text-[11px] font-black",
                              scoreTone(score) === "safe"
                                ? "bg-[#10B981]"
                                : scoreTone(score) === "caution"
                                  ? "bg-[#F59E0B]"
                                  : "bg-[#EF4444] text-white",
                            )}
                          >
                            {score}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <CategoryChip category={String(row.riskCategory ?? "")} />
                        </td>
                        <td className="px-3 py-2">
                          <DecisionChip decision={String(row.decision ?? "")} />
                        </td>
                        <td className="px-3 py-2">
                          <QrStatusChip status={String(row.qrStatus ?? "")} />
                        </td>
                        <td className="px-3 py-2">
                          <BrutButton
                            size="sm"
                            tone="neutral"
                            onClick={() =>
                              setSelected(selected === row.txnId ? null : row.txnId)
                            }
                          >
                            <Eye className="size-3" />
                            {selected === row.txnId ? "Hide" : "Open"}
                          </BrutButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {selected && (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="dp-label text-[#0A0A0A]/55">
                Investigation panel · {selected} ·{" "}
                {patternLabel(
                  (detail?.row?.fraudPattern as string | undefined) ?? undefined,
                )}
              </p>
              <BrutButton size="sm" tone="neutral" onClick={() => setSelected(null)}>
                <X className="size-3" /> Close
              </BrutButton>
            </div>
            {detail === undefined ? (
              <LoadingBlock label="Loading transaction" />
            ) : view ? (
              <TrustResult view={view} />
            ) : (
              <EmptyBlock title="Transaction not found" />
            )}
          </div>
        )}

        {rows.length >= limit - 5 && (
          <div className="flex justify-center">
            <BrutButton tone="info" onClick={() => setLimit((current) => Math.min(600, current + 150))}>
              Load more of the ledger
            </BrutButton>
          </div>
        )}
      </div>
    </Shell>
  );
}
