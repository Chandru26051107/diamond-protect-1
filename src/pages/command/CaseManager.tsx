/**
 * DIAMOND-PROTECT :: Command Centre — Fraud Case Manager.
 */

import { Shell } from "@/components/dp/Shell";
import {
  BrutButton,
  Chip,
  EmptyBlock,
  ErrorNote,
  FilterPills,
  KeyValue,
  LoadingBlock,
  Panel,
} from "@/components/dp/ui";
import { api } from "@/convex/_generated/api";
import {
  caseStatusTone,
  formatDateTime,
  formatInr,
  timeAgo,
} from "@/lib/dp";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ClipboardList,
  Search,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

const STATUSES = [
  { value: "NEW", label: "New" },
  { value: "INVESTIGATING", label: "Investigating" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "FALSE_POSITIVE", label: "False positive" },
];

const PRIORITIES = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

type CasePatch = {
  status?: "NEW" | "INVESTIGATING" | "ESCALATED" | "RESOLVED" | "FALSE_POSITIVE";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assignedTo?: string;
  note?: string;
  actor?: string;
};

export default function CaseManager() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const updateCase = useMutation(api.commandCentre.updateCase);
  const setAccountStatus = useMutation(api.commandCentre.setAccountStatus);

  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(searchParams.get("caseId"));
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cases = useQuery(api.commandCentre.cases, {
    status: status || undefined,
    priority: priority || undefined,
    search: search.trim() || undefined,
  });
  const audit = useQuery(api.commandCentre.auditLogs, { limit: 60 });

  useEffect(() => {
    const fromUrl = searchParams.get("caseId");
    if (fromUrl) setSelected(fromUrl);
  }, [searchParams]);

  const rows = cases?.rows ?? [];

  const active = useMemo(
    () => rows.find((row) => row.caseId === selected) ?? rows[0] ?? null,
    [rows, selected],
  );

  const caseAudit = useMemo(
    () =>
      (audit?.rows ?? []).filter(
        (row) =>
          row.entityId === active?.caseId ||
          row.entityId === active?.txnId ||
          row.entityId === active?.beneficiaryId,
      ),
    [audit, active],
  );

  const apply = async (label: string, patch: CasePatch) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await updateCase({
        caseId: active?.caseId ?? "",
        ...patch,
      });
      if (response?.ok) setMessage(label);
      else setError(response?.error ?? "Could not update the case.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the case.");
    } finally {
      setBusy(false);
    }
  };

  const blockBeneficiary = async () => {
    if (!active?.beneficiaryId) {
      setError("This case has no beneficiary account attached.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await setAccountStatus({
        accountId: active.beneficiaryId,
        status: "BLOCKED",
        note: `Beneficiary blocked from settlement while resolving ${active.caseId}.`,
        actor: "analyst.cases",
      });
      if (response?.ok) {
        setMessage(`${active.beneficiaryUpiId ?? active.beneficiaryId} blocked and case escalated.`);
        await updateCase({
          caseId: active.caseId,
          status: "ESCALATED",
          note: `Beneficiary ${active.beneficiaryUpiId ?? active.beneficiaryId} blocked from settlement.`,
          actor: "analyst.cases",
        });
      } else {
        setError(response?.error ?? "Could not block the beneficiary.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not block the beneficiary.");
    } finally {
      setBusy(false);
    }
  };

  const openCase = (caseId: string) => {
    setSelected(caseId);
    setMessage(null);
    setError(null);
    const next = new URLSearchParams(searchParams);
    next.set("caseId", caseId);
    setSearchParams(next, { replace: true });
  };

  return (
    <Shell
      eyebrow="Command Centre · case workflow"
      title="Fraud Case Manager"
      description="Every case raised from the Payment Shield lands here. Assign it, investigate it, block the beneficiary and resolve it — with a full audit trail on every action."
      actions={
        <>
          <Chip tone="info">{cases?.breakdown?.NEW ?? 0} new</Chip>
          <Chip tone="sun">{cases?.breakdown?.INVESTIGATING ?? 0} investigating</Chip>
          <Chip tone="alert">{cases?.breakdown?.ESCALATED ?? 0} escalated</Chip>
        </>
      }
    >
      <div className="space-y-5">
        <Panel title="Filters" tone="diamond">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="brut-flat flex items-center gap-2 bg-white px-2.5 py-2">
              <Search className="size-3.5 shrink-0" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Case ID, transaction, reporter, beneficiary or reason"
                className="w-full bg-transparent text-sm font-semibold focus:outline-none"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")}>
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="dp-label text-[#0A0A0A]/55">Status</p>
                <div className="mt-1.5">
                  <FilterPills
                    value={status}
                    onChange={setStatus}
                    allLabel="All"
                    options={STATUSES.map((entry) => ({
                      value: entry.value,
                      label: entry.label,
                      count: (cases?.breakdown ?? {})[entry.value] ?? 0,
                    }))}
                  />
                </div>
              </div>
              <div>
                <p className="dp-label text-[#0A0A0A]/55">Priority</p>
                <div className="mt-1.5">
                  <FilterPills value={priority} onChange={setPriority} allLabel="Any" options={PRIORITIES} />
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Panel
            title="Case queue"
            subtitle={`${rows.length} of ${cases?.all ?? 0} cases`}
            tight
          >
            {cases === undefined ? (
              <div className="p-3">
                <LoadingBlock label="Loading cases" />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-3">
                <EmptyBlock
                  title="No cases match"
                  hint="Report a transaction from the Safety Centre, or clear the filters."
                />
              </div>
            ) : (
              <ul className="max-h-[660px] overflow-y-auto">
                {rows.map((row) => (
                  <li key={row.caseId}>
                    <button
                      type="button"
                      onClick={() => openCase(row.caseId)}
                      className={cn(
                        "flex w-full flex-col gap-1.5 border-b-2 border-dashed border-[#0A0A0A]/20 px-3 py-2.5 text-left",
                        active?.caseId === row.caseId ? "bg-[#FDE047]" : "bg-white hover:bg-[#F4F1EA]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="dp-mono text-[11px] font-black">{row.caseId}</span>
                        <div className="flex items-center gap-1.5">
                          <Chip
                            tone={
                              row.priority === "CRITICAL"
                                ? "alert"
                                : row.priority === "HIGH"
                                  ? "caution"
                                  : "neutral"
                            }
                          >
                            {row.priority}
                          </Chip>
                          <Chip tone={caseStatusTone(row.status)}>{row.status}</Chip>
                        </div>
                      </div>
                      <p className="line-clamp-2 text-[12px] font-semibold leading-5">
                        {row.reason}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="dp-mono text-[10px] font-bold text-[#0A0A0A]/60">
                          {row.txnId}
                        </span>
                        <span className="dp-tabular text-[11px] font-bold">
                          {formatInr(row.amount)}
                        </span>
                        <span className="dp-tabular text-[10px] font-bold text-[#0A0A0A]/60">
                          score {row.diamondTrustScore}
                        </span>
                        <span className="dp-mono text-[10px] text-[#0A0A0A]/50">
                          {timeAgo(row.createdAt)}
                        </span>
                        {row.assignedTo && (
                          <span className="dp-mono text-[10px] font-bold uppercase text-[#0A0A0A]/60">
                            {row.assignedTo}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {active ? (
            <div className="space-y-4">
              <Panel
                title={`Case ${active.caseId}`}
                subtitle={`Reported by ${active.reportedBy} · ${formatDateTime(active.createdAt)}`}
                right={
                  <div className="flex items-center gap-1.5">
                    <Chip tone={caseStatusTone(active.status)}>{active.status}</Chip>
                    <Chip tone="neutral">{active.priority}</Chip>
                  </div>
                }
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
                  <div>
                    <p className="dp-label text-[#0A0A0A]/55">Reported reason</p>
                    <p className="mt-1 text-sm font-semibold leading-6">{active.reason}</p>
                    <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
                      <KeyValue label="Transaction" value={active.txnId} mono />
                      <KeyValue label="Amount" value={formatInr(active.amount)} mono />
                      <KeyValue label="Trust score" value={active.diamondTrustScore} mono />
                      <KeyValue
                        label="Beneficiary"
                        value={active.beneficiaryUpiId ?? active.beneficiaryId ?? "—"}
                        mono
                      />
                      <KeyValue label="Assigned to" value={active.assignedTo ?? "unassigned"} mono />
                      <KeyValue
                        label="Resolved"
                        value={active.resolvedAt ? formatDateTime(active.resolvedAt) : "open"}
                        mono
                      />
                    </div>
                    {active.analystNotes && (
                      <>
                        <p className="dp-label mt-3 text-[#0A0A0A]/55">Analyst notes</p>
                        <pre className="brut-flat mt-1 whitespace-pre-wrap bg-[#F4F1EA] p-2 text-[12px] font-medium leading-5">
                          {active.analystNotes}
                        </pre>
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block">
                      <span className="dp-label text-[#0A0A0A]/55">Assign to</span>
                      <select
                        value={assignee}
                        onChange={(event) => setAssignee(event.target.value)}
                        className="brut-flat mt-1.5 w-full bg-white p-2 text-[12px] font-semibold focus:outline-none"
                      >
                        <option value="">Keep current ({active.assignedTo ?? "unassigned"})</option>
                        {(cases?.analysts ?? []).map((analyst) => (
                          <option key={analyst} value={analyst}>
                            {analyst}
                          </option>
                        ))}
                        <option value="analyst.mulenet">analyst.mulenet</option>
                        <option value="analyst.cases">analyst.cases</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="dp-label text-[#0A0A0A]/55">Add a note</span>
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={3}
                        placeholder="What did you find?"
                        className="brut-flat mt-1.5 w-full bg-white p-2 text-sm font-medium focus:outline-none"
                      />
                    </label>
                    <BrutButton
                      tone="neutral"
                      className="w-full"
                      disabled={busy}
                      onClick={() =>
                        void apply("Note and assignment saved.", {
                          assignedTo: assignee || undefined,
                          note: note || undefined,
                          actor: "analyst.cases",
                        }).then(() => setNote(""))
                      }
                    >
                      <ClipboardList className="size-3.5" /> Save note / assign
                    </BrutButton>
                  </div>
                </div>

                <div className="mt-4 border-t-2 border-dashed border-[#0A0A0A]/25 pt-3">
                  <p className="dp-label text-[#0A0A0A]/55">Analyst actions</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <BrutButton
                      tone="sun"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void apply("Case moved to investigating.", {
                          status: "INVESTIGATING",
                          assignedTo: assignee || active.assignedTo || "analyst.cases",
                          actor: "analyst.cases",
                        })
                      }
                    >
                      <Search className="size-3" /> Start investigating
                    </BrutButton>
                    <BrutButton
                      tone="alert"
                      size="sm"
                      disabled={busy}
                      onClick={() => void apply("Case escalated to the fraud cell.", {
                        status: "ESCALATED",
                        actor: "analyst.cases",
                      })}
                    >
                      <ArrowUpRight className="size-3" /> Escalate
                    </BrutButton>
                    <BrutButton
                      tone="dark"
                      size="sm"
                      disabled={busy}
                      onClick={() => void blockBeneficiary()}
                    >
                      <Ban className="size-3" /> Block beneficiary
                    </BrutButton>
                    <BrutButton
                      tone="safe"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void apply("Case resolved — funds held back from settlement.", {
                          status: "RESOLVED",
                          note: note || "Beneficiary blocked and amount held back from settlement.",
                          actor: "analyst.cases",
                        })
                      }
                    >
                      <CheckCircle2 className="size-3" /> Resolve case
                    </BrutButton>
                    <BrutButton
                      tone="neutral"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void apply("Marked as a false positive.", {
                          status: "FALSE_POSITIVE",
                          note: note || "Analyst confirmed the payment was legitimate.",
                          actor: "analyst.cases",
                        })
                      }
                    >
                      <ShieldCheck className="size-3" /> False positive
                    </BrutButton>
                    <BrutButton
                      tone="info"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void apply("Case assigned.", {
                          assignedTo: assignee || "analyst.cases",
                          actor: "analyst.cases",
                        })
                      }
                    >
                      <UserCheck className="size-3" /> Assign case
                    </BrutButton>
                    <BrutButton
                      tone="neutral"
                      size="sm"
                      onClick={() => navigate(`/command/investigator?txnId=${active.txnId}`)}
                    >
                      Open transaction
                    </BrutButton>
                    {active.beneficiaryId && (
                      <BrutButton
                        tone="neutral"
                        size="sm"
                        onClick={() =>
                          navigate(`/command/mulenet?accountId=${active.beneficiaryId ?? ""}`)
                        }
                      >
                        Open in MuleNet
                      </BrutButton>
                    )}
                  </div>
                  {message && (
                    <p className="brut-flat mt-2 bg-[#10B981] p-2 text-[11px] font-bold uppercase leading-4">
                      {message}
                    </p>
                  )}
                  {error && <div className="mt-2"><ErrorNote message={error} /></div>}
                </div>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Case timeline" tight>
                  <ul className="max-h-[420px] overflow-y-auto">
                    {(active.timeline ?? []).map((entry, index) => (
                      <li
                        key={`${entry.at}-${index}`}
                        className="border-b-2 border-dashed border-[#0A0A0A]/20 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Chip tone="dark">{entry.action}</Chip>
                          <span className="dp-mono text-[10px] font-semibold text-[#0A0A0A]/55">
                            {formatDateTime(entry.at)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[12px] font-medium leading-5">
                          {entry.note ?? "—"}
                        </p>
                        <p className="dp-mono mt-1 text-[10px] text-[#0A0A0A]/50">
                          {entry.actor}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Panel>

                <Panel title="Audit trail" subtitle="Every analyst action is logged" tight>
                  {caseAudit.length === 0 ? (
                    <div className="p-3">
                      <EmptyBlock title="No audit entries for this case yet" />
                    </div>
                  ) : (
                    <ul className="max-h-[420px] overflow-y-auto">
                      {caseAudit.map((row) => (
                        <li
                          key={row.logId}
                          className="border-b-2 border-dashed border-[#0A0A0A]/20 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Chip tone="info">{row.action}</Chip>
                            <span className="dp-mono text-[10px] font-semibold text-[#0A0A0A]/55">
                              {formatDateTime(row.timestamp)}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[12px] font-medium leading-5">
                            {row.details}
                          </p>
                          <p className="dp-mono mt-1 text-[10px] text-[#0A0A0A]/50">
                            {row.actor} → {row.entityType}/{row.entityId}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </div>
          ) : (
            <Panel title="Case detail">
              <EmptyBlock
                title="No case selected"
                hint="Pick a case from the queue, or report a transaction from the Diamond Safety Centre."
              />
            </Panel>
          )}
        </div>
      </div>
    </Shell>
  );
}
