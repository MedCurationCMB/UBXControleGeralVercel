-- MULTI-PROJETO, FASE 1b. Complementa 2026-09-25_multi_projeto_fase1.sql.
-- documentos (arquivos de remessa/retorno CNAB nao tem pedido) e controle_pagamentos/controle_recebimento
-- ganham projeto_id proprio: simplifica os filtros do servidor e o RLS da fase 4.
-- Dados atuais viram UBX (id 1). Quando ha pedido, a linha herda o projeto dele.
-- Roda em uma unica transacao. Rodar primeiro no banco de teste.

BEGIN;

ALTER TABLE public.documentos            ADD COLUMN projeto_id integer NOT NULL DEFAULT public.app_projeto_default() REFERENCES public.projetos(id);
ALTER TABLE public.documentos_receita    ADD COLUMN projeto_id integer NOT NULL DEFAULT public.app_projeto_default() REFERENCES public.projetos(id);
ALTER TABLE public.controle_pagamentos   ADD COLUMN projeto_id integer NOT NULL DEFAULT public.app_projeto_default() REFERENCES public.projetos(id);
ALTER TABLE public.controle_recebimento  ADD COLUMN projeto_id integer NOT NULL DEFAULT public.app_projeto_default() REFERENCES public.projetos(id);

CREATE INDEX idx_documentos_projeto           ON public.documentos (projeto_id);
CREATE INDEX idx_documentos_receita_projeto   ON public.documentos_receita (projeto_id);
CREATE INDEX idx_controle_pagamentos_projeto  ON public.controle_pagamentos (projeto_id);
CREATE INDEX idx_controle_recebimento_projeto ON public.controle_recebimento (projeto_id);

-- Herda o projeto do pedido quando a linha tem pedido (vale tambem para chamadas de servidor, sem cabecalho).
-- Argumento do trigger: tabela de pedidos do modulo.
CREATE FUNCTION public.herda_projeto_do_pedido() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_projeto integer;
BEGIN
  IF NEW.pedido_id IS NOT NULL THEN
    EXECUTE format('SELECT projeto_id FROM public.%I WHERE id = $1', TG_ARGV[0]) INTO v_projeto USING NEW.pedido_id;
    IF v_projeto IS NOT NULL THEN
      NEW.projeto_id := v_projeto;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_herda_projeto BEFORE INSERT ON public.documentos
  FOR EACH ROW EXECUTE FUNCTION public.herda_projeto_do_pedido('pedidos_solicitados');
CREATE TRIGGER trigger_herda_projeto BEFORE INSERT ON public.documentos_receita
  FOR EACH ROW EXECUTE FUNCTION public.herda_projeto_do_pedido('pedidos_solicitados_receita');
CREATE TRIGGER trigger_herda_projeto BEFORE INSERT ON public.controle_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.herda_projeto_do_pedido('pedidos_solicitados');
CREATE TRIGGER trigger_herda_projeto BEFORE INSERT ON public.controle_recebimento
  FOR EACH ROW EXECUTE FUNCTION public.herda_projeto_do_pedido('pedidos_solicitados_receita');

COMMIT;
