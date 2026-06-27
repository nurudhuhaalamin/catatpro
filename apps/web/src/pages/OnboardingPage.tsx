import { useState } from "react";
import { useOrg } from "../lib/org.js";
import { apiFetch } from "../lib/api.js";

export function OnboardingPage() {
  const { refetch, setOrgId } = useOrg();
  const [name, setName] = useState("");
  const [standard, setStandard] = useState("emkm");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const org = await apiFetch<{ id: string }>("/orgs", {
        method: "POST",
        body: { name, accountingStandard: standard },
      });
      setOrgId(org.id);
      refetch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">Buat Usaha</h1>
      <p className="mt-1 text-sm text-slate-500">
        Bagan akun (COA) & tarif PPN akan disiapkan otomatis sesuai standar yang dipilih.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          required
          placeholder="Nama usaha"
          className="w-full rounded border border-slate-300 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="block text-sm text-slate-600">Standar akuntansi</label>
        <select
          className="w-full rounded border border-slate-300 px-3 py-2"
          value={standard}
          onChange={(e) => setStandard(e.target.value)}
        >
          <option value="emkm">SAK EMKM (mikro/kecil — paling sederhana)</option>
          <option value="ep">SAK EP (entitas privat)</option>
        </select>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50">
          {busy ? "Menyiapkan…" : "Buat & mulai"}
        </button>
      </form>
    </main>
  );
}
