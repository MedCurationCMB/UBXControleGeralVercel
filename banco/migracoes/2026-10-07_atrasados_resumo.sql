-- Resumo de contas atrasadas (pagar e receber) para a pagina inicial.
-- Mesma regra do Controle (getSituacao): vencimento anterior a hoje (Brasilia) e nao quitada (valor_pagamento < valor_pagar ou vazio).
-- security_invoker: respeita o RLS (projeto ativo) de quem consulta.
CREATE VIEW public.atrasados_resumo WITH (security_invoker = true) AS
SELECT 'pagamentos'::text AS modulo, COUNT(*)::int AS qtd,
       COALESCE(SUM(GREATEST(COALESCE(valor_pagar, 0) - COALESCE(valor_pagamento, 0), 0)), 0) AS valor
FROM public.controle_pagamentos
WHERE data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND NOT (valor_pagamento IS NOT NULL AND valor_pagar IS NOT NULL AND valor_pagamento >= valor_pagar)
UNION ALL
SELECT 'recebimentos', COUNT(*)::int,
       COALESCE(SUM(GREATEST(COALESCE(valor_pagar, 0) - COALESCE(valor_pagamento, 0), 0)), 0)
FROM public.controle_recebimento
WHERE data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND NOT (valor_pagamento IS NOT NULL AND valor_pagar IS NOT NULL AND valor_pagamento >= valor_pagar);

GRANT SELECT ON public.atrasados_resumo TO authenticated;
