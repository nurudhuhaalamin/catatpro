-- Row Level Security (RLS) — isolasi multi-tenant.
-- API server (koneksi langsung) bertindak sebagai pemilik DB dan TIDAK terkena RLS;
-- RLS ini melindungi akses langsung via Supabase (anon/authenticated key) sebagai
-- defense-in-depth. Identitas user = auth.uid() (JWT Supabase).

-- Helper: apakah user saat ini anggota organisasi tertentu.
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = p_org_id AND m.user_id = auth.uid()
  );
$$;

-- Aktifkan RLS di semua tabel tenant.
ALTER TABLE public.organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.number_sequences   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines      ENABLE ROW LEVEL SECURITY;

-- organizations: anggota boleh membaca; owner_user_id mengelola.
CREATE POLICY org_select ON public.organizations
  FOR SELECT USING (public.is_org_member(id));
CREATE POLICY org_modify ON public.organizations
  FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

-- memberships: user melihat baris miliknya sendiri.
CREATE POLICY membership_select ON public.memberships
  FOR SELECT USING (user_id = auth.uid() OR public.is_org_member(org_id));

-- Tabel data ber-org_id: akses penuh untuk anggota org.
CREATE POLICY periods_member ON public.accounting_periods
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY accounts_member ON public.accounts
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY sequences_member ON public.number_sequences
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY tax_rates_member ON public.tax_rates
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY journals_member ON public.journals
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY journal_lines_member ON public.journal_lines
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
