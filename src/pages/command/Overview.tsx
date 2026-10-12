/**
 * DIAMOND-PROTECT :: Command Centre — Overview.
 * The analyst's landing screen: what is happening right now across the ledger.
 */

import { Shell } from "@/components/dp/Shell";
import {
  BrutButton,
  Chip,
  DecisionChip,
  EmptyBlock,
  KeyValue,
  LoadingBlock,
  Panel,
  QrStatusChip,
  Stat,
} from "@/components/dp/ui";
import { api } from "@/convex/_generated/api";
import {
  formatCount,
  formatDateTime,
  formatInr,
  formatInrShort,
  patternLabel,
  scoreTone,
  timeAgo,
} from "@/lib/dp";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  Activity,
  AlertOctagon,
  Ban,
  CircleDollarSign,
  FolderOpen,
  Store,
  TrendingDown,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const TOOLTIP_STYLE = {
  border: "3px solid #0A0A0A",
  borderRadius: 0,
  background: "#FFFFFF",
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 11,
  fontWeight: 700,
  boxShadow: "5px 5px 0 0 #0A0A0A",
};

export default function CommandOverview() {
  const navigate = useNavigate();
  const data = useQuery(api.commandCentre.metrics, { feedSize: 24 });
  const extras = useQuery(api.commandCentre.overviewExtras, {});
  const scenarios = useQuery(api.diamond.demoScenarios, {});

  const metrics = data?.metrics ?? null;

  if (data === undefined) {
    return (
      <Shell eyebrow="Command Centre" title="Overview">
        <LoadingBlock label="Loading fraud intelligence" />
      </Shell>
    );
  }

  if (!data.ok || !metrics) {
    return (
      <Shell eyebrow="Command Centre" title="Overview">
        <EmptyBlock
          title="Command Centre data unavailable"
          hint="Generate the demo data from the button in the header, or check that the Convex deployment is reachable."
        />
      </Shell>
    );
  }

  const model = metrics.modelSnapshot as
    | {
        modelType: string;
        rocAuc: number;
        f1: number;
        precision: number;
        recall: number;
        accuracy: number;
        trainSize: number;
        testSize: number;
        notes: string;
        topFeatures: { label: string; importance: number; coef: number }[];
      }
    | null;

  const trend = metrics.trend ?? [];
  const distribution = metrics.scoreDistribution ?? [];
  const feed = data.feed ?? [];
  const alerts = data.alerts ?? [];

  return (
    <Shell
      eyebrow="Command Centre · fraud intelligence"
      title="Overview"
      description="Synthetic UPI ledger monitored in real time by the rule engine, the ML model and the MuleNet graph. Every number here is generated locally for the demo."
      actions={
        <>
          <Chip tone="alert">
            <Activity className="size-3" /> live subscription
          </Chip>
          <Chip tone="diamond">{formatCount(metrics.totalTransactions)} txns</Chip>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Total transactions"
            value={formatCount(metrics.totalTransactions)}
            hint="Synthetic payments scored end to end"
            tone="diamond"
            icon={<Activity className="size-3" />}
          />
          <Stat
            label="High-risk transactions"
            value={formatCount(metrics.highRiskTransactions)}
            hint={`Trust score below 55 · ${metrics.fraudRate}% of ledger labelled fraud`}
            tone="caution"
            icon={<AlertOctagon className="size-3" />}
          />
          <Stat
            label="Blocked before settlement"
            value={formatCount(metrics.blockedTransactions)}
            hint="Decision = do not pay, money never left the account"
            tone="alert"
            icon={<Ban className="size-3" />}
          />
          <Stat
            label="Fraud loss prevented"
            value={formatInrShort(metrics.fraudLossPrevented)}
            hint={`Exact estimate ${formatInr(metrics.fraudLossPrevented)}`}
            tone="safe"
            icon={<CircleDollarSign className="size-3" />}
          />
          <Stat
            label="Average trust score"
            value={metrics.avgTrustScore}
            hint="Mean Diamond Trust Score across the ledger"
            tone="info"
          />
          <Stat
            label="Active fraud cases"
            value={formatCount(metrics.activeCases)}
            hint="New + investigating + escalated"
            tone="sun"
            icon={<FolderOpen className="size-3" />}
          />
          <Stat
            label="Verified merchants"
            value={formatCount(metrics.verifiedMerchants)}
            hint={`${metrics.flaggedQrCodes} QR codes flagged or expired`}
            tone="neutral"
            icon={<Store className="size-3" />}
          />
          <Stat
            label="Suspected mule accounts"
            value={formatCount(metrics.suspectedMuleAccounts)}
            hint="MuleNet collector profile matched"
            tone="alert"
            icon={<Users className="size-3" />}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Panel
            title="Fraud trend · last 14 days"
            subtitle="Volume, fraud-labelled transactions and blocked payments"
            right={<Chip tone="alert">loss avoided {formatInrShort(metrics.fraudLossPrevented)}</Chip>}
          >
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fontWeight: 700 }}
                    stroke="#0A0A0A"
                    strokeWidth={2}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fontWeight: 700 }}
                    stroke="#0A0A0A"
                    strokeWidth={2}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area
                    type="step"
                    dataKey="total"
                    name="Transactions"
                    stroke="#0A0A0A"
                    strokeWidth={2}
                    fill="#22D3EE"
                    fillOpacity={1}
                  />
                  <Area
                    type="step"
                    dataKey="fraud"
                    name="Fraud labelled"
                    stroke="#0A0A0A"
                    strokeWidth={2}
                    fill="#EF4444"
                    fillOpacity={1}
                  />
                  <Area
                    type="step"
                    dataKey="blocked"
                    name="Blocked"
                    stroke="#0A0A0A"
                    strokeWidth={2}
                    fill="#F59E0B"
                    fillOpacity={1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip tone="info">transactions</Chip>
              <Chip tone="alert">fraud labelled</Chip>
              <Chip tone="caution">blocked</Chip>
            </div>
          </Panel>

          <Panel
            title="Diamond Trust Score distribution"
            subtitle="Where the ledger sits between 0 and 100"
          >
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 9, fontFamily: "JetBrains Mono", fontWeight: 700 }}
                    stroke="#0A0A0A"
                    strokeWidth={2}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fontFamily: "JetBrains Mono", fontWeight: 700 }}
                    stroke="#0A0A0A"
                    strokeWidth={2}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Transactions" stroke="#0A0A0A" strokeWidth={2}>
                    {distribution.map((entry) => {
                      const start = Number(String(entry.bucket).split("-")[0]);
                      return (
                        <Cell
                          key={entry.bucket}
                          fill={
                            start >= 80 ? "#10B981" : start >= 55 ? "#F59E0B" : "#EF4444"
                          }
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid gap-1">
              <KeyValue label="Trusted (80–100)" value={`${metrics.trustedRate}% of ledger`} mono />
              <KeyValue
                label="Alerts (0–54)"
                value={`${Math.round((metrics.highRiskTransactions / Math.max(1, metrics.totalTransactions)) * 1000) / 10}% of ledger`}
                mono
              />
            </div>
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Panel
            title="Live transaction feed"
            subtitle="Reactive subscription — new payments appear the moment they are scored"
            tone="diamond"
            right={
              <BrutButton size="sm" tone="neutral" onClick={() => navigate("/command/investigator")}>
                Open investigator
              </BrutButton>
            }
            tight
          >
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0">
                  <tr className="bg-[#0A0A0A] text-[#F4F1EA]">
                    {["When", "Payer → beneficiary", "Amount", "Score", "Decision", "QR"].map(
                      (heading) => (
                        <th key={heading} className="dp-label px-3 py-2 text-[10px]">
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {feed.map((row) => (
                    <tr
                      key={row.txnId}
                      className="cursor-pointer border-b-2 border-dashed border-[#0A0A0A]/20 bg-white hover:bg-[#F4F1EA]"
                      onClick={() => navigate(`/command/investigator?txnId=${row.txnId}`)}
                    >
                      <td className="dp-mono whitespace-nowrap px-3 py-2 text-[10px] font-semibold">
                        {timeAgo(Number(row.timestamp ?? 0))}
                      </td>
                      <td className="px-3 py-2">
                        <p className="truncate text-[12px] font-bold">
                          {row.userName} → {row.beneficiaryName}
                        </p>
                        <p className="dp-mono truncate text-[10px] text-[#0A0A0A]/55">
                          {row.beneficiaryUpiId}
                        </p>
                      </td>
                      <td className="dp-tabular whitespace-nowrap px-3 py-2 text-[12px] font-bold">
                        {formatInr(Number(row.amount ?? 0))}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "dp-tabular inline-block border-2 border-[#0A0A0A] px-1.5 py-0.5 text-[11px] font-black",
                            scoreTone(Number(row.diamondTrustScore ?? 0)) === "safe"
                              ? "bg-[#10B981]"
                              : scoreTone(Number(row.diamondTrustScore ?? 0)) === "caution"
                                ? "bg-[#F59E0B]"
                                : "bg-[#EF4444] text-white",
                          )}
                        >
                          {row.diamondTrustScore}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <DecisionChip decision={String(row.decision ?? "")} />
                      </td>
                      <td className="px-3 py-2">
                        <QrStatusChip status={String(row.qrStatus ?? "")} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="space-y-5">
            <Panel title="Recent alerts" tone="alert" tight>
              <div className="max-h-[240px] overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="p-3">
                    <EmptyBlock title="No high-risk payments in the current feed" />
                  </div>
                ) : (
                  <ul>
                    {alerts.map((alert) => (
                      <li key={alert.txnId} className="border-b-2 border-dashed border-[#0A0A0A]/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Chip tone={alert.severity === "CRITICAL" ? "alert" : "caution"}>
                            {alert.severity}
                          </Chip>
                          <span className="dp-tabular border-2 border-[#0A0A0A] bg-white px-1.5 text-[11px] font-black">
                            {alert.score}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[12px] font-bold">{alert.title}</p>
                        <p className="mt-1 text-[11px] font-medium leading-4 text-[#0A0A0A]/70">
                          {alert.detail}
                        </p>
                        <p className="dp-mono mt-1 text-[10px] font-semibold text-[#0A0A0A]/50">
                          {alert.txnId} · {timeAgo(alert.at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>

            <Panel title="Top suspicious beneficiaries" tight>
              <div className="max-h-[300px] overflow-y-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="sticky top-0">
                    <tr className="bg-[#0A0A0A] text-[#F4F1EA]">
                      {["Account", "Risk", "Received", "Status"].map((heading) => (
                        <th key={heading} className="dp-label px-3 py-1.5 text-[10px]">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics.topSuspicious ?? []).map((row) => (
                      <tr
                        key={row.accountId}
                        className="cursor-pointer border-b-2 border-dashed border-[#0A0A0A]/20 bg-white hover:bg-[#F4F1EA]"
                        onClick={() => navigate(`/command/mulenet?accountId=${row.accountId}`)}
                      >
                        <td className="px-3 py-2">
                          <p className="truncate text-[12px] font-bold">{row.name}</p>
                          <p className="dp-mono text-[10px] text-[#0A0A0A]/55">
                            {row.accountId} · {row.upiId}
                          </p>
                        </td>
                        <td className="dp-tabular px-3 py-2 text-[12px] font-black">
                          {row.riskScore}
                        </td>
                        <td className="dp-tabular px-3 py-2 text-[11px] font-semibold">
                          {formatInrShort(row.totalReceived)}
                        </td>
                        <td className="px-3 py-2">
                          <Chip
                            tone={
                              row.status === "MULE_SUSPECT"
                                ? "alert"
                                : row.status === "BLOCKED"
                                  ? "dark"
                                  : "caution"
                            }
                          >
                            {row.status}
                          </Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          <Panel title="Fraud pattern breakdown" subtitle="How the synthetic attacks are distributed">
            <ul className="space-y-2">
              {(metrics.patternBreakdown ?? []).map((row) => {
                const max = Math.max(
                  ...(metrics.patternBreakdown ?? []).map((entry) => entry.count),
                  1,
                );
                const width = Math.round((row.count / max) * 100);
                return (
                  <li key={row.pattern}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-bold uppercase tracking-[0.03em]">
                        {patternLabel(row.pattern)}
                      </span>
                      <span className="dp-tabular text-[11px] font-black">{row.count}</span>
                    </div>
                    <div className="mt-1 h-3 w-full border-2 border-[#0A0A0A] bg-white">
                      <div
                        className={cn(
                          "h-full",
                          row.pattern === "NORMAL"
                            ? "bg-[#22D3EE]"
                            : row.pattern.includes("MULE") || row.pattern.includes("FORWARD")
                              ? "bg-[#EF4444]"
                              : "bg-[#F59E0B]",
                        )}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="QR registry health" subtitle="Signed QR codes in the demo registry">
            {extras === undefined ? (
              <LoadingBlock label="Loading QR registry" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(extras.byStatus ?? {}).map(([status, count]) => (
                    <div key={status} className="brut-flat bg-white p-2">
                      <p className="dp-label text-[#0A0A0A]/55">{status}</p>
                      <p className="dp-tabular mt-1 text-xl font-black">{count}</p>
                    </div>
                  ))}
                </div>
                <p className="dp-label mt-3 text-[#0A0A0A]/55">Latest tampered codes</p>
                <ul className="mt-2 space-y-1.5">
                  {(extras.tampered ?? []).map((row) => (
                    <li key={row.qrId} className="brut-flat flex items-center justify-between gap-2 bg-[#FDE047] p-2">
                      <div className="min-w-0">
                        <p className="dp-mono truncate text-[10px] font-bold">{row.qrId}</p>
                        <p className="truncate text-[11px] font-semibold">{row.merchantName}</p>
                      </div>
                      <span className="dp-mono shrink-0 text-[9px] font-bold uppercase">
                        {row.tamperMode}
                      </span>
                    </li>
                  ))}
                </ul>
                <BrutButton
                  tone="info"
                  className="mt-3 w-full"
                  onClick={() => navigate("/command/merchants")}
                >
                  Open QR registry
                </BrutButton>
              </>
            )}
          </Panel>

          <Panel
            title="Risk model card"
            subtitle="Trained in-app on the synthetic ledger"
            tone="diamond"
          >
            {model ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="ROC-AUC" value={model.rocAuc} />
                  <Metric label="F1" value={model.f1} />
                  <Metric label="Precision" value={model.precision} />
                  <Metric label="Recall" value={model.recall} />
                  <Metric label="Accuracy" value={model.accuracy} />
                  <Metric label="Train / test" value={`${model.trainSize}/${model.testSize}`} raw />
                </div>
                <p className="dp-label mt-3 text-[#0A0A0A]/55">Top features</p>
                <ul className="mt-2 space-y-1.5">
                  {(model.topFeatures ?? []).map((feature) => (
                    <li key={feature.label} className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-semibold">{feature.label}</span>
                      <span className="dp-tabular text-[11px] font-black">
                        {feature.importance}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 flex items-start gap-2 border-t-2 border-dashed border-[#0A0A0A]/25 pt-2 text-[10px] font-medium leading-4 text-[#0A0A0A]/60">
                  <TrendingDown className="mt-[1px] size-3 shrink-0" />
                  {model.notes}
                </p>
              </>
            ) : (
              <EmptyBlock title="No model artifact" hint="Regenerate the demo data." />
            )}
          </Panel>
        </div>

        <Panel
          title="Preloaded demo scenarios"
          subtitle="Four reliable flows for a live demo — each one opens the relevant console"
          tone="sun"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(scenarios?.scenarios ?? []).map((scenario) => (
              <div key={scenario.id} className="brut-flat flex h-full flex-col bg-white p-3">
                <Chip tone={scenario.tone === "safe" ? "safe" : scenario.tone === "caution" ? "caution" : "alert"}>
                  {scenario.id.replace(/_/g, " ")}
                </Chip>
                <p className="mt-2 text-[12px] font-black uppercase tracking-[0.03em]">
                  {scenario.title}
                </p>
                <p className="mt-1 flex-1 text-[11px] font-medium leading-5 text-[#0A0A0A]/70">
                  {scenario.description}
                </p>
                <p className="dp-mono mt-2 text-[10px] font-bold uppercase text-[#0A0A0A]/55">
                  {scenario.expected}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {scenario.txnId && (
                    <BrutButton
                      size="sm"
                      tone="neutral"
                      onClick={() => navigate(`/command/investigator?txnId=${scenario.txnId}`)}
                    >
                      Transaction
                    </BrutButton>
                  )}
                  {scenario.qrId && (
                    <BrutButton
                      size="sm"
                      tone="neutral"
                      onClick={() => navigate(`/shield/qr?qrId=${scenario.qrId}`)}
                    >
                      QR
                    </BrutButton>
                  )}
                  {scenario.caseId && (
                    <BrutButton
                      size="sm"
                      tone="neutral"
                      onClick={() => navigate(`/command/cases?caseId=${scenario.caseId}`)}
                    >
                      Case
                    </BrutButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Ledger provenance" subtitle="What generated this dataset">
          <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            <KeyValue
              label="Dataset generated"
              value={formatDateTime(metrics.seededAt)}
              mono
            />
            <KeyValue label="Transactions" value={formatCount(metrics.totalTransactions)} mono />
            <KeyValue
              label="Fraud-labelled rows"
              value={`${metrics.fraudRate}%`}
              mono
            />
            <KeyValue
              label="Suspected mule accounts"
              value={formatCount(metrics.suspectedMuleAccounts)}
              mono
            />
            <KeyValue label="QR codes flagged" value={formatCount(metrics.flaggedQrCodes)} mono />
            <KeyValue
              label="Generator"
              value="convex/lib/generator.ts · deterministic seed"
            />
          </div>
          <p className="mt-3 flex items-start gap-2 border-t-2 border-dashed border-[#0A0A0A]/25 pt-3 text-[11px] font-medium leading-5 text-[#0A0A0A]/60">
            <AlertOctagon className="mt-[1px] size-3.5 shrink-0" />
            This is a hackathon prototype. Every row is synthetic and generated locally by
            the open-source generator in this project — there is no connection to UPI,
            NPCI, banks or any real financial system.
          </p>
        </Panel>
      </div>
    </Shell>
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
    <div className="brut-flat bg-[#F4F1EA] p-2">
      <p className="dp-label text-[#0A0A0A]/55">{label}</p>
      <p className={cn("mt-1 font-black", raw ? "dp-mono text-[12px]" : "dp-tabular text-lg")}>
        {value}
      </p>
    </div>
  );
}
