-- Ajuste de pedidos também em Recebimentos (espelha 2026-09-24_ajuste_pedidos.sql).
ALTER TABLE public.pedidos_solicitados_receita ADD COLUMN IF NOT EXISTS usuario_solicitante text;
ALTER TABLE public.pedidos_solicitados_receita ADD COLUMN IF NOT EXISTS ajuste_reenviado boolean NOT NULL DEFAULT false;

-- Se o status for um ENUM (status_pedido), garante o valor usado pelo ajuste. Sem efeito se já existir ou se o tipo não existir.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_pedido' AND typtype = 'e') THEN
    ALTER TYPE public.status_pedido ADD VALUE IF NOT EXISTS 'Aguardando Ajuste';
  END IF;
END $$;
