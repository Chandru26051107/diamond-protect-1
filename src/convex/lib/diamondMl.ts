/**
 * DIAMOND-PROTECT :: Layer 2 — ML risk model (MLRisk 0..100).
 *
 * The reference design for this prototype is a scikit-learn RandomForest. So
 * that the whole stack runs offline with zero Python, the shipped model is a
 * deterministic, fully explainable logistic-risk ensemble trained *in the app*
 * on the synthetic ledger (standardised features, class balancing, train/test
 * split, confusion matrix, ROC-AUC and per-feature contributions).
 *
 * If a model artifact is missing or fails to load, scoring automatically falls
 * back to a transparent heuristic — the demo never stops working.
 *
 * Metrics are measured on synthetic hackathon data only. They are NOT a
 * real-world accuracy claim.
 */

import { mulberry32 } from "./crypto";
import {
  FEATURES,
  clamp,
  formatInr,
  type FeatureKey,
  type FeatureVector,
} from "./types";

export type FeatureStat = {
  key: string;
  label: string;
  mean: number;
  std: number;
  coef: number;
  importance: number;
};

export type ModelMetrics = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number;
  threshold: number;
  confusion: { tp: number; fp: number; tn: number; fn: number };
  positives: number;
  negatives: number;
  notes: string;
};

export type DiamondModel = {
  modelType: string;
  trainedAt: number;
  trainSize: number;
  testSize: number;
  positiveRate: number;
  bias: number;
  features: FeatureStat[];
  metrics: ModelMetrics;
  trainingLog: string[];
};

export type TrainingSample = { features: FeatureVector; label: boolean };

const EPOCHS = 320;
const LEARNING_RATE = 0.55;
const L2 = 0.0008;
const TEST_FRACTION = 0.2;
const SPLIT_SEED = 20260112;
export const TRAIN_VERSION = 3;

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 1;
  const variance =
    values.reduce((sum, value) => sum + (value - avg) * (value - avg), 0) /
    (values.length - 1);
  const sd = Math.sqrt(variance);
  return sd > 1e-9 ? sd : 1;
}

export function trainDiamondModel(samples: TrainingSample[]): DiamondModel {
  const log: string[] = [];
  const clean = samples.filter(
    (sample) => sample && sample.features && typeof sample.features.amount === "number",
  );
  log.push(`Loaded ${clean.length} labelled synthetic transactions.`);

  const keys = FEATURES.map((feature) => feature.key);

  // ---- Feature standardisation -----------------------------------------
  const stats = new Map<FeatureKey, { mean: number; std: number }>();
  for (const key of keys) {
    const column = clean.map((sample) => Number(sample.features[key] ?? 0));
    const avg = mean(column);
    stats.set(key, { mean: avg, std: stdDev(column, avg) });
  }
  log.push("Standardised 12 features (z-score, zero-variance guarded).");

  const matrix = new Float64Array(clean.length * keys.length);
  for (let i = 0; i < clean.length; i++) {
    for (let j = 0; j < keys.length; j++) {
      const stat = stats.get(keys[j])!;
      const raw = Number(clean[i].features[keys[j]] ?? 0);
      matrix[i * keys.length + j] = (raw - stat.mean) / stat.std;
    }
  }

  // ---- Deterministic train/test split ----------------------------------
  const rand = mulberry32(SPLIT_SEED);
  const order = clean.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  const testCount = Math.max(1, Math.floor(clean.length * TEST_FRACTION));
  const testIdx = order.slice(0, testCount);
  const trainIdx = order.slice(testCount);

  const positives = trainIdx.filter((i) => clean[i].label).length;
  const negatives = trainIdx.length - positives;
  const positiveRate =
    clean.length > 0
      ? clean.filter((sample) => sample.label).length / clean.length
      : 0;
  // Class balancing so the ~10% fraud class is not drowned out.
  const wPos = positives > 0 ? trainIdx.length / (2 * positives) : 1;
  const wNeg = negatives > 0 ? trainIdx.length / (2 * negatives) : 1;
  log.push(
    `Balanced classes with weights (fraud ${wPos.toFixed(2)}x, legit ${wNeg.toFixed(2)}x).`,
  );

  // ---- Gradient descent -------------------------------------------------
  const weights = new Float64Array(keys.length);
  let bias = 0;
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const gradW = new Float64Array(keys.length);
    let gradB = 0;
    const lr = LEARNING_RATE / (1 + epoch * 0.004);
    for (const index of trainIdx) {
      const offset = index * keys.length;
      let z = bias;
      for (let j = 0; j < keys.length; j++) z += weights[j] * matrix[offset + j];
      const prediction = sigmoid(z);
      const label = clean[index].label ? 1 : 0;
      const classWeight = label === 1 ? wPos : wNeg;
      const error = (prediction - label) * classWeight;
      gradB += error;
      for (let j = 0; j < keys.length; j++) {
        gradW[j] += error * matrix[offset + j];
      }
    }
    const n = trainIdx.length || 1;
    bias -= lr * (gradB / n);
    for (let j = 0; j < keys.length; j++) {
      weights[j] -= lr * (gradW[j] / n + L2 * weights[j]);
    }
  }
  log.push(`Trained ${EPOCHS} gradient-descent epochs on ${trainIdx.length} samples.`);

  // ---- Evaluation on the held-out split --------------------------------
  const scores: number[] = [];
  const labels: number[] = [];
  for (const index of testIdx) {
    const offset = index * keys.length;
    let z = bias;
    for (let j = 0; j < keys.length; j++) z += weights[j] * matrix[offset + j];
    scores.push(sigmoid(z));
    labels.push(clean[index].label ? 1 : 0);
  }

  const threshold = 0.5;
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (let i = 0; i < scores.length; i++) {
    const predicted = scores[i] >= threshold;
    const actual = labels[i] === 1;
    if (predicted && actual) tp += 1;
    else if (predicted && !actual) fp += 1;
    else if (!predicted && actual) fn += 1;
    else tn += 1;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = scores.length > 0 ? (tp + tn) / scores.length : 0;

  // ROC-AUC via the rank (Mann-Whitney U) method.
  // Ranks must ascend with the score: rank 1 = lowest risk score.
  const ranked = scores
    .map((score, index) => ({ score, label: labels[index] }))
    .sort((a, b) => a.score - b.score);
  let rankSumPositive = 0;
  ranked.forEach((row, index) => {
    if (row.label === 1) rankSumPositive += index + 1;
  });
  const pos = labels.filter((label) => label === 1).length;
  const neg = labels.length - pos;
  const rocAuc =
    pos > 0 && neg > 0
      ? (rankSumPositive - (pos * (pos + 1)) / 2) / (pos * neg)
      : 0;

  const importanceTotal =
    keys.reduce((sum, _key, j) => sum + Math.abs(weights[j]), 0) || 1;

  const features: FeatureStat[] = keys.map((key, j) => {
    const stat = stats.get(key)!;
    return {
      key,
      label: FEATURES.find((feature) => feature.key === key)?.label ?? key,
      mean: Math.round(stat.mean * 1000) / 1000,
      std: Math.round(stat.std * 1000) / 1000,
      coef: Math.round(weights[j] * 10000) / 10000,
      importance: Math.round((Math.abs(weights[j]) / importanceTotal) * 1000) / 1000,
    };
  });

  log.push(
    `Held-out evaluation: accuracy ${(accuracy * 100).toFixed(1)}%, precision ${(
      precision * 100
    ).toFixed(1)}%, recall ${(recall * 100).toFixed(1)}%, ROC-AUC ${rocAuc.toFixed(3)}.`,
  );

  return {
    modelType: "DiamondRisk logistic ensemble (in-app gradient descent)",
    trainedAt: Date.now(),
    trainSize: trainIdx.length,
    testSize: testIdx.length,
    positiveRate: Math.round(positiveRate * 10000) / 10000,
    bias: Math.round(bias * 10000) / 10000,
    features,
    metrics: {
      accuracy: Math.round(accuracy * 10000) / 10000,
      precision: Math.round(precision * 10000) / 10000,
      recall: Math.round(recall * 10000) / 10000,
      f1: Math.round(f1 * 10000) / 10000,
      rocAuc: Math.round(rocAuc * 10000) / 10000,
      threshold,
      confusion: { tp, fp, tn, fn },
      positives: pos,
      negatives: neg,
      notes:
        "Metrics measured on synthetic hackathon data. Not a real-world production accuracy claim.",
    },
    trainingLog: log,
  };
}

export type FeatureContribution = {
  key: string;
  label: string;
  value: number;
  coefficient: number;
  contribution: number;
  reason: string;
};

export type MlScoring = {
  probability: number;
  risk: number;
  bias: number;
  contributions: FeatureContribution[];
  available: boolean;
};

export type ExplainContext = {
  location?: string;
  beneficiaryAddedMsAgo?: number | null;
  senderWindowMin?: number;
  merchantName?: string | null;
  registeredMerchantName?: string | null;
  amount?: number;
};

/** Transparent fallback used when no model artifact is available. */
export function heuristicMlRisk(features: FeatureVector): number {
  const raw =
    0.9 * Math.min(3, features.amount / 15000) +
    0.7 * features.isNewBeneficiary +
    0.6 * features.deviceChangeFlag +
    0.6 * features.locationChangeFlag +
    0.9 * (1 - features.qrValid) +
    0.9 * (1 - features.qrMerchantMatch) +
    0.5 * Math.min(3, features.senderCountLast10Min / 3) +
    0.6 * features.outflowRatio5Min +
    0.5 * Math.min(3, features.previousFraudReports / 2) +
    0.35 * (features.hourOfDay < 5 ? 1 : 0);
  return Math.round(clamp((raw / 6.4) * 100));
}

/** Turns one feature into the plain-English sentence shown in the UI. */
export function explainFeature(
  key: string,
  features: FeatureVector,
  context: ExplainContext = {},
): string {
  const value = Number(features[key as FeatureKey] ?? 0);
  switch (key) {
    case "amount": {
      const amount = context.amount ?? value;
      return value >= 2
        ? `Transaction amount of ${formatInr(amount)} is significantly higher than this account's normal payment pattern.`
        : `Transaction amount of ${formatInr(amount)} is above this account's usual range.`;
    }
    case "hourOfDay":
      return `Payment was initiated at ${String(Math.round(value)).padStart(
        2,
        "0",
      )}:00, outside normal spending hours.`;
    case "beneficiaryAccountAgeDays":
      return `Beneficiary account is only ${Math.max(1, Math.round(value))} day(s) old.`;
    case "previousTxnsToBeneficiary":
      return `Only ${Math.max(0, Math.round(value))} prior payment(s) exist between this payer and the beneficiary.`;
    case "isNewBeneficiary": {
      const added = context.beneficiaryAddedMsAgo;
      if (added !== null && added !== undefined && added < 3600 * 1000) {
        const seconds = Math.max(1, Math.round(added / 1000));
        return `Beneficiary was added ${
          seconds < 90 ? `${seconds} seconds` : `${Math.round(seconds / 60)} minutes`
        } before payment.`;
      }
      return "Beneficiary has never received a payment from this account before.";
    }
    case "deviceChangeFlag":
      return "Payment came from a device this account has not used before.";
    case "locationChangeFlag":
      return `Payment location${context.location ? ` (${context.location})` : ""} differs from the account's usual city.`;
    case "qrValid":
      return "QR signature could not be verified — the payee payload may have been altered.";
    case "qrMerchantMatch":
      return `QR merchant name${
        context.merchantName ? ` "${context.merchantName}"` : ""
      } does not match the registered merchant${
        context.registeredMerchantName ? ` "${context.registeredMerchantName}"` : ""
      }.`;
    case "senderCountLast10Min":
      return `Beneficiary received funds from ${Math.max(
        0,
        Math.round(value),
      )} accounts within ${context.senderWindowMin ?? 10} minutes.`;
    case "outflowRatio5Min":
      return `${Math.round(value * 100)}% of received funds were forwarded within 2 minutes.`;
    case "previousFraudReports":
      return `Beneficiary has ${Math.max(0, Math.round(value))} prior fraud report(s) on this ledger.`;
    default:
      return `${key} contributed to the risk score.`;
  }
}

export function scoreWithModel(
  model: DiamondModel | null,
  features: FeatureVector,
  context: ExplainContext = {},
): MlScoring {
  if (!model || !Array.isArray(model.features) || model.features.length === 0) {
    const risk = heuristicMlRisk(features);
    return {
      probability: risk / 100,
      risk,
      bias: 0,
      contributions: [],
      available: false,
    };
  }

  const contributions: FeatureContribution[] = [];
  let z = model.bias;
  for (const stat of model.features) {
    const raw = Number(features[stat.key as FeatureKey] ?? 0);
    const scale = stat.std === 0 ? 1 : stat.std;
    const standardised = (raw - stat.mean) / scale;
    const contribution = stat.coef * standardised;
    z += contribution;
    contributions.push({
      key: stat.key,
      label: stat.label,
      value: raw,
      coefficient: stat.coef,
      contribution: Math.round(contribution * 10000) / 10000,
      reason: explainFeature(stat.key, features, context),
    });
  }

  const probability = sigmoid(z);
  return {
    probability,
    risk: Math.round(clamp(probability * 100)),
    bias: model.bias,
    contributions: contributions.sort((a, b) => b.contribution - a.contribution),
    available: true,
  };
}

/**
 * explain_prediction(model, features) — the top 5 human-readable risk
 * contributors behind a score, exactly as required by the brief.
 */
export function explainPrediction(
  model: DiamondModel | null,
  features: FeatureVector,
  context: ExplainContext = {},
  limit = 5,
): string[] {
  const scoring = scoreWithModel(model, features, context);
  const reasons: string[] = [];
  const seen = new Set<string>();

  for (const contribution of scoring.contributions) {
    if (contribution.contribution <= 0.02) continue;
    if (seen.has(contribution.reason)) continue;
    seen.add(contribution.reason);
    reasons.push(contribution.reason);
    if (reasons.length >= limit) break;
  }

  if (reasons.length === 0) {
    reasons.push(
      "No single ML feature dominates this payment — behaviour looks close to this account's baseline.",
    );
  }
  return reasons;
}
