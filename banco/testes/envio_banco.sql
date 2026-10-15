-- Teste do trigger marcar_envio_banco. Rodar SOMENTE no banco de TESTE, depois de 2026-10-15_envio_banco.sql.
-- Tudo dentro de uma transacao que termina em ROLLBACK: nao deixa dados.
-- Uso: psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f banco/testes/envio_banco.sql
BEGIN;

DO $$
DECLARE
  a integer; b integer; c integer;
  em timestamptz; arq text;
BEGIN
  INSERT INTO controle_pagamentos (valor_pagar, status_pagamento) VALUES (100, 1) RETURNING id INTO a;
  INSERT INTO controle_pagamentos (valor_pagar, status_pagamento) VALUES (200, 1) RETURNING id INTO b;
  INSERT INTO controle_pagamentos (valor_pagar, status_pagamento) VALUES (300, 1) RETURNING id INTO c;

  -- 1. pagamento novo nao tem envio
  SELECT enviado_banco_em, remessa_arquivo INTO em, arq FROM controle_pagamentos WHERE id = a;
  IF em IS NOT NULL OR arq IS NOT NULL THEN RAISE EXCEPTION 'FALHA: pagamento novo ja veio com envio'; END IF;
  RAISE NOTICE 'OK  1. pagamento novo nasce sem envio';

  -- 2. 1 -> 2 sem arquivo = manual (data preenchida, arquivo nulo)
  UPDATE controle_pagamentos SET status_pagamento = 2 WHERE id = a;
  SELECT enviado_banco_em, remessa_arquivo INTO em, arq FROM controle_pagamentos WHERE id = a;
  IF em IS NULL THEN RAISE EXCEPTION 'FALHA: envio manual sem data'; END IF;
  IF arq IS NOT NULL THEN RAISE EXCEPTION 'FALHA: envio manual veio com arquivo (%)', arq; END IF;
  RAISE NOTICE 'OK  2. 1->2 manual grava a data e deixa o arquivo nulo';

  -- 3. 1 -> 2 junto com o arquivo (como a rota de remessa faz) = remessa
  UPDATE controle_pagamentos SET status_pagamento = 2, remessa_arquivo = 'CI240_001_0000001.rem' WHERE id = b;
  SELECT enviado_banco_em, remessa_arquivo INTO em, arq FROM controle_pagamentos WHERE id = b;
  IF em IS NULL OR arq <> 'CI240_001_0000001.rem' THEN RAISE EXCEPTION 'FALHA: remessa nao gravou data/arquivo (%, %)', em, arq; END IF;
  RAISE NOTICE 'OK  3. 1->2 com arquivo grava data e nome da remessa';

  -- 4. reaplicar status 2 (lote em quem ja esta no 2) nao mexe na data nem na origem
  SELECT enviado_banco_em INTO em FROM controle_pagamentos WHERE id = b;
  UPDATE controle_pagamentos SET status_pagamento = 2 WHERE id = b;
  IF (SELECT enviado_banco_em FROM controle_pagamentos WHERE id = b) <> em
     OR (SELECT remessa_arquivo FROM controle_pagamentos WHERE id = b) IS NULL THEN
    RAISE EXCEPTION 'FALHA: reaplicar status 2 alterou o envio';
  END IF;
  RAISE NOTICE 'OK  4. reaplicar o status 2 preserva data e origem';

  -- 5. 2 -> 3 (retorno) preserva o envio
  UPDATE controle_pagamentos SET status_pagamento = 3 WHERE id = b;
  SELECT enviado_banco_em, remessa_arquivo INTO em, arq FROM controle_pagamentos WHERE id = b;
  IF em IS NULL OR arq IS NULL THEN RAISE EXCEPTION 'FALHA: virar Pago apagou o envio'; END IF;
  RAISE NOTICE 'OK  5. 2->3 (Pago) preserva o envio';

  -- 6. 3 -> 2 manual: nao herda o arquivo da remessa antiga
  UPDATE controle_pagamentos SET status_pagamento = 2 WHERE id = b;
  SELECT remessa_arquivo INTO arq FROM controle_pagamentos WHERE id = b;
  IF arq IS NOT NULL THEN RAISE EXCEPTION 'FALHA: 3->2 manual herdou o arquivo antigo (%)', arq; END IF;
  RAISE NOTICE 'OK  6. 3->2 manual vira manual (nao herda arquivo antigo)';

  -- 7. voltar para 1 limpa tudo
  UPDATE controle_pagamentos SET status_pagamento = 1 WHERE id = a;
  SELECT enviado_banco_em, remessa_arquivo INTO em, arq FROM controle_pagamentos WHERE id = a;
  IF em IS NOT NULL OR arq IS NOT NULL THEN RAISE EXCEPTION 'FALHA: voltar para A Pagar nao limpou o envio'; END IF;
  RAISE NOTICE 'OK  7. voltar para 1 limpa data e arquivo';

  -- 8. editar outras colunas nao dispara nada
  UPDATE controle_pagamentos SET valor_pagar = 350 WHERE id = c;
  IF (SELECT enviado_banco_em FROM controle_pagamentos WHERE id = c) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: editar valor marcou envio';
  END IF;
  RAISE NOTICE 'OK  8. editar outros campos nao marca envio';
END $$;

ROLLBACK;
