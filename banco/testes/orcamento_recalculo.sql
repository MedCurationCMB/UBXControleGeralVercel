-- Verifica o recalculo do orcamento (migracao 2026-10-06_orcamento_recalculo.sql). Roda em transacao revertida; falha com ASSERT.
-- Uso (somente no banco de TESTE): psql "$TEST_DATABASE_URL" -f banco/testes/orcamento_recalculo.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  pj int; em text; ca text; me int; an int; consumo numeric; v numeric; fid bigint;
BEGIN
  -- centro/categoria/mes com exatamente 1 linha de fluxo valendo no orcamento
  SELECT co.projeto_id, co.empresa, co.categoria, co.mes, co.ano INTO pj, em, ca, me, an
  FROM controle_orcamento co
  WHERE co.valor_pedidos_solicitados > 0
    AND (SELECT count(*) FROM pedidos_solicitados_fluxo f WHERE f.projeto_id = co.projeto_id AND f.empresa = co.empresa
         AND f.categoria = co.categoria AND f.mes = co.mes AND f.ano = co.ano) = 1
  LIMIT 1;
  ASSERT pj IS NOT NULL, 'sem massa de teste (centro com 1 linha de fluxo)';

  SELECT id INTO fid FROM pedidos_solicitados_fluxo
   WHERE projeto_id = pj AND empresa = em AND categoria = ca AND mes = me AND ano = an;
  SELECT valor_pedidos_solicitados INTO consumo FROM controle_orcamento
   WHERE projeto_id = pj AND empresa = em AND categoria = ca AND mes = me AND ano = an;

  -- 1) cancelar a unica linha devolve o orcamento
  UPDATE pedidos_solicitados_fluxo SET status = 'Cancelado' WHERE id = fid;
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento
   WHERE projeto_id = pj AND empresa = em AND categoria = ca AND mes = me AND ano = an;
  ASSERT v = 0, format('cancelado deveria devolver o orcamento, consumo=%s', v);

  -- 2) reativar volta ao valor original
  UPDATE pedidos_solicitados_fluxo SET status = 'Autorizado' WHERE id = fid;
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento
   WHERE projeto_id = pj AND empresa = em AND categoria = ca AND mes = me AND ano = an;
  ASSERT v = (SELECT valor_referente FROM pedidos_solicitados_fluxo WHERE id = fid), format('reativar: consumo=%s', v);

  -- 3) bug antigo: apagar a ultima linha do centro deve zerar o consumo
  DELETE FROM pedidos_solicitados_fluxo WHERE id = fid;
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento
   WHERE projeto_id = pj AND empresa = em AND categoria = ca AND mes = me AND ano = an;
  ASSERT v = 0, format('apagar a ultima linha deveria zerar, consumo=%s', v);
END $$;

ROLLBACK;
\echo 'OK: orcamento_recalculo'
