import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatMoney } from "@catatpro/shared";
import { useOrg } from "../lib/org.js";
import { apiFetch } from "../lib/api.js";

interface Asset {
  id: string;
  name: string;
  acquisitionDate: string;
  costCents: number;
  accumulatedCents: number;
  bookValueCents: number;
  monthlyCents: number;
  usefulLifeMonths: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export function AssetsPage() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [acquisitionDate, setDate] = useState(today());
  const [costRupiah, setCost] = useState(0);
  const [salvageRupiah, setSalvage] = useState(0);
  const [usefulLifeMonths, setLife] = useState(12);

  const { data: assets = [] } = useQuery({
    queryKey: ["assets", orgId],
    queryFn: () => apiFetch<Asset[]>(`/orgs/${orgId}/assets`, { orgId }),
    enabled: !!orgId,
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch(`/orgs/${orgId}/assets`, {
        orgId,
        method: "POST",
        body: {
          name,
          acquisitionDate,
          costCents: Math.round(costRupiah * 100),
          salvageValueCents: Math.round(salvageRupiah * 100),
          usefulLifeMonths,
        },
      }),
    onSuccess: () => {
      setName(""); setCost(0); setSalvage(0);
      qc.invalidateQueries({ queryKey: ["assets", orgId] });
    },
  });

  const depreciate = useMutation({
    mutationFn: (assetId: string) => apiFetch(`/orgs/${orgId}/assets/${assetId}/depreciate`, { orgId, method: "POST", body: { date: today(), months: 1 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets", orgId] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Aset Tetap</h1>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <input required placeholder="Nama aset" className="rounded border border-slate-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="date" className="rounded border border-slate-300 px-3 py-2" value={acquisitionDate} onChange={(e) => setDate(e.target.value)} />
        <input type="number" min={0} placeholder="Biaya (Rp)" className="w-36 rounded border border-slate-300 px-3 py-2" value={costRupiah} onChange={(e) => setCost(Number(e.target.value))} />
        <input type="number" min={0} placeholder="Residu (Rp)" className="w-32 rounded border border-slate-300 px-3 py-2" value={salvageRupiah} onChange={(e) => setSalvage(Number(e.target.value))} />
        <input type="number" min={1} placeholder="Masa (bln)" className="w-28 rounded border border-slate-300 px-3 py-2" value={usefulLifeMonths} onChange={(e) => setLife(Number(e.target.value))} />
        <button className="rounded bg-slate-900 px-4 py-2 text-white" disabled={create.isPending}>Tambah</button>
        {create.isError && <span className="text-sm text-red-600">{(create.error as Error).message}</span>}
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="py-2">Aset</th>
            <th className="text-right">Biaya</th>
            <th className="text-right">Akumulasi</th>
            <th className="text-right">Nilai buku</th>
            <th className="text-right">Per bulan</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.id} className="border-b">
              <td className="py-2">{a.name}</td>
              <td className="text-right">{formatMoney(a.costCents)}</td>
              <td className="text-right">{formatMoney(a.accumulatedCents)}</td>
              <td className="text-right">{formatMoney(a.bookValueCents)}</td>
              <td className="text-right">{formatMoney(a.monthlyCents)}</td>
              <td className="text-right">
                <button
                  className="text-slate-600 underline disabled:opacity-40"
                  disabled={depreciate.isPending || a.bookValueCents <= 0}
                  onClick={() => depreciate.mutate(a.id)}
                >
                  Susutkan
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {depreciate.isError && <p className="text-sm text-red-600">{(depreciate.error as Error).message}</p>}
    </div>
  );
}
