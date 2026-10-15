-- Registro de quando e como um pagamento foi enviado ao banco (status 2 "Enviado ao banco").
--   enviado_banco_em : carimbo de quando o status passou a 2
--   remessa_arquivo  : nome do .rem quando o envio foi por remessa; NULL = enviado manualmente
-- Quem preenche e o trigger, entao vale para qualquer caminho (remessa, edicao, lote, SQL).
-- A rota de remessa envia remessa_arquivo no mesmo UPDATE do status; qualquer outro UPDATE vira "manual".
-- Voltar para status 1 (A Pagar) limpa os dois campos. Pagamentos ja enviados antes desta migracao ficam sem data.
-- RLS: as policies rls_projeto existentes ja cobrem as colunas novas.

ALTER TABLE public.controle_pagamentos
  ADD COLUMN enviado_banco_em timestamptz,
  ADD COLUMN remessa_arquivo text;

CREATE INDEX idx_controle_pagamentos_enviado_em
  ON public.controle_pagamentos (enviado_banco_em) WHERE enviado_banco_em IS NOT NULL;

CREATE FUNCTION public.marcar_envio_banco() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status_pagamento = 2 AND OLD.status_pagamento IS DISTINCT FROM 2 THEN
    NEW.enviado_banco_em := now();
    IF NEW.remessa_arquivo IS NOT DISTINCT FROM OLD.remessa_arquivo THEN
      NEW.remessa_arquivo := NULL; -- o UPDATE nao trouxe arquivo novo: envio manual
    END IF;
  ELSIF NEW.status_pagamento = 1 THEN
    NEW.enviado_banco_em := NULL;
    NEW.remessa_arquivo := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_marcar_envio_banco
  BEFORE UPDATE OF status_pagamento ON public.controle_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.marcar_envio_banco();
