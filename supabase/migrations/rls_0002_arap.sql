-- RLS untuk tabel AR/AP (Fase 2). Diterapkan SETELAH semua migrasi skema
-- (prefix `rls_` selalu urut paling akhir). Memakai helper public.is_org_member
-- dari rls_0001_core.sql.

ALTER TABLE public.contacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoice_lines  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bills       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bill_lines  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations  ENABLE ROW LEVEL SECURITY;

CREATE POLICY contacts_member ON public.contacts
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY sales_invoices_member ON public.sales_invoices
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY sales_invoice_lines_member ON public.sales_invoice_lines
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY purchase_bills_member ON public.purchase_bills
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY purchase_bill_lines_member ON public.purchase_bill_lines
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY payments_member ON public.payments
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY payment_allocations_member ON public.payment_allocations
  FOR ALL USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
