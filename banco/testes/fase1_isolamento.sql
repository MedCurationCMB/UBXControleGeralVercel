-- Teste da fase 1 (multi-projeto). Rodar SOMENTE no banco de TESTE, depois de 2026-09-25_multi_projeto_fase1.sql.
-- Tudo dentro de uma transacao que termina em ROLLBACK: nao deixa dados.
-- Uso: psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f banco/testes/fase1_isolamento.sql
BEGIN;

DO $$
DECLARE
  n integer; v numeric; ok boolean;
  ped1 bigint; ped2 bigint;
BEGIN
  INSERT INTO projetos (id, nome) VALUES (2, 'PROJETO DEV');

  -- 1. mesmos nomes em projetos diferentes; repetido no mesmo projeto falha
  INSERT INTO empresas (projeto_id, empresa) VALUES (1, 'ZZ EMPRESA'), (2, 'ZZ EMPRESA');
  BEGIN
    INSERT INTO empresas (projeto_id, empresa) VALUES (2, 'ZZ EMPRESA');
    RAISE EXCEPTION 'FALHA: empresa repetida no mesmo projeto foi aceita';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  RAISE NOTICE 'OK  1. mesmo nome em projetos diferentes; repetido no mesmo projeto e recusado';

  INSERT INTO categorias (projeto_id, empresa, categoria) VALUES (1, 'ZZ EMPRESA', 'ZZ CAT'), (2, 'ZZ EMPRESA', 'ZZ CAT'), (2, 'ZZ EMPRESA', 'SO NO DEV');
  INSERT INTO fornecedores (projeto_id, nome) VALUES (1, 'ZZ FORN'), (2, 'ZZ FORN');

  -- 2. orcamento: cada projeto cria e soma o seu
  INSERT INTO orcamentos_usuarios (projeto_id, empresa, categoria, mes, ano, valor_orcamento) VALUES (1, 'ZZ EMPRESA', 'ZZ CAT', 1, 2031, 2000);
  INSERT INTO orcamentos_usuarios (projeto_id, empresa, categoria, mes, ano, valor_orcamento) VALUES (2, 'ZZ EMPRESA', 'ZZ CAT', 1, 2031, 1000);
  SELECT count(*) INTO n FROM controle_orcamento WHERE empresa = 'ZZ EMPRESA' AND ano = 2031;
  IF n <> 2 THEN RAISE EXCEPTION 'FALHA: esperava 2 linhas de controle_orcamento (1 por projeto), veio %', n; END IF;
  SELECT valor_orcamento INTO v FROM controle_orcamento WHERE empresa = 'ZZ EMPRESA' AND ano = 2031 AND projeto_id = 2;
  IF v <> 1000 THEN RAISE EXCEPTION 'FALHA: orcamento do projeto 2 = %, esperado 1000', v; END IF;
  RAISE NOTICE 'OK  2. orcamento por projeto (2 linhas separadas, valores corretos)';

  -- 3. pedido no projeto 2; o cronograma nao informa projeto_id e herda do pedido
  INSERT INTO pedidos_solicitados (projeto_id, empresa, categoria, fornecedor, valor_pedido) VALUES (2, 'ZZ EMPRESA', 'ZZ CAT', 'ZZ FORN', 300) RETURNING id INTO ped2;
  INSERT INTO pedidos_solicitados_fluxo (pedido_id, empresa, categoria, fornecedor, mes, ano, valor_referente) VALUES (ped2, 'ZZ EMPRESA', 'ZZ CAT', 'ZZ FORN', 1, 2031, 300);
  SELECT projeto_id INTO n FROM pedidos_solicitados_fluxo WHERE pedido_id = ped2;
  IF n <> 2 THEN RAISE EXCEPTION 'FALHA: cronograma nao herdou o projeto do pedido (veio %)', n; END IF;
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento WHERE empresa = 'ZZ EMPRESA' AND ano = 2031 AND projeto_id = 2;
  IF v <> 300 THEN RAISE EXCEPTION 'FALHA: consumo do projeto 2 = %, esperado 300', v; END IF;
  SELECT valor_pedidos_solicitados INTO v FROM controle_orcamento WHERE empresa = 'ZZ EMPRESA' AND ano = 2031 AND projeto_id = 1;
  IF v <> 0 THEN RAISE EXCEPTION 'FALHA: consumo do projeto 1 = % (deveria ficar 0, o pedido e do projeto 2)', v; END IF;
  RAISE NOTICE 'OK  3. cronograma herda o projeto; consumo soma so no projeto do pedido (2=300, 1=0)';

  -- 4. chave estrangeira nao cruza projetos
  BEGIN
    INSERT INTO pedidos_solicitados (projeto_id, empresa, categoria, fornecedor, valor_pedido) VALUES (1, 'ZZ EMPRESA', 'SO NO DEV', 'ZZ FORN', 10);
    RAISE EXCEPTION 'FALHA: pedido do projeto 1 usou categoria que so existe no projeto 2';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO pedidos_solicitados (projeto_id, empresa, categoria, fornecedor, valor_pedido) VALUES (1, 'ZZ EMPRESA', 'ZZ CAT', 'FORNECEDOR INEXISTENTE NO 1', 10);
    RAISE EXCEPTION 'FALHA: fornecedor inexistente no projeto foi aceito';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  RAISE NOTICE 'OK  4. categoria/fornecedor de outro projeto e recusado pela chave estrangeira';

  -- 5. trava de parcelas le a configuracao do projeto do pedido
  INSERT INTO config (projeto_id, chave, valor) VALUES (2, 'fluxo_sistema', '3');
  INSERT INTO controle_pagamentos (pedido_id, valor_pagar, status_pagamento) VALUES (ped2, 500, 1);  -- fluxo 3 no projeto 2: permitido
  INSERT INTO pedidos_solicitados (projeto_id, empresa, categoria, fornecedor, valor_pedido) VALUES (1, 'ZZ EMPRESA', 'ZZ CAT', 'ZZ FORN', 300) RETURNING id INTO ped1;
  BEGIN
    INSERT INTO controle_pagamentos (pedido_id, valor_pagar, status_pagamento) VALUES (ped1, 500, 1);  -- fluxo 1 no projeto 1: bloqueado
    RAISE EXCEPTION 'FALHA: parcela acima do valor foi aceita no projeto 1';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Soma das parcelas%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'OK  5. trava de parcelas usa a config do projeto (projeto 2 fluxo 3 libera; projeto 1 fluxo 1 bloqueia)';

  -- 6. cabecalho x-projeto-id define o projeto padrao; texto vazio nao quebra
  PERFORM set_config('request.headers', '{"x-projeto-id":"2"}', true);
  INSERT INTO empresas (empresa) VALUES ('ZZ VIA CABECALHO');
  SELECT projeto_id INTO n FROM empresas WHERE empresa = 'ZZ VIA CABECALHO';
  IF n <> 2 THEN RAISE EXCEPTION 'FALHA: insert com cabecalho 2 caiu no projeto %', n; END IF;
  SELECT count(*) INTO n FROM pedidos_solicitados_valores_distintos('empresa') WHERE valor = 'ZZ EMPRESA';
  IF n <> 1 THEN RAISE EXCEPTION 'FALHA: valores_distintos com cabecalho 2 nao achou a empresa do projeto 2'; END IF;
  PERFORM set_config('request.headers', '', true);
  INSERT INTO empresas (empresa) VALUES ('ZZ SEM CABECALHO');
  SELECT projeto_id INTO n FROM empresas WHERE empresa = 'ZZ SEM CABECALHO';
  IF n <> 1 THEN RAISE EXCEPTION 'FALHA: sem cabecalho deveria cair no projeto 1, caiu no %', n; END IF;
  RAISE NOTICE 'OK  6. cabecalho define o projeto; sem cabecalho (ou vazio) cai no UBX';

  -- 6b. (fase 1b) controle e documentos herdam o projeto do pedido; documento sem pedido usa o padrao/cabecalho
  SELECT projeto_id INTO n FROM controle_pagamentos WHERE pedido_id = ped2 LIMIT 1;
  IF n <> 2 THEN RAISE EXCEPTION 'FALHA: controle_pagamentos nao herdou o projeto do pedido (veio %)', n; END IF;
  PERFORM set_config('request.headers', '{"x-projeto-id":"2"}', true);
  INSERT INTO documentos (tipo_documento, nome_documento, anexo_id, usuario) VALUES (-3, 'ZZ remessa', 'zz', 'teste') RETURNING projeto_id INTO n;
  IF n <> 2 THEN RAISE EXCEPTION 'FALHA: documento sem pedido deveria seguir o cabecalho (2), veio %', n; END IF;
  PERFORM set_config('request.headers', '', true);
  RAISE NOTICE 'OK  6b. controle e documentos herdam o projeto do pedido; documento sem pedido segue o cabecalho';

  -- 7. usuarios atuais estao todos vinculados ao UBX
  SELECT count(*) INTO n FROM usuarios u WHERE NOT EXISTS (SELECT 1 FROM usuarios_projetos up WHERE up.usuario_id = u.id AND up.projeto_id = 1);
  IF n <> 0 THEN RAISE EXCEPTION 'FALHA: % usuario(s) sem vinculo com o UBX', n; END IF;
  RAISE NOTICE 'OK  7. todos os usuarios estao vinculados ao UBX';
END $$;

ROLLBACK;
