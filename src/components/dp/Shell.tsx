/**
 * DIAMOND-PROTECT :: app shell.
 * Prototype banner + analyst console navigation + demo data orchestration.
 */

import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useAction, useQuery } from "convex/react";
import {
  AlertTriangle,
  Database,
  FolderOpen,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  QrCode,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Store,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ErrorNote } from "./ui";

const NAV: {
  group: string;
  note: string;
  items: { to: string; label: string; icon: typeof ShieldCheck }[];
}[] = [
  {
    group: "Command Centre",
    note: "Bank fraud analyst console",
    items: [
      { to: "/command", label: "Overview", icon: LayoutDashboard },
      { to: "/command/investigator", label: "Transaction Investigator", icon: Search },
      { to: "/command/mulenet", label: "MuleNet Graph", icon: Share2 },
      { to: "/command/merchants", label: "Merchant QR Registry", icon: Store },
      { to: "/command/cases", label: "Fraud Case Manager", icon: FolderOpen },
      { to: "/command/rules", label: "Rule Control Panel", icon: SlidersHorizontal },
    ],
  },
  {
    group: "Payment Shield",
    note: "What the customer sees",
    items: [
      { to: "/shield", label: "Pay & Score", icon: ShieldCheck },
      { to: "/shield/qr", label: "Diamond QR Verify", icon: QrCode },
      { to: "/shield/history", label: "Transaction History", icon: History },
      { to: "/shield/safety", label: "Diamond Safety Centre", icon: LifeBuoy },
    ],
  },
];

export function DiamondMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M16 2 L28 6.5 V16.5 C28 23.5 22.6 28.4 16 30.5 C9.4 28.4 4 23.5 4 16.5 V6.5 Z"
        fill="#22D3EE"
        stroke="#0A0A0A"
        strokeWidth="2.4"
        strokeLinejoin="miter"
      />
      <path
        d="M16 9 L21.5 15.5 L16 23 L10.5 15.5 Z"
        fill="#0A0A0A"
      />
      <path d="M16 9 L16 23" stroke="#7DD3FC" strokeWidth="1.4" />
      <path d="M10.5 15.5 L21.5 15.5" stroke="#7DD3FC" strokeWidth="1.4" />
    </svg>
  );
}

const SEED_PHASES = [
  "Wiping previous demo ledger",
  "Generating 500 synthetic customers",
  "Minting 300 signed merchant QR codes",
  "Planning 8,000 synthetic UPI payments",
  "Detecting money-mule clusters (MuleNet)",
  "Training the Diamond risk model",
  "Scoring the ledger through all three layers",
  "Aggregating Command Centre KPIs",
];

function SeedOverlay({
  active,
  failed,
  message,
  onRetry,
}: {
  active: boolean;
  failed: boolean;
  message: string;
  onRetry: () => void;
}) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }
    const timer = setInterval(() => {
      setPhase((current) => Math.min(SEED_PHASES.length - 1, current + 1));
    }, 1400);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#F4F1EA] p-6">
      <div className="brut w-full max-w-lg bg-white p-6">
        <div className="flex items-center gap-3">
          <DiamondMark className="size-10 shrink-0" />
          <div>
            <p className="dp-label text-[#0A0A0A]/60">DIAMOND-PROTECT</p>
            <h2 className="text-xl font-black">Initialising synthetic demo data</h2>
          </div>
        </div>

        {failed ? (
          <div className="mt-5 space-y-3">
            <ErrorNote message={message || "Demo data generation failed."} onRetry={onRetry} />
            <p className="text-xs font-medium text-[#0A0A0A]/60">
              Nothing is broken in the app — generation can simply be retried. If it
              keeps failing, the Convex deployment may be unreachable.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm font-medium leading-6 text-[#0A0A0A]/70">
              Building a deterministic synthetic UPI ledger in your own database. No
              real UPI, NPCI, bank or customer data is involved — every row is
              generated locally by the open-source generator in this project.
            </p>
            <ul className="mt-4 space-y-1.5">
              {SEED_PHASES.map((label, index) => (
                <li
                  key={label}
                  className={cn(
                    "flex items-center gap-2 border-2 border-[#0A0A0A] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.05em]",
                    index < phase
                      ? "bg-[#10B981]"
                      : index === phase
                        ? "bg-[#FDE047]"
                        : "bg-white text-[#0A0A0A]/45",
                  )}
                >
                  <Database className="size-3" />
                  {label}
                </li>
              ))}
            </ul>
            <div className="mt-4 h-3 w-full border-2 border-[#0A0A0A] bg-white">
              <div
                className="h-full bg-[#22D3EE] transition-all duration-700"
                style={{
                  width: `${Math.round(((phase + 1) / SEED_PHASES.length) * 100)}%`,
                }}
              />
            </div>
            <p className="dp-mono mt-2 text-[11px] text-[#0A0A0A]/55">{message}</p>
          </>
        )}
      </div>
    </div>
  );
}

export function Shell({
  title,
  eyebrow,
  description,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const overview = useQuery(api.commandCentre.metrics, { feedSize: 5 });
  const seedDemoData = useAction(api.demoSeed.seedDemoData);

  const [seedError, setSeedError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const requested = useRef(false);

  const seeded = overview?.seeded ?? false;
  const isSeeding = seeding || (overview?.isSeeding ?? false);

  const runSeed = async () => {
    setSeeding(true);
    setSeedError(null);
    try {
      const response = await seedDemoData({});
      if (!response?.ok) {
        setSeedError(response?.message ?? "Demo data generation failed.");
      }
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : "Demo seeding failed.");
    } finally {
      setSeeding(false);
    }
  };

  // Auto-seed once when the database has no demo dataset yet.
  useEffect(() => {
    if (overview === undefined || requested.current) return;
    if (!overview.seeded && !overview.isSeeding) {
      requested.current = true;
      void runSeed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const modelLine = overview?.metrics?.modelSnapshot as
    | { rocAuc?: number; modelType?: string }
    | null
    | undefined;

  const showOverlay = !seeded && (isSeeding || seedError !== null);

  return (
    <div className="dp-grid min-h-screen bg-[#F4F1EA]">
      <SeedOverlay
        active={showOverlay}
        failed={seedError !== null && !seeding}
        message={seedError ?? overview?.message ?? "Working…"}
        onRetry={() => void runSeed()}
      />

      <div className="border-b-[3px] border-[#0A0A0A] bg-[#FDE047] px-3 py-1.5">
        <p className="dp-mono flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[10px] font-bold uppercase tracking-[0.1em] sm:text-[11px]">
          <AlertTriangle className="size-3" />
          Hackathon prototype · synthetic data only · no connection to UPI, NPCI,
          banks or real financial systems
        </p>
      </div>

      <div className="mx-auto flex max-w-[1600px] flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="hidden shrink-0 border-r-[3px] border-[#0A0A0A] bg-[#F4F1EA] lg:block lg:w-[280px]">
          <div className="sticky top-0 flex h-screen flex-col overflow-y-auto p-4">
            <Link to="/" className="brut flex items-center gap-2.5 bg-white p-3">
              <DiamondMark className="size-8 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-sm font-black leading-none">
                  DIAMOND-PROTECT
                </p>
                <p className="dp-mono mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#0A0A0A]/60">
                  Every payment. Protected.
                </p>
              </div>
            </Link>

            <nav className="mt-4 space-y-5">
              {NAV.map((group) => (
                <div key={group.group}>
                  <p className="dp-label text-[#0A0A0A]/45">{group.group}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-[#0A0A0A]/40">
                    {group.note}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {group.items.map((item) => {
                      const active =
                        location.pathname === item.to ||
                        (item.to !== "/command" &&
                          item.to !== "/shield" &&
                          location.pathname.startsWith(item.to));
                      const Icon = item.icon;
                      return (
                        <li key={item.to}>
                          <Link
                            to={item.to}
                            className={cn(
                              "flex items-center gap-2.5 border-2 border-[#0A0A0A] px-2.5 py-2 text-[12px] font-bold transition-transform",
                              active
                                ? "bg-[#0A0A0A] text-[#F4F1EA]"
                                : "bg-white hover:-translate-y-[1px] hover:shadow-[3px_3px_0_0_#0A0A0A]",
                            )}
                          >
                            <Icon className="size-3.5 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="mt-5 border-2 border-[#0A0A0A] bg-white p-3">
              <p className="dp-label text-[#0A0A0A]/50">Risk model</p>
              <p className="dp-mono mt-1 text-[11px] font-bold leading-4">
                {modelLine?.rocAuc
                  ? `ROC-AUC ${modelLine.rocAuc}`
                  : "no model loaded"}
              </p>
              <p className="mt-1 text-[10px] font-medium leading-4 text-[#0A0A0A]/55">
                Trained in-app on synthetic data. Synthetic metrics only.
              </p>
            </div>

            <div className="mt-4 flex-1" />

            <div className="border-t-2 border-dashed border-[#0A0A0A]/30 pt-3">
              <p className="dp-label truncate text-[#0A0A0A]/55">
                {user?.name ?? user?.email ?? "analyst"}
              </p>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="brut-flat mt-2 inline-flex w-full items-center justify-center gap-1.5 bg-white px-2 py-1.5 text-[11px] font-bold uppercase"
              >
                <LogOut className="size-3" /> Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          {/* Mobile nav */}
          <div className="border-b-[3px] border-[#0A0A0A] bg-[#F4F1EA] lg:hidden">
            <div className="flex items-center gap-2 p-3">
              <Link to="/" className="brut flex items-center gap-2 bg-white p-2">
                <DiamondMark className="size-6" />
                <span className="text-xs font-black">DIAMOND-PROTECT</span>
              </Link>
            </div>
            <div className="dp-hide-scroll flex gap-2 overflow-x-auto px-3 pb-3">
              {NAV.flatMap((group) => group.items).map((item) => {
                const active = location.pathname === item.to;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "brut-flat flex shrink-0 items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold uppercase",
                      active ? "bg-[#0A0A0A] text-[#F4F1EA]" : "bg-white",
                    )}
                  >
                    <Icon className="size-3" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <header className="border-b-[3px] border-[#0A0A0A] bg-white px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {eyebrow && <p className="dp-label text-[#0A0A0A]/50">{eyebrow}</p>}
                <h1 className="mt-1 truncate text-2xl font-black tracking-tight sm:text-[28px]">
                  {title}
                </h1>
                {description && (
                  <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-[#0A0A0A]/65">
                    {description}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {actions}
                <button
                  type="button"
                  onClick={() => void runSeed()}
                  disabled={isSeeding}
                  className="brut brut-hover brut-press inline-flex items-center gap-2 bg-[#22D3EE] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] disabled:opacity-60"
                >
                  <RefreshCw className={cn("size-3.5", isSeeding && "animate-spin")} />
                  {isSeeding ? "Seeding…" : seeded ? "Reset demo data" : "Load demo data"}
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="dp-mono border-2 border-[#0A0A0A] bg-[#F4F1EA] px-2 py-0.5 text-[10px] font-bold uppercase">
                {overview?.metrics
                  ? `${overview.metrics.totalTransactions.toLocaleString("en-IN")} synthetic transactions`
                  : "no ledger yet"}
              </span>
              <span className="dp-mono border-2 border-[#0A0A0A] bg-[#F4F1EA] px-2 py-0.5 text-[10px] font-bold uppercase">
                seed v1 · deterministic
              </span>
              {overview?.message && (
                <span className="dp-mono truncate border-2 border-[#0A0A0A] bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-[#0A0A0A]/60">
                  {overview.message}
                </span>
              )}
            </div>
          </header>

          <main className="p-4 sm:p-6">{children}</main>

          <footer className="border-t-[3px] border-[#0A0A0A] bg-white px-4 py-4 sm:px-6">
            <p className="dp-mono text-[10px] font-bold uppercase leading-5 tracking-[0.06em] text-[#0A0A0A]/55">
              DIAMOND-PROTECT · open-source hackathon prototype · all data is
              synthetic and generated locally · not affiliated with NPCI, UPI or any
              bank · for a real incident always use your bank&apos;s official support
              channels
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
