-- Desfaz a fase 4: desliga o RLS de todas as tabelas de public e apaga as policies criadas por ela.
BEGIN;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND policyname IN ('rls_projeto','rls_pai','rls_leitura','rls_escrita','rls_owner') LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
COMMIT;
