/**
 * DIAMOND-PROTECT :: landing page.
 * Neobrutalism Minimalism — square corners, heavy black borders, flat colour
 * blocking, hard offset shadows.
 *
 * Hackathon prototype: all figures and screenshots shown here are generated
 * synthetic demo data. No connection to UPI, NPCI, banks or real systems.
 */

import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { formatCount, formatInrShort } from "@/lib/dp";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  Ban,
  BadgeCheck,
  Building2,
  Fingerprint,
  Gauge,
  Network,
  QrCode,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router";

function DiamondMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M16 2 L28 6.5 V16.5 C28 23.5 22.6 28.4 16 30.5 C9.4 28.4 4 23.5 4 16.5 V6.5 Z"
        fill="#22D3EE"
        stroke="#0A0A0A"
        strokeWidth="2.4"
      />
      <path d="M16 9 L21.5 15.5 L16 23 L10.5 15.5 Z" fill="#0A0A0A" />
      <path d="M16 9 L16 23" stroke="#7DD3FC" strokeWidth="1.4" />
      <path d="M10.5 15.5 L21.5 15.5" stroke="#7DD3FC" strokeWidth="1.4" />
    </svg>
  );
}

const FEATURES = [
  {
    icon: QrCode,
    title: "QR Shield",
    body: "HMAC-SHA256 signed merchant payloads. Signature, merchant identity, amount, version and expiry are verified before the payee is trusted — a reprinted sticker fails instantly.",
    tone: "bg-[#22D3EE]",
  },
  {
    icon: Gauge,
    title: "Rule + ML risk engine",
    body: "15 deterministic fraud rules combined with a risk model trained in-app on the synthetic ledger, weighted into one explainable Diamond Trust Score between 0 and 100.",
    tone: "bg-[#FDE047]",
  },
  {
    icon: Network,
    title: "MuleNet graph",
    body: "NetworkX-style analytics: in/out degree, inflow, outflow ratio, unique counterparties, receive-to-forward latency, clustering and money-mule cluster detection.",
    tone: "bg-[#7DD3FC]",
  },
  {
    icon: Fingerprint,
    title: "Explainable by design",
    body: "Every score prints the rule reasons that fired, the model's per-feature contributions and the network behaviour observed — no black boxes in front of a judge.",
    tone: "bg-[#10B981]",
  },
  {
    icon: Building2,
    title: "Fraud analyst console",
    body: "Overview KPIs, transaction investigator, MuleNet explorer, QR registry, case management with audit trail and a live rule control panel.",
    tone: "bg-[#F59E0B]",
  },
  {
    icon: ShieldCheck,
    title: "Pre-payment, not post-mortem",
    body: "The decision happens before authorisation: proceed, verify the beneficiary, add authentication, or stop the payment outright.",
    tone: "bg-white",
  },
];

const FRAUD_COVERAGE = [
  "Fake QR stickers",
  "Tampered QR payloads",
  "Merchant impersonation",
  "Payment redirection",
  "New-beneficiary fraud",
  "Rapid payment bursts",
  "Device-change fraud",
  "Location anomalies",
  "High-value transfers",
  "Money-mule inflows",
  "Rapid money forwarding",
  "Mule-network clusters",
];

export default function Landing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const health = useQuery(api.diamond.health);
  const metrics = useQuery(api.commandCentre.metrics, { feedSize: 5 });

  const stats = metrics?.metrics ?? null;

  const enter = () => navigate(isAuthenticated ? "/command" : "/auth?returnTo=/command");

  return (
    <div className="dp-grid min-h-screen bg-[#F4F1EA]">
      <div className="border-b-[3px] border-[#0A0A0A] bg-[#FDE047] px-3 py-1.5">
        <p className="dp-mono flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[10px] font-bold uppercase tracking-[0.1em] sm:text-[11px]">
          <TriangleAlert className="size-3" />
          Hackathon prototype · synthetic data only · no connection to UPI, NPCI, banks or
          real financial systems
        </p>
      </div>

      <header className="border-b-[3px] border-[#0A0A0A] bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <DiamondMark className="size-9" />
            <div>
              <p className="text-base font-black leading-none tracking-tight">
                DIAMOND-PROTECT
              </p>
              <p className="dp-mono mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0A0A0A]/60">
                Every payment. protected.
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <a
              href="#how"
              className="brut-flat hidden bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] sm:inline-block"
            >
              How it works
            </a>
            <a
              href="#coverage"
              className="brut-flat hidden bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] sm:inline-block"
            >
              Coverage
            </a>
            <button
              type="button"
              onClick={enter}
              className="brut brut-hover brut-press inline-flex items-center gap-2 bg-[#0A0A0A] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[#F4F1EA]"
            >
              {isAuthenticated ? "Open Command Centre" : "Enter console"}
              <ArrowRight className="size-3.5" />
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 sm:py-14">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
        >
          <div>
            <span className="brut-flat inline-flex items-center gap-2 bg-[#22D3EE] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]">
              <Sparkles className="size-3" />
              BIS-aligned fintech hackathon build
            </span>
            <h1 className="mt-4 text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
              Diamond
              <br />
              Protect
            </h1>
            <p className="dp-mono mt-4 max-w-2xl text-[13px] font-bold uppercase leading-6 tracking-[0.04em]">
              AI-powered real-time UPI fraud, fake-QR and mule-account protection system
            </p>
            <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-[#0A0A0A]/75">
              DIAMOND-PROTECT does not just detect fraud after the payment — it protects
              the payment before it happens. Three independent layers score every
              transaction before authorisation and hand the analyst a full explanation.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={enter}
                className="brut brut-hover brut-press inline-flex items-center gap-2 bg-[#0A0A0A] px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-[#F4F1EA]"
              >
                <ShieldCheck className="size-4" />
                {isAuthenticated ? "Open the Command Centre" : "Enter the demo console"}
              </button>
              <Link
                to="/shield"
                className="brut brut-hover brut-press inline-flex items-center gap-2 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.06em]"
              >
                <Zap className="size-4" /> Try the Payment Shield
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="brut-flat bg-[#10B981] px-2 py-1 text-[11px] font-bold uppercase">
                80–100 diamond safe
              </span>
              <span className="brut-flat bg-[#F59E0B] px-2 py-1 text-[11px] font-bold uppercase">
                55–79 diamond caution
              </span>
              <span className="brut-flat bg-[#EF4444] px-2 py-1 text-[11px] font-bold uppercase text-white">
                0–54 diamond alert
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="brut bg-[#0A0A0A] p-4 text-[#F4F1EA]">
              <p className="dp-label opacity-70">Live demo ledger</p>
              <p className="dp-tabular mt-2 text-4xl font-black">
                {stats ? formatCount(stats.totalTransactions) : "8,000"}
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.06em] opacity-70">
                synthetic UPI transactions scored
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="brut-flat bg-[#F4F1EA] p-2 text-[#0A0A0A]">
                  <p className="dp-label opacity-60">Loss prevented</p>
                  <p className="dp-tabular mt-1 text-lg font-black">
                    {stats ? formatInrShort(stats.fraudLossPrevented) : "₹3.2Cr"}
                  </p>
                </div>
                <div className="brut-flat bg-[#F4F1EA] p-2 text-[#0A0A0A]">
                  <p className="dp-label opacity-60">Mule accounts</p>
                  <p className="dp-tabular mt-1 text-lg font-black">
                    {stats ? formatCount(stats.suspectedMuleAccounts) : "50+"}
                  </p>
                </div>
              </div>
              <p className="dp-mono mt-3 border-t-2 border-dashed border-[#F4F1EA]/30 pt-2 text-[10px] font-bold uppercase leading-4 opacity-70">
                {health?.seeded
                  ? `Model ROC-AUC ${health.model.rocAuc ?? "—"} · trained on synthetic data`
                  : "Demo data generates automatically on first load"}
              </p>
            </div>

            <div className="brut flex items-start gap-3 bg-white p-4">
              <BadgeCheck className="mt-0.5 size-5 shrink-0" />
              <p className="text-[12px] font-medium leading-5">
                <span className="font-black uppercase">Demo-safe by construction.</span>{" "}
                The generator is deterministic, the ML model trains in-process, and every
                API call is wrapped so a failed request degrades to rule-based scoring
                instead of breaking the presentation.
              </p>
            </div>
          </div>
        </motion.section>

        {/* Layers */}
        <section id="how" className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="dp-label text-[#0A0A0A]/55">The protection stack</p>
              <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                Three layers, one decision
              </h2>
            </div>
            <p className="max-w-md text-sm font-medium leading-6 text-[#0A0A0A]/65">
              Trust = 100 − (0.45·Rule + 0.35·ML + 0.20·Graph). Fixed weights keep the
              score reproducible and auditable during a live demo.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "QR Shield",
                text: "The scanned merchant payload is verified against its HMAC-SHA256 signature and the merchant registry before anything else runs.",
                tone: "bg-[#22D3EE]",
                icon: QrCode,
              },
              {
                step: "02",
                title: "Risk scoring",
                text: "15 deterministic rules plus an in-app trained model score the behaviour: amount anomaly, new beneficiary, device and location change, odd hours, bursts.",
                tone: "bg-[#FDE047]",
                icon: Gauge,
              },
              {
                step: "03",
                title: "MuleNet",
                text: "The beneficiary's network neighbourhood is checked for collector-ring behaviour: fan-in, rapid forwarding and cluster membership.",
                tone: "bg-[#7DD3FC]",
                icon: Network,
              },
            ].map((layer) => {
              const Icon = layer.icon;
              return (
                <div key={layer.step} className="brut flex flex-col bg-white">
                  <div className={cn("border-b-[3px] border-[#0A0A0A] p-3", layer.tone)}>
                    <Icon className="size-5" />
                  </div>
                  <div className="p-4">
                    <p className="dp-tabular text-3xl font-black leading-none">
                      {layer.step}
                    </p>
                    <p className="mt-2 text-sm font-black uppercase tracking-[0.04em]">
                      {layer.title}
                    </p>
                    <p className="mt-1.5 text-[12px] font-medium leading-5 text-[#0A0A0A]/70">
                      {layer.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Features */}
        <section className="mt-14">
          <p className="dp-label text-[#0A0A0A]/55">What is in the build</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
            Built to be demonstrated, not just described
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="brut flex flex-col bg-white">
                  <div
                    className={cn(
                      "border-b-[3px] border-[#0A0A0A] p-3",
                      feature.tone,
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-black uppercase tracking-[0.04em]">
                      {feature.title}
                    </p>
                    <p className="mt-2 text-[12px] font-medium leading-5 text-[#0A0A0A]/70">
                      {feature.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Coverage */}
        <section id="coverage" className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="brut bg-white p-5">
            <p className="dp-label text-[#0A0A0A]/55">Version 1 threat coverage</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
              Every version-1 attack path is exercised by the seeded ledger
            </h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {FRAUD_COVERAGE.map((item) => (
                <p
                  key={item}
                  className="brut-flat flex items-center gap-2 bg-[#F4F1EA] px-2.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.03em]"
                >
                  <Ban className="size-3.5 shrink-0" />
                  {item}
                </p>
              ))}
            </div>
            <p className="mt-4 border-t-2 border-dashed border-[#0A0A0A]/25 pt-4 text-[12px] font-medium leading-5 text-[#0A0A0A]/70">
              The primary user of this demo is a <span className="font-black">bank fraud
              analyst</span>: the Command Centre leads with KPIs, investigation, network
              analysis, case workflow and a live rule console — while the customer-facing
              shield shows what the user would actually experience.
            </p>
          </div>

          <div className="space-y-4">
            <div className="brut bg-[#22D3EE] p-5">
              <p className="dp-label opacity-70">Ready to look inside?</p>
              <p className="mt-2 text-xl font-black leading-6">
                The console opens with 8,000 synthetic transactions, 300 signed QR codes,
                120 fraud cases and 20 mule clusters already seeded.
              </p>
              <button
                type="button"
                onClick={enter}
                className="brut brut-hover brut-press mt-4 inline-flex w-full items-center justify-center gap-2 bg-[#0A0A0A] px-4 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-[#F4F1EA]"
              >
                {isAuthenticated ? "Open the console" : "Sign in and open the console"}
                <ArrowRight className="size-3.5" />
              </button>
            </div>
            <div className="brut bg-white p-5">
              <p className="dp-label text-[#0A0A0A]/55">Open source · offline first</p>
              <ul className="mt-2 space-y-1.5 text-[12px] font-medium leading-5">
                <li>· Runs entirely on your machine — no paid APIs, no bank credentials</li>
                <li>· Deterministic synthetic generator (same demo story every run)</li>
                <li>· Model trained in-process, metrics reported honestly as synthetic</li>
                <li>· Friendly error states instead of stack traces</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="mt-14">
          <div className="brut bg-[#0A0A0A] p-6 text-[#F4F1EA] sm:p-8">
            <p className="dp-label opacity-70">Final pitch</p>
            <p className="mt-2 text-2xl font-black leading-tight sm:text-4xl">
              DIAMOND-PROTECT: Every Payment. Protected.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={enter}
                className="brut brut-hover brut-press inline-flex items-center gap-2 bg-[#22D3EE] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-[#0A0A0A]"
              >
                <ShieldCheck className="size-4" /> Enter the console
              </button>
              <Link
                to="/shield/safety"
                className="brut brut-hover brut-press inline-flex items-center gap-2 bg-[#F4F1EA] px-5 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-[#0A0A0A]"
              >
                <TriangleAlert className="size-4" /> Safety centre
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-[3px] border-[#0A0A0A] bg-white px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-[1240px]">
          <p className="dp-mono text-[10px] font-bold uppercase leading-5 tracking-[0.06em] text-[#0A0A0A]/55">
            DIAMOND-PROTECT · open-source hackathon prototype built for an 8-hour fintech
            hackathon alongside BIS guidance on digital payment security · every row of
            data is synthetic and generated locally · not affiliated with NPCI, UPI or any
            bank · metrics are measured on synthetic data and are not production accuracy
            claims · for a real incident always use your bank&apos;s official support
            channels
          </p>
        </div>
      </footer>
    </div>
  );
}
