import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatMoney, type Account, type Contact } from "@catatpro/shared";
import { useOrg } from "../lib/org.js";
import { apiFetch } from "../lib/api.js";

interface DocRow {
  id: string;
  number: string | null;
  totalCents: number;
  paidCents: number;
  status: string;
  currency: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function PaymentsPage() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [direction, setDirection] = useState<"receive" | "pay">("receive");
  const [contactId, setContactId] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [date, setDate] = useState(today());
  const [currency, setCurrency] = useState("IDR");
  const [rate, setRate] = useState(1);
  const [alloc, setAlloc] = useState<Record<string, number>>({});

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts", orgId],
    queryFn: () => apiFetch<Contact[]>(`/orgs/${orgId}/contacts`, { orgId }),
    enabled: !!orgId,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", orgId],
    queryFn: () => apiFetch<Account[]>(`/orgs/${orgId}/accounts`, { orgId }),
    enabled: !!orgId,
  });
  const targetPath = direction === "receive" ? "sales-invoices" : "purchase-bills";
  const targetType = direction === "receive" ? "sales_invoice" : "purchase_bill";
  const { data: docs = [] } = useQuery({
    queryKey: [targetPath, orgId],
    queryFn: () => apiFetch<DocRow[]>(`/orgs/${orgId}/${targetPath}`, { orgId }),
    enabled: !!orgId,
  });

  const cashAccounts = accounts.filter((a) => a.subtype === "cash_bank" && !a.isArchived);
  // hanya dokumen dengan mata uang sama yang bisa dialokasikan
  const outstanding = docs.filter((d) => d.status !== "paid" && d.currency === currency);
  const totalAlloc = Object.values(alloc).reduce((s, v) => s + (v || 0), 0);

  const create = useMutation({
    mutationFn: () =>
      apiFetch(`/orgs/${orgId}/payments`, {
        orgId,
        method: "POST",
        body: {
          contactId,
          direction,
          date,
          cashAccountId,
          currency,
          rateMicros: Math.round(rate * 1_000_000),
          amountCents: Math.round(totalAlloc * 100),
          allocations: Object.entries(alloc)
            .filter(([, v]) => v > 0)
            .map(([targetId, v]) => ({ targetType, targetId, amountCents: Math.round(v * 100) })),
        },
      }),
    onSuccess: () => {
      setAlloc({});
      setContactId("");
      qc.invalidateQueries({ queryKey: [targetPath, orgId] });
      qc.invalidateQueries({ queryKey: ["payments", orgId] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Pembayaran</h1>
      <form
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="flex flex-wrap gap-2">
          <select className="rounded border border-slate-300 px-3 py-2" value={direction} onChange={(e) => { setDirection(e.target.value as "receive" | "pay"); setAlloc({}); }}>
            <option value="receive">Terima dari pelanggan</option>
            <option value="pay">Bayar ke pemasok</option>
          </select>
          <select required className="rounded border border-slate-300 px-3 py-2" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Pilih kontak</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="date" className="rounded border border-slate-300 px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
          <select required className="rounded border border-slate-300 px-3 py-2" value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
            <option value="">Akun kas/bank</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <input
            className="w-20 rounded border border-slate-300 px-3 py-2 uppercase"
            value={currency}
            maxLength={3}
            onChange={(e) => { setCurrency(e.target.value.toUpperCase()); setAlloc({}); }}
            title="Mata uang"
          />
          {currency !== "IDR" && (
            <input
              type="number"
              min={0}
              step="0.0001"
              className="w-32 rounded border border-slate-300 px-3 py-2"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              title="Kurs ke IDR"
              placeholder="Kurs bayar"
            />
          )}
        </div>

        <div className="space-y-1">
          <div className="text-sm text-slate-500">Alokasikan ke dokumen terbuka:</div>
          {outstanding.map((d) => {
            const sisa = (d.totalCents - d.paidCents) / 100;
            return (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <span className="w-40">{d.number}</span>
                <span className="w-32 text-slate-500">sisa {formatMoney(d.totalCents - d.paidCents)}</span>
                <input
                  type="number"
                  min={0}
                  max={sisa}
                  placeholder="Rp"
                  className="w-32 rounded border border-slate-300 px-2 py-1"
                  value={alloc[d.id] ?? ""}
                  onChange={(e) => setAlloc((a) => ({ ...a, [d.id]: Number(e.target.value) }))}
                />
              </div>
            );
          })}
          {outstanding.length === 0 && <div className="text-sm text-slate-400">Tidak ada dokumen terbuka.</div>}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm">Total: <b>{formatMoney(Math.round(totalAlloc * 100))}</b></span>
          <button className="rounded bg-slate-900 px-4 py-2 text-white" disabled={create.isPending || totalAlloc <= 0}>
            Catat pembayaran
          </button>
          {create.isError && <span className="text-sm text-red-600">{(create.error as Error).message}</span>}
        </div>
      </form>
    </div>
  );
}
