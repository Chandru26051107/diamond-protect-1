/**
 * DIAMOND-PROTECT :: Command Centre — Merchant QR Registry.
 * Register merchants, issue HMAC-signed QR codes, revoke them and simulate an
 * attacker tampering with a printed sticker.
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
  QrStatusChip,
} from "@/components/dp/ui";
import { api } from "@/convex/_generated/api";
import {
  CATEGORY_OPTIONS,
  CITY_OPTIONS,
  formatDateTime,
  formatInr,
  timeAgo,
} from "@/lib/dp";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  CheckCircle2,
  PenTool,
  PlusCircle,
  QrCode,
  Search,
  Store,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const TAMPER_MODES = [
  { value: "merchant_name", label: "Impersonate merchant name" },
  { value: "amount", label: "Inflate the amount" },
  { value: "upi_id", label: "Redirect the payee VPA" },
  { value: "expired", label: "Backdate the expiry" },
  { value: "signature", label: "Forge the signature" },
  { value: "missing_field", label: "Strip a signed field" },
];

export default function MerchantRegistry() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null);
  const [selectedQr, setSelectedQr] = useState<string | null>(null);
  const [amount, setAmount] = useState("0");
  const [validity, setValidity] = useState("30");
  const [mode, setMode] = useState("merchant_name");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState(CATEGORY_OPTIONS[0]);
  const [newCity, setNewCity] = useState(CITY_OPTIONS[0]);

  const merchants = useQuery(api.diamond.merchants, {
    search: search.trim() || undefined,
  });
  const qrList = useQuery(api.diamond.qrCodes, {
    status: status || undefined,
    search: search.trim() || undefined,
  });
  const generateQr = useMutation(api.diamond.generateQr);
  const revokeQr = useMutation(api.diamond.revokeQr);
  const tamperQr = useMutation(api.diamond.tamperQr);
  const registerMerchant = useMutation(api.commandCentre.registerMerchant);

  const merchantRows = merchants?.rows ?? [];

  const activeMerchant = useMemo(() => {
    if (selectedMerchant) {
      return merchantRows.find((row) => row.merchantId === selectedMerchant) ?? null;
    }
    return merchantRows[0] ?? null;
  }, [merchantRows, selectedMerchant]);

  const merchantQr = useMemo(() => {
    const list = qrList?.rows ?? [];
    if (!activeMerchant) return [];
    return list.filter((row) => row.merchantId === activeMerchant.merchantId);
  }, [qrList, activeMerchant]);

  const selectedQrRow = useMemo(
    () =>
      (qrList?.rows ?? []).find((row) => row.qrId === selectedQr) ??
      merchantQr[0] ??
      null,
    [qrList, selectedQr, merchantQr],
  );

  const counts = useMemo(() => {
    const list = qrList?.rows ?? [];
    return {
      ACTIVE: list.filter((row) => row.status === "ACTIVE").length,
      EXPIRED: list.filter((row) => row.status === "EXPIRED").length,
      TAMPERED: list.filter((row) => row.status === "TAMPERED").length,
      REVOKED: list.filter((row) => row.status === "REVOKED").length,
    };
  }, [qrList]);

  const run = async (
    label: string,
    action: () => Promise<{ ok: boolean; error: string | null } | null | undefined>,
  ) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await action();
      if (response?.ok) setMessage(label);
      else setError(response?.error ?? "The action could not be completed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action failed.");
    } finally {
      setBusy(false);
    }
  };

  const doTamper = async () => {
    if (!selectedQrRow) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await tamperQr({
        qrId: selectedQrRow.qrId,
        mode,
        actor: "analyst.registry",
      });
      if (response?.ok) {
        setMessage(
          response.qr?.summary ??
            `${selectedQrRow.qrId} tampered — verify it in the Payment Shield.`,
        );
      } else {
        setError(response?.error ?? "Could not simulate tampering.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not simulate tampering.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      eyebrow="Command Centre · registry"
      title="Merchant QR Registry"
      description="Every merchant QR in this prototype is signed with HMAC-SHA256 over a canonical payload. Issue, revoke and tamper with codes here and watch the Payment Shield react."
      actions={
        <>
          <Chip tone="safe">{counts.ACTIVE} active</Chip>
          <Chip tone="alert">{counts.TAMPERED} tampered</Chip>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Panel
              title="Merchants"
              subtitle={`${merchantRows.length} registered`}
              right={<Store className="size-3.5" />}
              tight
            >
              <div className="border-b-2 border-[#0A0A0A] p-3">
                <div className="brut-flat flex items-center gap-2 bg-white px-2.5 py-2">
                  <Search className="size-3.5 shrink-0" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Merchant name, UPI ID or ID"
                    className="w-full bg-transparent text-sm font-semibold focus:outline-none"
                  />
                  {search && (
                    <button type="button" onClick={() => setSearch("")}>
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-[430px] overflow-y-auto">
                {merchants === undefined ? (
                  <div className="p-3">
                    <LoadingBlock label="Loading merchants" />
                  </div>
                ) : merchantRows.length === 0 ? (
                  <div className="p-3">
                    <EmptyBlock title="No merchants match" />
                  </div>
                ) : (
                  <ul>
                    {merchantRows.map((row) => (
                      <li key={row.merchantId}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMerchant(row.merchantId);
                            setSelectedQr(null);
                          }}
                          className={cn(
                            "flex w-full items-start justify-between gap-2 border-b-2 border-dashed border-[#0A0A0A]/20 px-3 py-2 text-left",
                            activeMerchant?.merchantId === row.merchantId
                              ? "bg-[#FDE047]"
                              : "bg-white hover:bg-[#F4F1EA]",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-bold">{row.merchantName}</p>
                            <p className="dp-mono truncate text-[10px] text-[#0A0A0A]/55">
                              {row.merchantId} · {row.upiId}
                            </p>
                            <p className="dp-mono text-[10px] font-semibold text-[#0A0A0A]/50">
                              {row.category} · {row.city} · {row.totalQrCodes} QR
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Chip tone={row.isVerified ? "safe" : "caution"}>
                              {row.isVerified ? "verified" : "unverified"}
                            </Chip>
                            {row.status !== "ACTIVE" && <Chip tone="alert">{row.status}</Chip>}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>

            <Panel title="Register a merchant" tone="info">
              <div className="space-y-2.5">
                <label className="block">
                  <span className="dp-label text-[#0A0A0A]/55">Merchant name</span>
                  <input
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="e.g. Verma Grocery Mart"
                    className="brut-flat mt-1.5 w-full bg-white p-2 text-sm font-semibold focus:outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="dp-label text-[#0A0A0A]/55">Category</span>
                    <select
                      value={newCategory}
                      onChange={(event) => setNewCategory(event.target.value)}
                      className="brut-flat mt-1.5 w-full bg-white p-2 text-[12px] font-semibold focus:outline-none"
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="dp-label text-[#0A0A0A]/55">City</span>
                    <select
                      value={newCity}
                      onChange={(event) => setNewCity(event.target.value)}
                      className="brut-flat mt-1.5 w-full bg-white p-2 text-[12px] font-semibold focus:outline-none"
                    >
                      {CITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <BrutButton
                  tone="info"
                  className="w-full"
                  disabled={busy || newName.trim().length < 3}
                  onClick={() =>
                    void run(`${newName.trim()} registered and verified.`, async () => {
                      const response = await registerMerchant({
                        merchantName: newName.trim(),
                        category: newCategory,
                        city: newCity,
                        actor: "analyst.registry",
                      });
                      if (response?.ok) setNewName("");
                      return response;
                    })
                  }
                >
                  <PlusCircle className="size-3.5" /> Register merchant
                </BrutButton>
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            {activeMerchant ? (
              <Panel
                title={`Signed QR codes · ${activeMerchant.merchantName}`}
                subtitle={`${merchantQr.length} code(s) issued`}
                right={
                  <div className="flex items-center gap-1.5">
                    <input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="amount"
                      className="brut-flat dp-tabular w-[92px] bg-white px-2 py-1 text-[12px] font-bold focus:outline-none"
                    />
                    <input
                      value={validity}
                      onChange={(event) => setValidity(event.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="min"
                      className="brut-flat dp-tabular w-[70px] bg-white px-2 py-1 text-[12px] font-bold focus:outline-none"
                    />
                    <BrutButton
                      size="sm"
                      tone="safe"
                      disabled={busy}
                      onClick={() =>
                        void run("Signed QR issued.", () =>
                          generateQr({
                            merchantId: activeMerchant.merchantId,
                            amount: Number(amount) || 0,
                            validityMinutes: Number(validity) || 30,
                            actor: "analyst.registry",
                          }),
                        )
                      }
                    >
                      <QrCode className="size-3.5" /> Issue QR
                    </BrutButton>
                  </div>
                }
                tight
              >
                <div className="border-b-2 border-[#0A0A0A] p-3">
                  <FilterPills
                    value={status}
                    onChange={setStatus}
                    allLabel="All status"
                    options={[
                      { value: "ACTIVE", label: "Active", count: counts.ACTIVE },
                      { value: "EXPIRED", label: "Expired", count: counts.EXPIRED },
                      { value: "TAMPERED", label: "Tampered", count: counts.TAMPERED },
                      { value: "REVOKED", label: "Revoked", count: counts.REVOKED },
                    ]}
                  />
                </div>
                {merchantQr.length === 0 ? (
                  <div className="p-3">
                    <EmptyBlock
                      title="No QR codes for this merchant"
                      hint="Issue a signed QR with the button above."
                    />
                  </div>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full border-collapse text-left">
                      <thead className="sticky top-0">
                        <tr className="bg-[#0A0A0A] text-[#F4F1EA]">
                          {["QR ID", "Amount", "Created", "Expires", "Status", "", ""].map(
                            (heading) => (
                              <th key={heading} className="dp-label px-3 py-1.5 text-[10px]">
                                {heading}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {merchantQr.map((row) => (
                          <tr
                            key={row.qrId}
                            className={cn(
                              "border-b-2 border-dashed border-[#0A0A0A]/20",
                              selectedQrRow?.qrId === row.qrId ? "bg-[#FDE047]" : "bg-white",
                            )}
                          >
                            <td className="dp-mono px-3 py-1.5 text-[11px] font-bold">
                              {row.qrId}
                              {row.tamperMode && (
                                <span className="dp-mono ml-1.5 text-[9px] uppercase text-[#EF4444]">
                                  {row.tamperMode}
                                </span>
                              )}
                            </td>
                            <td className="dp-tabular px-3 py-1.5 text-[11px] font-bold">
                              {row.amount > 0 ? formatInr(row.amount) : "open"}
                            </td>
                            <td className="dp-mono px-3 py-1.5 text-[10px] font-semibold">
                              {timeAgo(row.createdAt)}
                            </td>
                            <td className="dp-mono px-3 py-1.5 text-[10px] font-semibold">
                              {new Date(row.expiresAt) < new Date()
                                ? "expired"
                                : timeAgo(row.expiresAt).replace("ago", "left")}
                            </td>
                            <td className="px-3 py-1.5">
                              <QrStatusChip status={row.status} />
                            </td>
                            <td className="px-3 py-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedQr(row.qrId)}
                                className="brut-flat bg-white px-2 py-0.5 text-[10px] font-bold uppercase"
                              >
                                inspect
                              </button>
                            </td>
                            <td className="px-3 py-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void run(`QR ${row.qrId} revoked.`, () =>
                                    revokeQr({ qrId: row.qrId, actor: "analyst.registry" }),
                                  )
                                }
                                className="brut-flat bg-[#EF4444] px-2 py-0.5 text-[10px] font-bold uppercase text-white"
                              >
                                revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            ) : (
              <Panel title="Signed QR codes">
                <EmptyBlock title="Select a merchant" hint="Pick a merchant from the list on the left." />
              </Panel>
            )}

            {message && (
              <div className="brut flex items-center gap-2 bg-[#10B981] p-3">
                <CheckCircle2 className="size-4" />
                <p className="dp-mono text-[11px] font-bold uppercase">{message}</p>
              </div>
            )}
            {error && <ErrorNote message={error} />}

            {selectedQrRow && (
              <Panel
                title="QR inspector"
                subtitle={`${selectedQrRow.qrId} · version ${selectedQrRow.version}`}
                right={<QrStatusChip status={selectedQrRow.status} />}
              >
                <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="brut bg-white p-3">
                    <QRCodeSVG
                      value={selectedQrRow.payload}
                      size={156}
                      level="M"
                      bgColor="#FFFFFF"
                      fgColor="#0A0A0A"
                      marginSize={0}
                    />
                    <p className="dp-mono mt-2 break-all text-[9px] text-[#0A0A0A]/55">
                      {selectedQrRow.signature}
                    </p>
                  </div>
                  <div>
                    <KeyValue label="Merchant" value={selectedQrRow.merchantName} />
                    <KeyValue label="Merchant ID" value={selectedQrRow.merchantId} mono />
                    <KeyValue label="UPI ID" value={selectedQrRow.upiId} mono />
                    <KeyValue
                      label="Amount"
                      value={selectedQrRow.amount > 0 ? formatInr(selectedQrRow.amount) : "open"}
                      mono
                    />
                    <KeyValue label="Created" value={formatDateTime(selectedQrRow.createdAt)} mono />
                    <KeyValue label="Expires" value={formatDateTime(selectedQrRow.expiresAt)} mono />
                    <KeyValue label="Nonce" value={selectedQrRow.nonce} mono />
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="block">
                        <span className="dp-label text-[#0A0A0A]/55">Simulate attack</span>
                        <select
                          value={mode}
                          onChange={(event) => setMode(event.target.value)}
                          className="brut-flat mt-1.5 bg-white p-2 text-[12px] font-semibold focus:outline-none"
                        >
                          {TAMPER_MODES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <BrutButton
                        tone="alert"
                        disabled={busy}
                        onClick={() => void doTamper()}
                      >
                        <PenTool className="size-3.5" /> Tamper
                      </BrutButton>
                      <BrutButton
                        tone="dark"
                        disabled={busy}
                        onClick={() =>
                          void run("QR revoked.", () =>
                            revokeQr({ qrId: selectedQrRow.qrId, actor: "analyst.registry" }),
                          )
                        }
                      >
                        <Ban className="size-3.5" /> Revoke
                      </BrutButton>
                    </div>
                    <pre className="brut-flat dp-mono mt-3 overflow-x-auto bg-[#F4F1EA] p-2 text-[10px] leading-4">
                      {selectedQrRow.payload}
                    </pre>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
