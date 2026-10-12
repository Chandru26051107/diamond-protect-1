/**
 * DIAMOND-PROTECT :: Command Centre — Rule Control Panel.
 * Tune the thresholds and rule toggles that drive every future score.
 */

import { Shell } from "@/components/dp/Shell";
import {
  BrutButton,
  Chip,
  ErrorNote,
  KeyValue,
  LoadingBlock,
  Panel,
  ScoreChip,
} from "@/components/dp/ui";
import { api } from "@/convex/_generated/api";
import { categoryTone, formatDateTime, scoreTone, TONE_BG } from "@/lib/dp";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertOctagon,
  Database,
  FlaskConical,
  RotateCcw,
  Save,
  ShieldCheck,
  Sliders,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function RuleControl() {
  const settings = useQuery(api.commandCentre.settings, {});
  const updateSettings = useMutation(api.commandCentre.updateSettings);
  const scoreTransaction = useMutation(api.diamond.scoreTransaction);
  const seedDemoData = useAction(api.demoSeed.seedDemoData);
  const suggestions = useQuery(api.diamond.payerSuggestions, {});

  const [form, setForm] = useState<{
    highRiskThreshold: number;
    mlThreshold: number;
    newBeneficiaryWindowHours: number;
    rapidTransactionWindowMin: number;
    rapidForwardingThreshold: number;
    graphSensitivity: number;
    highAmountThreshold: number;
    qrValidityMinutes: number;
  } | null>(null);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState<{
    score: number;
    category: string;
    decision: string;
    rule: number;
    ml: number;
    graph: number;
    reasons: string[];
  } | null>(null);
  const [sandboxBusy, setSandboxBusy] = useState(false);

  useEffect(() => {
    if (settings?.config && form === null) {
      setForm({
        highRiskThreshold: settings.config.highRiskThreshold,
        mlThreshold: settings.config.mlThreshold,
        newBeneficiaryWindowHours: settings.config.newBeneficiaryWindowHours,
        rapidTransactionWindowMin: settings.config.rapidTransactionWindowMin,
        rapidForwardingThreshold: settings.config.rapidForwardingThreshold,
        graphSensitivity: settings.config.graphSensitivity,
        highAmountThreshold: settings.config.highAmountThreshold,
        qrValidityMinutes: settings.config.qrValidityMinutes,
      });
      setToggles(settings.config.ruleToggles ?? {});
    }
  }, [settings, form]);

  const model = settings?.model;

  const defaultConfig = useMemo(
    () => ({
      highRiskThreshold: 55,
      mlThreshold: 0.6,
      newBeneficiaryWindowHours: 24,
      rapidTransactionWindowMin: 10,
      rapidForwardingThreshold: 0.75,
      graphSensitivity: 1,
      highAmountThreshold: 25000,
      qrValidityMinutes: 30,
    }),
    [],
  );

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await updateSettings({
        ...form,
        ruleToggles: toggles,
        actor: "analyst.rules",
      });
      if (response?.ok) {
        setMessage(
          "Configuration saved. Every future score — including the user shield — now uses these thresholds.",
        );
      } else {
        setError(response?.error ?? "Could not save the configuration.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the configuration.");
    } finally {
      setBusy(false);
    }
  };

  const resetDemo = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await seedDemoData({ force: true });
      if (response?.ok) {
        setMessage(response.message ?? "Demo data regenerated.");
      } else {
        setError(response?.message ?? "Could not reset the demo data.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset the demo data.");
    } finally {
      setBusy(false);
    }
  };

  const runSandbox = async () => {
    const payer = suggestions?.users?.[0]?.upiId;
    const payee = suggestions?.suspicious?.[0]?.upiId ?? suggestions?.users?.[1]?.upiId;
    if (!payer || !payee) {
      setError("Demo directory is still loading — try again in a moment.");
      return;
    }
    setSandboxBusy(true);
    setError(null);
    try {
      const response = await scoreTransaction({
        payerUpiId: payer,
        beneficiaryUpiId: payee,
        amount: 48000,
        deviceId: "DEV-SANDBOX",
        location: "Mumbai",
        timestamp: Date.now(),
        commit: false,
      });
      if (!response?.ok || !response.result) {
        setError(response?.error ?? "Sandbox scoring failed.");
        return;
      }
      const raw = response.result as unknown as Record<string, unknown>;
      setSandbox({
        score: Number(raw.diamondTrustScore ?? 0),
        category: String(raw.riskCategory ?? ""),
        decision: String(raw.decision ?? ""),
        rule: Number(raw.ruleScore ?? 0),
        ml: Number(raw.mlRisk ?? 0),
        graph: Number(raw.graphScore ?? 0),
        reasons: (raw.reasons as string[]) ?? [],
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sandbox scoring failed.");
    } finally {
      setSandboxBusy(false);
    }
  };

  return (
    <Shell
      eyebrow="Command Centre · configuration"
      title="Rule Control Panel"
      description="Thresholds and rule toggles that drive the deterministic layer. Changes apply immediately to every future scoring call, including the customer-facing shield."
      actions={
        <>
          <Chip tone="info">
            <Sliders className="size-3" /> {Object.values(toggles).filter(Boolean).length} rules enabled
          </Chip>
          <Chip tone="neutral">
            updated{" "}
            {settings?.updatedAt
              ? formatDateTime(settings.updatedAt)
              : settings?.model?.trainedAt
                ? formatDateTime(settings.model.trainedAt)
                : "—"}
          </Chip>
        </>
      }
    >
      {settings === undefined ? (
        <LoadingBlock label="Loading configuration" />
      ) : !form ? (
        <LoadingBlock label="Preparing configuration" />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <Panel title="Decision thresholds" tone="diamond">
              <div className="grid gap-5 sm:grid-cols-2">
                <Slider
                  label="Block threshold (trust score below this → do not pay)"
                  value={form.highRiskThreshold}
                  min={1}
                  max={99}
                  step={1}
                  onChange={(value) =>
                    setForm({ ...form, highRiskThreshold: value })
                  }
                  hint="Default 55 · a lower value blocks more aggressively"
                />
                <Slider
                  label="ML threshold (probability treated as high risk)"
                  value={form.mlThreshold}
                  min={0.05}
                  max={0.99}
                  step={0.05}
                  onChange={(value) => setForm({ ...form, mlThreshold: value })}
                  hint="Default 0.60"
                  decimals={2}
                />
                <Slider
                  label="New-beneficiary window (hours)"
                  value={form.newBeneficiaryWindowHours}
                  min={1}
                  max={168}
                  step={1}
                  onChange={(value) =>
                    setForm({ ...form, newBeneficiaryWindowHours: value })
                  }
                  hint="Default 24 · a payee added inside this window is flagged"
                />
                <Slider
                  label="Rapid-transaction window (minutes)"
                  value={form.rapidTransactionWindowMin}
                  min={1}
                  max={120}
                  step={1}
                  onChange={(value) =>
                    setForm({ ...form, rapidTransactionWindowMin: value })
                  }
                  hint="Default 10"
                />
                <Slider
                  label="Rapid-forwarding threshold (outflow ratio)"
                  value={form.rapidForwardingThreshold}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onChange={(value) =>
                    setForm({ ...form, rapidForwardingThreshold: value })
                  }
                  hint="Default 0.75 · share of received funds forwarded"
                  decimals={2}
                />
                <Slider
                  label="Graph sensitivity multiplier"
                  value={form.graphSensitivity}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(value) => setForm({ ...form, graphSensitivity: value })}
                  hint="Default 1.0 · scales the MuleNet contribution"
                  decimals={1}
                />
                <Slider
                  label="High-value threshold (INR)"
                  value={form.highAmountThreshold}
                  min={500}
                  max={500000}
                  step={500}
                  onChange={(value) =>
                    setForm({ ...form, highAmountThreshold: value })
                  }
                  hint="Default 25,000"
                  format={(value) => `₹${value.toLocaleString("en-IN")}`}
                />
                <Slider
                  label="QR validity (minutes)"
                  value={form.qrValidityMinutes}
                  min={1}
                  max={1440}
                  step={1}
                  onChange={(value) => setForm({ ...form, qrValidityMinutes: value })}
                  hint="Default 30 · used when issuing new signed QR codes"
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-2 border-t-2 border-dashed border-[#0A0A0A]/25 pt-4">
                <BrutButton tone="safe" size="lg" onClick={() => void save()} disabled={busy}>
                  <Save className="size-4" />
                  {busy ? "Saving…" : "Save configuration"}
                </BrutButton>
                <BrutButton
                  tone="neutral"
                  size="lg"
                  disabled={busy}
                  onClick={() => {
                    setForm(defaultConfig);
                    setToggles(
                      Object.fromEntries(
                        (settings.catalogue ?? []).map((rule) => [rule.id, true]),
                      ),
                    );
                    setMessage("Defaults restored in the form — press save to apply.");
                  }}
                >
                  <RotateCcw className="size-4" /> Restore defaults
                </BrutButton>
                <BrutButton tone="alert" size="lg" onClick={() => void resetDemo()} disabled={busy}>
                  <Database className="size-4" /> Reset demo data
                </BrutButton>
              </div>
              {message && (
                <p className="brut-flat mt-3 bg-[#10B981] p-2.5 text-[11px] font-bold uppercase leading-4">
                  {message}
                </p>
              )}
              {error && <div className="mt-3"><ErrorNote message={error} /></div>}
            </Panel>

            <div className="space-y-5">
              <Panel title="Scoring sandbox" tone="info">
                <p className="text-xs font-medium leading-5">
                  Score a fixed demo payment with the current configuration. Change a
                  threshold, save, and run it again to watch the deterministic layer move.
                </p>
                <p className="dp-mono mt-2 text-[11px] font-bold uppercase text-[#0A0A0A]/60">
                  payer {suggestions?.users?.[0]?.name ?? "—"} → beneficiary{" "}
                  {suggestions?.suspicious?.[0]?.name ?? suggestions?.users?.[1]?.name ?? "—"}{" "}
                  · ₹48,000
                </p>
                <BrutButton
                  tone="info"
                  className="mt-3 w-full"
                  disabled={sandboxBusy}
                  onClick={() => void runSandbox()}
                >
                  <FlaskConical className="size-3.5" />
                  {sandboxBusy ? "Scoring…" : "Run test payment (not committed)"}
                </BrutButton>
                {sandbox && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <ScoreChip score={sandbox.score} />
                      <Chip tone={categoryTone(sandbox.category)}>
                        {sandbox.category.replace("DIAMOND_", "")}
                      </Chip>
                      <Chip tone={scoreTone(sandbox.score)}>{sandbox.decision.replace(/_/g, " ")}</Chip>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        ["Rule", sandbox.rule],
                        ["ML", sandbox.ml],
                        ["Graph", sandbox.graph],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="brut-flat bg-white p-2 text-center">
                          <p className="dp-label text-[#0A0A0A]/55">{label}</p>
                          <p className="dp-tabular text-lg font-black">{value}</p>
                        </div>
                      ))}
                    </div>
                    <ul className="space-y-1">
                      {sandbox.reasons.slice(0, 3).map((reason) => (
                        <li
                          key={reason}
                          className="brut-flat bg-[#F4F1EA] p-2 text-[11px] font-medium leading-4"
                        >
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Panel>

              <Panel title="Risk model" subtitle={model?.modelType ?? "no artifact"} tone="diamond">
                {model ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Metric label="ROC-AUC" value={model.metrics?.rocAuc ?? 0} />
                      <Metric label="F1" value={model.metrics?.f1 ?? 0} />
                      <Metric label="Precision" value={model.metrics?.precision ?? 0} />
                      <Metric label="Recall" value={model.metrics?.recall ?? 0} />
                      <Metric label="Train" value={model.trainSize} raw />
                      <Metric label="Test" value={model.testSize} raw />
                    </div>
                    <p className="dp-label mt-3 text-[#0A0A0A]/55">Feature importance</p>
                    <ul className="mt-2 space-y-1.5">
                      {(model.features ?? [])
                        .slice()
                        .sort((a, b) => b.importance - a.importance)
                        .slice(0, 6)
                        .map((feature) => (
                          <li key={feature.key}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[11px] font-semibold">
                                {feature.label}
                              </span>
                              <span className="dp-tabular text-[11px] font-black">
                                {feature.importance}
                              </span>
                            </div>
                            <div className="mt-1 h-2 w-full border-2 border-[#0A0A0A] bg-white">
                              <div
                                className="h-full bg-[#0A0A0A]"
                                style={{ width: `${Math.round(feature.importance * 100)}%` }}
                              />
                            </div>
                          </li>
                        ))}
                    </ul>
                    <p className="mt-3 border-t-2 border-dashed border-[#0A0A0A]/25 pt-2 text-[10px] font-medium leading-4 text-[#0A0A0A]/60">
                      {model.metrics?.notes}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-medium text-[#0A0A0A]/60">
                    No model artifact stored. Scoring falls back to the rule engine and a
                    transparent heuristic for the ML layer.
                  </p>
                )}
              </Panel>
            </div>
          </div>

          <Panel
            title="Rule catalogue"
            subtitle="Toggle a rule off to exclude it from the deterministic layer"
            tone="sun"
            tight
          >
            <div className="grid gap-0 md:grid-cols-2">
              {(settings.catalogue ?? []).map((rule) => {
                const enabled = toggles[rule.id] !== false;
                return (
                  <div
                    key={rule.id}
                    className={cn(
                      "flex items-start justify-between gap-3 border-b-2 border-dashed border-[#0A0A0A]/20 p-3 md:border-r-2",
                      enabled ? "bg-white" : "bg-[#F4F1EA] opacity-70",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="dp-mono border-2 border-[#0A0A0A] bg-[#0A0A0A] px-1.5 text-[10px] font-bold text-[#F4F1EA]">
                          {rule.id}
                        </span>
                        <span className="text-[12px] font-black uppercase tracking-[0.03em]">
                          {rule.name}
                        </span>
                        <span className="dp-tabular border-2 border-[#0A0A0A] bg-[#F4F1EA] px-1.5 text-[10px] font-bold">
                          +{rule.weight}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] font-medium leading-5 text-[#0A0A0A]/65">
                        {rule.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setToggles((current) => ({ ...current, [rule.id]: !enabled }))
                      }
                      className={cn(
                        "brut-flat shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase",
                        enabled ? TONE_BG.safe : TONE_BG.neutral,
                      )}
                    >
                      {enabled ? "enabled" : "disabled"}
                    </button>
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="Explainability contract" tone="info">
              <ul className="space-y-2 text-[12px] font-medium leading-5">
                {[
                  "Every rule prints its own plain-English reason.",
                  "The model reports per-feature contributions, not just a number.",
                  "The graph layer reports the network behaviour it observed.",
                  "All three are recombined with fixed weights, so any score can be audited arithmetic-first.",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                    {line}
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Duplicate-charge safeguard" tone="neutral">
              <KeyValue label="Trusted band" value="80–100 · proceed" mono />
              <KeyValue label="Caution band" value="55–79 · verify" mono />
              <KeyValue label="Alert band" value="0–54 · do not pay" mono />
              <p className="mt-3 text-[11px] font-medium leading-5 text-[#0A0A0A]/65">
                The weights (0.45 rule, 0.35 model, 0.20 graph) are intentionally fixed in
                this prototype so the score is reproducible in front of a judge.
              </p>
            </Panel>

            <Panel title="Compliance framing" tone="alert">
              <p className="text-[12px] font-medium leading-5">
                This prototype is designed to sit in front of a payment rail as a
                pre-authorisation risk gate. Mapping to real-world expectations:
              </p>
              <ul className="mt-2 space-y-1.5 text-[11px] font-medium leading-4">
                <li>· BIS guidance on digital payment security and QR handling</li>
                <li>· RBI KYC / mule-account monitoring expectations</li>
                <li>· NPCI UPI risk-management obligations (design reference only)</li>
              </ul>
              <p className="mt-3 flex items-start gap-2 text-[10px] font-bold uppercase leading-4">
                <AlertOctagon className="mt-[1px] size-3.5 shrink-0" />
                No certification, endorsement or integration is claimed.
              </p>
            </Panel>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
  format,
  decimals,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: string;
  format?: (value: number) => string;
  decimals?: number;
}) {
  const display = format
    ? format(value)
    : decimals !== undefined
      ? Number(value).toFixed(decimals)
      : String(value);
  return (
    <div className="brut-flat bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="dp-label text-[#0A0A0A]/60">{label}</span>
        <span className="dp-tabular shrink-0 border-2 border-[#0A0A0A] bg-[#FDE047] px-1.5 text-[12px] font-black">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2.5 w-full accent-[#0A0A0A]"
      />
      {hint && (
        <p className="mt-1 text-[10px] font-medium leading-4 text-[#0A0A0A]/55">{hint}</p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  raw,
}: {
  label: string;
  value: number | string;
  raw?: boolean;
}) {
  return (
    <div className="brut-flat bg-[#F4F1EA] p-2 text-center">
      <p className="dp-label text-[#0A0A0A]/55">{label}</p>
      <p className={cn("mt-1 font-black", raw ? "dp-mono text-[12px]" : "dp-tabular text-lg")}>
        {value}
      </p>
    </div>
  );
}
