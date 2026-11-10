-- Desfaz 2026-11-10_extrato_varias_contas.sql: volta o indice unico (1 conta por linha do extrato).
-- Falha de proposito se alguma linha ja tiver 2+ contas: desvincule esses grupos antes (ou o CREATE UNIQUE INDEX aborta).
BEGIN;

DROP INDEX IF EXISTS public.controle_pagamentos_extrato_lancamento_idx;
DROP INDEX IF EXISTS public.controle_recebimento_extrato_lancamento_idx;

CREATE UNIQUE INDEX controle_pagamentos_extrato_lancamento_uniq
  ON public.controle_pagamentos (extrato_lancamento_id) WHERE extrato_lancamento_id IS NOT NULL;
CREATE UNIQUE INDEX controle_recebimento_extrato_lancamento_uniq
  ON public.controle_recebimento (extrato_lancamento_id) WHERE extrato_lancamento_id IS NOT NULL;

COMMIT;
