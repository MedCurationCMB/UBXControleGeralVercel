-- Verifica empresa_renomear e empresa_copiar_categorias (migracao 2026-11-04_centro_resultado.sql). Transacao revertida; falha com ASSERT.
-- Cria os proprios dados (centros ZZ_CR_*, categoria ZZ_CAT_*, orcamento 2040, um pedido). Precisa de 1 fornecedor no projeto 1.
-- Uso (somente no banco de TESTE): psql "$TEST_DATABASE_URL" -f banco/testes/centro_resultado.sql
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.erro(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p_sql; RETURN NULL; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END $f$;

DO $$
DECLARE a uuid; b uuid; f1 text; ped bigint; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"usuario_id":1}', true);   -- usuario 1 = owner
  PERFORM set_config('request.headers', '{"x-projeto-id":"1"}', true);
  SELECT nome INTO f1 FROM fornecedores WHERE projeto_id = 1 LIMIT 1;
  ASSERT f1 IS NOT NULL, 'sem fornecedor de teste';

  INSERT INTO empresas (empresa, projeto_id) VALUES ('ZZ_CR_A', 1) RETURNING id INTO a;
  INSERT INTO empresas (empresa, projeto_id) VALUES ('ZZ_CR_B', 1) RETURNING id INTO b;
  INSERT INTO categorias (empresa, categoria, projeto_id) VALUES ('ZZ_CR_A', 'ZZ_CAT_1', 1), ('ZZ_CR_A', 'ZZ_CAT_2', 1), ('ZZ_CR_B', 'ZZ_CAT_2', 1);
  INSERT INTO categorias_receita (empresa, categoria, projeto_id) VALUES ('ZZ_CR_A', 'ZZ_REC_1', 1);
  INSERT INTO controle_orcamento (empresa, categoria, mes, ano, valor_orcamento, projeto_id) VALUES ('ZZ_CR_A', 'ZZ_CAT_1', 1, 2040, 5000, 1);
  INSERT INTO pedidos_solicitados (empresa, categoria, fornecedor, valor_pedido, status, projeto_id, usuario_solicitante)
    VALUES ('ZZ_CR_A', 'ZZ_CAT_1', f1, 700, 'Autorizado', 1, 'teste') RETURNING id INTO ped;
  INSERT INTO pedidos_solicitados_fluxo (pedido_id, projeto_id, empresa, categoria, fornecedor, fornecedor_beneficiario, mes, ano, valor_referente, status)
    VALUES (ped, 1, 'ZZ_CR_A', 'ZZ_CAT_1', f1, f1, 1, 2040, 700, 'Autorizado');
  ASSERT (SELECT valor_pedidos_solicitados FROM controle_orcamento WHERE empresa = 'ZZ_CR_A' AND categoria = 'ZZ_CAT_1' AND mes = 1 AND ano = 2040) = 700, 'montagem: consumo';

  -- copiar: so acrescenta (ZZ_CAT_2 ja existia em B e nao duplica), nos dois modulos
  r := empresa_copiar_categorias(a, b);
  ASSERT (r->>'pagamentos')::int = 1 AND (r->>'recebimentos')::int = 1, 'copia: ' || r::text;
  ASSERT (SELECT count(*) FROM categorias WHERE empresa = 'ZZ_CR_B') = 2 AND (SELECT count(*) FROM categorias WHERE empresa = 'ZZ_CR_A') = 2, 'copia nao pode remover nem duplicar';
  ASSERT (empresa_copiar_categorias(a, b)->>'pagamentos')::int = 0, 'segunda copia nao deveria inserir nada';
  ASSERT pg_temp.erro(format('SELECT empresa_copiar_categorias(%L, %L)', a, a)) IS NOT NULL, 'copiar para o proprio centro deveria falhar';

  -- renomear: a cascata leva categoria, orcamento, pedido e fluxo; o consumo continua o mesmo
  ASSERT empresa_renomear(a, '  ZZ_CR_NOVO ') = 'ZZ_CR_NOVO', 'renomear deveria devolver o nome sem espacos';
  ASSERT (SELECT count(*) FROM categorias WHERE empresa = 'ZZ_CR_A') = 0 AND (SELECT count(*) FROM categorias WHERE empresa = 'ZZ_CR_NOVO') = 2, 'categorias nao seguiram';
  ASSERT (SELECT empresa FROM pedidos_solicitados WHERE id = ped) = 'ZZ_CR_NOVO', 'pedido nao seguiu';
  ASSERT (SELECT count(*) FROM pedidos_solicitados_fluxo WHERE pedido_id = ped AND empresa = 'ZZ_CR_NOVO') = 1, 'fluxo nao seguiu';
  ASSERT (SELECT valor_pedidos_solicitados FROM controle_orcamento WHERE empresa = 'ZZ_CR_NOVO' AND categoria = 'ZZ_CAT_1' AND mes = 1 AND ano = 2040) = 700, 'orcamento/consumo nao seguiu';
  ASSERT (SELECT count(*) FROM controle_orcamento WHERE empresa IN ('ZZ_CR_A', 'ZZ_CR_NOVO') AND categoria = 'ZZ_CAT_1') = 1, 'orcamento duplicado pela cascata';

  -- duplicado e vazio
  ASSERT pg_temp.erro(format('SELECT empresa_renomear(%L, ''ZZ_CR_B'')', a)) LIKE 'Já existe%', 'nome duplicado deveria falhar';
  ASSERT pg_temp.erro(format('SELECT empresa_renomear(%L, ''  '')', a)) LIKE 'Informe%', 'nome vazio deveria falhar';
END $$;

ROLLBACK;
\echo 'OK: centro_resultado'
