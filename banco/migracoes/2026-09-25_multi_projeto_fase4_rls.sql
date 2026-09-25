-- MULTI-PROJETO, FASE 4: RLS. Ver docs/plano-multiprojeto.md.
-- Liga RLS em TODAS as tabelas de public. Cada usuario so enxerga/grava o projeto ativo (cabecalho x-projeto-id)
-- e so se for membro dele (ou owner). Chave anonima sem o JWT do usuario nao le nada.
-- O servidor (service role) continua ignorando o RLS.
--
-- ORDEM DE ENTREGA: (1) SUPABASE_JWT_SECRET no Vercel, (2) publicar o codigo que gera o token (middleware),
-- (3) conferir que o cookie ubx_db aparece, (4) so entao rodar este arquivo.
-- Para desfazer: 2026-09-25_multi_projeto_fase4_rls_reverter.sql.
-- Gerado por script; roda em uma unica transacao.

BEGIN;

-- Quem e o usuario (claim usuario_id do JWT emitido pelo app)
CREATE OR REPLACE FUNCTION public.app_usuario_id() RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'usuario_id', '')::bigint
$$;

-- Projeto ativo SE o usuario puder acessa-lo (membro ou owner, cadastro autorizado, projeto ativo); senao NULL.
-- security definer: le usuarios/usuarios_projetos sem depender de RLS nelas.
CREATE OR REPLACE FUNCTION public.app_projeto_rls() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id
    FROM projetos p
   WHERE p.id = app_projeto_ativo()
     AND p.ativo
     AND app_usuario_id() IS NOT NULL
     AND (
       EXISTS (SELECT 1 FROM usuarios u
                WHERE u.id = app_usuario_id() AND u.hierarquia::text = 'owner' AND u.status_cadastro::text = 'Autorizado')
       OR EXISTS (SELECT 1 FROM usuarios_projetos up JOIN usuarios u ON u.id = up.usuario_id
                   WHERE up.usuario_id = app_usuario_id() AND up.projeto_id = p.id AND u.status_cadastro::text = 'Autorizado')
     )
$$;

-- Admin no projeto ativo (papel admin no vinculo, ou owner)
CREATE OR REPLACE FUNCTION public.app_admin_projeto() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_projeto_rls() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM usuarios u WHERE u.id = app_usuario_id() AND u.hierarquia::text = 'owner')
    OR EXISTS (SELECT 1 FROM usuarios_projetos up WHERE up.usuario_id = app_usuario_id() AND up.projeto_id = app_projeto_rls() AND up.papel = 'admin')
  )
$$;

-- Owner (hierarquia da tabela usuarios): unico que gerencia usuarios, SMTP, e-mail e chave do assistente (Painel Admin)
CREATE OR REPLACE FUNCTION public.app_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios u
                  WHERE u.id = app_usuario_id() AND u.hierarquia::text = 'owner' AND u.status_cadastro::text = 'Autorizado')
$$;

GRANT EXECUTE ON FUNCTION public.app_usuario_id(), public.app_projeto_rls(), public.app_admin_projeto(), public.app_owner()
  TO anon, authenticated, service_role;

-- A producao tem uma policy antiga "Permitir tudo" em config (inerte sem RLS). Com RLS ligado ela liberaria tudo.
DROP POLICY IF EXISTS "Permitir tudo" ON public.config;

-- Tabelas de dados (projeto_id = projeto ativo do usuario)
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.empresas FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.categorias FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.categorias_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.categorias_receita FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.fornecedores FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.clientes FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.orcamentos_usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.orcamentos_usuarios FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.orcamentos_usuarios_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.orcamentos_usuarios_receita FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.controle_orcamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.controle_orcamento FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.controle_orcamento_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.controle_orcamento_receita FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.registro_orcamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.registro_orcamentos FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.registro_orcamentos_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.registro_orcamentos_receita FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.registro_orcamento_analise ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.registro_orcamento_analise FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.registro_orcamento_analise_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.registro_orcamento_analise_receita FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.requisicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.requisicoes FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.requisicoes_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.requisicoes_receita FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.conta_pagador ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.conta_pagador FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.conta_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.conta_receita FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.modelo_contrato ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.modelo_contrato FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.modelo_contrato_venda ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.modelo_contrato_venda FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.controle_sequencial ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.controle_sequencial FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.controle_sequencial_recebimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.controle_sequencial_recebimento FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()));
ALTER TABLE public.pedidos_solicitados ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.pedidos_solicitados FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls())
    AND (requisicao_id IS NULL OR EXISTS (SELECT 1 FROM public.requisicoes x WHERE x.id = pedidos_solicitados.requisicao_id)));
ALTER TABLE public.pedidos_solicitados_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.pedidos_solicitados_receita FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls())
    AND (requisicao_id IS NULL OR EXISTS (SELECT 1 FROM public.requisicoes_receita x WHERE x.id = pedidos_solicitados_receita.requisicao_id)));
ALTER TABLE public.pedidos_solicitados_fluxo ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.pedidos_solicitados_fluxo FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls())
    AND (pedido_id IS NULL OR EXISTS (SELECT 1 FROM public.pedidos_solicitados x WHERE x.id = pedidos_solicitados_fluxo.pedido_id)));
ALTER TABLE public.pedidos_solicitados_fluxo_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.pedidos_solicitados_fluxo_receita FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls())
    AND (pedido_id IS NULL OR EXISTS (SELECT 1 FROM public.pedidos_solicitados_receita x WHERE x.id = pedidos_solicitados_fluxo_receita.pedido_id)));
ALTER TABLE public.controle_pagamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.controle_pagamentos FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls())
    AND (pedido_id IS NULL OR EXISTS (SELECT 1 FROM public.pedidos_solicitados x WHERE x.id = controle_pagamentos.pedido_id)));
ALTER TABLE public.controle_recebimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.controle_recebimento FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls())
    AND (pedido_id IS NULL OR EXISTS (SELECT 1 FROM public.pedidos_solicitados_receita x WHERE x.id = controle_recebimento.pedido_id)));
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.documentos FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls())
    AND (pedido_id IS NULL OR EXISTS (SELECT 1 FROM public.pedidos_solicitados x WHERE x.id = documentos.pedido_id)) AND (pagamento_id IS NULL OR EXISTS (SELECT 1 FROM public.controle_pagamentos x WHERE x.id = documentos.pagamento_id)));
ALTER TABLE public.documentos_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_projeto ON public.documentos_receita FOR ALL TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls())
    AND (pedido_id IS NULL OR EXISTS (SELECT 1 FROM public.pedidos_solicitados_receita x WHERE x.id = documentos_receita.pedido_id)) AND (recebimento_id IS NULL OR EXISTS (SELECT 1 FROM public.controle_recebimento x WHERE x.id = documentos_receita.recebimento_id)));

-- Tabelas filhas sem projeto_id: seguem o registro pai (o RLS do pai filtra a subconsulta)
ALTER TABLE public.comentarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_pai ON public.comentarios FOR ALL TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos_solicitados x WHERE x.id = comentarios.pedido_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos_solicitados x WHERE x.id = comentarios.pedido_id));
ALTER TABLE public.comentarios_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_pai ON public.comentarios_receita FOR ALL TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.pedidos_solicitados_receita x WHERE x.id = comentarios_receita.pedido_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pedidos_solicitados_receita x WHERE x.id = comentarios_receita.pedido_id));
ALTER TABLE public.informacoes_boleto ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_pai ON public.informacoes_boleto FOR ALL TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.documentos x WHERE x.id = informacoes_boleto.boleto_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.documentos x WHERE x.id = informacoes_boleto.boleto_id));
ALTER TABLE public.informacoes_boleto_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_pai ON public.informacoes_boleto_receita FOR ALL TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.documentos_receita x WHERE x.id = informacoes_boleto_receita.boleto_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.documentos_receita x WHERE x.id = informacoes_boleto_receita.boleto_id));

-- config: membros leem; so admin do projeto grava
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_leitura ON public.config FOR SELECT TO anon, authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()));
CREATE POLICY rls_escrita ON public.config FOR ALL TO authenticated
  USING (projeto_id = (SELECT public.app_projeto_rls()) AND (SELECT public.app_admin_projeto()))
  WITH CHECK (projeto_id = (SELECT public.app_projeto_rls()) AND (SELECT public.app_admin_projeto()));

-- projetos: cada um le apenas o projeto ativo (lista de projetos vem do servidor); ninguem grava pelo navegador
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_leitura ON public.projetos FOR SELECT TO authenticated
  USING (id = (SELECT public.app_projeto_rls()));

-- Tabelas de apoio (tipos e status): leitura para usuario logado; sem gravacao pelo navegador
ALTER TABLE public.pagamento_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_leitura ON public.pagamento_status FOR SELECT TO authenticated USING (true);
ALTER TABLE public.recebimento_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_leitura ON public.recebimento_status FOR SELECT TO authenticated USING (true);
ALTER TABLE public.pedido_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_leitura ON public.pedido_status FOR SELECT TO authenticated USING (true);
ALTER TABLE public.pedido_status_receita ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_leitura ON public.pedido_status_receita FOR SELECT TO authenticated USING (true);
ALTER TABLE public.tipos_chave ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_leitura ON public.tipos_chave FOR SELECT TO authenticated USING (true);
ALTER TABLE public.tipos_documento ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_leitura ON public.tipos_documento FOR SELECT TO authenticated USING (true);
ALTER TABLE public.tipos_pagamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_leitura ON public.tipos_pagamento FOR SELECT TO authenticated USING (true);
ALTER TABLE public.tipos_recebimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_leitura ON public.tipos_recebimento FOR SELECT TO authenticated USING (true);

-- Globais sensiveis (senhas, SMTP, e-mail, chave do assistente): so o owner pelo navegador
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_owner ON public.usuarios FOR ALL TO authenticated
  USING ((SELECT public.app_owner()))
  WITH CHECK ((SELECT public.app_owner()));
ALTER TABLE public.smtp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_owner ON public.smtp_config FOR ALL TO authenticated
  USING ((SELECT public.app_owner()))
  WITH CHECK ((SELECT public.app_owner()));
ALTER TABLE public.email_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_owner ON public.email_config FOR ALL TO authenticated
  USING ((SELECT public.app_owner()))
  WITH CHECK ((SELECT public.app_owner()));
ALTER TABLE public.assistente_virtual ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_owner ON public.assistente_virtual FOR ALL TO authenticated
  USING ((SELECT public.app_owner()))
  WITH CHECK ((SELECT public.app_owner()));

-- Somente o servidor (service role): sem policy = navegador nao acessa
ALTER TABLE public.reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_projetos ENABLE ROW LEVEL SECURITY;

COMMIT;
