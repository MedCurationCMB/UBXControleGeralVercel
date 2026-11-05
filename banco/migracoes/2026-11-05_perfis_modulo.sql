-- Perfis por modulo (fase 1): Usuario/Administrador Pagamento e Recebimento.
-- O perfil e papel (admin|user) x modulo. usuarios_projetos.modulo NULL = ve os dois modulos (comportamento de hoje:
-- ninguem muda). 'pagamentos' ou 'recebimentos' = so enxerga e grava as tabelas daquele modulo.
--
-- Garantia no banco: uma policy RESTRICTIVE por tabela (soma-se com a rls_projeto existente, nao a substitui).
-- O servidor (service role) ignora o RLS: as rotas de API sao filtradas no middleware (src/middleware.ts).
-- Para desfazer: 2026-11-05_perfis_modulo_reverter.sql.

BEGIN;

ALTER TABLE public.usuarios_projetos ADD COLUMN IF NOT EXISTS modulo text CHECK (modulo IN ('pagamentos', 'recebimentos'));

-- O usuario ve este modulo no projeto ativo? (owner: sempre; membro: modulo NULL ou igual)
CREATE OR REPLACE FUNCTION public.app_pode_modulo(p_modulo text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_projeto_rls() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = app_usuario_id() AND u.hierarquia::text = 'owner')
    OR EXISTS (SELECT 1 FROM usuarios_projetos up
                WHERE up.usuario_id = app_usuario_id() AND up.projeto_id = app_projeto_rls() AND (up.modulo IS NULL OR up.modulo = p_modulo))
  )
$$;

-- Administrador dos dois modulos (ou owner): o unico que edita centros de resultado e gerencia acessos
CREATE OR REPLACE FUNCTION public.app_admin_completo() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_projeto_rls() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = app_usuario_id() AND u.hierarquia::text = 'owner')
    OR EXISTS (SELECT 1 FROM usuarios_projetos up
                WHERE up.usuario_id = app_usuario_id() AND up.projeto_id = app_projeto_rls() AND up.papel = 'admin' AND up.modulo IS NULL)
  )
$$;
GRANT EXECUTE ON FUNCTION public.app_pode_modulo(text), public.app_admin_completo() TO anon, authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categorias', 'orcamentos_usuarios', 'controle_orcamento', 'registro_orcamentos', 'registro_orcamento_analise', 'requisicoes',
    'pedidos_solicitados', 'pedidos_solicitados_fluxo', 'controle_pagamentos', 'documentos', 'comentarios', 'informacoes_boleto',
    'fornecedores', 'conta_pagador', 'modelo_contrato', 'controle_sequencial'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_modulo ON public.%I', t);
    EXECUTE format('CREATE POLICY rls_modulo ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING ((SELECT public.app_pode_modulo(''pagamentos''))) WITH CHECK ((SELECT public.app_pode_modulo(''pagamentos'')))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY[
    'categorias_receita', 'orcamentos_usuarios_receita', 'controle_orcamento_receita', 'registro_orcamentos_receita', 'registro_orcamento_analise_receita',
    'requisicoes_receita', 'pedidos_solicitados_receita', 'pedidos_solicitados_fluxo_receita', 'controle_recebimento', 'documentos_receita',
    'comentarios_receita', 'informacoes_boleto_receita', 'clientes', 'conta_receita', 'modelo_contrato_venda', 'controle_sequencial_recebimento'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_modulo ON public.%I', t);
    EXECUTE format('CREATE POLICY rls_modulo ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING ((SELECT public.app_pode_modulo(''recebimentos''))) WITH CHECK ((SELECT public.app_pode_modulo(''recebimentos'')))', t);
  END LOOP;
END $$;

-- Realocacoes: guardam o modulo na propria linha; os itens herdam do pai
DROP POLICY IF EXISTS rls_modulo ON public.realocacoes;
CREATE POLICY rls_modulo ON public.realocacoes AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (public.app_pode_modulo(modulo)) WITH CHECK (public.app_pode_modulo(modulo));
DROP POLICY IF EXISTS rls_modulo ON public.realocacao_itens;
CREATE POLICY rls_modulo ON public.realocacao_itens AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.realocacoes r WHERE r.id = realocacao_itens.realocacao_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.realocacoes r WHERE r.id = realocacao_itens.realocacao_id));

-- Renomear centro (afeta os dois modulos): so administrador completo
CREATE OR REPLACE FUNCTION public.empresa_renomear(p_id uuid, p_novo text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_proj integer; v_antigo text; v_novo text := btrim(coalesce(p_novo, ''));
BEGIN
  IF NOT public.app_admin_completo() THEN RAISE EXCEPTION 'Somente administrador (dos dois módulos) pode editar o nome do centro de resultado.'; END IF;
  IF v_novo = '' THEN RAISE EXCEPTION 'Informe o nome do centro de resultado.'; END IF;
  SELECT projeto_id, empresa INTO v_proj, v_antigo FROM public.empresas WHERE id = p_id FOR UPDATE;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Centro de resultado não encontrado.'; END IF;
  IF v_novo = v_antigo THEN RETURN v_novo; END IF;
  IF EXISTS (SELECT 1 FROM public.empresas WHERE projeto_id = v_proj AND empresa = v_novo) THEN
    RAISE EXCEPTION 'Já existe um centro de resultado chamado "%".', v_novo;
  END IF;

  UPDATE public.empresas SET empresa = v_novo WHERE id = p_id;
  UPDATE public.realocacao_itens SET empresa = v_novo WHERE projeto_id = v_proj AND empresa = v_antigo;
  RETURN v_novo;
END $$;

COMMIT;
