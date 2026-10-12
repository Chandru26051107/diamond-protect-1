/**
 * DIAMOND-PROTECT :: Command Centre — Transaction Investigator.
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
  KeyValue,
  LoadingBlock,
  Panel,
  QrStatusChip,
} from "@/components/dp/ui";
import { api } from "@/convex/_generated/api";
import {
  formatDateTime,
  formatInr,
  formatInrShort,
  patternLabel,
  scoreTone,
} from "@/lib/dp";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowDownUp,
  Ban,
  Eye,
  FilePlus2,
  Search,
  ShieldQuestion,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

type SortKey = "time" | "score" | "amount";

export default function Investigator() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const reportFraud = useMutation(api.diamond.reportFraud);
  const setAccountStatus = useMutation(api.commandCentre.setAccountStatus);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [decision, setDecision] = useState("");
  const [qrStatus, setQrStatus] = useState("");
  const [pattern, setPattern] = useState("");
  const [fraudOnly, setFraudOnly] = useState(false);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<string | null>(searchParams.get("txnId"));
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const limit = 400;
  const list = useQuery(api.diamond.transactions, {
    limit,
    search: search.trim() || undefined,
    riskCategory: category || undefined,
    decision: decision || undefined,
    qrStatus: qrStatus || undefined,
    pattern: pattern || undefined,
    fraudOnly: fraudOnly || undefined,
    minAmount: minAmount ? Number(minAmount) : undefined,
    maxAmount: maxAmount ? Number(maxAmount) : undefined,
  });

  const detail = useQuery(
    api.diamond.transaction,
    selected ? { txnId: selected } : "skip",
  );

  useEffect(() => {
    const fromUrl = searchParams.get("txnId");
    if (fromUrl) setSelected(fromUrl);
  }, [searchParams]);

  const rows = useMemo(() => {
    const list_rows = [...(list?.rows ?? [])];
    const direction = sortDir === "asc" ? 1 : -1;
    list_rows.sort((a, b) => {
      const left =
        sortKey === "time"
          ? Number(a.timestamp ?? 0)
          : sortKey === "score"
            ? Number(a.diamondTrustScore ?? 0)
            : Number(a.amount ?? 0);
      const right =
        sortKey === "time"
          ? Number(b.timestamp ?? 0)
          : sortKey === "score"
            ? Number(b.diamondTrustScore ?? 0)
            : Number(b.amount ?? 0);
      return (left - right) * direction;
    });
    return list_rows;
  }, [list, sortKey, sortDir]);

  const patternOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of list?.rows ?? []) {
      if (row.fraudPattern) set.add(String(row.fraudPattern));
    }
    return [...set].sort();
  }, [list]);

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

  const openRow = (txnId: string) => {
    setSelected(txnId);
    setActionMessage(null);
    setActionError(null);
    const next = new URLSearchParams(searchParams);
    next.set("txnId", txnId);
    setSearchParams(next, { replace: true });
  };

  const closeRow = () => {
    setSelected(null);
    const next = new URLSearchParams(searchParams);
    next.delete("txnId");
    setSearchParams(next, { replace: true });
  };

  const createCase = async () => {
    if (!selected) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const response = await reportFraud({
        txnId: selected,
        reason: "Escalated by a fraud analyst from the Transaction Investigator.",
        reportedBy: "analyst.console",
      });
      if (response?.ok) setActionMessage(response.message ?? "Case created.");
      else setActionError(response?.error ?? "Could not create the case.");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not create the case.");
    } finally {
      setActionBusy(false);
    }
  };

  const changeStatus = async (status: string) => {
    const accountId = detail?.row?.beneficiaryId;
    if (!accountId) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const response = await setAccountStatus({
        accountId,
        status,
        actor: "analyst.console",
        note: `Beneficiary marked ${status} while investigating ${selected}.`,
      });
      if (response?.ok) {
        setActionMessage(
          `${detail?.row?.beneficiaryName ?? accountId} marked ${status.replace(/_/g, " ").toLowerCase()}. Action written to the audit log.`,
        );
      } else {
        setActionError(response?.error ?? "Could not update the account.");
      }
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not update the account.");
    } finally {
      setActionBusy(false);
    }
  };

  const sorted = sortKey !== "time" ? sortKey : null;

  return (
    <Shell
      eyebrow="Command Centre · investigation"
      title="Transaction Investigator"
      description="Search, filter and drill into any scored payment. Every exception is explainable down to the rule, the model contribution and the network neighbourhood."
      actions={
        <Chip tone="info">
          {list?.returned ?? 0} of {list?.scanned ?? 0} scanned
        </Chip>
      }
    >
      <div className="space-y-5">
        <Panel title="Filters" tone="diamond">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <label className="block">
              <span className="dp-label text-[#0A0A0A]/55">Search</span>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="brut-flat flex flex-1 items-center gap-2 bg-white px-2.5 py-2">
                  <Search className="size-3.5 shrink-0" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Txn ID, payer, beneficiary, UPI ID or pattern"
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
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="dp-label text-[#0A0A0A]/55">Min amount</span>
                <input
                  value={minAmount}
                  onChange={(event) => setMinAmount(event.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  className="brut-flat dp-tabular mt-1.5 w-full bg-white p-2 text-sm font-bold focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="dp-label text-[#0A0A0A]/55">Max amount</span>
                <input
                  value={maxAmount}
                  onChange={(event) => setMaxAmount(event.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="any"
                  className="brut-flat dp-tabular mt-1.5 w-full bg-white p-2 text-sm font-bold focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="dp-label text-[#0A0A0A]/55">Pattern</span>
                <select
                  value={pattern}
                  onChange={(event) => setPattern(event.target.value)}
                  className="brut-flat mt-1.5 w-full bg-white p-2 text-[12px] font-semibold focus:outline-none"
                >
                  <option value="">Any pattern</option>
                  {patternOptions.map((option) => (
                    <option key={option} value={option}>
                      {patternLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-4">
            <div>
              <p className="dp-label text-[#0A0A0A]/55">Risk category</p>
              <div className="mt-1.5">
                <FilterPills
                  value={category}
                  onChange={setCategory}
                  allLabel="Any"
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
                  allLabel="Any"
                  options={[
                    { value: "PROCEED", label: "Proceed" },
                    { value: "VERIFY_BENEFICIARY", label: "Verify" },
                    { value: "EXTRA_AUTH", label: "Extra auth" },
                    { value: "DO_NOT_PAY", label: "Block" },
                  ]}
                />
              </div>
            </div>
            <div>
              <p className="dp-label text-[#0A0A0A]/55">QR status</p>
              <div className="mt-1.5">
                <FilterPills
                  value={qrStatus}
                  onChange={setQrStatus}
                  allLabel="Any"
                  options={[
                    { value: "VERIFIED", label: "Verified" },
                    { value: "CAUTION", label: "Caution" },
                    { value: "FAKE_TAMPERED", label: "Fake" },
                    { value: "NOT_USED", label: "No QR" },
                  ]}
                />
              </div>
            </div>
            <div>
              <p className="dp-label text-[#0A0A0A]/55">Label</p>
              <div className="mt-1.5">
                <FilterPills
                  value={fraudOnly ? "FRAUD" : ""}
                  onChange={(value) => setFraudOnly(value === "FRAUD")}
                  allLabel="All rows"
                  options={[{ value: "FRAUD", label: "Fraud labelled" }]}
                />
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="Transactions"
          subtitle={list?.note ?? "Reading ledger…"}
          right={
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="dp-label text-[#0A0A0A]/50">Sort</span>
              {(
                [
                  ["time", "Time"],
                  ["score", "Score"],
                  ["amount", "Amount"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (sortKey === key) {
                      setSortDir(sortDir === "asc" ? "desc" : "asc");
                    } else {
                      setSortKey(key);
                      setSortDir("desc");
                    }
                  }}
                  className={cn(
                    "brut-flat inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase",
                    sortKey === key ? "bg-[#0A0A0A] text-[#F4F1EA]" : "bg-white",
                  )}
                >
                  {label}
                  {sortKey === key && <ArrowDownUp className="size-3" />}
                </button>
              ))}
            </div>
          }
          tight
        >
          {list === undefined ? (
            <div className="p-4">
              <LoadingBlock label="Querying synthetic ledger" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyBlock title="No transactions match" hint="Widen the filters or clear the search." />
            </div>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#0A0A0A] text-[#F4F1EA]">
                    {[
                      "Txn ID",
                      "Payer",
                      "Beneficiary",
                      "Amount",
                      "When",
                      "Score",
                      "Category",
                      "Decision",
                      "QR",
                      "Label",
                      "",
                    ].map((heading) => (
                      <th key={heading} className="dp-label whitespace-nowrap px-3 py-2 text-[10px]">
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
                          <p className="text-[12px] font-semibold">{row.userName}</p>
                          <p className="dp-mono text-[10px] text-[#0A0A0A]/55">{row.userUpiId}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-[12px] font-semibold">{row.beneficiaryName}</p>
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
                              "dp-tabular inline-block border-2 border-[#0A0A0A] px-1.5 py-0.5 text-[11px] font-black",
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
                          <Chip tone={row.isFraudLabel ? "alert" : "neutral"}>
                            {row.isFraudLabel ? "fraud" : "legit"}
                          </Chip>
                        </td>
                        <td className="px-3 py-2">
                          <BrutButton
                            size="sm"
                            tone="neutral"
                            onClick={() => (selected === row.txnId ? closeRow() : openRow(row.txnId))}
                          >
                            <Eye className="size-3" />
                            {selected === row.txnId ? "Hide" : "Investigate"}
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
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="dp-label text-[#0A0A0A]/55">
                Investigation panel · {selected}
                {sorted ? ` · sorted by ${sorted} ${sortDir}` : ""}
              </p>
              <div className="flex gap-2">
                <BrutButton
                  size="sm"
                  tone="info"
                  onClick={() =>
                    navigate(`/command/mulenet?accountId=${detail?.row?.beneficiaryId ?? ""}`)
                  }
                >
                  View in MuleNet
                </BrutButton>
                <BrutButton size="sm" tone="neutral" onClick={closeRow}>
                  <X className="size-3" /> Close
                </BrutButton>
              </div>
            </div>

            {detail === undefined ? (
              <LoadingBlock label="Loading transaction metadata" />
            ) : view ? (
              <>
                <div className="grid gap-4 xl:grid-cols-3">
                  <Panel title="Analyst actions" tone="alert">
                    <div className="space-y-2">
                      <BrutButton
                        tone="neutral"
                        className="w-full"
                        onClick={() => void createCase()}
                        disabled={actionBusy}
                      >
                        <FilePlus2 className="size-3.5" /> Create fraud case
                      </BrutButton>
                      <BrutButton
                        tone="alert"
                        className="w-full"
                        onClick={() => void changeStatus("BLOCKED")}
                        disabled={actionBusy}
                      >
                        <Ban className="size-3.5" /> Block beneficiary
                      </BrutButton>
                      <BrutButton
                        tone="sun"
                        className="w-full"
                        onClick={() => void changeStatus("UNDER_REVIEW")}
                        disabled={actionBusy}
                      >
                        <ShieldQuestion className="size-3.5" /> Mark under review
                      </BrutButton>
                      <BrutButton
                        tone="safe"
                        className="w-full"
                        onClick={() => void changeStatus("CLEARED")}
                        disabled={actionBusy}
                      >
                        Mark beneficiary cleared
                      </BrutButton>
                      {detail.relatedCase && (
                        <div className="brut-flat bg-white p-2">
                          <p className="dp-label text-[#0A0A0A]/55">Existing case</p>
                          <p className="dp-mono mt-1 text-[12px] font-bold">
                            {detail.relatedCase.caseId} · {detail.relatedCase.status}
                          </p>
                          <BrutButton
                            size="sm"
                            tone="neutral"
                            className="mt-2 w-full"
                            onClick={() =>
                              navigate(`/command/cases?caseId=${detail.relatedCase?.caseId ?? ""}`)
                            }
                          >
                            Open case
                          </BrutButton>
                        </div>
                      )}
                      {actionMessage && (
                        <p className="brut-flat bg-[#10B981] p-2 text-[11px] font-bold uppercase leading-4">
                          {actionMessage}
                        </p>
                      )}
                      {actionError && <ErrorNote message={actionError} />}
                    </div>
                  </Panel>

                  <Panel title="Account record" subtitle={detail.account?.name ?? "Unknown account"}>
                    {detail.account ? (
                      <div className="grid gap-x-4">
                        <KeyValue label="Account ID" value={detail.account.accountId} mono />
                        <KeyValue label="UPI ID" value={detail.account.upiId} mono />
                        <KeyValue label="Type" value={detail.account.kind} mono />
                        <KeyValue label="Status" value={detail.account.status} mono />
                        <KeyValue label="Risk score" value={detail.account.riskScore} mono />
                        <KeyValue
                          label="Account age"
                          value={`${detail.account.accountAgeDays} days`}
                          mono
                        />
                        <KeyValue label="In / out degree" value={`${detail.account.inDegree} / ${detail.account.outDegree}`} mono />
                        <KeyValue
                          label="Total received"
                          value={formatInrShort(detail.account.totalReceived)}
                          mono
                        />
                        <KeyValue
                          label="Unique senders"
                          value={detail.account.uniqueSenders}
                          mono
                        />
                        {(detail.account.flaggedReasons ?? []).map((reason) => (
                          <p
                            key={reason}
                            className="brut-flat mt-2 bg-[#EF4444] p-2 text-[11px] font-bold leading-4 text-white"
                          >
                            {reason}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <EmptyBlock
                        title="Beneficiary is not in the analysed graph"
                        hint="Unknown or unregistered payee — the graph layer contributes no network evidence."
                      />
                    )}
                  </Panel>

                  <Panel title="Audit trail" subtitle="Every action against this transaction">
                    {(detail.audit ?? []).length === 0 ? (
                      <EmptyBlock title="No audit entries yet" hint="Analyst actions will appear here." />
                    ) : (
                      <ul className="space-y-2">
                        {(detail.audit ?? []).map((row) => (
                          <li key={row.logId} className="brut-flat bg-white p-2">
                            <div className="flex items-center justify-between gap-2">
                              <Chip tone="dark">{row.action}</Chip>
                              <span className="dp-mono text-[10px] font-semibold text-[#0A0A0A]/55">
                                {formatDateTime(row.timestamp)}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] font-medium leading-4">{row.details}</p>
                            <p className="dp-mono mt-1 text-[10px] text-[#0A0A0A]/50">
                              {row.actor}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                </div>

                <TrustResult view={view} compact={false} />
              </>
            ) : (
              <EmptyBlock title="Transaction not found" />
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
