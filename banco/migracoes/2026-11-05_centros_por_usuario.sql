-- Visibilidade por centro de resultado (fase 2): cada membro do projeto ve "todos" os centros (padrao: ninguem muda) ou so os marcados.
-- usuarios_projetos.todos_centros + usuarios_projetos_empresas (centros marcados, pelo ID do centro: renomear nao quebra o vinculo).
--
-- Garantia no banco: policy RESTRICTIVE rls_centro, somada a rls_projeto e rls_modulo.
--   - tabelas com a coluna empresa: so as linhas dos centros permitidos (leitura e escrita: restrito nao cria pedido/orcamento de centro alheio);
--   - pedidos: vê o pedido se o centro do pedido e permitido OU se ele tem alguma linha de fluxo num centro permitido (rateio);
--   - controle_*, documentos: so os do pedidos que ele ve;
--   - realocacoes: so le as de pedidos visiveis; criar/autorizar so quem ve todos os centros (as funcoes mexem em varios centros e rodam como o usuario).
-- Quem cria/renomeia centro: restrito nao cria centro (o nome novo nao esta na lista dele).
-- O servidor (service role) ignora o RLS: rotas que leem dados de centros usam o cliente do usuario (src/lib/supabase/usuario.ts).
-- Para desfazer: 2026-11-05_centros_por_usuario_reverter.sql.

BEGIN;

ALTER TABLE public.usuarios_projetos ADD COLUMN IF NOT EXISTS todos_centros boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.usuarios_projetos_empresas (
  usuario_id bigint  NOT NULL,
  projeto_id integer NOT NULL,
  empresa_id uuid    NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, projeto_id, empresa_id),
  FOREIGN KEY (usuario_id, projeto_id) REFERENCES public.usuarios_projetos(usuario_id, projeto_id) ON DELETE CASCADE
);
ALTER TABLE public.usuarios_projetos_empresas ENABLE ROW LEVEL SECURITY;  -- sem policy: so o servidor e as funcoes abaixo (security definer)

-- NULL = todos os centros; senao a lista (pode ser vazia) dos nomes permitidos no projeto ativo
CREATE OR REPLACE FUNCTION public.app_centros_permitidos() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN app_projeto_rls() IS NULL THEN ARRAY[]::text[]
    WHEN EXISTS (SELECT 1 FROM usuarios u WHERE u.id = app_usuario_id() AND u.hierarquia::text = 'owner') THEN NULL
    WHEN coalesce((SELECT up.todos_centros FROM usuarios_projetos up
                    WHERE up.usuario_id = app_usuario_id() AND up.projeto_id = app_projeto_rls()), false) THEN NULL
    ELSE coalesce((SELECT array_agg(e.empresa) FROM usuarios_projetos_empresas upe JOIN empresas e ON e.id = upe.empresa_id
                    WHERE upe.usuario_id = app_usuario_id() AND upe.projeto_id = app_projeto_rls()), ARRAY[]::text[])
  END
$$;
GRANT EXECUTE ON FUNCTION public.app_centros_permitidos() TO anon, authenticated, service_role;

-- 1) Tabelas com a coluna empresa
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empresas', 'categorias', 'categorias_receita', 'orcamentos_usuarios', 'orcamentos_usuarios_receita', 'controle_orcamento', 'controle_orcamento_receita',
    'registro_orcamentos', 'registro_orcamentos_receita', 'registro_orcamento_analise', 'registro_orcamento_analise_receita',
    'requisicoes', 'requisicoes_receita', 'pedidos_solicitados_fluxo', 'pedidos_solicitados_fluxo_receita'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_centro ON public.%I', t);
    EXECUTE format($p$CREATE POLICY rls_centro ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING ((SELECT public.app_centros_permitidos()) IS NULL OR empresa::text = ANY ((SELECT public.app_centros_permitidos())::text[]))
      WITH CHECK ((SELECT public.app_centros_permitidos()) IS NULL OR empresa::text = ANY ((SELECT public.app_centros_permitidos())::text[]))$p$, t);
  END LOOP;

  -- 2) Pedidos: centro do pedido permitido OU alguma linha de fluxo (ja filtrada pelo RLS do fluxo) num centro permitido
  EXECUTE 'DROP POLICY IF EXISTS rls_centro ON public.pedidos_solicitados';
  EXECUTE $p$CREATE POLICY rls_centro ON public.pedidos_solicitados AS RESTRICTIVE FOR ALL TO anon, authenticated
    USING ((SELECT public.app_centros_permitidos()) IS NULL OR empresa::text = ANY ((SELECT public.app_centros_permitidos())::text[])
           OR EXISTS (SELECT 1 FROM public.pedidos_solicitados_fluxo f WHERE f.pedido_id = pedidos_solicitados.id))
    WITH CHECK ((SELECT public.app_centros_permitidos()) IS NULL OR empresa::text = ANY ((SELECT public.app_centros_permitidos())::text[]))$p$;
  EXECUTE 'DROP POLICY IF EXISTS rls_centro ON public.pedidos_solicitados_receita';
  EXECUTE $p$CREATE POLICY rls_centro ON public.pedidos_solicitados_receita AS RESTRICTIVE FOR ALL TO anon, authenticated
    USING ((SELECT public.app_centros_permitidos()) IS NULL OR empresa::text = ANY ((SELECT public.app_centros_permitidos())::text[])
           OR EXISTS (SELECT 1 FROM public.pedidos_solicitados_fluxo_receita f WHERE f.pedido_id = pedidos_solicitados_receita.id))
    WITH CHECK ((SELECT public.app_centros_permitidos()) IS NULL OR empresa::text = ANY ((SELECT public.app_centros_permitidos())::text[]))$p$;

  -- 3) Dependentes do pedido
  FOREACH t IN ARRAY ARRAY['controle_pagamentos', 'documentos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_centro ON public.%I', t);
    EXECUTE format($p$CREATE POLICY rls_centro ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING ((SELECT public.app_centros_permitidos()) IS NULL OR EXISTS (SELECT 1 FROM public.pedidos_solicitados x WHERE x.id = %I.pedido_id))
      WITH CHECK ((SELECT public.app_centros_permitidos()) IS NULL OR EXISTS (SELECT 1 FROM public.pedidos_solicitados x WHERE x.id = %I.pedido_id))$p$, t, t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['controle_recebimento', 'documentos_receita'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS rls_centro ON public.%I', t);
    EXECUTE format($p$CREATE POLICY rls_centro ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING ((SELECT public.app_centros_permitidos()) IS NULL OR EXISTS (SELECT 1 FROM public.pedidos_solicitados_receita x WHERE x.id = %I.pedido_id))
      WITH CHECK ((SELECT public.app_centros_permitidos()) IS NULL OR EXISTS (SELECT 1 FROM public.pedidos_solicitados_receita x WHERE x.id = %I.pedido_id))$p$, t, t, t);
  END LOOP;
END $$;

-- 4) Realocacoes: le as de pedidos visiveis; so quem ve todos os centros cria/autoriza
DROP POLICY IF EXISTS rls_centro ON public.realocacoes;
CREATE POLICY rls_centro ON public.realocacoes AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING ((SELECT public.app_centros_permitidos()) IS NULL
         OR (modulo = 'pagamentos' AND EXISTS (SELECT 1 FROM public.pedidos_solicitados p WHERE p.id = realocacoes.pedido_id))
         OR (modulo = 'recebimentos' AND EXISTS (SELECT 1 FROM public.pedidos_solicitados_receita p WHERE p.id = realocacoes.pedido_id)))
  WITH CHECK ((SELECT public.app_centros_permitidos()) IS NULL);
DROP POLICY IF EXISTS rls_centro ON public.realocacao_itens;
CREATE POLICY rls_centro ON public.realocacao_itens AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING ((SELECT public.app_centros_permitidos()) IS NULL OR EXISTS (SELECT 1 FROM public.realocacoes r WHERE r.id = realocacao_itens.realocacao_id))
  WITH CHECK ((SELECT public.app_centros_permitidos()) IS NULL);

COMMIT;
