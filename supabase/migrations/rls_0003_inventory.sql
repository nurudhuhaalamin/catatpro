-- RLS untuk tabel inventory (Fase 3). Memakai helper public.is_org_member.

ALTER TABLE public.warehouses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouses_member ON public.warehouses
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY items_member ON public.items
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY stock_moves_member ON public.stock_moves
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
