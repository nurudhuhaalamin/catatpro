import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OrgWithRole } from "@catatpro/shared";
import { apiFetch } from "./api.js";

interface OrgState {
  orgs: OrgWithRole[];
  loading: boolean;
  orgId: string | null;
  org: OrgWithRole | null;
  setOrgId: (id: string) => void;
  refetch: () => void;
}

const OrgContext = createContext<OrgState | null>(null);
const STORAGE_KEY = "catatpro.orgId";

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgId, setOrgIdState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["orgs"],
    queryFn: () => apiFetch<OrgWithRole[]>("/orgs"),
  });
  const orgs = data ?? [];
  const setOrgId = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setOrgIdState(id);
  };
  const effectiveId = orgId && orgs.some((o) => o.id === orgId) ? orgId : orgs[0]?.id ?? null;
  const org = orgs.find((o) => o.id === effectiveId) ?? null;

  return (
    <OrgContext.Provider value={{ orgs, loading: isLoading, orgId: effectiveId, org, setOrgId, refetch }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgState {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg harus di dalam OrgProvider");
  return ctx;
}
