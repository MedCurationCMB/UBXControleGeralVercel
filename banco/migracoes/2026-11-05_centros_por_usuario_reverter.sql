-- Desfaz 2026-11-05_centros_por_usuario.sql: remove as policies por centro, a funcao, a tabela de centros marcados e a coluna.
-- Todos voltam a ver todos os centros.
BEGIN;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empresas', 'categorias', 'categorias_receita', 'orcamentos_usuarios', 'orcamentos_usuarios_receita', 'controle_orcamento', 'controle_orcamento_receita',
    'registro_orcamentos', 'registro_orcamentos_receita', 'registro_orcamento_analise', 'registro_orcamento_analise_receita',
    'requisicoes', 'requisicoes_receita', 'pedidos_solicitados_fluxo', 'pedidos_solicitados_fluxo_receita',
    'pedidos_solicitados', 'pedidos_solicitados_receita', 'controle_pagamentos', 'documentos', 'controle_recebimento', 'documentos_receita',
    'realocacoes', 'realocacao_itens'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_centro ON public.%I', t);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.app_centros_permitidos();
DROP TABLE IF EXISTS public.usuarios_projetos_empresas;
ALTER TABLE public.usuarios_projetos DROP COLUMN IF EXISTS todos_centros;

COMMIT;
