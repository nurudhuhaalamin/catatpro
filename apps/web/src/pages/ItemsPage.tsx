import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatMoney, type Item } from "@catatpro/shared";
import { useOrg } from "../lib/org.js";
import { apiFetch } from "../lib/api.js";

export function ItemsPage() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("stock");
  const [unit, setUnit] = useState("pcs");
  const [priceRupiah, setPriceRupiah] = useState(0);

  const { data: items = [] } = useQuery({
    queryKey: ["items", orgId],
    queryFn: () => apiFetch<Item[]>(`/orgs/${orgId}/items`, { orgId }),
    enabled: !!orgId,
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch(`/orgs/${orgId}/items`, {
        orgId,
        method: "POST",
        body: { name, type, unit, salePriceCents: Math.round(priceRupiah * 100) },
      }),
    onSuccess: () => {
      setName("");
      setPriceRupiah(0);
      qc.invalidateQueries({ queryKey: ["items", orgId] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Item / Produk</h1>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input required placeholder="Nama item" className="rounded border border-slate-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="rounded border border-slate-300 px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="stock">Stok (barang)</option>
          <option value="service">Jasa</option>
        </select>
        <input placeholder="Satuan" className="w-24 rounded border border-slate-300 px-3 py-2" value={unit} onChange={(e) => setUnit(e.target.value)} />
        <input type="number" min={0} placeholder="Harga jual (Rp)" className="w-40 rounded border border-slate-300 px-3 py-2" value={priceRupiah} onChange={(e) => setPriceRupiah(Number(e.target.value))} />
        <button className="rounded bg-slate-900 px-4 py-2 text-white" disabled={create.isPending}>Tambah</button>
        {create.isError && <span className="text-sm text-red-600">{(create.error as Error).message}</span>}
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="py-2">Nama</th>
            <th>Tipe</th>
            <th className="text-right">Stok</th>
            <th className="text-right">Biaya rata-rata</th>
            <th className="text-right">Harga jual</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b">
              <td className="py-2">{it.name}</td>
              <td>{it.type === "stock" ? "Stok" : "Jasa"}</td>
              <td className="text-right">{it.type === "stock" ? `${it.qtyOnHand} ${it.unit}` : "—"}</td>
              <td className="text-right">{it.type === "stock" ? formatMoney(it.avgCostCents) : "—"}</td>
              <td className="text-right">{formatMoney(it.salePriceCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
