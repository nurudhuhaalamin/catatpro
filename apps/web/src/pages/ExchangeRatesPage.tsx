import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "../lib/org.js";
import { apiFetch } from "../lib/api.js";

interface Rate { id: string; currency: string; rateMicros: number; validFrom: string }
const today = () => new Date().toISOString().slice(0, 10);

export function ExchangeRatesPage() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState(0);
  const [validFrom, setValidFrom] = useState(today());

  const { data: rates = [] } = useQuery({
    queryKey: ["rates", orgId],
    queryFn: () => apiFetch<Rate[]>(`/orgs/${orgId}/exchange-rates`, { orgId }),
    enabled: !!orgId,
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch(`/orgs/${orgId}/exchange-rates`, {
        orgId,
        method: "POST",
        body: { currency, rateMicros: Math.round(rate * 1_000_000), validFrom },
      }),
    onSuccess: () => {
      setRate(0);
      qc.invalidateQueries({ queryKey: ["rates", orgId] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Kurs Mata Uang</h1>
      <p className="text-sm text-slate-500">Kurs (nilai IDR per 1 unit mata uang asing). Dipakai sebagai default saat membuat dokumen.</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <input className="w-24 rounded border border-slate-300 px-3 py-2 uppercase" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        <input type="number" min={0} step="0.0001" placeholder="Kurs ke IDR" className="w-40 rounded border border-slate-300 px-3 py-2" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        <input type="date" className="rounded border border-slate-300 px-3 py-2" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        <button className="rounded bg-slate-900 px-4 py-2 text-white" disabled={create.isPending}>Tambah kurs</button>
        {create.isError && <span className="text-sm text-red-600">{(create.error as Error).message}</span>}
      </form>

      <table className="w-full border-collapse text-sm">
        <thead><tr className="border-b text-left text-slate-500"><th className="py-2">Mata uang</th><th className="text-right">Kurs (IDR)</th><th>Berlaku sejak</th></tr></thead>
        <tbody>
          {rates.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2">{r.currency}</td>
              <td className="text-right">{(r.rateMicros / 1_000_000).toLocaleString("id-ID")}</td>
              <td>{r.validFrom}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
