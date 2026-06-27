import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatMoney } from "@catatpro/shared";
import { useOrg } from "../lib/org.js";
import { apiFetch } from "../lib/api.js";

type Tab = "trial-balance" | "balance-sheet" | "income-statement" | "ar-aging" | "ap-aging";
const TABS: [Tab, string][] = [
  ["trial-balance", "Neraca Saldo"],
  ["balance-sheet", "Neraca"],
  ["income-statement", "Laba Rugi"],
  ["ar-aging", "Aging Piutang"],
  ["ap-aging", "Aging Hutang"],
];

interface Row { code?: string; name?: string; debitCents?: number; creditCents?: number; amountCents?: number }

export function ReportsPage() {
  const { orgId } = useOrg();
  const [tab, setTab] = useState<Tab>("trial-balance");
  const { data } = useQuery({
    queryKey: ["report", tab, orgId],
    queryFn: () => apiFetch<Record<string, unknown>>(`/orgs/${orgId}/reports/${tab}`, { orgId }),
    enabled: !!orgId,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Laporan</h1>
      <div className="flex flex-wrap gap-1">
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
