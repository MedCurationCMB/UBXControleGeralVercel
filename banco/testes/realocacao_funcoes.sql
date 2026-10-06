-- Verifica as funcoes de realocacao (migracao 2026-10-06_realocacao_funcoes.sql). Transacao revertida; falha com ASSERT.
-- Cria os proprios dados (categoria ZZ_TESTE, orcamento em 2040, pedidos de teste). Precisa de >= 3 empresas e 2 fornecedores/1 cliente no projeto 1.
-- Uso (somente no banco de TESTE): psql "$TEST_DATABASE_URL" -f banco/testes/realocacao_funcoes.sql
\set ON_ERROR_STOP on
BEGIN;

-- consumo do orcamento (pagamentos/recebimentos) e soma do fluxo de um pedido por centro/mes
CREATE FUNCTION pg_temp.cons(p_rec boolean, p_emp text, p_mes int) RETURNS numeric LANGUAGE plpgsql AS $f$
DECLARE v numeric;
BEGIN
  EXECUTE format('SELECT valor_pedidos_solicitados FROM %I WHERE projeto_id = 1 AND empresa = $1 AND categoria = ''ZZ_TESTE'' AND mes = $2 AND ano = 2040',
                 CASE WHEN p_rec THEN 'controle_orcamento_receita' ELSE 'controle_orcamento' END) INTO v USING p_emp, p_mes;
  RETURN v;
END $f$;
CREATE FUNCTION pg_temp.fx(p_ped bigint, p_emp text, p_mes int) RETURNS numeric LANGUAGE sql AS $f$
  SELECT coalesce(sum(valor_referente), 0) FROM pedidos_solicitados_fluxo WHERE pedido_id = p_ped AND empresa = p_emp AND (p_mes IS NULL OR mes = p_mes)
$f$;
CREATE FUNCTION pg_temp.dep(p_r jsonb, p_emp text, p_mes int) RETURNS numeric LANGUAGE sql AS $f$
  SELECT coalesce(sum((x->>'valor')::numeric), 0) FROM jsonb_array_elements(p_r->'depois') x
   WHERE x->>'empresa' = p_emp AND (p_mes IS NULL OR (x->>'mes')::int = p_mes)
$f$;
CREATE FUNCTION pg_temp.erro(p_sql text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN EXECUTE p_sql; RETURN NULL; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM; END $f$;

DO $$
DECLARE
  e1 text; e2 text; e3 text; f1 text; f2 text; c1 text; cat text := 'ZZ_TESTE';
  ped bigint; ped0 bigint; pedr bigint; r jsonb; rid bigint; v numeric; msg text; st text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"usuario_id":1}', true);   -- usuario 1 = owner
  PERFORM set_config('request.headers', '{"x-projeto-id":"1"}', true);
  SELECT empresa INTO e1 FROM empresas WHERE projeto_id = 1 ORDER BY empresa OFFSET 0 LIMIT 1;
  SELECT empresa INTO e2 FROM empresas WHERE projeto_id = 1 ORDER BY empresa OFFSET 1 LIMIT 1;
  SELECT empresa INTO e3 FROM empresas WHERE projeto_id = 1 ORDER BY empresa OFFSET 2 LIMIT 1;
  SELECT nome INTO f1 FROM fornecedores WHERE projeto_id = 1 ORDER BY nome OFFSET 0 LIMIT 1;
  SELECT nome INTO f2 FROM fornecedores WHERE projeto_id = 1 ORDER BY nome OFFSET 1 LIMIT 1;
  SELECT nome INTO c1 FROM clientes WHERE projeto_id = 1 ORDER BY nome LIMIT 1;
  ASSERT e3 IS NOT NULL AND f2 IS NOT NULL AND c1 IS NOT NULL, 'sem massa de teste (3 empresas, 2 fornecedores, 1 cliente)';

  -- categoria so em e1 e e2 (e3 fica sem, para o teste de "centro sem a categoria"); orcamento 2040 meses 1 e 2
  INSERT INTO categorias (empresa, categoria, projeto_id) VALUES (e1, cat, 1), (e2, cat, 1);
  INSERT INTO controle_orcamento (empresa, categoria, mes, ano, valor_orcamento, projeto_id)
    VALUES (e1, cat, 1, 2040, 5000, 1), (e1, cat, 2, 2040, 5000, 1), (e2, cat, 1, 2040, 5000, 1), (e2, cat, 2, 2040, 5000, 1);
  UPDATE config SET valor = '1' WHERE projeto_id = 1 AND chave = 'fluxo_sistema';

  -- pedido de R$ 1.500: mes 1 = 700 (f1) + 300 (f2); mes 2 = 500 (f1)
  INSERT INTO pedidos_solicitados (empresa, categoria, fornecedor, valor_pedido, status, projeto_id, usuario_solicitante)
    VALUES (e1, cat, f1, 1500, 'Autorizado', 1, 'teste') RETURNING id INTO ped;
  INSERT INTO pedidos_solicitados_fluxo (pedido_id, projeto_id, empresa, categoria, fornecedor, fornecedor_beneficiario, mes, ano, valor_referente, status) VALUES
    (ped, 1, e1, cat, f1, f1, 1, 2040, 700, 'Autorizado'), (ped, 1, e1, cat, f1, f2, 1, 2040, 300, 'Autorizado'), (ped, 1, e1, cat, f1, f1, 2, 2040, 500, 'Autorizado');
  ASSERT pg_temp.cons(false, e1, 1) = 1000 AND pg_temp.cons(false, e1, 2) = 500, 'montagem: consumo inicial';

  -- 1) simulacao 60/40: nada e gravado; cascata de beneficiarios (mes 1: f1 700 -> e1 600 + e2 100; f2 300 -> e2 300)
  r := realocacao_solicitar('pagamentos', ped, 'percentual', jsonb_build_array(jsonb_build_object('empresa', e1, 'percentual', 60), jsonb_build_object('empresa', e2, 'percentual', 40)), 'teste', NULL, true);
  ASSERT (r->>'ok')::boolean AND (r->>'simulado')::boolean AND NOT (r->>'direta')::boolean, 'simulacao 60/40 deveria ser ok e nao direta: ' || r::text;
  ASSERT pg_temp.dep(r, e1, 1) = 600 AND pg_temp.dep(r, e2, 1) = 400 AND pg_temp.dep(r, e1, 2) = 300 AND pg_temp.dep(r, e2, 2) = 200, 'rateio 60/40 por mes: ' || (r->'depois')::text;
  ASSERT (SELECT sum((x->>'valor')::numeric) FROM jsonb_array_elements(r->'depois') x WHERE x->>'beneficiario' = f2) = 300, 'beneficiario f2 deveria manter 300';
  ASSERT (SELECT count(*) FROM realocacoes WHERE pedido_id = ped) = 0 AND pg_temp.cons(false, e2, 1) = 0, 'simulacao nao pode gravar nem reservar';

  -- 2) arredondamento: 33,33/66,67 fecha exato (mes 1 = 1000 -> 333,30 + 666,70; mes 2 = 500 -> 166,65 + 333,35)
  r := realocacao_solicitar('pagamentos', ped, 'percentual', jsonb_build_array(jsonb_build_object('empresa', e1, 'percentual', 33.33), jsonb_build_object('empresa', e2, 'percentual', 66.67)), 'teste', NULL, true);
  ASSERT pg_temp.dep(r, e1, 1) = 333.30 AND pg_temp.dep(r, e2, 1) = 666.70 AND pg_temp.dep(r, e1, 2) = 166.65 AND pg_temp.dep(r, e2, 2) = 333.35, 'arredondamento: ' || (r->'depois')::text;
  ASSERT pg_temp.dep(r, e1, NULL) + pg_temp.dep(r, e2, NULL) = 1500, 'total tem que fechar 1500';

  -- 3) Fluxo 1 sem saldo/orcamento: bloqueia e lista TODOS os pontos
  UPDATE controle_orcamento SET valor_orcamento = 100 WHERE projeto_id = 1 AND empresa = e2 AND categoria = cat AND mes = 1 AND ano = 2040;
  DELETE FROM controle_orcamento WHERE projeto_id = 1 AND empresa = e2 AND categoria = cat AND mes = 2 AND ano = 2040;
  r := realocacao_solicitar('pagamentos', ped, 'percentual', jsonb_build_array(jsonb_build_object('empresa', e1, 'percentual', 60), jsonb_build_object('empresa', e2, 'percentual', 40)), 'teste');
  ASSERT NOT (r->>'ok')::boolean, 'sem saldo deveria bloquear';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'problemas') p WHERE p->>'tipo' = 'sem_saldo' AND p->>'empresa' = e2 AND (p->>'mes')::int = 1
                   AND (p->>'disponivel')::numeric = 100 AND (p->>'necessario')::numeric = 400 AND (p->>'falta')::numeric = 300), 'faltou o problema de saldo: ' || (r->'problemas')::text;
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'problemas') p WHERE p->>'tipo' = 'sem_orcamento' AND p->>'empresa' = e2 AND (p->>'mes')::int = 2), 'faltou o problema de orcamento';
  ASSERT (SELECT count(*) FROM realocacoes WHERE pedido_id = ped) = 0, 'bloqueado nao pode gravar';

  -- 4) Fluxo 2: o mesmo caso so avisa (e reserva); recusar libera
  UPDATE config SET valor = '2' WHERE projeto_id = 1 AND chave = 'fluxo_sistema';
  r := realocacao_solicitar('pagamentos', ped, 'percentual', jsonb_build_array(jsonb_build_object('empresa', e1, 'percentual', 60), jsonb_build_object('empresa', e2, 'percentual', 40)), 'teste');
  ASSERT (r->>'ok')::boolean AND jsonb_array_length(r->'avisos') = 2 AND jsonb_array_length(r->'problemas') = 0, 'fluxo 2 deveria so avisar (saldo e orcamento): ' || r::text;
  rid := (r->>'realocacao_id')::bigint;
  PERFORM realocacao_recusar(rid, 'admin', 'teste de recusa');
  ASSERT (SELECT status || '|' || motivo_recusa FROM realocacoes WHERE id = rid) = 'Recusada|teste de recusa', 'recusa nao gravou';
  ASSERT pg_temp.cons(false, e2, 1) = 0, 'recusada deveria liberar a reserva';
  UPDATE config SET valor = '1' WHERE projeto_id = 1 AND chave = 'fluxo_sistema';
  UPDATE controle_orcamento SET valor_orcamento = 5000 WHERE projeto_id = 1 AND empresa = e2 AND categoria = cat AND mes = 1 AND ano = 2040;
  INSERT INTO controle_orcamento (empresa, categoria, mes, ano, valor_orcamento, projeto_id) VALUES (e2, cat, 2, 2040, 5000, 1);

  -- 5) centro de destino sem a categoria bloqueia em qualquer fluxo
  r := realocacao_solicitar('pagamentos', ped, 'percentual', jsonb_build_array(jsonb_build_object('empresa', e1, 'percentual', 50), jsonb_build_object('empresa', e3, 'percentual', 50)), 'teste', NULL, true);
  ASSERT NOT (r->>'ok')::boolean AND EXISTS (SELECT 1 FROM jsonb_array_elements(r->'problemas') p WHERE p->>'tipo' = 'sem_categoria' AND p->>'empresa' = e3), 'sem_categoria: ' || r::text;

  -- 6) solicitar de verdade (Fluxo 1): saldo fica reservado so no destino; a segunda pendente do pedido e barrada
  r := realocacao_solicitar('pagamentos', ped, 'percentual', jsonb_build_array(jsonb_build_object('empresa', e1, 'percentual', 60), jsonb_build_object('empresa', e2, 'percentual', 40)), 'teste');
  ASSERT (r->>'ok')::boolean AND r->>'realocacao_id' IS NOT NULL, 'solicitar falhou: ' || r::text;
  rid := (r->>'realocacao_id')::bigint;
  ASSERT pg_temp.cons(false, e2, 1) = 400 AND pg_temp.cons(false, e2, 2) = 200, 'reserva no destino';
  ASSERT pg_temp.cons(false, e1, 1) = 1000 AND pg_temp.cons(false, e1, 2) = 500, 'origem so libera ao aplicar';
  msg := pg_temp.erro(format($q$SELECT realocacao_solicitar('pagamentos', %s, 'percentual', '[{"empresa":"%s","percentual":50},{"empresa":"%s","percentual":50}]', 'teste')$q$, ped, e1, e2));
  ASSERT msg LIKE '%aguardando autoriza%', 'segunda pendente deveria ser barrada: ' || coalesce(msg, 'sem erro');

  -- 7) quem nao e administrador nao autoriza
  PERFORM set_config('request.jwt.claims', '{"usuario_id":6}', true);
  msg := pg_temp.erro(format('SELECT realocacao_autorizar(%s, ''x'')', rid));
  ASSERT msg LIKE 'Somente administrador%', 'nao-admin deveria ser barrado: ' || coalesce(msg, 'sem erro');
  PERFORM set_config('request.jwt.claims', '{"usuario_id":1}', true);

  -- 8) pedido que mudou depois da solicitacao nao pode ser autorizado
  UPDATE pedidos_solicitados_fluxo SET valor_referente = 701 WHERE pedido_id = ped AND mes = 1 AND fornecedor_beneficiario = f1;
  msg := pg_temp.erro(format('SELECT realocacao_autorizar(%s, ''admin'')', rid));
  ASSERT msg LIKE 'O pedido mudou%', 'pedido alterado deveria ser barrado: ' || coalesce(msg, 'sem erro');
  UPDATE pedidos_solicitados_fluxo SET valor_referente = 700 WHERE pedido_id = ped AND mes = 1 AND fornecedor_beneficiario = f1;

  -- 9) autorizar: troca as linhas, sem contar em dobro, historico gravado, cabecalho no centro de maior valor
  PERFORM realocacao_autorizar(rid, 'admin');
  ASSERT pg_temp.fx(ped, e1, 1) = 600 AND pg_temp.fx(ped, e2, 1) = 400 AND pg_temp.fx(ped, e1, 2) = 300 AND pg_temp.fx(ped, e2, 2) = 200, 'linhas do fluxo apos autorizar';
  ASSERT (SELECT sum(valor_referente) FROM pedidos_solicitados_fluxo WHERE pedido_id = ped) = 1500, 'total do fluxo';
  ASSERT (SELECT sum(valor_referente) FROM pedidos_solicitados_fluxo WHERE pedido_id = ped AND fornecedor_beneficiario = f2) = 300, 'beneficiario f2';
  ASSERT pg_temp.cons(false, e1, 1) = 600 AND pg_temp.cons(false, e2, 1) = 400 AND pg_temp.cons(false, e2, 2) = 200, 'consumo apos autorizar (sem reserva em dobro)';
  SELECT status || '|' || autorizador INTO msg FROM realocacoes WHERE id = rid;
  ASSERT msg = 'Autorizada|admin', 'status/autorizador: ' || msg;
  ASSERT (SELECT count(*) FROM realocacao_itens WHERE realocacao_id = rid AND lado = 'antes') = 3, 'historico: antes';
  ASSERT (SELECT empresa FROM pedidos_solicitados WHERE id = ped) = e1, 'cabecalho deveria ir para o centro de maior valor';
  msg := pg_temp.erro(format('SELECT realocacao_autorizar(%s, ''admin'')', rid));
  ASSERT msg LIKE 'Esta realoca%decidida%', 'autorizar duas vezes deveria ser barrado';

  -- 10) por valor, so o mes 1 muda (agora ja realocado: parte da distribuicao vigente)
  r := realocacao_solicitar('pagamentos', ped, 'valor', jsonb_build_array(
         jsonb_build_object('empresa', e2, 'mes', 1, 'ano', 2040, 'valor', 1000), jsonb_build_object('empresa', e1, 'mes', 2, 'ano', 2040, 'valor', 500)), 'teste');
  ASSERT (r->>'ok')::boolean, 'por valor: ' || r::text;
  ASSERT pg_temp.cons(false, e2, 1) = 400 + 600, 'reserva por valor = so o que entra a mais (1000 - 400)';
  PERFORM realocacao_recusar((r->>'realocacao_id')::bigint, 'admin');
  ASSERT pg_temp.cons(false, e2, 1) = 400, 'recusar libera';
  msg := pg_temp.erro(format($q$SELECT realocacao_solicitar('pagamentos', %s, 'valor', '[{"empresa":"%s","mes":1,"ano":2040,"valor":900},{"empresa":"%s","mes":2,"ano":2040,"valor":500}]', 'teste')$q$, ped, e2, e1));
  ASSERT msg LIKE '%n_o fecham%01/2040%', 'soma que nao fecha deveria ser barrada: ' || coalesce(msg, 'sem erro');
  msg := pg_temp.erro(format($q$SELECT realocacao_solicitar('pagamentos', %s, 'percentual', '[{"empresa":"%s","percentual":60},{"empresa":"%s","percentual":30}]', 'teste')$q$, ped, e1, e2));
  ASSERT msg LIKE 'A soma dos percentuais%', 'percentual que nao fecha 100 deveria ser barrado';

  -- 11) Fluxo 3: direto, sem autorizacao e sem checar saldo (mesmo com o destino estourado)
  UPDATE config SET valor = '3' WHERE projeto_id = 1 AND chave = 'fluxo_sistema';
  UPDATE controle_orcamento SET valor_orcamento = 1 WHERE projeto_id = 1 AND empresa = e2 AND categoria = cat AND ano = 2040;
  r := realocacao_solicitar('pagamentos', ped, 'percentual', jsonb_build_array(jsonb_build_object('empresa', e1, 'percentual', 50), jsonb_build_object('empresa', e2, 'percentual', 50)), 'teste');
  ASSERT (r->>'ok')::boolean AND (r->>'direta')::boolean, 'fluxo 3 deveria ser direto: ' || r::text;
  ASSERT (SELECT status || '|' || coalesce(autorizador, 'nulo') FROM realocacoes WHERE id = (r->>'realocacao_id')::bigint) = 'Autorizada|nulo', 'direta: status';
  ASSERT pg_temp.fx(ped, e1, 1) = 500 AND pg_temp.fx(ped, e2, 1) = 500, 'direta: linhas trocadas na hora';

  -- 12) Fluxo 3 sem linhas por mes: rateio so do total, 2a realocacao parte da 1a
  INSERT INTO pedidos_solicitados (empresa, categoria, fornecedor, valor_pedido, status, projeto_id, usuario_solicitante)
    VALUES (e1, cat, f1, 1000, 'Autorizado', 1, 'teste') RETURNING id INTO ped0;
  r := realocacao_solicitar('pagamentos', ped0, 'percentual', jsonb_build_array(jsonb_build_object('empresa', e1, 'percentual', 70), jsonb_build_object('empresa', e2, 'percentual', 30)), 'teste');
  ASSERT (r->>'ok')::boolean AND (r->>'direta')::boolean AND NOT (r->>'periodo')::boolean, 'sem linhas: ' || r::text;
  ASSERT (SELECT count(*) FROM realocacao_itens WHERE realocacao_id = (r->>'realocacao_id')::bigint AND lado = 'depois' AND mes IS NULL) = 2, 'itens sem mes';
  r := realocacao_solicitar('pagamentos', ped0, 'valor', jsonb_build_array(jsonb_build_object('empresa', e1, 'valor', 500), jsonb_build_object('empresa', e2, 'valor', 500)), 'teste');
  ASSERT (SELECT sum(valor) FROM realocacao_itens WHERE realocacao_id = (r->>'realocacao_id')::bigint AND lado = 'antes' AND empresa = e1) = 700, '2a realocacao deveria partir da 1a (70/30)';
  msg := pg_temp.erro(format($q$SELECT realocacao_solicitar('pagamentos', %s, 'percentual', '[{"empresa":"%s","percentual":50},{"empresa":"%s","percentual":50}]', 'teste')$q$, ped0, e1, e2));
  ASSERT msg LIKE '%igual%atual%', 'distribuicao igual a atual deveria ser barrada: ' || coalesce(msg, 'sem erro');
  msg := pg_temp.erro(format($q$SELECT realocacao_solicitar('pagamentos', %s, 'valor', '[{"empresa":"%s","valor":400},{"empresa":"%s","valor":500}]', 'teste')$q$, ped0, e1, e2));
  ASSERT msg LIKE '%n_o fecham%', 'total que nao fecha deveria ser barrado: ' || coalesce(msg, 'sem erro');
  UPDATE pedidos_solicitados SET status = 'Aguardando Autorização' WHERE id = ped0;
  msg := pg_temp.erro(format($q$SELECT realocacao_solicitar('pagamentos', %s, 'percentual', '[{"empresa":"%s","percentual":100}]', 'teste')$q$, ped0, e2));
  ASSERT msg LIKE 'S_ _ poss_vel realocar pedido autorizado%', 'pedido nao autorizado deveria ser barrado: ' || coalesce(msg, 'sem erro');

  -- 13) recebimentos usam as tabelas e o orcamento de receita
  UPDATE config SET valor = '1' WHERE projeto_id = 1 AND chave = 'fluxo_sistema';
  INSERT INTO categorias_receita (empresa, categoria, projeto_id) VALUES (e1, cat, 1), (e2, cat, 1);
  INSERT INTO controle_orcamento_receita (empresa, categoria, mes, ano, valor_orcamento, projeto_id) VALUES (e1, cat, 1, 2040, 5000, 1), (e2, cat, 1, 2040, 5000, 1);
  INSERT INTO pedidos_solicitados_receita (empresa, categoria, cliente, valor_pedido, status, projeto_id, usuario_solicitante)
    VALUES (e1, cat, c1, 1000, 'Autorizado', 1, 'teste') RETURNING id INTO pedr;
  INSERT INTO pedidos_solicitados_fluxo_receita (pedido_id, projeto_id, empresa, categoria, cliente, cliente_beneficiario, mes, ano, valor_referente, status)
    VALUES (pedr, 1, e1, cat, c1, c1, 1, 2040, 1000, 'Autorizado');
  r := realocacao_solicitar('recebimentos', pedr, 'percentual', jsonb_build_array(jsonb_build_object('empresa', e1, 'percentual', 50), jsonb_build_object('empresa', e2, 'percentual', 50)), 'teste');
  ASSERT (r->>'ok')::boolean AND NOT (r->>'direta')::boolean, 'receita: ' || r::text;
  ASSERT pg_temp.cons(true, e2, 1) = 500 AND pg_temp.cons(true, e1, 1) = 1000, 'receita: reserva no destino';
  PERFORM realocacao_autorizar((r->>'realocacao_id')::bigint, 'admin');
  ASSERT pg_temp.cons(true, e1, 1) = 500 AND pg_temp.cons(true, e2, 1) = 500, 'receita: consumo apos autorizar';
  ASSERT (SELECT sum(valor_referente) FROM pedidos_solicitados_fluxo_receita WHERE pedido_id = pedr AND cliente_beneficiario = c1) = 1000, 'receita: beneficiario preservado';
END $$;

ROLLBACK;
\echo 'OK: realocacao_funcoes'
