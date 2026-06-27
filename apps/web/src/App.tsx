import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSession } from "./lib/auth.js";
import { OrgProvider, useOrg } from "./lib/org.js";
import { AppLayout } from "./components/AppLayout.js";
import { LoginPage } from "./pages/LoginPage.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ContactsPage } from "./pages/ContactsPage.js";
import { DocumentPage } from "./pages/DocumentPage.js";
import { PaymentsPage } from "./pages/PaymentsPage.js";
import { ReportsPage } from "./pages/ReportsPage.js";

function Loading() {
  return <div className="flex min-h-screen items-center justify-center text-slate-400">Memuat…</div>;
}

function Shell() {
  const { orgs, loading } = useOrg();
  if (loading) return <Loading />;
  if (orgs.length === 0)
    return (
      <Routes>
        <Route path="*" element={<OnboardingPage />} />
      </Routes>
    );
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="sales" element={<DocumentPage kind="sales" />} />
        <Route path="purchases" element={<DocumentPage kind="purchase" />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  const session = useSession();
  if (session === undefined) return <Loading />;
  return (
    <BrowserRouter>
      {session ? (
        <OrgProvider>
          <Shell />
        </OrgProvider>
      ) : (
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
