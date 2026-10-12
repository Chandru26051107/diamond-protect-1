/**
 * DIAMOND-PROTECT :: Diamond Trust Result panel.
 * Shared by the live Payment Shield and by the persisted transaction viewer.
 */

import { api } from "@/convex/_generated/api";
import {
  CATEGORY_META,
  categoryTone,
  decisionLabel,
  decisionTone,
  formatDateTime,
  formatInr,
  patternLabel,
  qrStatusTone,
} from "@/lib/dp";
import { cn } from "@/lib/utils";
import { useMutation } from "convex/react";
import {
  BadgeCheck,
  Ban,
  Flag,
  Fingerprint,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { Chip, ExplanationList, KeyValue, LayerBar, Panel, ScoreRing, BrutButton } from "./ui";

export type TrustSignal = {
  ruleId: string;
  label: string;
  detail: string;
  weight: number;
  layer: string;
};

export type TrustView = {
  txnId: string;
  amount: number;
  timestamp: number;
  payerName: string;
  payerUpiId?: string;
  beneficiaryName: string;
  beneficiaryUpiId: string;
  deviceId?: string;
  location?: string;
  txnType?: string;
  diamondTrustScore: number;
  riskCategory: "DIAMOND_SAFE" | "DIAMOND_CAUTION" | "DIAMOND_ALERT";
  decision: string;
  ruleScore: number;
  mlRisk: number;
  mlProbability?: number;
  graphScore: number;
  reasons: string[];
  signals: TrustSignal[];
  recommendedAction: string;
  explanation: string;
  qrStatus: string;
  fraudPattern?: string;
  isFraudLabel?: boolean;
  features?: Record<string, number>;
  graphNode?: {
    inDegree?: number;
    outDegree?: number;
    uniqueSenders?: number;
    uniqueReceivers?: number;
    outflowRatio?: number;
    avgReceiveToSendSec?: number;
    riskScore?: number;
    isMuleSuspect?: boolean;
    fraudCluster?: number;
    fraudClusterReach?: number;
    flaggedReasons?: string[];
  } | null;
  modelAvailable?: boolean;
};

const LAYER_LABEL: Record<string, string> = {
  RULE: "Rule engine",
  QR: "QR shield",
  ML: "ML model",
  GRAPH: "MuleNet graph",
};

export function TrustResult({
  view,
  onReported,
  compact = false,
}: {
  view: TrustView;
  onReported?: (caseId: string) => void;
  compact?: boolean;
}) {
  const reportFraud = useMutation(api.diamond.reportFraud);
  const [reason, setReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const meta = CATEGORY_META[view.riskCategory] ?? CATEGORY_META.DIAMOND_CAUTION;
  const tone = categoryTone(view.riskCategory);
  const contribution = {
    rule: Math.round(view.ruleScore * 0.45 * 10) / 10,
    ml: Math.round(view.mlRisk * 0.35 * 10) / 10,
    graph: Math.round(view.graphScore * 0.2 * 10) / 10,
  };

  const submitReport = async () => {
    setReporting(true);
    setReportError(null);
    try {
      const response = await reportFraud({
        txnId: view.txnId,
        reason: reason.trim() || "User reported this payment as suspicious.",
      });
      if (response?.ok) {
        setReportMessage(response.message ?? `Case ${response.caseId} created.`);
        setShowReport(false);
        setReason("");
        if (response.caseId) onReported?.(response.caseId);
      } else {
        setReportError(response?.error ?? "Could not create the case.");
      }
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : "Could not create the case.",
      );
    } finally {
      setReporting(false);
    }
  };

  const headlineIcon =
    view.riskCategory === "DIAMOND_SAFE" ? (
      <ShieldCheck className="size-5" />
    ) : view.riskCategory === "DIAMOND_CAUTION" ? (
      <TriangleAlert className="size-5" />
    ) : (
      <ShieldAlert className="size-5" />
    );

  return (
    <div className={cn("grid gap-4", compact ? "" : "lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]")}>
      <div className="space-y-4">
        <Panel tone={tone} title="Diamond Trust Score" subtitle={view.txnId}>
          <div className="flex flex-col items-center gap-4 pt-1">
            <ScoreRing
              score={view.diamondTrustScore}
              size={compact ? 170 : 200}
              label={meta.short}
              caption={meta.blurb}
            />
            <div className="flex flex-wrap justify-center gap-2">
              <Chip tone={tone} className="text-[12px]">
                {headlineIcon}
                {meta.headline}
              </Chip>
              <Chip tone={decisionTone(view.decision)}>
                {decisionLabel(view.decision)}
              </Chip>
            </div>
            <p
              className={cn(
                "brut-flat w-full p-2.5 text-center text-[12px] font-bold uppercase tracking-[0.04em]",
                tone === "alert"
                  ? "bg-[#EF4444] text-white"
                  : tone === "caution"
                    ? "bg-[#F59E0B] text-[#0A0A0A]"
                    : "bg-[#10B981] text-[#0A0A0A]",
              )}
            >
              {view.recommendedAction}
            </p>
          </div>
        </Panel>

        <Panel title="Score composition">
          <div className="space-y-3.5">
            <LayerBar
              label="Rule risk"
              weight="× 0.45"
              value={view.ruleScore}
              tone="alert"
              detail={`Deterministic rules contribute ${contribution.rule} points of risk.`}
            />
            <LayerBar
              label="ML risk"
              weight="× 0.35"
              value={view.mlRisk}
              tone="caution"
              detail={`Model probability ${(view.mlProbability ?? view.mlRisk / 100).toFixed(2)} · contributes ${contribution.ml} points.`}
            />
            <LayerBar
              label="Graph risk"
              weight="× 0.20"
              value={view.graphScore}
              tone="info"
              detail={`MuleNet network risk contributes ${contribution.graph} points.`}
            />
            <p className="brut-flat bg-[#F4F1EA] p-2 text-[11px] font-bold leading-5">
              Trust = 100 − (0.45·Rule + 0.35·ML + 0.20·Graph) ={" "}
              <span className="dp-tabular">{view.diamondTrustScore}</span>
              {!view.modelAvailable && (
                <span className="mt-1 block font-semibold text-[#B45309]">
                  ML artifact unavailable — rule-based heuristic fallback used for the
                  ML layer.
                </span>
              )}
            </p>
          </div>
        </Panel>

        <Panel title="Report this transaction">
          {reportMessage ? (
            <div className="brut-flat bg-[#10B981] p-2.5 text-[12px] font-bold uppercase">
              <BadgeCheck className="mr-1.5 inline size-3.5" />
              {reportMessage}
            </div>
          ) : showReport ? (
            <div className="space-y-2.5">
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="What happened? e.g. I was told to scan this QR to receive a refund."
                className="brut-flat w-full bg-white p-2 text-sm font-medium placeholder:text-[#0A0A0A]/40 focus:outline-none"
              />
              {reportError && (
                <p className="brut-flat bg-[#EF4444] p-2 text-[11px] font-bold text-white">
                  {reportError}
                </p>
              )}
              <div className="flex gap-2">
                <BrutButton tone="alert" onClick={() => void submitReport()} disabled={reporting}>
                  <Flag className="size-3.5" />
                  {reporting ? "Filing…" : "Submit report"}
                </BrutButton>
                <BrutButton tone="neutral" onClick={() => setShowReport(false)}>
                  Cancel
                </BrutButton>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium leading-5 text-[#0A0A0A]/65">
                Filing a report opens a fraud case in the analyst Command Centre with a
                full audit trail.
              </p>
              <BrutButton tone="alert" onClick={() => setShowReport(true)}>
                <Flag className="size-3.5" /> Report this transaction
              </BrutButton>
            </div>
          )}
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel
          title="Payment under review"
          subtitle={formatDateTime(view.timestamp)}
          right={
            <Chip tone={qrStatusTone(view.qrStatus)}>
              <QrCode className="size-3" />
              {view.qrStatus.replace(/_/g, " ")}
            </Chip>
          }
        >
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <KeyValue label="Transaction ID" value={view.txnId} mono />
            <KeyValue label="Amount" value={formatInr(view.amount)} mono />
            <KeyValue label="Payer" value={view.payerName} />
            <KeyValue label="Beneficiary" value={view.beneficiaryName} />
            <KeyValue label="Beneficiary UPI" value={view.beneficiaryUpiId} mono />
            <KeyValue label="Device" value={view.deviceId || "—"} mono />
            <KeyValue label="Location" value={view.location || "—"} />
            <KeyValue label="Payment type" value={view.txnType ?? "P2P"} mono />
            {view.fraudPattern && (
              <KeyValue label="Ledger pattern" value={patternLabel(view.fraudPattern)} />
            )}
            <KeyValue
              label="Ledger fraud label"
              value={view.isFraudLabel === undefined ? "—" : view.isFraudLabel ? "fraud" : "legitimate"}
            />
          </div>
          <p className="mt-3 border-t-2 border-dashed border-[#0A0A0A]/25 pt-3 text-xs font-medium leading-5 text-[#0A0A0A]/70">
            {view.explanation}
          </p>
        </Panel>

        <Panel
          title="Fraud signals fired"
          subtitle={`${view.signals.length} signal${view.signals.length === 1 ? "" : "s"} across all three layers`}
          tone="info"
        >
          {view.signals.length === 0 ? (
            <p className="text-sm font-medium text-[#0A0A0A]/60">
              No fraud signal fired for this payment.
            </p>
          ) : (
            <ul className="space-y-2">
              {view.signals.map((signal, index) => (
                <li
                  key={`${signal.ruleId}-${index}`}
                  className="brut-flat flex flex-wrap items-start justify-between gap-2 bg-white p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip tone="dark">{signal.ruleId}</Chip>
                      <span className="text-[12px] font-black uppercase tracking-[0.04em]">
                        {signal.label}
                      </span>
                      <Chip
                        tone={
                          signal.layer === "QR"
                            ? "alert"
                            : signal.layer === "GRAPH"
                              ? "info"
                              : signal.layer === "ML"
                                ? "caution"
                                : "diamond"
                        }
                      >
                        {LAYER_LABEL[signal.layer] ?? signal.layer}
                      </Chip>
                    </div>
                    <p className="mt-1.5 text-[13px] font-medium leading-5">
                      {signal.detail}
                    </p>
                  </div>
                  <span className="dp-tabular shrink-0 border-2 border-[#0A0A0A] bg-[#F4F1EA] px-1.5 py-0.5 text-[11px] font-bold">
                    +{signal.weight}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Why did we flag this?" tight>
            <div className="p-4">
              <ExplanationList reasons={view.reasons} title="Top contributors" />
            </div>
          </Panel>

          <Panel title="Beneficiary network (MuleNet)">
            {view.graphNode ? (
              <div className="grid gap-x-6">
                <KeyValue label="In-degree" value={view.graphNode.inDegree ?? 0} mono />
                <KeyValue label="Out-degree" value={view.graphNode.outDegree ?? 0} mono />
                <KeyValue label="Unique senders" value={view.graphNode.uniqueSenders ?? 0} mono />
                <KeyValue label="Unique receivers" value={view.graphNode.uniqueReceivers ?? 0} mono />
                <KeyValue
                  label="Outflow ratio"
                  value={`${Math.round((view.graphNode.outflowRatio ?? 0) * 100)}%`}
                  mono
                />
                <KeyValue
                  label="Receive → forward"
                  value={
                    (view.graphNode.avgReceiveToSendSec ?? 0) >= 86400
                      ? "no forwarding observed"
                      : `${Math.round(view.graphNode.avgReceiveToSendSec ?? 0)}s`
                  }
                  mono
                />
                <KeyValue label="Account risk" value={view.graphNode.riskScore ?? 0} mono />
                <KeyValue
                  label="Fraud cluster"
                  value={
                    (view.graphNode.fraudCluster ?? -1) >= 0
                      ? `C${view.graphNode.fraudCluster} · ${view.graphNode.fraudClusterReach ?? 0} accounts`
                      : "none"
                  }
                  mono
                />
                {(view.graphNode.flaggedReasons ?? []).length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {(view.graphNode.flaggedReasons ?? []).map((reason) => (
                      <li
                        key={reason}
                        className="brut-flat bg-[#EF4444] p-2 text-[11px] font-bold leading-4 text-white"
                      >
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
                {(view.graphNode.isMuleSuspect ?? false) && (
                  <p className="brut-flat mt-3 flex items-center gap-2 bg-[#0A0A0A] p-2 text-[11px] font-bold uppercase text-[#F4F1EA]">
                    <Ban className="size-3.5" /> Mule-collector behaviour profile matched
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm font-medium text-[#0A0A0A]/60">
                Beneficiary is not part of the analysed graph (unknown or unregistered
                account).
              </p>
            )}
          </Panel>
        </div>

        {view.features && (
          <Panel
            title="Model feature snapshot"
            subtitle="Exactly the 12 features the model scores, stored with the transaction"
            right={
              <Chip tone="diamond">
                <Fingerprint className="size-3" /> feature vector
              </Chip>
            }
          >
            <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(view.features).map(([key, value]) => (
                <KeyValue
                  key={key}
                  label={key.replace(/([A-Z])/g, " $1").toLowerCase()}
                  value={typeof value === "number" ? value : String(value)}
                  mono
                />
              ))}
            </div>
            <p className="mt-3 flex items-start gap-2 border-t-2 border-dashed border-[#0A0A0A]/25 pt-3 text-[11px] font-medium leading-5 text-[#0A0A0A]/60">
              <Sparkles className="mt-[1px] size-3.5 shrink-0" />
              Every score in this prototype is explainable: rules print their own
              reasons, the model reports per-feature contributions and the graph layer
              reports the network behaviour it saw.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
