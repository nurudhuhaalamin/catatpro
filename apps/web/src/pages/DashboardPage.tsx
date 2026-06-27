import { useQuery } from "@tanstack/react-query";
import { formatMoney } from "@catatpro/shared";
import { useOrg } from "../lib/org.js";
import { apiFetch } from "../lib/api.js";

export function DashboardPage() {
  const { orgId, org } = useOrg();
  const { data: bs } = useQuery({
    queryKey: ["report", "balance-sheet", orgId],
    queryFn: () => apiFetch<Record<string, number>>(`/orgs/${orgId}/reports/balance-sheet`, { orgId }),
    enabled: !!orgId,
  });
  const { data: is } = useQuery({
    queryKey: ["report", "income-statement", orgId],
    queryFn: () => apiFetch<Record<string, number>>(`/orgs/${orgId}/reports/income-statement`, { orgId }),
    enabled: !!orgId,
  });

  const cards = [
    ["Total Aset", bs?.totalAssets],
    ["Total Liabilitas", bs?.totalLiabilities],
    ["Pendapatan", is?.totalIncome],
    ["Laba Bersih", is?.netIncomeCents],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{org?.name}</h1>
        <p className="text-sm text-slate-500">Ringkasan keuangan (standar: {org?.accountingStandard?.toUpperCase()})</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, val]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-1 text-lg font-semibold">{val === undefined ? "…" : formatMoney(val)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
