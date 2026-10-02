-- Fornecedor beneficiario (pagamentos) / cliente beneficiario (recebimentos): quem de fato recebe/paga. O fornecedor do pedido continua obrigatorio; cada linha do
-- fluxo (pedidos_solicitados_fluxo) e cada conta a pagar (controle_pagamentos) pode ter um beneficiario diferente.
-- NULL = mesmo fornecedor do pedido (pedidos antigos continuam como estao).
-- As telas novas gravam sempre o nome do beneficiario, inclusive quando ele e o proprio fornecedor.

ALTER TABLE public.pedidos_solicitados_fluxo ADD COLUMN fornecedor_beneficiario text;
ALTER TABLE public.pedidos_solicitados_fluxo
  ADD CONSTRAINT pedidos_solicitados_fluxo_beneficiario_fkey
  FOREIGN KEY (projeto_id, fornecedor_beneficiario) REFERENCES public.fornecedores(projeto_id, nome) ON UPDATE CASCADE;

ALTER TABLE public.controle_pagamentos ADD COLUMN fornecedor_beneficiario text;
ALTER TABLE public.controle_pagamentos
  ADD CONSTRAINT controle_pagamentos_beneficiario_fkey
  FOREIGN KEY (projeto_id, fornecedor_beneficiario) REFERENCES public.fornecedores(projeto_id, nome) ON UPDATE CASCADE;

-- Recebimentos: mesma logica, com o cliente.
ALTER TABLE public.pedidos_solicitados_fluxo_receita ADD COLUMN cliente_beneficiario text;
ALTER TABLE public.pedidos_solicitados_fluxo_receita
  ADD CONSTRAINT pedidos_solicitados_fluxo_receita_beneficiario_fkey
  FOREIGN KEY (projeto_id, cliente_beneficiario) REFERENCES public.clientes(projeto_id, nome) ON UPDATE CASCADE;

ALTER TABLE public.controle_recebimento ADD COLUMN cliente_beneficiario text;
ALTER TABLE public.controle_recebimento
  ADD CONSTRAINT controle_recebimento_beneficiario_fkey
  FOREIGN KEY (projeto_id, cliente_beneficiario) REFERENCES public.clientes(projeto_id, nome) ON UPDATE CASCADE;
