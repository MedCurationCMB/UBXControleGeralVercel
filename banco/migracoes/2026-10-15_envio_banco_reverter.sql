-- Desfaz 2026-10-15_envio_banco.sql. Perde apenas os carimbos de envio gravados desde a migracao.
DROP TRIGGER IF EXISTS trigger_marcar_envio_banco ON public.controle_pagamentos;
DROP FUNCTION IF EXISTS public.marcar_envio_banco();
DROP INDEX IF EXISTS public.idx_controle_pagamentos_enviado_em;
ALTER TABLE public.controle_pagamentos
  DROP COLUMN IF EXISTS enviado_banco_em,
  DROP COLUMN IF EXISTS remessa_arquivo;
