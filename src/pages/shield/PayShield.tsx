/**
 * DIAMOND-PROTECT :: User Payment Shield — simulate a payment and score it
 * in real time, before any money moves.
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
import { CATEGORY_META, CITY_OPTIONS, formatInr, scoreTone } from "@/lib/dp";
import { useMutation, useQuery } from "convex/react";
import { Crosshair, Eye, Rocket, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

type PayerProfile = {
  name: string;
  upiId: string;
  usualDeviceId?: string | null;
  usualCity?: string | null;
  lastBeneficiaryUpiId?: string | null;
};

export default function PayShield() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scoreTransaction = useMutation(api.diamond.scoreTransaction);
  const suggestions = useQuery(api.diamond.payerSuggestions, {});
  const scenarios = useQuery(api.diamond.demoScenarios, {});
  const recent = useQuery(api.diamond.transactions, { limit: 24 });

  const [payerUpiId, setPayerUpiId] = useState("");
  const [beneficiaryUpiId, setBeneficiaryUpiId] = useState("");
  const [amount, setAmount] = useState("1250");
  const [deviceId, setDeviceId] = useState("DEV-A1B2C3");
  const [location, setLocation] = useState("Mumbai");
  const [qrId, setQrId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TrustView | null>(null);

  const prefilledBeneficiary = searchParams.get("beneficiary");
  const prefilledAmount = searchParams.get("amount");
  const prefilledQr = searchParams.get("qrId");

  useEffect(() => {
    if (prefilledBeneficiary) setBeneficiaryUpiId(prefilledBeneficiary);
    if (prefilledAmount) setAmount(prefilledAmount);
    if (prefilledQr) setQrId(prefilledQr);
  }, [prefilledBeneficiary, prefilledAmount, prefilledQr]);

  /**
   * Loads a saved synthetic customer profile: the payer, the device and city that
   * account actually pays from, and (when forced) a beneficiary it has paid
   * before. Typing a payment from a random device always trips the device-change
   * and location-anomaly rules, which would make a normal payment look suspicious.
   */
  const applyPayer = (profile: PayerProfile | undefined, withBeneficiary = false) => {
    if (!profile) return;
    setPayerUpiId(profile.upiId);
    if (profile.usualDeviceId) setDeviceId(profile.usualDeviceId);
    if (profile.usualCity && CITY_OPTIONS.includes(profile.usualCity)) {
      setLocation(profile.usualCity);
    }
    if (withBeneficiary && profile.lastBeneficiaryUpiId) {
      setBeneficiaryUpiId(profile.lastBeneficiaryUpiId);
      setQrId(null);
    }
  };

  useEffect(() => {
    if (payerUpiId || !suggestions?.users?.length) return;
    const first = suggestions.users[0];
    applyPayer(first);
    setBeneficiaryUpiId(
      (current) =>
        current || first.lastBeneficiaryUpiId || suggestions.merchants?.[0]?.upiId || "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions]);

  const runScore = async () => {
    setBusy(true);
    setError(null);
    setView(null);
    try {
      const numericAmount = Number(amount);
      const response = await scoreTransaction({
        payerUpiId: payerUpiId.trim(),
        beneficiaryUpiId: beneficiaryUpiId.trim(),
        amount: Number.isFinite(numericAmount) ? numericAmount : 0,
        deviceId,
        location,
        timestamp: Date.now(),
        qrId: qrId ?? undefined,
      });
      if (!response?.ok || !response.result) {
        setError(response?.error ?? "Scoring could not complete for this payment.");
        return;
      }
      const raw = response.result as unknown as Record<string, unknown>;
      setView({
        txnId: String(raw.txnId ?? response.txnId ?? "LIVE"),
        amount: Number(raw.amount ?? numericAmount),
        timestamp: Number(raw.timestamp ?? Date.now()),
        payerName: String(raw.payerName ?? payerUpiId),
        payerUpiId,
        beneficiaryName: String(raw.beneficiaryName ?? beneficiaryUpiId),
        beneficiaryUpiId,
        deviceId: String(raw.deviceId ?? deviceId),
        location: String(raw.location ?? location),
        txnType: qrId ? "P2M_QR" : "P2P",
        diamondTrustScore: Number(raw.diamondTrustScore ?? 0),
        riskCategory: (raw.riskCategory ?? "DIAMOND_CAUTION") as TrustView["riskCategory"],
        decision: String(raw.decision ?? "VERIFY_BENEFICIARY"),
        ruleScore: Number(raw.ruleScore ?? 0),
        mlRisk: Number(raw.mlRisk ?? 0),
        mlProbability: Number(raw.mlProbability ?? 0),
        graphScore: Number(raw.graphScore ?? 0),
        reasons: (raw.reasons as string[]) ?? [],
        signals: (raw.signals as TrustView["signals"]) ?? [],
        recommendedAction: String(raw.recommendedAction ?? ""),
        explanation: String(raw.explanation ?? ""),
        qrStatus: String(raw.qrStatus ?? "NOT_USED"),
        features: raw.features as Record<string, number> | undefined,
        graphNode: (raw.graphNode as TrustView["graphNode"]) ?? null,
        modelAvailable: Boolean(raw.modelAvailable),
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Payment scoring failed: ${caught.message}`
          : "Payment scoring failed unexpectedly.",
      );
    } finally {
      setBusy(false);
    }
  };

  const loadSuspicious = () => {
    const suspect = suggestions?.suspicious?.[0];
    if (!suspect) return;
    setBeneficiaryUpiId(suspect.upiId);
    setAmount("48000");
    setQrId(null);
  };

  const historyPreview = useMemo(() => recent?.rows?.slice(0, 6) ?? [], [recent]);

  return (
    <Shell
      eyebrow="Payment Shield"
      title="Pay & Score"
      description="Simulate a UPI payment and get its Diamond Trust Score before any money moves. Every figure comes from the synthetic demo ledger in this prototype."
      actions={
        <Chip tone="diamond">
          <Sparkles className="size-3" /> real-time pre-payment scoring
        </Chip>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-5">
            <Panel title="New payment" subtitle="All fields are simulated">
              <div className="space-y-3">
                <Field label="Payer UPI ID">
                  <input
                    value={payerUpiId}
                    onChange={(event) => setPayerUpiId(event.target.value)}
                    placeholder="aarav.sharma012@diamondbank"
                    className="brut-flat w-full bg-white p-2.5 text-sm font-semibold focus:outline-none"
                  />
                </Field>
                {suggestions?.users?.length ? (
                  <div>
                    <p className="dp-label text-[#0A0A0A]/50">
                      Saved customer profiles (real device + city from this ledger)
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {suggestions.users.slice(0, 4).map((profile) => {
                        const payer = profile as PayerProfile;
                        return (
                          <button
                            key={payer.upiId}
                            type="button"
                            onClick={() => {
                              applyPayer(payer, true);
                              setAmount("1250");
                            }}
                            className="brut-flat bg-white px-2 py-1 text-[11px] font-bold"
                          >
                            {payer.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[10px] font-medium leading-4 text-[#0A0A0A]/55">
                      Loading a profile uses the payer&apos;s own device, city and a
                      beneficiary it has paid before — the normal-payment path.
                    </p>
                  </div>
                ) : null}
                <Field label="Beneficiary UPI ID">
                  <input
                    value={beneficiaryUpiId}
                    onChange={(event) => {
                      setBeneficiaryUpiId(event.target.value);
                      setQrId(null);
                    }}
                    placeholder="neha.verma007@upidemo"
                    className="brut-flat w-full bg-white p-2.5 text-sm font-semibold focus:outline-none"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Amount (INR)">
                    <input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                      className="brut-flat dp-tabular w-full bg-white p-2.5 text-sm font-bold focus:outline-none"
                    />
                  </Field>
                  <Field label="Device ID">
                    <input
                      value={deviceId}
                      onChange={(event) => setDeviceId(event.target.value)}
                      className="brut-flat dp-mono w-full bg-white p-2.5 text-sm font-semibold focus:outline-none"
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Location">
                    <select
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      className="brut-flat w-full bg-white p-2.5 text-sm font-semibold focus:outline-none"
                    >
                      {CITY_OPTIONS.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Transaction time">
                    <div className="brut-flat dp-mono flex h-[42px] items-center bg-[#F4F1EA] px-2.5 text-[12px] font-bold">
                      now
                    </div>
                  </Field>
                </div>
                {qrId && (
                  <p className="brut-flat flex items-center justify-between gap-2 bg-[#7DD3FC] p-2 text-[11px] font-bold uppercase">
                    QR attached: {qrId}
                    <button
                      type="button"
                      onClick={() => setQrId(null)}
                      className="decoration-2 underline"
                    >
                      remove
                    </button>
                  </p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <BrutButton
                    tone={CATEGORY_META.DIAMOND_SAFE.tone}
                    size="lg"
                    onClick={() => void runScore()}
                    disabled={busy || !payerUpiId || !beneficiaryUpiId}
                  >
                    <ShieldCheck className="size-4" />
                    {busy ? "Scoring payment…" : "Check payment safety"}
                  </BrutButton>
                  <BrutButton tone="neutral" onClick={loadSuspicious}>
                    <Crosshair className="size-3.5" /> Load mule beneficiary
                  </BrutButton>
                </div>

                {busy && <LoadingBlock label="Running all three risk layers" />}
                {error && <ErrorNote message={error} onRetry={() => void runScore()} />}

                <div className="border-t-2 border-dashed border-[#0A0A0A]/25 pt-3">
                  <p className="dp-label text-[#0A0A0A]/50">Quick demo payees</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {suggestions?.merchants?.slice(0, 3).map((merchant) => (
                      <button
                        key={merchant.upiId}
                        type="button"
                        onClick={() => {
                          setBeneficiaryUpiId(merchant.upiId);
                          setQrId(null);
                        }}
                        className="brut-flat bg-white px-2 py-1 text-[11px] font-bold"
                      >
                        {merchant.name}
                      </button>
                    ))}
                    {suggestions?.suspicious?.slice(0, 2).map((account) => (
                      <button
                        key={account.upiId}
                        type="button"
                        onClick={() => {
                          setBeneficiaryUpiId(account.upiId);
                          setAmount("62000");
                          setQrId(null);
                        }}
                        className="brut-flat bg-[#EF4444] px-2 py-1 text-[11px] font-bold text-white"
                      >
                        {account.name} · mule suspect
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Preloaded demo scenarios" subtitle="Four reliable judge-facing flows">
              {scenarios?.scenarios?.length ? (
                <ul className="space-y-2">
                  {scenarios.scenarios.map((scenario) => (
                    <li key={scenario.id} className="brut-flat bg-white p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-black uppercase tracking-[0.04em]">
                            {scenario.title}
                          </p>
                          <p className="mt-1 text-[11px] font-medium leading-4 text-[#0A0A0A]/65">
                            {scenario.description}
                          </p>
                          <p className="dp-mono mt-1 text-[10px] font-bold uppercase text-[#0A0A0A]/50">
                            expected: {scenario.expected}
                          </p>
                        </div>
                        <BrutButton
                          size="sm"
                          tone="neutral"
                          onClick={() => {
                            if (scenario.txnId) {
                              navigate(`/shield/result/${scenario.txnId}`);
                              return;
                            }
                            if (scenario.qrId) navigate(`/shield/qr?qrId=${scenario.qrId}`);
                          }}
                        >
                          <Eye className="size-3" /> Open
                        </BrutButton>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyBlock title="No scenarios yet" hint="Generate the demo data first." />
              )}
            </Panel>
          </div>

          <div className="space-y-5">
            {view ? (
              <TrustResult view={view} />
            ) : (
              <Panel
                title="Diamond Trust Result"
                subtitle="Score a payment to populate the full explanation"
                tone="info"
              >
                <div className="grid place-items-center gap-3 py-10 text-center">
                  <Rocket className="size-8" />
                  <p className="max-w-md text-sm font-medium leading-6 text-[#0A0A0A]/65">
                    Fill in the simulated payment and press{" "}
                    <span className="font-black">Check payment safety</span>. You will get
                    a 0–100 Diamond Trust Score, the category, every triggered signal,
                    the contribution of each layer and a plain-English recommended
                    action.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Chip tone="safe">80–100 · Diamond Safe</Chip>
                    <Chip tone="caution">55–79 · Diamond Caution</Chip>
                    <Chip tone="alert">0–54 · Diamond Alert</Chip>
                  </div>
                </div>
              </Panel>
            )}

            <Panel
              title="Recent ledger activity"
              subtitle="Latest synthetic transactions scored by the same engine"
              right={
                <BrutButton size="sm" tone="neutral" onClick={() => navigate("/shield/history")}>
                  Full history
                </BrutButton>
              }
            >
              {recent === undefined ? (
                <LoadingBlock label="Reading ledger" />
              ) : historyPreview.length === 0 ? (
                <EmptyBlock title="No transactions yet" hint="Load the demo data." />
              ) : (
                <ul className="divide-y-2 divide-dashed divide-[#0A0A0A]/20">
                  {historyPreview.map((row) => {
                    const score = Number(row.diamondTrustScore ?? 0);
                    return (
                      <li key={row.txnId} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="dp-mono truncate text-[11px] font-bold">
                            {row.txnId}
                          </p>
                          <p className="truncate text-[12px] font-semibold">
                            {row.beneficiaryName}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="dp-tabular text-[12px] font-bold">
                            {formatInr(Number(row.amount ?? 0))}
                          </span>
                          <Chip tone={scoreTone(score)}>{score}</Chip>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <Panel title="How the shield works" subtitle="Three layers, one decision, before settlement">
          <div className="grid gap-4 md:grid-cols-3">
            <LayerCard
              index="01"
              title="QR Shield"
              text="HMAC-SHA256 signature, merchant identity, amount, expiry and payload integrity are verified before the payee is trusted."
            />
            <LayerCard
              index="02"
              title="Rule + ML risk"
              text="15 deterministic fraud rules and a model trained in-app on the synthetic ledger score the behaviour of this exact payment."
            />
            <LayerCard
              index="03"
              title="MuleNet graph"
              text="The beneficiary's network neighbourhood is checked for fan-in, rapid forwarding and money-mule cluster membership."
            />
          </div>
        </Panel>
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="dp-label text-[#0A0A0A]/55">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function LayerCard({
  index,
  title,
  text,
}: {
  index: string;
  title: string;
  text: string;
}) {
  return (
    <div className="brut bg-[#F4F1EA] p-3">
      <p className="dp-tabular text-3xl font-black leading-none">{index}</p>
      <p className="mt-2 text-sm font-black uppercase tracking-[0.04em]">{title}</p>
      <p className="mt-1.5 text-[12px] font-medium leading-5 text-[#0A0A0A]/70">{text}</p>
    </div>
  );
}
