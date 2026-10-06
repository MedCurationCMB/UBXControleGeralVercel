-- Verifica as tabelas de realocacao e a reserva de saldo (migracao 2026-10-06_realocacao_tabelas.sql). Transacao revertida; falha com ASSERT.
-- Uso (somente no banco de TESTE): psql "$TEST_DATABASE_URL" -f banco/testes/realocacao_reserva.sql
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  fx record; dx record; rid bigint; v numeric; novo numeric; base_d numeric; base_o numeric; erro boolean := false;
BEGIN
  -- linha de fluxo (valor >= 100) e outro centro/mes com orcamento, no mesmo projeto, para ser o destino
  SELECT * INTO fx FROM pedidos_solicitados_fluxo f
   WHERE f.status = 'Autorizado' AND f.valor_referente >= 100
     AND EXISTS (SELECT 1 FROM controle_orcamento c WHERE c.projeto_id = f.projeto_id AND c.empresa = f.empresa
                  AND c.categoria = f.categoria AND c.mes = f.mes AND c.ano = f.ano)
   LIMIT 1;
  ASSERT fx.id IS NOT NULL, 'sem linha de fluxo de teste';
  SELECT * INTO dx FROM controle_orcamento c
   WHERE c.projeto_id = fx.projeto_id AND NOT (c.empresa = fx.empresa AND c.categoria = fx.categoria AND c.mes = fx.mes AND c.ano = fx.ano)
   LIMIT 1;
  ASSERT dx.id IS NOT NULL, 'sem destino de teste';

  SELECT valor_pedidos_solicitados INTO base_d FROM controle_orcamento WHERE id = dx.id;
  SELECT valor_pedidos_solicitados INTO base_o FROM controle_orcamento
   WHERE projeto_id = fx.projeto_id AND empresa = fx.empresa AND categoria = fx.categoria AND mes = fx.mes AND ano = fx.ano;
  novo := round(fx.valor_referente * 0.4, 2);

  -- realocacao pendente: 60% fica na origem, 40% vai para o destino
  INSERT INTO realocacoes (projeto_id, modulo, pedido_id, modo, solicitante) VALUES (fx.projeto_id, 'pagamentos', fx.pedido_id, 'percentual', 'teste')
    RETURNING id INTO rid;
  INSERT INTO realocacao_itens (realocacao_id, projeto_id, lado, empresa, categoria, mes, ano, valor) VALUES
    (rid, fx.projeto_id, 'antes',  fx.empresa, fx.categoria, fx.mes, fx.ano, fx.valor_referente),
    (rid, fx.projeto_id, 'depois', fx.empresa, fx.categoria, fx.mes, fx.ano, fx.valor_referente - novo),
    (rid, fx.projeto_id, 'depois', dx.empresa, dx.categoria, dx.mes, dx.ano, novo);

  -- 1) destino ganha so a parte que entra; origem nao muda (a parte que sai so libera ao aplicar)
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento WHERE id = dx.id;
  ASSERT v = base_d + novo, format('destino deveria ter %s, tem %s', base_d + novo, v);
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento
   WHERE projeto_id = fx.projeto_id AND empresa = fx.empresa AND categoria = fx.categoria AND mes = fx.mes AND ano = fx.ano;
  ASSERT v = base_o, format('origem nao deveria mudar: %s vs %s', base_o, v);

  -- 2) segunda realocacao pendente do mesmo pedido e barrada
  BEGIN
    INSERT INTO realocacoes (projeto_id, modulo, pedido_id, modo, solicitante) VALUES (fx.projeto_id, 'pagamentos', fx.pedido_id, 'valor', 'teste');
  EXCEPTION WHEN unique_violation THEN erro := true;
  END;
  ASSERT erro, 'deveria barrar a segunda pendente do pedido';

  -- 3) recusar libera a reserva
  UPDATE realocacoes SET status = 'Recusada', autorizador = 'teste', data_decisao = now() WHERE id = rid;
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento WHERE id = dx.id;
  ASSERT v = base_d, format('recusada deveria devolver: %s vs %s', base_d, v);

  -- 4) pode pedir de novo; autorizar tira a reserva (quem aplica troca as linhas do fluxo, etapa 3)
  UPDATE realocacoes SET status = 'Aguardando Autorização' WHERE id = rid;
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento WHERE id = dx.id;
  ASSERT v = base_d + novo, 'voltar a pendente deveria reservar de novo';
  UPDATE realocacoes SET status = 'Autorizada' WHERE id = rid;
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento WHERE id = dx.id;
  ASSERT v = base_d, 'autorizada nao deveria manter reserva';

  -- 5) apagar a realocacao pendente tambem libera
  UPDATE realocacoes SET status = 'Aguardando Autorização' WHERE id = rid;
  DELETE FROM realocacoes WHERE id = rid;
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento WHERE id = dx.id;
  ASSERT v = base_d, 'apagar a pendente deveria liberar';
END $$;

-- 6) recebimentos usam o orcamento de receita
DO $$
DECLARE fx record; dx record; rid bigint; v numeric; base_d numeric;
BEGIN
  SELECT * INTO fx FROM pedidos_solicitados_fluxo_receita f
   WHERE f.status = 'Autorizado' AND f.valor_referente >= 100 LIMIT 1;
  IF fx.id IS NULL THEN RAISE NOTICE 'sem recebimentos de teste, passo 6 pulado'; RETURN; END IF;
  SELECT * INTO dx FROM controle_orcamento_receita c
   WHERE c.projeto_id = fx.projeto_id AND NOT (c.empresa = fx.empresa AND c.categoria = fx.categoria AND c.mes = fx.mes AND c.ano = fx.ano) LIMIT 1;
  IF dx.id IS NULL THEN RAISE NOTICE 'sem destino de receita, passo 6 pulado'; RETURN; END IF;
  SELECT valor_pedidos_solicitados INTO base_d FROM controle_orcamento_receita WHERE id = dx.id;
  INSERT INTO realocacoes (projeto_id, modulo, pedido_id, modo, solicitante) VALUES (fx.projeto_id, 'recebimentos', fx.pedido_id, 'valor', 'teste')
    RETURNING id INTO rid;
  INSERT INTO realocacao_itens (realocacao_id, projeto_id, lado, empresa, categoria, mes, ano, valor) VALUES
    (rid, fx.projeto_id, 'antes',  fx.empresa, fx.categoria, fx.mes, fx.ano, fx.valor_referente),
    (rid, fx.projeto_id, 'depois', dx.empresa, dx.categoria, dx.mes, dx.ano, fx.valor_referente);
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento_receita WHERE id = dx.id;
  ASSERT v = base_d + fx.valor_referente, format('receita: destino deveria ter %s, tem %s', base_d + fx.valor_referente, v);
END $$;

ROLLBACK;
\echo 'OK: realocacao_reserva'
