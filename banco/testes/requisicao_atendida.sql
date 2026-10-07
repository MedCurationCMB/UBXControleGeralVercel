-- Verifica "Atendida sem pedido" (migracao 2026-10-07_requisicao_atendida_sem_pedido.sql). Transacao revertida; falha com ASSERT.
-- Uso (somente no banco de TESTE): psql "$TEST_DATABASE_URL" -f banco/testes/requisicao_atendida.sql
\set ON_ERROR_STOP on
BEGIN;
\i banco/migracoes/2026-10-07_requisicao_atendida_sem_pedido.sql

DO $$
DECLARE c record; p record; rid bigint; rrid bigint; barrou boolean;
BEGIN
  SELECT * INTO c FROM categorias LIMIT 1;
  SELECT * INTO p FROM pedidos_solicitados WHERE requisicao_id IS NULL LIMIT 1;
  ASSERT c.empresa IS NOT NULL AND p.id IS NOT NULL, 'sem dados de teste';

  INSERT INTO requisicoes (projeto_id, empresa, categoria, descricao, status)
  VALUES (c.projeto_id, c.empresa, c.categoria, 'teste', 'Aguardando Autorização') RETURNING id INTO rid;

  -- 1. so requisicao autorizada pode ser marcada
  barrou := false;
  BEGIN UPDATE requisicoes SET atendida_sem_pedido = true WHERE id = rid; EXCEPTION WHEN raise_exception THEN barrou := true; END;
  ASSERT barrou, 'marcou requisicao nao autorizada';

  -- 2. autorizada e sem pedido: marca (inclusive autorizando na mesma atualizacao)
  UPDATE requisicoes SET atendida_sem_pedido = true, status = 'Autorizado', atendida_data = current_date, atendida_usuario = 'teste' WHERE id = rid;

  -- 3. requisicao atendida nao gera pedido
  barrou := false;
  BEGIN
    INSERT INTO pedidos_solicitados (projeto_id, empresa, categoria, fornecedor, valor_pedido, requisicao_id)
    VALUES (p.projeto_id, p.empresa, p.categoria, p.fornecedor, 10, rid);
  EXCEPTION WHEN raise_exception THEN barrou := true; END;
  ASSERT barrou, 'criou pedido para requisicao atendida';

  -- 4. nao sai de Autorizado enquanto atendida
  barrou := false;
  BEGIN UPDATE requisicoes SET status = 'Não Autorizado' WHERE id = rid; EXCEPTION WHEN raise_exception THEN barrou := true; END;
  ASSERT barrou, 'mudou o status de requisicao atendida';

  -- 5. desfazer libera o pedido; depois, com pedido vinculado, nao marca de novo
  UPDATE requisicoes SET atendida_sem_pedido = false, atendida_data = NULL, atendida_usuario = NULL WHERE id = rid;
  INSERT INTO pedidos_solicitados (projeto_id, empresa, categoria, fornecedor, valor_pedido, requisicao_id)
  VALUES (p.projeto_id, p.empresa, p.categoria, p.fornecedor, 10, rid);
  barrou := false;
  BEGIN UPDATE requisicoes SET atendida_sem_pedido = true WHERE id = rid; EXCEPTION WHEN raise_exception THEN barrou := true; END;
  ASSERT barrou, 'marcou requisicao que ja tem pedido';

  -- 6. mesma regra em recebimentos
  SELECT * INTO c FROM categorias_receita LIMIT 1;
  SELECT * INTO p FROM pedidos_solicitados_receita WHERE requisicao_id IS NULL LIMIT 1;
  IF c.empresa IS NOT NULL AND p.id IS NOT NULL THEN
    INSERT INTO requisicoes_receita (projeto_id, empresa, categoria, descricao, status)
    VALUES (c.projeto_id, c.empresa, c.categoria, 'teste', 'Autorizado') RETURNING id INTO rrid;
    UPDATE requisicoes_receita SET atendida_sem_pedido = true WHERE id = rrid;
    barrou := false;
    BEGIN
      INSERT INTO pedidos_solicitados_receita (projeto_id, empresa, categoria, cliente, valor_pedido, requisicao_id)
      VALUES (p.projeto_id, p.empresa, p.categoria, p.cliente, 10, rrid);
    EXCEPTION WHEN raise_exception THEN barrou := true; END;
    ASSERT barrou, 'recebimentos: criou pedido para requisicao atendida';
  END IF;
END $$;

ROLLBACK;
\echo OK requisicao_atendida
