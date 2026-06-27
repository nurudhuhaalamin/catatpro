import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useOrg } from "../lib/org.js";

const nav = [
  ["/", "Dashboard"],
  ["/contacts", "Kontak"],
  ["/sales", "Penjualan"],
  ["/purchases", "Pembelian"],
  ["/payments", "Pembayaran"],
  ["/reports", "Laporan"],
];

export function AppLayout() {
  const { orgs, org, setOrgId } = useOrg();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="font-bold">CatatPro</span>
          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={org?.id ?? ""}
            onChange={(e) => setOrgId(e.target.value)}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.role})
              </option>
            ))}
          </select>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {nav.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `rounded px-3 py-1 ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <button
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/login");
            }}
          >
            Keluar
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
