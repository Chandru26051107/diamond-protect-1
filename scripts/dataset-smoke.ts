/**
 * Temporary smoke test for the synthetic dataset pipeline.
 * Run with: bun scripts/dataset-smoke.ts
 */
import { generateDataset } from "../src/convex/lib/dataset";
import { DEFAULT_CONFIG } from "../src/convex/lib/types";
import { verifyQrPayload } from "../src/convex/lib/qrShield";

const started = Date.now();
const dataset = generateDataset(DEFAULT_CONFIG, Date.now());
const elapsed = Date.now() - started;

console.log("elapsed ms:", elapsed);
console.log("stats:", dataset.stats);
console.log("model:", {
  auc: dataset.model.metrics.rocAuc,
  f1: dataset.model.metrics.f1,
  precision: dataset.model.metrics.precision,
  recall: dataset.model.metrics.recall,
  accuracy: dataset.model.metrics.accuracy,
  confusion: dataset.model.metrics.confusion,
  train: dataset.model.trainSize,
  test: dataset.model.testSize,
});
console.log("accounts:", dataset.accounts.length, "mqules:", dataset.accounts.filter((a) => a.isMuleSuspect).length);

const sample = dataset.transactions.slice(0, 3).map((txn) => ({
  id: txn.txnId,
  amount: txn.amount,
  score: txn.diamondTrustScore,
  cat: txn.riskCategory,
  decision: txn.decision,
  rule: txn.ruleScore,
  ml: txn.mlProbability,
  graph: txn.graphScore,
  pattern: txn.fraudPattern,
  label: txn.isFraudLabel,
  reasons: txn.reasons.slice(0, 2),
}));
console.log("sample txns:", JSON.stringify(sample, null, 2));

const distribution = dataset.transactions.reduce<Record<string, number>>((acc, txn) => {
  acc[txn.riskCategory] = (acc[txn.riskCategory] ?? 0) + 1;
  return acc;
}, {});
console.log("distribution:", distribution);

const decisions = dataset.transactions.reduce<Record<string, number>>((acc, txn) => {
  acc[txn.decision] = (acc[txn.decision] ?? 0) + 1;
  return acc;
}, {});
console.log("decisions:", decisions);

const patterns = dataset.transactions.reduce<Record<string, number>>((acc, txn) => {
  acc[txn.fraudPattern] = (acc[txn.fraudPattern] ?? 0) + 1;
  return acc;
}, {});
console.log("patterns:", patterns);

// QR shield checks
const registry = dataset.merchants.map((m) => ({
  merchantId: m.merchantId,
  merchantName: m.merchantName,
  upiId: m.upiId,
  status: m.status,
}));
let verified = 0;
let fake = 0;
let caution = 0;
for (const qr of dataset.qrCodes) {
  const verdict = verifyQrPayload(qr.payload, qr.signature, registry, Date.now());
  if (verdict.status === "VERIFIED") verified += 1;
  else if (verdict.status === "FAKE_TAMPERED") fake += 1;
  else caution += 1;
}
console.log("qr verdicts:", { verified, fake, caution });

const tamperedQr = dataset.qrCodes.find((qr) => qr.isTampered);
if (tamperedQr) {
  const verdict = verifyQrPayload(tamperedQr.payload, tamperedQr.signature, registry, Date.now());
  console.log("tampered sample:", {
    status: verdict.status,
    reason: verdict.reason,
    checks: verdict.checks.map((c) => `${c.name}:${c.passed}`),
  });
}

console.log("metrics:", {
  total: dataset.metrics.totalTransactions,
  highRisk: dataset.metrics.highRiskTransactions,
  blocked: dataset.metrics.blockedTransactions,
  lossPrevented: dataset.metrics.fraudLossPrevented,
  avg: dataset.metrics.avgTrustScore,
  mules: dataset.metrics.suspectedMuleAccounts,
  trendDays: dataset.metrics.trend.length,
  clusters: dataset.metrics.topSuspicious.length,
});
console.log("graph edges:", dataset.graphEdges.length);
console.log("cases:", dataset.cases.length, "audit:", dataset.auditLogs.length);
