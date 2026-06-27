import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatMoney, type Account, type Contact, type TaxRate, type Item } from "@catatpro/shared";
import { useOrg } from "../lib/org.js";
import { apiFetch } from "../lib/api.js";

interface DocRow {
  id: string;
  number: string | null;
  date: string;
  totalCents: number;
  paidCents: number;
  status: string;
}
interface Line {
  description: string;
  qty: number;
  unitRupiah: number;
  accountId: string;
  itemId: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function DocumentPage({ kind }: { kind: "sales" | "purchase" }) {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const isSales = kind === "sales";
  const listPath = isSales ? "sales-invoices" : "purchase-bills";
  const title = isSales ? "Penjualan" : "Pembelian";

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
  const { data: taxRates = [] } = useQuery({
    queryKey: ["taxRates", orgId],
    queryFn: () => apiFetch<TaxRate[]>(`/orgs/${orgId}/tax-rates`, { orgId }),
    enabled: !!orgId,
  });
  const { data: itemList = [] } = useQuery({
    queryKey: ["items", orgId],
    queryFn: () => apiFetch<Item[]>(`/orgs/${orgId}/items`, { orgId }),
    enabled: !!orgId,
  });
  const { data: docs = [] } = useQuery({
    queryKey: [listPath, orgId],
    queryFn: () => apiFetch<DocRow[]>(`/orgs/${orgId}/${listPath}`, { orgId }),
    enabled: !!orgId,
  });

  const lineAccounts = accounts.filter((a) =>
    a.isPostable && !a.isArchived && (isSales ? a.type === "income" : a.type === "asset" || a.type === "expense"),
  );

  const [contactId, setContactId] = useState("");
  const [date, setDate] = useState(today());
  const [taxRateId, setTaxRateId] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [rate, setRate] = useState(1); // base per 1 unit asing
  const emptyLine = (): Line => ({ description: "", qty: 1, unitRupiah: 0, accountId: "", itemId: "" });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  // Pilih item → isi keterangan, harga, akun, dan itemId.
  const pickItem = (i: number, itemId: string) => {
    const it = itemList.find((x) => x.id === itemId);
    if (!it) {
      setLine(i, { itemId: "" });
      return;
    }
    setLine(i, {
      itemId,
      description: it.name,
      unitRupiah: isSales ? it.salePriceCents / 100 : 0,
      accountId: (isSales ? it.revenueAccountId : it.inventoryAccountId) ?? "",
    });
  };

  const create = useMutation({
    mutationFn: () =>
      apiFetch(`/orgs/${orgId}/${listPath}`, {
        orgId,
        method: "POST",
        body: {
          contactId,
          date,
          taxRateId: taxRateId || null,
          currency,
          rateMicros: Math.round(rate * 1_000_000),
          lines: lines.map((l) => ({
            description: l.description,
            qty: l.qty,
            unitPriceCents: Math.round(l.unitRupiah * 100),
            accountId: l.accountId,
            itemId: l.itemId || null,
          })),
        },
      }),
    onSuccess: () => {
      setLines([emptyLine()]);
      setContactId("");
      qc.invalidateQueries({ queryKey: [listPath, orgId] });
    },
  });

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{title}</h1>

      <form
        className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="flex flex-wrap gap-2">
          <select required className="rounded border border-slate-300 px-3 py-2" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">{isSales ? "Pilih pelanggan" : "Pilih pemasok"}</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input type="date" className="rounded border border-slate-300 px-3 py-2" value={date} onChange={(e) => setDate(e.target.value)} />
          <select className="rounded border border-slate-300 px-3 py-2" value={taxRateId} onChange={(e) => setTaxRateId(e.target.value)}>
            <option value="">Tanpa PPN</option>
            {taxRates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <input
            className="w-20 rounded border border-slate-300 px-3 py-2 uppercase"
            value={currency}
            maxLength={3}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            title="Mata uang (mis. IDR, USD)"
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
              placeholder="Kurs"
            />
          )}
        </div>

        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <select className="rounded border border-slate-300 px-3 py-2" value={l.itemId} onChange={(e) => pickItem(i, e.target.value)}>
              <option value="">Item (opsional)</option>
              {itemList.map((it) => (
                <option key={it.id} value={it.id}>{it.name}{it.type === "stock" ? ` (stok ${it.qtyOnHand})` : ""}</option>
              ))}
            </select>
            <input
              required
              placeholder="Keterangan"
              className="flex-1 rounded border border-slate-300 px-3 py-2"
              value={l.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
            />
            <input
              type="number"
              min={1}
              className="w-20 rounded border border-slate-300 px-3 py-2"
              value={l.qty}
              onChange={(e) => setLine(i, { qty: Number(e.target.value) })}
            />
            <input
              type="number"
              min={0}
              placeholder="Harga (Rp)"
              className="w-36 rounded border border-slate-300 px-3 py-2"
              value={l.unitRupiah}
              onChange={(e) => setLine(i, { unitRupiah: Number(e.target.value) })}
            />
            <select required className="rounded border border-slate-300 px-3 py-2" value={l.accountId} onChange={(e) => setLine(i, { accountId: e.target.value })}>
              <option value="">{isSales ? "Akun pendapatan" : "Akun beban/persediaan"}</option>
              {lineAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
        ))}

        <div className="flex items-center gap-3">
          <button type="button" className="text-sm text-slate-600 underline" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            + Tambah baris
          </button>
          <button className="rounded bg-slate-900 px-4 py-2 text-white" disabled={create.isPending}>
            Simpan & posting
          </button>
          {create.isError && <span className="text-sm text-red-600">{(create.error as Error).message}</span>}
        </div>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="py-2">No.</th>
            <th>Tanggal</th>
            <th className="text-right">Total</th>
            <th className="text-right">Dibayar</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-b">
              <td className="py-2">{d.number}</td>
              <td>{d.date}</td>
              <td className="text-right">{formatMoney(d.totalCents)}</td>
              <td className="text-right">{formatMoney(d.paidCents)}</td>
              <td>{d.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
