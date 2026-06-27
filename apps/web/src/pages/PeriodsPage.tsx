import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "../lib/org.js";
import { apiFetch } from "../lib/api.js";

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed" | "locked";
}

export function PeriodsPage() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");

  const { data: periods = [] } = useQuery({
    queryKey: ["periods", orgId],
    queryFn: () => apiFetch<Period[]>(`/orgs/${orgId}/periods`, { orgId }),
    enabled: !!orgId,
  });

  const create = useMutation({
    mutationFn: () => apiFetch(`/orgs/${orgId}/periods`, { orgId, method: "POST", body: { name, startDate, endDate } }),
    onSuccess: () => {
      setName(""); setStart(""); setEnd("");
      qc.invalidateQueries({ queryKey: ["periods", orgId] });
    },
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => apiFetch(`/orgs/${orgId}/periods/${v.id}`, { orgId, method: "PATCH", body: { status: v.status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["periods", orgId] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Periode Akuntansi</h1>
      <p className="text-sm text-slate-500">Tutup/kunci periode agar transaksi historis tidak bisa diubah.</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <input required placeholder="Nama (mis. 2026-01)" className="rounded border border-slate-300 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="date" required className="rounded border border-slate-300 px-3 py-2" value={startDate} onChange={(e) => setStart(e.target.value)} />
        <input type="date" required className="rounded border border-slate-300 px-3 py-2" value={endDate} onChange={(e) => setEnd(e.target.value)} />
        <button className="rounded bg-slate-900 px-4 py-2 text-white" disabled={create.isPending}>Tambah periode</button>
        {create.isError && <span className="text-sm text-red-600">{(create.error as Error).message}</span>}
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500"><th className="py-2">Periode</th><th>Rentang</th><th>Status</th><th>Aksi</th></tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id} className="border-b">
              <td className="py-2">{p.name}</td>
              <td>{p.startDate} → {p.endDate}</td>
              <td>{p.status}</td>
              <td className="flex gap-2 py-1">
                {p.status !== "open" && <button className="text-slate-600 underline" onClick={() => setStatus.mutate({ id: p.id, status: "open" })}>Buka</button>}
                {p.status !== "closed" && <button className="text-slate-600 underline" onClick={() => setStatus.mutate({ id: p.id, status: "closed" })}>Tutup</button>}
                {p.status !== "locked" && <button className="text-red-600 underline" onClick={() => setStatus.mutate({ id: p.id, status: "locked" })}>Kunci</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
