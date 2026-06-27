-- RLS untuk tabel kurs (multi-currency). Memakai helper public.is_org_member.

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY exchange_rates_member ON public.exchange_rates
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
