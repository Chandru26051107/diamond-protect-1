/**
 * DIAMOND-PROTECT :: Diamond Safety Centre.
 * Short, practical fraud-awareness cards plus a one-tap fraud report that
 * lands in the analyst Command Centre.
 */

import { Shell } from "@/components/dp/Shell";
import {
  BrutButton,
  Chip,
  EmptyBlock,
  ErrorNote,
  LoadingBlock,
  Panel,
} from "@/components/dp/ui";
import { api } from "@/convex/_generated/api";
import { formatDateTime, formatInr } from "@/lib/dp";
import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  BadgeCheck,
  Eye,
  Flag,
  KeyRound,
  PhoneCall,
  QrCode,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

const CARDS = [
  {
    icon: KeyRound,
    title: "Never share your UPI PIN, OTP or card details",
    body: "No bank, merchant or support agent ever needs your PIN or OTP. Anyone asking for it is attacking you, even if they know your name and last transaction.",
    tone: "alert" as const,
  },
  {
    icon: QrCode,
    title: "Receiving money never needs a QR code",
    body: "Scanning a QR sends money. If someone says “scan this to receive your refund”, that is a collect-style scam — you are the one paying.",
    tone: "caution" as const,
  },
  {
    icon: Eye,
    title: "Verify the merchant QR before paying",
    body: "Check the merchant name that appears after scanning. DIAMOND-PROTECT verifies the signed QR payload so a reprinted sticker cannot redirect your payment.",
    tone: "info" as const,
  },
  {
    icon: PhoneCall,
    title: "Do not pay unknown beneficiaries after urgent calls",
    body: "Urgency is the fraudster's main tool. “Your account will be frozen in 10 minutes” is a script, not a bank policy. Hang up and call the number on your card.",
    tone: "caution" as const,
  },
  {
    icon: Flag,
    title: "Report suspicious transactions immediately",
    body: "The faster a case is raised, the more likely funds can be held before settlement. Every report in this prototype creates an auditable case for the analyst.",
    tone: "safe" as const,
  },
];

export default function SafetyCentre() {
  const navigate = useNavigate();
  const recent = useQuery(api.diamond.transactions, { limit: 40 });
  const reportFraud = useMutation(api.diamond.reportFraud);

  const [txnId, setTxnId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = recent?.rows ?? [];

  const submit = async () => {
    if (!txnId) {
      setError("Select the transaction you want to report.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await reportFraud({
        txnId,
        reason: reason.trim() || "User reported this payment as suspicious.",
      });
      if (response?.ok) {
        setMessage(response.message ?? "Case created.");
        setCaseId(response.caseId ?? null);
        setReason("");
      } else {
        setError(response?.error ?? "Could not create the case.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the case.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      eyebrow="Payment Shield"
      title="Diamond Safety Centre"
      description="Plain-language guidance for customers, plus a reporting path that feeds the analyst console with a full audit trail."
      actions={
        <Chip tone="safe">
          <ShieldCheck className="size-3" /> every payment, protected
        </Chip>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="brut flex h-full flex-col bg-white">
                <div
                  className={
                    card.tone === "alert"
                      ? "border-b-[3px] border-[#0A0A0A] bg-[#EF4444] p-3 text-white"
                      : card.tone === "caution"
                        ? "border-b-[3px] border-[#0A0A0A] bg-[#F59E0B] p-3"
                        : card.tone === "info"
                          ? "border-b-[3px] border-[#0A0A0A] bg-[#22D3EE] p-3"
                          : "border-b-[3px] border-[#0A0A0A] bg-[#10B981] p-3"
                  }
                >
                  <Icon className="size-5" />
                </div>
                <div className="flex-1 p-3">
                  <p className="text-sm font-black leading-5 uppercase tracking-[0.02em]">
                    {card.title}
                  </p>
                  <p className="mt-2 text-[12px] font-medium leading-5 text-[#0A0A0A]/70">
                    {card.body}
                  </p>
                </div>
              </div>
            );
          })}

          <div className="brut flex h-full flex-col bg-[#0A0A0A] text-[#F4F1EA]">
            <div className="border-b-[3px] border-[#F4F1EA] bg-[#0A0A0A] p-3">
              <TriangleAlert className="size-5" />
            </div>
            <div className="flex flex-1 flex-col justify-between p-3">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.02em]">
                  Report a fraud
                </p>
                <p className="mt-2 text-[12px] font-medium leading-5 opacity-80">
                  Raise a case straight into the analyst queue. This prototype stores
                  the report in your own synthetic database — nothing is sent anywhere.
                </p>
              </div>
              <BrutButton
                tone="alert"
                className="mt-3 w-full"
                onClick={() => {
                  document
                    .getElementById("report-form")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              >
                <Flag className="size-3.5" /> Report fraud now
              </BrutButton>
            </div>
          </div>
        </div>

        <div id="report-form" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <Panel
            title="Report a fraudulent transaction"
            subtitle="Select from the synthetic ledger and describe what happened"
          >
            {recent === undefined ? (
              <LoadingBlock label="Loading recent ledger" />
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="dp-label text-[#0A0A0A]/55">Transaction</span>
                  <select
                    value={txnId}
                    onChange={(event) => setTxnId(event.target.value)}
                    className="brut-flat mt-1.5 w-full bg-white p-2.5 text-sm font-semibold focus:outline-none"
                  >
                    <option value="">Select a transaction…</option>
                    {rows.slice(0, 30).map((row) => (
                      <option key={row.txnId} value={row.txnId}>
                        {row.txnId} · {row.beneficiaryName} ·{" "}
                        {formatInr(Number(row.amount ?? 0))} · score {row.diamondTrustScore}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="dp-label text-[#0A0A0A]/55">What happened?</span>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={4}
                    placeholder="e.g. I was told to scan a QR to receive a refund and the money went to an unknown account."
                    className="brut-flat mt-1.5 w-full bg-white p-2.5 text-sm font-medium placeholder:text-[#0A0A0A]/40 focus:outline-none"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <BrutButton tone="alert" size="lg" onClick={() => void submit()} disabled={busy}>
                    <Flag className="size-4" />
                    {busy ? "Filing report…" : "Submit fraud report"}
                  </BrutButton>
                  <BrutButton tone="neutral" size="lg" onClick={() => navigate("/shield")}>
                    Back to Pay & Score
                  </BrutButton>
                </div>
                {error && <ErrorNote message={error} />}
                {message && (
                  <div className="brut bg-[#10B981] p-3">
                    <p className="flex items-center gap-2 text-sm font-black uppercase">
                      <BadgeCheck className="size-4" /> {message}
                    </p>
                    {caseId && (
                      <BrutButton
                        tone="dark"
                        className="mt-2"
                        size="sm"
                        onClick={() => navigate(`/command/cases?caseId=${caseId}`)}
                      >
                        Open {caseId} in the Case Manager
                      </BrutButton>
                    )}
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel title="What happens next" tone="info">
            <ol className="space-y-3">
              {[
                "Your report creates a fraud case with the transaction snapshot and Diamond Trust Score attached.",
                "The case appears instantly in the analyst Command Centre with status NEW.",
                "An analyst reviews the rule triggers, ML probability and MuleNet neighbourhood.",
                "The beneficiary account can be marked under review or blocked, and the action is written to the audit log.",
              ].map((step, index) => (
                <li key={step} className="flex gap-2.5">
                  <span className="dp-tabular grid size-5 shrink-0 place-items-center bg-[#0A0A0A] text-[10px] font-bold text-[#F4F1EA]">
                    {index + 1}
                  </span>
                  <span className="text-[12px] font-medium leading-5">{step}</span>
                </li>
              ))}
            </ol>
            <div className="brut-flat mt-4 bg-[#FDE047] p-2.5">
              <p className="flex items-start gap-2 text-[11px] font-bold uppercase leading-4">
                <Ban className="mt-[1px] size-3.5 shrink-0" />
                Real incidents: this prototype is not connected to any bank. Always use
                your bank&apos;s official customer-support channel and the national
                cybercrime reporting portal for live incidents.
              </p>
            </div>
          </Panel>
        </div>

        <Panel title="Recent reports in this prototype" subtitle="Latest cases raised from the shield">
          <RecentCases />
        </Panel>
      </div>
    </Shell>
  );
}

function RecentCases() {
  const cases = useQuery(api.commandCentre.cases, {});
  const rows = cases?.rows ?? [];
  if (cases === undefined) return <LoadingBlock label="Loading cases" />;
  if (rows.length === 0)
    return <EmptyBlock title="No fraud cases yet" hint="Report a transaction above." />;
  return (
    <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {rows.slice(0, 6).map((row) => (
        <li key={row.caseId} className="brut-flat bg-white p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="dp-mono text-[11px] font-bold">{row.caseId}</span>
            <Chip tone={row.status === "NEW" ? "info" : "sun"}>{row.status}</Chip>
          </div>
          <p className="mt-1 truncate text-[12px] font-semibold">{row.reason}</p>
          <p className="dp-mono mt-1 text-[10px] font-medium text-[#0A0A0A]/55">
            {row.txnId} · {formatDateTime(row.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
}
