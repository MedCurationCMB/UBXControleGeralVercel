-- Verifica os perfis por modulo (migracao 2026-11-05_perfis_modulo.sql). Transacao revertida; falha com ASSERT.
-- Usa um membro comum (papel 'user') ja existente no projeto 1 e muda o modulo dele dentro da transacao.
-- Uso (somente no banco de TESTE): psql "$TEST_DATABASE_URL" -f banco/testes/perfis_modulo.sql
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.erro(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p_sql; RETURN NULL; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END $f$;
CREATE FUNCTION pg_temp.conta(p_tab text) RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE n bigint; BEGIN EXECUTE format('SELECT count(*) FROM public.%I', p_tab) INTO n; RETURN n; END $f$;

DO $$
DECLARE u bigint; r_pag bigint; r_rec bigint;
BEGIN
  SELECT usuario_id INTO u FROM usuarios_projetos up JOIN usuarios x ON x.id = up.usuario_id
   WHERE up.projeto_id = 1 AND up.papel = 'user' AND x.hierarquia::text <> 'owner' AND x.status_cadastro::text = 'Autorizado' LIMIT 1;
  ASSERT u IS NOT NULL, 'sem membro comum no projeto 1';
  PERFORM set_config('request.jwt.claims', json_build_object('usuario_id', u)::text, true);
  PERFORM set_config('request.headers', '{"x-projeto-id":"1"}', true);

  -- modulo NULL: ve os dois
  ASSERT app_pode_modulo('pagamentos') AND app_pode_modulo('recebimentos'), 'modulo NULL deveria ver os dois';

  -- perfil de Pagamento
  UPDATE usuarios_projetos SET modulo = 'pagamentos' WHERE usuario_id = u AND projeto_id = 1;
  ASSERT app_pode_modulo('pagamentos') AND NOT app_pode_modulo('recebimentos'), 'perfil pagamentos: so pagamentos';
  ASSERT NOT app_admin_completo(), 'usuario comum nao e admin completo';

  -- com o papel do banco (authenticated) o RLS vale: as tabelas de recebimentos ficam vazias e a escrita e negada
  SET LOCAL ROLE authenticated;
  ASSERT pg_temp.conta('pedidos_solicitados_receita') = 0 AND pg_temp.conta('categorias_receita') = 0 AND pg_temp.conta('clientes') = 0, 'perfil pagamentos nao deveria ler recebimentos';
  ASSERT pg_temp.erro('INSERT INTO public.categorias_receita (empresa, categoria) VALUES (''x'', ''x'')') IS NOT NULL, 'perfil pagamentos nao deveria gravar em recebimentos';
  RESET ROLE;

  -- perfil de Recebimento: o inverso
  UPDATE usuarios_projetos SET modulo = 'recebimentos' WHERE usuario_id = u AND projeto_id = 1;
  ASSERT NOT app_pode_modulo('pagamentos') AND app_pode_modulo('recebimentos'), 'perfil recebimentos: so recebimentos';
  SET LOCAL ROLE authenticated;
  ASSERT pg_temp.conta('pedidos_solicitados') = 0 AND pg_temp.conta('categorias') = 0 AND pg_temp.conta('fornecedores') = 0, 'perfil recebimentos nao deveria ler pagamentos';
  RESET ROLE;

  -- admin de um modulo nao e admin completo; admin sem modulo e
  UPDATE usuarios_projetos SET papel = 'admin' WHERE usuario_id = u AND projeto_id = 1;
  ASSERT app_admin_projeto() AND NOT app_admin_completo(), 'admin de um modulo: admin do projeto, nao completo';
  UPDATE usuarios_projetos SET modulo = NULL WHERE usuario_id = u AND projeto_id = 1;
  ASSERT app_admin_completo(), 'admin sem modulo e completo';
END $$;

ROLLBACK;
\echo 'OK: perfis_modulo'
