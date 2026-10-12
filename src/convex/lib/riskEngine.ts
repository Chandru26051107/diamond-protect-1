/**
 * DIAMOND-PROTECT :: composite scoring engine.
 *
 *     Diamond Trust Score = 100 - (0.45·RuleRisk + 0.35·MLRisk + 0.20·GraphRisk)
 *
 * One single code path is used by the seeded demo ledger and by live scoring,
 * so what a judge sees in the Command Centre always matches what the Payment
 * Shield computes in front of them.
 */

import {
  explainPrediction,
  scoreWithModel,
  type DiamondModel,
} from "./diamondMl";
import { graphRisk, type NodeMetrics } from "./mulenet";
import { runRuleEngine, type QrVerdictInput } from "./rules";
import {
  CATEGORY_META,
  DEFAULT_CONFIG,
  categoryFromScore,
  clamp,
  decisionFromScore,
  round2,
  type FeatureVector,
  type RiskSignal,
  type RuleConfig,
} from "./types";

export const LAYER_WEIGHTS = { rule: 0.45, ml: 0.35, graph: 0.2 } as const;

export type ScoreContext = {
  amount: number;
  timestamp: number;
  payerName: string;
  payerAvgAmount: number;
  beneficiaryId: string;
  beneficiaryName: string;
  beneficiaryUpiId: string;
  beneficiaryAddedMsAgo: number | null;
  beneficiaryAccountAgeDays: number;
  payerTxnCountWindow: number;
  deviceId: string;
  location: string;
  isMerchantPayment: boolean;
  merchantKnown: boolean;
  qr: QrVerdictInput | null;
  graphNode: NodeMetrics | null;
  features: FeatureVector;
  config: RuleConfig;
  model: DiamondModel | null;
};

export type ScoreResult = {
  ruleScore: number;
  mlRisk: number;
  mlProbability: number;
  graphScore: number;
  diamondTrustScore: number;
  riskCategory: "DIAMOND_SAFE" | "DIAMOND_CAUTION" | "DIAMOND_ALERT";
  decision: "PROCEED" | "VERIFY_BENEFICIARY" | "EXTRA_AUTH" | "DO_NOT_PAY";
  reasons: string[];
  signals: RiskSignal[];
  contribution: { rule: number; ml: number; graph: number };
  recommendedAction: string;
  explanation: string;
  mlAvailable: boolean;
};

export function qrStatusFromVerdict(
  verdict: QrVerdictInput | null,
): "VERIFIED" | "CAUTION" | "FAKE_TAMPERED" | "NOT_USED" {
  if (!verdict || !verdict.used) return "NOT_USED";
  return verdict.status;
}

export function scoreTransaction(context: ScoreContext): ScoreResult {
  const config: RuleConfig = { ...DEFAULT_CONFIG, ...(context.config ?? {}) };

  // ---- Layer 1: deterministic rules -------------------------------------
  const { ruleScore, signals: ruleSignals } = runRuleEngine({
    amount: context.amount,
    timestamp: context.timestamp,
    userAvgAmount: context.payerAvgAmount,
    beneficiaryAddedMsAgo: context.beneficiaryAddedMsAgo,
    beneficiaryAgeDays: context.beneficiaryAccountAgeDays,
    previousTxnsToBeneficiary: context.features.previousTxnsToBeneficiary,
    isNewBeneficiary: Boolean(context.features.isNewBeneficiary),
    deviceChangeFlag: Boolean(context.features.deviceChangeFlag),
    locationChangeFlag: Boolean(context.features.locationChangeFlag),
    payerTxnCountWindow: context.payerTxnCountWindow,
    outflowRatio5Min: context.features.outflowRatio5Min,
    previousFraudReports: context.features.previousFraudReports,
    beneficiaryIsMule: context.graphNode?.isMuleSuspect ?? false,
    qr: context.qr,
    isMerchantPayment: context.isMerchantPayment,
    merchantKnown: context.merchantKnown,
    config,
  });

  // ---- Layer 2: ML ------------------------------------------------------
  const mlScoring = scoreWithModel(context.model, context.features, {
    location: context.location,
    beneficiaryAddedMsAgo: context.beneficiaryAddedMsAgo,
    senderWindowMin: config.rapidTransactionWindowMin,
    amount: context.amount,
    merchantName: context.qr?.merchantName ?? null,
    registeredMerchantName: context.qr?.registeredMerchantName ?? null,
  });
  const mlSignals: RiskSignal[] = mlScoring.contributions
    .filter((contribution) => contribution.contribution > 0.02)
    .slice(0, 3)
    .map((contribution, index) => ({
      ruleId: `M${index + 1}`,
      label: contribution.label,
      detail: contribution.reason,
      weight: Math.round(
        clamp(Math.abs(contribution.contribution) * 20, 1, 40),
      ),
      layer: "ML" as const,
    }));

  // ---- Layer 3: MuleNet graph ------------------------------------------
  const graphResult = context.graphNode
    ? graphRisk({
        beneficiaryName: context.beneficiaryName,
        riskScore: context.graphNode.riskScore,
        isMule: context.graphNode.isMuleSuspect,
        uniqueSenders: context.graphNode.uniqueSenders,
        uniqueReceivers: context.graphNode.uniqueReceivers,
        outflowRatio: context.graphNode.outflowRatio,
        avgReceiveToSendSec: context.graphNode.avgReceiveToSendSec,
        community: context.graphNode.community,
        communitySize: context.graphNode.communitySize,
        communityMuleCount: context.graphNode.communityMuleCount,
        accountAgeDays: context.beneficiaryAccountAgeDays,
        senderWindowMin: config.rapidTransactionWindowMin,
        sensitivity: config.graphSensitivity,
        isMerchant: context.merchantKnown,
        clusterId: context.graphNode.fraudCluster,
        clusterMules: context.graphNode.fraudClusterMules,
        clusterReach: context.graphNode.fraudClusterReach,
      })
    : { score: 0, signals: [] as RiskSignal[] };

  // ---- Composite --------------------------------------------------------
  const mlRisk = mlScoring.risk;
  const graphScore = graphResult.score;

  let diamondTrustScore = clamp(
    100 -
      (LAYER_WEIGHTS.rule * clamp(ruleScore) +
        LAYER_WEIGHTS.ml * clamp(mlRisk) +
        LAYER_WEIGHTS.graph * clamp(graphScore)),
  );
  diamondTrustScore = Math.round(diamondTrustScore);

  const isMerchantPayment = context.isMerchantPayment;
  let riskCategory = categoryFromScore(diamondTrustScore);
  let decision = decisionFromScore(diamondTrustScore, config.highRiskThreshold);

  // Hard stops: a tampered QR or a mule collector can never be "just proceed".
  const qrStatus = qrStatusFromVerdict(context.qr);
  if (qrStatus === "FAKE_TAMPERED") {
    diamondTrustScore = Math.min(diamondTrustScore, 25);
    riskCategory = "DIAMOND_ALERT";
    decision = "DO_NOT_PAY";
  } else if (context.graphNode?.isMuleSuspect && diamondTrustScore > 40) {
    diamondTrustScore = Math.min(diamondTrustScore, 40);
    riskCategory = "DIAMOND_ALERT";
    decision = "DO_NOT_PAY";
  }

  // ---- Explainability ---------------------------------------------------
  const qrSignals = ruleSignals.filter((signal) => signal.layer === "QR");
  const deterministic = ruleSignals
    .filter((signal) => signal.layer === "RULE")
    .sort((a, b) => b.weight - a.weight);

  const ordered: RiskSignal[] = [...qrSignals, ...deterministic];
  const graphSignals = graphResult.signals.slice(0, 2);
  const mlReasons = explainPrediction(context.model, context.features, {
    location: context.location,
    beneficiaryAddedMsAgo: context.beneficiaryAddedMsAgo,
    senderWindowMin: config.rapidTransactionWindowMin,
    amount: context.amount,
    merchantName: context.qr?.merchantName ?? null,
    registeredMerchantName: context.qr?.registeredMerchantName ?? null,
  });

  const reasons: string[] = [];
  const seen = new Set<string>();
  const push = (text: string) => {
    const clean = String(text ?? "").trim();
    if (!clean || seen.has(clean) || reasons.length >= 5) return;
    seen.add(clean);
    reasons.push(clean);
  };

  if (riskCategory === "DIAMOND_SAFE") {
    // A safe payment should explain WHY it is safe, not list network trivia —
    // but if low-severity rules did fire we must say so instead of claiming
    // that nothing at all triggered.
    push(
      ruleScore >= 15 && deterministic.length > 0
        ? `${deterministic.length} low-severity signal${deterministic.length === 1 ? "" : "s"} fired (rule risk ${Math.round(ruleScore)}/100) but none reached a blocking threshold — safe to proceed.`
        : "All deterministic fraud rules were evaluated and none crossed its trigger threshold.",
    );
    if (context.qr && context.qr.used && context.qr.signatureValid) {
      push(
        "The scanned QR signature verified and the merchant matched the DIAMOND-PROTECT registry.",
      );
    }
    push(
      context.graphNode && context.graphNode.fraudCluster < 0
        ? `Beneficiary is not linked to any suspected money-mule cluster (network risk ${Math.round(graphScore)}/100).`
        : "Beneficiary is not present in any fraud network on this ledger.",
    );
    push(
      `Payment behaviour is consistent with this account's baseline (model risk ${Math.round(mlRisk)}/100).`,
    );
    push("Nothing unusual detected — this payment is cleared to proceed safely.");
  } else {
    for (const signal of ordered) push(signal.detail);
    for (const signal of graphSignals) push(signal.detail);
    if (reasons.length < 5) {
      for (const reason of mlReasons) push(reason);
    }
    for (const signal of mlSignals) push(signal.detail);
  }

  if (reasons.length === 0) {
    reasons.push(
      "No fraud rules fired, the ML model is confident, and the beneficiary has a clean network history.",
    );
  }

  const meta = CATEGORY_META[riskCategory];
  const recommendedAction =
    decision === "PROCEED"
      ? "Proceed safely — every layer agrees this payment looks normal."
      : decision === "VERIFY_BENEFICIARY"
        ? `Verify the beneficiary (${context.beneficiaryUpiId}) through an official channel before releasing funds.`
        : decision === "EXTRA_AUTH"
          ? "Add extra authentication: confirm the payee name and amount, then authorise deliberately."
          : isMerchantPayment
            ? "Do not pay. Verify the merchant through an official channel."
            : "Do not pay. Verify the beneficiary through an official channel before retrying.";

  const firedCount = ordered.length + graphSignals.length;
  const explanation =
    `Diamond Trust Score ${diamondTrustScore}/100 — ${meta.label} (${meta.headline}). ` +
    `RuleRisk ${Math.round(ruleScore)}, MLRisk ${Math.round(mlRisk)}` +
    `${mlScoring.available ? "" : " (heuristic fallback — model unavailable)"}, GraphRisk ${Math.round(graphScore)}. ` +
    `${firedCount} deterministic / network signal${firedCount === 1 ? "" : "s"} fired` +
    `${context.graphNode ? ` against ${context.graphNode.isMuleSuspect ? "a suspected mule account" : "the beneficiary's network neighbourhood"}` : ""}.`;

  return {
    ruleScore: Math.round(ruleScore),
    mlRisk: Math.round(mlRisk),
    mlProbability: round2(mlScoring.probability),
    graphScore: Math.round(graphScore),
    diamondTrustScore,
    riskCategory,
    decision,
    reasons,
    signals: [...qrSignals, ...ruleSignals.filter((s) => s.layer === "RULE"), ...mlSignals, ...graphResult.signals],
    contribution: {
      rule: round2(LAYER_WEIGHTS.rule * clamp(ruleScore)),
      ml: round2(LAYER_WEIGHTS.ml * clamp(mlRisk)),
      graph: round2(LAYER_WEIGHTS.graph * clamp(graphScore)),
    },
    recommendedAction,
    explanation,
    mlAvailable: mlScoring.available,
  };
}
