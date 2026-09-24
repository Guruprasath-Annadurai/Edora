-- Enable RLS on concept_aliases and concept_graph (knowledge-graph reference
-- tables shipped without RLS in 20260807/20260808). Both are shared
-- curriculum data, not per-user rows, so the policy mirrors the existing
-- GRANT SELECT TO authenticated — service_role already bypasses RLS for
-- the write paths (INSERT/UPDATE) those migrations granted it.

ALTER TABLE public.concept_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concept_aliases_read" ON public.concept_aliases
  FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE public.concept_graph ENABLE ROW LEVEL SECURITY;
CREATE POLICY "concept_graph_read" ON public.concept_graph
  FOR SELECT USING (auth.role() = 'authenticated');
