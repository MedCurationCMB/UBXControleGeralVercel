-- Vinculo entre contas a pagar/receber e linhas do extrato bancario (1 linha do extrato <-> 1 conta).
-- Saida (valor < 0) vincula em controle_pagamentos; entrada (valor > 0) em controle_recebimento.
-- O indice unico parcial garante que uma linha do extrato so seja usada por uma conta.
-- RLS: as policies rls_projeto existentes ja cobrem a coluna nova.

ALTER TABLE public.controle_pagamentos
  ADD COLUMN extrato_lancamento_id integer REFERENCES public.extratos_bancarios_lancamentos(id) ON DELETE SET NULL;
ALTER TABLE public.controle_recebimento
  ADD COLUMN extrato_lancamento_id integer REFERENCES public.extratos_bancarios_lancamentos(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX controle_pagamentos_extrato_lancamento_uniq
  ON public.controle_pagamentos (extrato_lancamento_id) WHERE extrato_lancamento_id IS NOT NULL;
CREATE UNIQUE INDEX controle_recebimento_extrato_lancamento_uniq
  ON public.controle_recebimento (extrato_lancamento_id) WHERE extrato_lancamento_id IS NOT NULL;
