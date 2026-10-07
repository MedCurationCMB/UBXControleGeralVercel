-- Verifica a view atrasados_resumo (migracao 2026-10-07_atrasados_resumo.sql). Transacao revertida; falha com ASSERT.
-- Uso (somente no banco de TESTE): psql "$TEST_DATABASE_URL" -f banco/testes/atrasados_resumo.sql
\set ON_ERROR_STOP on
BEGIN;
\i banco/migracoes/2026-10-07_atrasados_resumo.sql

DO $$
DECLARE r record; esperado int; hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  -- contagem confere com a regra escrita por fora da view
  SELECT COUNT(*) INTO esperado FROM controle_pagamentos
   WHERE data_vencimento < hoje AND (valor_pagamento IS NULL OR valor_pagar IS NULL OR valor_pagamento < valor_pagar);
  SELECT * INTO r FROM atrasados_resumo WHERE modulo = 'pagamentos';
  ASSERT r.qtd = esperado, format('pagamentos: view %s, esperado %s', r.qtd, esperado);

  -- conta vencida e quitada nao entra; vencida e paga so em parte entra pelo que falta
  INSERT INTO controle_pagamentos (projeto_id, data_vencimento, valor_pagar, valor_pagamento)
  SELECT projeto_id, hoje - 1, 100, 100 FROM controle_pagamentos LIMIT 1;
  INSERT INTO controle_pagamentos (projeto_id, data_vencimento, valor_pagar, valor_pagamento)
  SELECT projeto_id, hoje - 1, 100, 40 FROM controle_pagamentos LIMIT 1;
  INSERT INTO controle_pagamentos (projeto_id, data_vencimento, valor_pagar)
  SELECT projeto_id, hoje, 100 FROM controle_pagamentos LIMIT 1;  -- vence hoje: nao e atraso
  SELECT * INTO r FROM atrasados_resumo WHERE modulo = 'pagamentos';
  ASSERT r.qtd = esperado + 1, format('pagamentos apos inserts: %s, esperado %s', r.qtd, esperado + 1);
END $$;

ROLLBACK;
\echo OK atrasados_resumo
