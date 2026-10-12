/**
 * DIAMOND-PROTECT :: neobrutalist UI primitives.
 * Square corners, 3px black borders, hard offset shadows, flat colour blocks.
 */

import { cn } from "@/lib/utils";
import {
  TONE_BG,
  TONE_HEX,
  type Tone,
  accountStatusTone,
  accountStatusLabel,
  categoryTone,
  decisionTone,
  decisionLabel,
  formatInr,
  qrStatusTone,
  scoreTone,
} from "@/lib/dp";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

/* ------------------------------- surfaces ------------------------------- */

export function Panel({
  children,
  className,
  title,
  subtitle,
  right,
  tone,
  tight,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  tone?: Tone;
  tight?: boolean;
}) {
  return (
    <section className={cn("brut bg-white", className)}>
      {(title || right) && (
        <header
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-[#0A0A0A] px-4 py-3",
            tone ? TONE_BG[tone] : "bg-white",
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="dp-label truncate text-[12px] tracking-[0.14em]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-xs font-medium text-[#0A0A0A]/70">
                {subtitle}
              </p>
            )}
          </div>
          {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={cn(tight ? "p-0" : "p-4")}>{children}</div>
    </section>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <p className="dp-label text-[#0A0A0A]/60">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#0A0A0A]/70">
            {description}
          </p>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

/* --------------------------------- chips -------------------------------- */

export function Chip({
  children,
  tone = "neutral",
  className,
  mono = true,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "brut-flat inline-flex items-center gap-1 px-2 py-[3px] text-[11px] font-bold uppercase",
        mono && "dp-mono tracking-[0.08em]",
        TONE_BG[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CategoryChip({ category }: { category?: string | null }) {
  const tone = categoryTone(category);
  const label =
    category === "DIAMOND_SAFE"
      ? "Diamond Safe"
      : category === "DIAMOND_CAUTION"
        ? "Diamond Caution"
        : category === "DIAMOND_ALERT"
          ? "Diamond Alert"
          : "Unscored";
  return <Chip tone={tone}>{label}</Chip>;
}

export function DecisionChip({ decision }: { decision?: string | null }) {
  return <Chip tone={decisionTone(decision)}>{decisionLabel(decision)}</Chip>;
}

export function QrStatusChip({ status }: { status?: string | null }) {
  const label =
    status === "FAKE_TAMPERED"
      ? "Fake / Tampered"
      : status === "NOT_USED"
        ? "No QR"
        : (status ?? "UNKNOWN").replace(/_/g, " ").toLowerCase();
  return <Chip tone={qrStatusTone(status)}>{label}</Chip>;
}

export function AccountStatusChip({ status }: { status?: string | null }) {
  return <Chip tone={accountStatusTone(status)}>{accountStatusLabel(status)}</Chip>;
}

export function ScoreChip({ score }: { score: number }) {
  return (
    <Chip tone={scoreTone(score)} className="dp-tabular">
      {score}
    </Chip>
  );
}

/* -------------------------------- metrics -------------------------------- */

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  mono = true,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="brut bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="dp-label text-[#0A0A0A]/60">{label}</p>
        <span
          className={cn("brut-flat grid size-6 place-items-center", TONE_BG[tone])}
        >
          {icon ?? <ShieldCheck className="size-3" />}
        </span>
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-black leading-none sm:text-[28px]",
          mono && "dp-tabular",
        )}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-2 text-xs font-medium leading-5 text-[#0A0A0A]/60">
          {hint}
        </p>
      )}
    </div>
  );
}

export function KeyValue({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 border-b border-dashed border-[#0A0A0A]/25 py-1.5 last:border-0", className)}>
      <span className="dp-label shrink-0 text-[#0A0A0A]/55">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-sm font-semibold",
          mono && "dp-mono",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------- score ring ------------------------------ */

export function ScoreRing({
  score,
  size = 190,
  label,
  caption,
}: {
  score: number;
  size?: number;
  label?: string;
  caption?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tone = scoreTone(clamped);
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="#FFFFFF"
            stroke="#0A0A0A"
            strokeWidth={3}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius - 8}
            fill="none"
            stroke="#E6E1D5"
            strokeWidth={stroke - 8}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius - 8}
            fill="none"
            stroke={TONE_HEX[tone]}
            strokeWidth={stroke - 8}
            strokeDasharray={`${(clamped / 100) * 2 * Math.PI * (radius - 8)} ${circumference}`}
            strokeLinecap="butt"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="dp-tabular text-[44px] font-black leading-none">
            {clamped}
          </span>
          <span className="dp-label mt-1 text-[#0A0A0A]/55">/ 100</span>
          {label && <span className="dp-label mt-1">{label}</span>}
        </div>
      </div>
      {caption && (
        <p className="max-w-[240px] text-center text-xs font-medium leading-5 text-[#0A0A0A]/70">
          {caption}
        </p>
      )}
    </div>
  );
}

export function LayerBar({
  label,
  value,
  tone,
  weight,
  detail,
}: {
  label: string;
  value: number;
  tone: Tone;
  weight?: string;
  detail?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="dp-label">
          {label}
          {weight && <span className="ml-2 text-[#0A0A0A]/45">{weight}</span>}
        </span>
        <span className="dp-tabular text-sm font-bold">{clamped}</span>
      </div>
      <div className="mt-1.5 h-4 w-full border-2 border-[#0A0A0A] bg-white">
        <div
          className={cn("h-full", TONE_BG[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {detail && (
        <p className="mt-1 text-[11px] font-medium leading-4 text-[#0A0A0A]/60">
          {detail}
        </p>
      )}
    </div>
  );
}

/* ------------------------------ states ---------------------------------- */

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div className="brut flex items-center gap-3 bg-white p-4">
      <Loader2 className="size-4 animate-spin" />
      <span className="dp-label text-[#0A0A0A]/70">{label}…</span>
    </div>
  );
}

export function ErrorNote({
  message,
  onRetry,
  detail,
}: {
  message: string;
  onRetry?: () => void;
  detail?: string;
}) {
  return (
    <div className="brut flex flex-wrap items-start gap-3 bg-[#EF4444] p-3 text-white">
      <AlertTriangle className="mt-[2px] size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{message}</p>
        {detail && (
          <p className="dp-mono mt-1 break-words text-[11px] opacity-80">{detail}</p>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="brut-flat inline-flex items-center gap-1.5 bg-white px-2 py-1 text-[11px] font-bold uppercase text-[#0A0A0A]"
        >
          <RefreshCw className="size-3" /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-[3px] border-dashed border-[#0A0A0A]/35 bg-white/60 p-6 text-center">
      <p className="dp-label text-[#0A0A0A]/60">{title}</p>
      {hint && (
        <p className="mx-auto mt-2 max-w-md text-xs font-medium leading-5 text-[#0A0A0A]/55">
          {hint}
        </p>
      )}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/* ------------------------------- buttons --------------------------------- */

export function BrutButton({
  children,
  onClick,
  disabled,
  tone = "dark",
  className,
  type = "button",
  size = "md",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: Tone;
  className?: string;
  type?: "button" | "submit";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "brut brut-hover brut-press inline-flex items-center justify-center gap-2 font-bold uppercase tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        size === "sm" && "px-2.5 py-1.5 text-[11px]",
        size === "md" && "px-3.5 py-2 text-xs",
        size === "lg" && "px-5 py-3 text-sm",
        TONE_BG[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  allLabel = "All",
}: {
  options: { value: T; label: string; count?: number }[];
  value: T | "";
  onChange: (value: T | "") => void;
  allLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange("")}
        className={cn(
          "brut-flat px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]",
          value === "" ? "bg-[#0A0A0A] text-[#F4F1EA]" : "bg-white",
        )}
      >
        {allLabel}
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "brut-flat px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]",
            value === option.value ? "bg-[#0A0A0A] text-[#F4F1EA]" : "bg-white",
          )}
        >
          {option.label}
          {option.count !== undefined && (
            <span className="dp-tabular ml-1.5 opacity-60">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function ExplanationList({
  reasons,
  title = "Why did we flag this?",
}: {
  reasons: string[];
  title?: string;
}) {
  if (!reasons || reasons.length === 0) {
    return (
      <p className="text-sm text-[#0A0A0A]/60">
        No fraud signals fired for this payment.
      </p>
    );
  }
  return (
    <div>
      <p className="dp-label text-[#0A0A0A]/60">{title}</p>
      <ol className="mt-2 space-y-2">
        {reasons.map((reason, index) => (
          <li
            key={`${index}-${reason.slice(0, 12)}`}
            className="flex gap-2.5 border-2 border-[#0A0A0A] bg-[#F4F1EA] p-2.5"
          >
            <span className="dp-tabular grid size-5 shrink-0 place-items-center bg-[#0A0A0A] text-[10px] font-bold text-[#F4F1EA]">
              {index + 1}
            </span>
            <span className="text-sm font-medium leading-5">{reason}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function MoneyText({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}) {
  return <span className={cn("dp-tabular", className)}>{formatInr(amount)}</span>;
}

export { formatInr };
