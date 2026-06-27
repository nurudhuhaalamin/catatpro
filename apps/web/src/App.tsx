import { coaTemplate, formatMoney } from "@catatpro/shared";

const modules = [
  ["Akuntansi inti", "Jurnal, buku besar, neraca saldo, neraca & laba-rugi (double-entry)"],
  ["Kas & Bank", "Uang masuk/keluar, transfer antar akun"],
  ["Penjualan (AR)", "Faktur, penerimaan, piutang, aging"],
  ["Pembelian (AP)", "Tagihan, pembayaran, hutang, aging"],
  ["Inventory", "Item, gudang, pergerakan stok, valuasi & HPP"],
  ["Pajak & Laporan", "PPN (12% DPP 11/12), e-Faktur/Coretax, laporan keuangan"],
];

export function App() {
  const coaCount = coaTemplate("emkm").length;
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">CatatPro</h1>
      <p className="mt-2 text-slate-600">
        ERP keuangan komprehensif — double-entry, online-first, multi-tenant. Mengacu standar
        akuntansi & perpajakan Indonesia terbaru (SAK EMKM/EP, PPN 2026).
      </p>
      <p className="mt-1 text-sm text-slate-400">
        Template COA EMKM: {coaCount} akun · contoh saldo {formatMoney(11_100_00)}
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {modules.map(([title, desc]) => (
          <li key={title} className="rounded-lg border border-slate-200 p-4">
            <div className="font-semibold text-slate-800">{title}</div>
            <div className="mt-1 text-sm text-slate-500">{desc}</div>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-xs text-slate-400">
        Fondasi (Fase 0–1). Lihat docs/ROADMAP.md untuk fase berikutnya.
      </p>
    </main>
  );
}
