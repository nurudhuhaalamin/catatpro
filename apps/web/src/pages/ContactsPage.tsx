import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Contact } from "@catatpro/shared";
import { useOrg } from "../lib/org.js";
import { apiFetch } from "../lib/api.js";

export function ContactsPage() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("customer");

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts", orgId],
    queryFn: () => apiFetch<Contact[]>(`/orgs/${orgId}/contacts`, { orgId }),
    enabled: !!orgId,
  });

  const create = useMutation({
    mutationFn: () => apiFetch(`/orgs/${orgId}/contacts`, { orgId, method: "POST", body: { name, type } }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["contacts", orgId] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Kontak</h1>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          required
          placeholder="Nama pelanggan / pemasok"
          className="rounded border border-slate-300 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select className="rounded border border-slate-300 px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="customer">Pelanggan</option>
          <option value="supplier">Pemasok</option>
          <option value="both">Keduanya</option>
        </select>
        <button className="rounded bg-slate-900 px-4 py-2 text-white" disabled={create.isPending}>
          Tambah
        </button>
        {create.isError && <span className="text-sm text-red-600">{(create.error as Error).message}</span>}
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="py-2">Nama</th>
            <th>Tipe</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id} className="border-b">
              <td className="py-2">{c.name}</td>
              <td>{c.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
