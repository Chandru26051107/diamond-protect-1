/**
 * DIAMOND-PROTECT :: Diamond QR Verify.
 * Verifies an HMAC-signed merchant QR and can simulate a real QR attack live.
 */

import { Shell } from "@/components/dp/Shell";
import {
  BrutButton,
  Chip,
  EmptyBlock,
  ErrorNote,
  FilterPills,
  KeyValue,
  LoadingBlock,
  Panel,
} from "@/components/dp/ui";
import { api } from "@/convex/_generated/api";
import { formatDateTime, formatInr, qrStatusTone, timeAgo } from "@/lib/dp";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  CheckCircle2,
  Eye,
  PenTool,
  QrCode,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate, useSearchParams } from "react-router";

type Verdict = {
  valid: boolean;
  status: "VERIFIED" | "CAUTION" | "FAKE_TAMPERED";
  riskLevel: string;
  reason: string;
  merchantMatch: boolean;
  signatureValid: boolean;
  expired: boolean;
  revoked: boolean;
  unknownMerchant: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
  payload: Record<string, unknown> | null;
  registeredMerchantName: string | null;
  recommendedAction: string;
};

const TAMPER_MODES = [
  { value: "merchant_name", label: "Impersonate merchant" },
  { value: "amount", label: "Inflate amount" },
  { value: "upi_id", label: "Redirect payee VPA" },
  { value: "expired", label: "Backdate expiry" },
  { value: "signature", label: "Forge signature" },
  { value: "missing_field", label: "Strip a signed field" },
];

export default function QrVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qrList = useQuery(api.diamond.qrCodes, {});
  const verifyQr = useMutation(api.diamond.verifyQr);
  const tamperQr = useMutation(api.diamond.tamperQr);

  const [status, setStatus] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("qrId"),
  );
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [tampering, setTampering] = useState(false);
  const [mode, setMode] = useState("merchant_name");
  const [error, setError] = useState<string | null>(null);
  const [tamperSummary, setTamperSummary] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = qrList?.rows ?? [];
    return status ? list.filter((row) => row.status === status) : list;
  }, [qrList, status]);

  useEffect(() => {
    if (!selectedId && rows.length > 0) setSelectedId(rows[0].qrId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const selected = useMemo(
    () => (qrList?.rows ?? []).find((row) => row.qrId === selectedId) ?? null,
    [qrList, selectedId],
  );

  useEffect(() => {
    setVerdict(null);
    setTamperSummary(null);
  }, [selectedId]);

  const runVerify = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await verifyQr({ qrId: selectedId });
      if (!response?.ok || !response.verdict) {
        setError(
          (response as { error?: string })?.error ??
            "QR verification could not complete.",
        );
        return;
      }
      setVerdict(response.verdict as unknown as Verdict);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "QR verification failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const runTamper = async () => {
    if (!selectedId) return;
    setTampering(true);
    setError(null);
    try {
      const response = await tamperQr({ qrId: selectedId, mode });
      if (!response?.ok) {
        setError(response?.error ?? "Could not simulate tampering.");
        return;
      }
      setTamperSummary(response.qr?.summary ?? null);
      setVerdict(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tamper simulation failed.");
    } finally {
      setTampering(false);
    }
  };

  const counts = useMemo(() => {
    const list = qrList?.rows ?? [];
    return {
      ACTIVE: list.filter((row) => row.status === "ACTIVE").length,
      EXPIRED: list.filter((row) => row.status === "EXPIRED").length,
      TAMPERED: list.filter((row) => row.status === "TAMPERED").length,
      REVOKED: list.filter((row) => row.status === "REVOKED").length,
    };
  }, [qrList]);

  const toneClass =
    verdict?.status === "VERIFIED"
      ? "bg-[#10B981] text-[#0A0A0A]"
      : verdict?.status === "CAUTION"
        ? "bg-[#F59E0B] text-[#0A0A0A]"
        : "bg-[#EF4444] text-white";

  return (
    <Shell
      eyebrow="Payment Shield"
      title="Diamond QR Verify"
      description="Static UPI QR stickers are trivial to copy and reprint. DIAMOND-PROTECT verifies the HMAC-SHA256 signature, the merchant identity, the amount, the expiry and the payload integrity before trusting a QR."
      actions={
        <Chip tone="info">
          <ScanLine className="size-3" /> {counts.ACTIVE} active · {counts.TAMPERED} tampered
        </Chip>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Demo QR registry" subtitle={`${rows.length} codes shown`} tight>
            <div className="border-b-2 border-[#0A0A0A] p-3">
              <FilterPills
                value={status}
                onChange={setStatus}
                allLabel="All QR"
                options={[
                  { value: "ACTIVE", label: "Active", count: counts.ACTIVE },
                  { value: "EXPIRED", label: "Expired", count: counts.EXPIRED },
                  { value: "TAMPERED", label: "Tampered", count: counts.TAMPERED },
                  { value: "REVOKED", label: "Revoked", count: counts.REVOKED },
                ]}
              />
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {qrList === undefined ? (
                <div className="p-3">
                  <LoadingBlock label="Loading QR codes" />
                </div>
              ) : rows.length === 0 ? (
                <div className="p-3">
                  <EmptyBlock title="No QR codes match this filter" />
                </div>
              ) : (
                <ul>
                  {rows.slice(0, 40).map((row) => (
                    <li key={row.qrId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.qrId)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 border-b-2 border-dashed border-[#0A0A0A]/20 px-3 py-2 text-left",
                          selectedId === row.qrId ? "bg-[#FDE047]" : "bg-white hover:bg-[#F4F1EA]",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="dp-mono truncate text-[11px] font-bold">
                            {row.qrId} · {row.merchantId}
                          </p>
                          <p className="truncate text-[12px] font-semibold">
                            {row.merchantName}
                          </p>
                          <p className="dp-mono text-[10px] font-medium text-[#0A0A0A]/55">
                            {row.amount > 0 ? formatInr(row.amount) : "open amount"} ·{" "}
                            {timeAgo(row.createdAt)}
                          </p>
                        </div>
                        <Chip tone={qrStatusTone(row.status)}>{row.status}</Chip>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          {selected && (
            <Panel title="Simulate a QR attack" tone="alert">
              <p className="text-xs font-medium leading-5">
                A fraudster reprints the merchant&apos;s sticker with an edited payload
                but keeps the original signature. Tamper the stored QR and verify again
                to watch the shield catch it.
              </p>
              <div className="mt-3 space-y-2">
                <label className="block">
                  <span className="dp-label text-[#0A0A0A]/55">Attack mode</span>
                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                    className="brut-flat mt-1.5 w-full bg-white p-2 text-sm font-semibold focus:outline-none"
                  >
                    {TAMPER_MODES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <BrutButton tone="alert" onClick={() => void runTamper()} disabled={tampering}>
                  <PenTool className="size-3.5" />
                  {tampering ? "Tampering…" : "Tamper this QR"}
                </BrutButton>
                {tamperSummary && (
                  <p className="brut-flat dp-mono bg-[#FDE047] p-2 text-[11px] font-bold leading-4">
                    {tamperSummary}
                  </p>
                )}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          {selected ? (
            <Panel
              title="Scanned QR payload"
              subtitle={`${selected.qrId} · version ${selected.version}`}
              right={<Chip tone={qrStatusTone(selected.status)}>{selected.status}</Chip>}
            >
              <div className="grid gap-4 sm:grid-cols-[190px_minmax(0,1fr)]">
                <div className="brut bg-white p-3">
                  <QRCodeSVG
                    value={selected.payload}
                    size={164}
                    level="M"
                    bgColor="#FFFFFF"
                    fgColor="#0A0A0A"
                    marginSize={0}
                  />
                  <p className="dp-mono mt-2 break-all text-[9px] font-medium leading-3 text-[#0A0A0A]/55">
                    {selected.signature}
                  </p>
                </div>
                <div>
                  <KeyValue label="Merchant" value={selected.merchantName} />
                  <KeyValue label="Merchant ID" value={selected.merchantId} mono />
                  <KeyValue label="UPI ID" value={selected.upiId} mono />
                  <KeyValue
                    label="Amount"
                    value={selected.amount > 0 ? formatInr(selected.amount) : "open amount"}
                    mono
                  />
                  <KeyValue label="Created" value={formatDateTime(selected.createdAt)} mono />
                  <KeyValue label="Expires" value={formatDateTime(selected.expiresAt)} mono />
                  <KeyValue label="Nonce" value={selected.nonce} mono />
                  <KeyValue label="Version" value={`v${selected.version}`} mono />
                  <KeyValue label="Signature" value={`${selected.signature.slice(0, 18)}…`} mono />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <BrutButton
                      tone="info"
                      size="lg"
                      onClick={() => void runVerify()}
                      disabled={busy}
                    >
                      <ShieldCheck className="size-4" />
                      {busy ? "Verifying…" : "Verify QR"}
                    </BrutButton>
                    {verdict?.valid && (
                      <BrutButton
                        tone="safe"
                        size="lg"
                        onClick={() =>
                          navigate(
                            `/shield?beneficiary=${encodeURIComponent(selected.upiId)}&amount=${
                              selected.amount || 1200
                            }&qrId=${selected.qrId}`,
                          )
                        }
                      >
                        <Eye className="size-4" /> Proceed to risk scoring
                      </BrutButton>
                    )}
                  </div>
                </div>
              </div>

              <details className="mt-4 border-t-2 border-dashed border-[#0A0A0A]/25 pt-3">
                <summary className="dp-label cursor-pointer text-[#0A0A0A]/60">
                  Raw signed payload (canonical JSON)
                </summary>
                <pre className="brut-flat dp-mono mt-2 overflow-x-auto bg-[#F4F1EA] p-2 text-[10px] leading-4">
                  {selected.payload}
                </pre>
              </details>
            </Panel>
          ) : (
            <Panel title="Scanned QR payload">
              <EmptyBlock title="Select a QR code" hint="Pick a demo QR from the registry on the left." />
            </Panel>
          )}

          {error && <ErrorNote message={error} onRetry={() => void runVerify()} />}

          {verdict && (
            <>
              <div className={cn("brut p-4", toneClass)}>
                <div className="flex items-start gap-3">
                  {verdict.status === "VERIFIED" ? (
                    <BadgeCheck className="mt-0.5 size-6 shrink-0" />
                  ) : verdict.status === "CAUTION" ? (
                    <TriangleAlert className="mt-0.5 size-6 shrink-0" />
                  ) : (
                    <ShieldAlert className="mt-0.5 size-6 shrink-0" />
                  )}
                  <div>
                    <p className="dp-label opacity-80">
                      {verdict.status === "VERIFIED"
                        ? "Verified QR"
                        : verdict.status === "CAUTION"
                          ? "Caution QR"
                          : "Fake / Tampered QR"}
                    </p>
                    <p className="mt-1 text-lg font-black leading-tight">
                      {verdict.status === "VERIFIED"
                        ? "Signature, merchant identity and expiry all check out."
                        : verdict.status === "CAUTION"
                          ? "This QR is authentic but should not be reused."
                          : "QR integrity failed. Possible tampering or fake QR. Do not pay."}
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-5">{verdict.reason}</p>
                    <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.04em]">
                      Recommended action: {verdict.recommendedAction}
                    </p>
                  </div>
                </div>
              </div>

              <Panel
                title="Verification checklist"
                subtitle={`risk level ${verdict.riskLevel.replace("_", " ").toLowerCase()}`}
                right={
                  <Chip
                    tone={
                      verdict.status === "VERIFIED"
                        ? "safe"
                        : verdict.status === "CAUTION"
                          ? "caution"
                          : "alert"
                    }
                  >
                    {verdict.checks.filter((check) => check.passed).length}/
                    {verdict.checks.length} checks passed
                  </Chip>
                }
              >
                <ul className="space-y-2">
                  {verdict.checks.map((check) => (
                    <li
                      key={check.name}
                      className="brut-flat flex items-start gap-2.5 bg-white p-2.5"
                    >
                      {check.passed ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#10B981]" />
                      ) : (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-[#EF4444]" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[12px] font-black uppercase tracking-[0.03em]">
                          {check.name}
                        </p>
                        <p className="mt-0.5 text-[12px] font-medium leading-5 text-[#0A0A0A]/70">
                          {check.detail}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {verdict.payload && (
                  <div className="mt-3">
                    <KeyValue
                      label="Payload merchant"
                      value={String(verdict.payload.merchant_name ?? "—")}
                      mono
                    />
                    <KeyValue
                      label="Registered merchant"
                      value={verdict.registeredMerchantName ?? "not registered"}
                      mono
                    />
                    <KeyValue
                      label="Payload amount"
                      value={formatInr(Number(verdict.payload.amount ?? 0))}
                      mono
                    />
                  </div>
                )}
              </Panel>
            </>
          )}

          <Panel title="What the QR Shield checks" tight>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {[
                "Payload is valid JSON and readable",
                "All 8 signed fields are present",
                "Amount is a valid non-negative number",
                "Payload version is supported",
                "Merchant ID exists in the registry",
                "Merchant credentials are not revoked",
                "Merchant name and VPA match the registry",
                "HMAC-SHA256 signature matches the canonical payload",
                "QR is inside its validity window",
              ].map((line) => (
                <p key={line} className="flex items-start gap-2 text-[12px] font-medium leading-5">
                  <QrCode className="mt-0.5 size-3.5 shrink-0" />
                  {line}
                </p>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
