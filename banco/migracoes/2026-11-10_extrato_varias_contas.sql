-- Varias contas numa mesma linha do extrato (folha por colaborador, rateio por centro de resultado, notas somadas num recebimento).
-- A coluna extrato_lancamento_id ja e da conta; o que barrava era o indice unico. Vira indice comum (continua servindo a consulta por linha).
-- A conferencia "a soma das contas fecha com o valor da linha" fica no servidor (src/app/api/extratos-bancarios/vinculos).
-- Nenhum dado muda: os vinculos 1 para 1 existentes continuam validos.
-- Para desfazer: 2026-11-10_extrato_varias_contas_reverter.sql.
BEGIN;

DROP INDEX IF EXISTS public.controle_pagamentos_extrato_lancamento_uniq;
DROP INDEX IF EXISTS public.controle_recebimento_extrato_lancamento_uniq;

CREATE INDEX IF NOT EXISTS controle_pagamentos_extrato_lancamento_idx
  ON public.controle_pagamentos (extrato_lancamento_id) WHERE extrato_lancamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS controle_recebimento_extrato_lancamento_idx
  ON public.controle_recebimento (extrato_lancamento_id) WHERE extrato_lancamento_id IS NOT NULL;

COMMIT;
