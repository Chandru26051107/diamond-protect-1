/**
 * DIAMOND-PROTECT :: Diamond Trust Result (persisted transaction view).
 */

import { Shell } from "@/components/dp/Shell";
import { TrustResult, type TrustView } from "@/components/dp/TrustResult";
import {
  BrutButton,
  Chip,
  EmptyBlock,
  ErrorNote,
  LoadingBlock,
  Panel,
} from "@/components/dp/ui";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { ArrowLeft, Share2 } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";

export default function Result() {
  const { txnId } = useParams<{ txnId: string }>();
  const navigate = useNavigate();
  const detail = useQuery(
    api.diamond.transaction,
    txnId ? { txnId } : "skip",
  );

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

  const caseRow = detail?.relatedCase;

  return (
    <Shell
      eyebrow="Payment Shield"
      title="Diamond Trust Result"
      description="The full, explainable breakdown for one scored payment — rules, model and network analysis side by side."
      actions={
        <>
          <BrutButton tone="neutral" onClick={() => navigate("/shield")}>
            <ArrowLeft className="size-3.5" /> Back to Pay & Score
          </BrutButton>
          {caseRow && (
            <Chip tone="alert">
              <Share2 className="size-3" /> case {caseRow.caseId}
            </Chip>
          )}
        </>
      }
    >
      {detail === undefined ? (
        <LoadingBlock label="Loading transaction" />
      ) : !detail.ok || !view ? (
        <ErrorNote
          message={`Transaction ${txnId ?? ""} was not found in the demo ledger.`}
          onRetry={() => navigate("/shield/history")}
        />
      ) : (
        <div className="space-y-5">
          {caseRow && (
            <Panel title="Linked fraud case" tone="alert">
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone="dark">{caseRow.caseId}</Chip>
                <Chip tone="sun">{caseRow.status}</Chip>
                <span className="text-sm font-semibold">
                  Reported by {caseRow.reportedBy} · {caseRow.reason}
                </span>
                <BrutButton
                  size="sm"
                  tone="alert"
                  onClick={() => navigate(`/command/cases?caseId=${caseRow.caseId}`)}
                >
                  Open in Case Manager
                </BrutButton>
              </div>
            </Panel>
          )}
          <TrustResult view={view} />
        </div>
      )}
    </Shell>
  );
}

export function EmptyResult() {
  return (
    <EmptyBlock
      title="No transaction selected"
      hint="Pick a transaction from the history page."
    />
  );
}
