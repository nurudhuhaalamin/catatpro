-- RLS untuk aset tetap (Fase 5a). Memakai helper public.is_org_member.

ALTER TABLE public.fixed_assets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depreciation_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixed_assets_member ON public.fixed_assets
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY depreciation_entries_member ON public.depreciation_entries
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
