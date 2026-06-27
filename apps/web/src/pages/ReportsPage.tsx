import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatMoney } from "@catatpro/shared";
import { useOrg } from "../lib/org.js";
import { apiFetch } from "../lib/api.js";
import { getAccessToken } from "../lib/auth.js";
import { toCsv, downloadCsv } from "../lib/csv.js";

type Tab =
  | "trial-balance"
  | "balance-sheet"
  | "income-statement"
  | "ar-aging"
  | "ap-aging"
  | "inventory"
  | "tax-summary"
  | "cash-flow";
const TABS: [Tab, string][] = [
  ["trial-balance", "Neraca Saldo"],
  ["balance-sheet", "Neraca"],
  ["income-statement", "Laba Rugi"],
  ["cash-flow", "Arus Kas"],
  ["tax-summary", "PPN"],
  ["ar-aging", "Aging Piutang"],
  ["ap-aging", "Aging Hutang"],
  ["inventory", "Persediaan"],
];

interface Row { code?: string; name?: string; debitCents?: number; creditCents?: number; amountCents?: number }

function pathFor(tab: Tab, orgId: string): string {
  if (tab === "inventory") return `/orgs/${orgId}/inventory/valuation`;
  return `/orgs/${orgId}/reports/${tab}`;
}

// Bangun baris CSV per jenis laporan.
function csvRows(tab: Tab, data: Record<string, unknown>): Record<string, unknown>[] {
  switch (tab) {
    case "trial-balance":
      return (data.rows as Row[]).map((r) => ({ kode: r.code, akun: r.name, debit: r.debitCents, kredit: r.creditCents }));
    case "inventory":
      return (data.rows as Record<string, unknown>[]).map((r) => ({ item: r.name, qty: r.qtyOnHand, biaya_rata2: r.avgCostCents, nilai: r.valueCents }));
    case "income-statement":
      return [
        ...(data.income as Row[]).map((r) => ({ bagian: "Pendapatan", akun: r.name, nilai: r.amountCents })),
        ...(data.expense as Row[]).map((r) => ({ bagian: "Beban", akun: r.name, nilai: r.amountCents })),
      ];
    case "balance-sheet":
      return ["assets", "liabilities", "equity"].flatMap((k) =>
        (data[k] as Row[]).map((r) => ({ bagian: k, akun: r.name, nilai: r.amountCents })),
      );
    case "tax-summary":
      return [
        { jenis: "PPN Keluaran", nilai: data.outputCents },
        { jenis: "PPN Masukan", nilai: data.inputCents },
        { jenis: "PPN Terutang", nilai: data.payableCents },
      ];
    case "cash-flow":
      return [
        { kategori: "Kas awal", nilai: data.beginningCents },
        { kategori: "Operasional", nilai: data.operatingCents },
        { kategori: "Investasi", nilai: data.investingCents },
        { kategori: "Pendanaan", nilai: data.financingCents },
        { kategori: "Perubahan bersih", nilai: data.netChangeCents },
        { kategori: "Kas akhir", nilai: data.endingCents },
      ];
    default:
      return Object.entries(data).map(([k, v]) => ({ pos: k, nilai: v }));
  }
}

export function ReportsPage() {
  const { orgId } = useOrg();
  const [tab, setTab] = useState<Tab>("trial-balance");
  const { data } = useQuery({
    queryKey: ["report", tab, orgId],
    queryFn: () => apiFetch<Record<string, unknown>>(pathFor(tab, orgId!), { orgId }),
    enabled: !!orgId,
  });

  async function downloadEfaktur() {
    const token = await getAccessToken();
    const res = await fetch(`/api/orgs/${orgId}/exports/efaktur`, {
      headers: { Authorization: `Bearer ${token}`, "x-org-id": orgId! },
    });
    downloadCsv("efaktur.csv", await res.text());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Laporan</h1>
        <div className="flex gap-2 print:hidden">
          <button
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
            onClick={() => data && downloadCsv(`${tab}.csv`, toCsv(csvRows(tab, data)))}
          >
            Unduh CSV
          </button>
          {tab === "tax-summary" && (
            <button className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100" onClick={downloadEfaktur}>
              Ekspor e-Faktur
            </button>
          )}
          <button className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100" onClick={() => window.print()}>
            Cetak
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 print:hidden">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded px-3 py-1 text-sm ${tab === id ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        {!data && <p className="text-slate-400">Memuat…</p>}
        {data && tab === "trial-balance" && <TrialBalance rows={(data.rows as Row[]) ?? []} balanced={data.balanced as boolean} />}
        {data && tab === "balance-sheet" && <BalanceSheet data={data} />}
        {data && tab === "income-statement" && <IncomeStatement data={data} />}
        {data && (tab === "ar-aging" || tab === "ap-aging") && <Aging data={data} />}
        {data && tab === "inventory" && <Inventory data={data} />}
        {data && tab === "tax-summary" && <TaxSummary data={data} />}
        {data && tab === "cash-flow" && <CashFlow data={data} />}
      </div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="mb-4">
      <div className="font-semibold text-slate-700">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between border-b py-1">
          <span>{r.code ? `${r.code} — ` : ""}{r.name}</span>
          <span>{formatMoney(r.amountCents ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

function TrialBalance({ rows, balanced }: { rows: Row[]; balanced: boolean }) {
  return (
    <div>
      <table className="w-full">
        <thead><tr className="text-left text-slate-500"><th>Akun</th><th className="text-right">Debit</th><th className="text-right">Kredit</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              <td>{r.code} — {r.name}</td>
              <td className="text-right">{formatMoney(r.debitCents ?? 0)}</td>
              <td className="text-right">{formatMoney(r.creditCents ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`mt-2 ${balanced ? "text-green-600" : "text-red-600"}`}>{balanced ? "Seimbang ✓" : "Tidak seimbang!"}</p>
    </div>
  );
}

function BalanceSheet({ data }: { data: Record<string, unknown> }) {
  return (
    <div>
      <Section title="Aset" rows={data.assets as Row[]} />
      <Section title="Liabilitas" rows={data.liabilities as Row[]} />
      <Section title="Ekuitas" rows={data.equity as Row[]} />
      <div className="flex justify-between"><span>Laba berjalan</span><span>{formatMoney(data.netIncomeCents as number)}</span></div>
      <div className="mt-2 flex justify-between font-semibold"><span>Total Aset</span><span>{formatMoney(data.totalAssets as number)}</span></div>
      <div className="flex justify-between font-semibold"><span>Total Liabilitas + Ekuitas</span><span>{formatMoney((data.totalLiabilities as number) + (data.totalEquity as number))}</span></div>
    </div>
  );
}

function IncomeStatement({ data }: { data: Record<string, unknown> }) {
  return (
    <div>
      <Section title="Pendapatan" rows={data.income as Row[]} />
      <Section title="Beban" rows={data.expense as Row[]} />
      <div className="mt-2 flex justify-between font-semibold"><span>Laba (Rugi) Bersih</span><span>{formatMoney(data.netIncomeCents as number)}</span></div>
    </div>
  );
}

interface InvRow { name: string; qtyOnHand: number; avgCostCents: number; valueCents: number }
function Inventory({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows as InvRow[]) ?? [];
  return (
    <table className="w-full">
      <thead><tr className="text-left text-slate-500"><th>Item</th><th className="text-right">Qty</th><th className="text-right">Biaya rata-rata</th><th className="text-right">Nilai</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b">
            <td>{r.name}</td>
            <td className="text-right">{r.qtyOnHand}</td>
            <td className="text-right">{formatMoney(r.avgCostCents)}</td>
            <td className="text-right">{formatMoney(r.valueCents)}</td>
          </tr>
        ))}
        <tr className="font-semibold"><td colSpan={3} className="py-2">Total</td><td className="text-right">{formatMoney((data.totalCents as number) ?? 0)}</td></tr>
      </tbody>
    </table>
  );
}

function TaxSummary({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between border-b py-1"><span>PPN Keluaran (penjualan)</span><span>{formatMoney(data.outputCents as number)}</span></div>
      <div className="flex justify-between border-b py-1"><span>PPN Masukan (pembelian)</span><span>{formatMoney(data.inputCents as number)}</span></div>
      <div className="flex justify-between py-1 font-semibold"><span>PPN Terutang</span><span>{formatMoney(data.payableCents as number)}</span></div>
    </div>
  );
}

function CashFlow({ data }: { data: Record<string, unknown> }) {
  const rows: [string, number][] = [
    ["Kas awal", data.beginningCents as number],
    ["Aktivitas operasional", data.operatingCents as number],
    ["Aktivitas investasi", data.investingCents as number],
    ["Aktivitas pendanaan", data.financingCents as number],
    ["Perubahan kas bersih", data.netChangeCents as number],
    ["Kas akhir", data.endingCents as number],
  ];
  return (
    <div className="space-y-1">
      {rows.map(([label, val], i) => (
        <div key={i} className={`flex justify-between py-1 ${label === "Kas akhir" || label === "Perubahan kas bersih" ? "border-t font-semibold" : ""}`}>
          <span>{label}</span>
          <span>{formatMoney(val ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

function Aging({ data }: { data: Record<string, unknown> }) {
  const buckets: [string, string][] = [
    ["current", "Belum jatuh tempo"],
    ["d1_30", "1–30 hari"],
    ["d31_60", "31–60 hari"],
    ["d61_90", "61–90 hari"],
    ["d90plus", "> 90 hari"],
    ["total", "Total"],
  ];
  return (
    <div>
      {buckets.map(([k, label]) => (
        <div key={k} className={`flex justify-between py-1 ${k === "total" ? "border-t font-semibold" : ""}`}>
          <span>{label}</span>
          <span>{formatMoney((data[k] as number) ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}
