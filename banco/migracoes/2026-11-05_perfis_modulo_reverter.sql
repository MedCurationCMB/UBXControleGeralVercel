-- Desfaz 2026-11-05_perfis_modulo.sql: remove as policies por modulo e a coluna. Todos voltam a ver os dois modulos.
-- (empresa_renomear volta a exigir app_admin_projeto: rode de novo 2026-11-04_centro_resultado.sql se precisar.)
BEGIN;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categorias', 'orcamentos_usuarios', 'controle_orcamento', 'registro_orcamentos', 'registro_orcamento_analise', 'requisicoes',
    'pedidos_solicitados', 'pedidos_solicitados_fluxo', 'controle_pagamentos', 'documentos', 'comentarios', 'informacoes_boleto',
    'fornecedores', 'conta_pagador', 'modelo_contrato', 'controle_sequencial',
    'categorias_receita', 'orcamentos_usuarios_receita', 'controle_orcamento_receita', 'registro_orcamentos_receita', 'registro_orcamento_analise_receita',
    'requisicoes_receita', 'pedidos_solicitados_receita', 'pedidos_solicitados_fluxo_receita', 'controle_recebimento', 'documentos_receita',
    'comentarios_receita', 'informacoes_boleto_receita', 'clientes', 'conta_receita', 'modelo_contrato_venda', 'controle_sequencial_recebimento',
    'realocacoes', 'realocacao_itens'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_modulo ON public.%I', t);
  END LOOP;
END $$;

-- a empresa_renomear nova chama app_admin_completo: volta para a checagem antiga antes de apagar a funcao
CREATE OR REPLACE FUNCTION public.empresa_renomear(p_id uuid, p_novo text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_proj integer; v_antigo text; v_novo text := btrim(coalesce(p_novo, ''));
BEGIN
  IF NOT public.app_admin_projeto() THEN RAISE EXCEPTION 'Somente administrador pode editar o nome do centro de resultado.'; END IF;
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

DROP FUNCTION IF EXISTS public.app_admin_completo();
DROP FUNCTION IF EXISTS public.app_pode_modulo(text);
ALTER TABLE public.usuarios_projetos DROP COLUMN IF EXISTS modulo;

COMMIT;
